/**
 * PROMEDIOS DE RESPUESTA EN TAREAS
 *
 * Mide cuánto tarda cada persona en resolver sus tareas, por cuadrante de la
 * matriz Eisenhower, y cuánto tarda quien las asignó en confirmarlas.
 *
 * Dos reglas que cambian por completo el número, pedidas explícitamente:
 *
 *  1. Solo cuenta HORARIO LABORAL: lunes a viernes, 10:10–18:00 hora de
 *     Monterrey. Una tarea asignada el viernes a las 5 pm y resuelta el lunes a
 *     las 11 am no llevó 66 horas: llevó 1h50m de trabajo. Contar el reloj de
 *     pared hace ver a todo el equipo cuatro veces más lento de lo que es.
 *
 *  2. El reloj arranca cuando la tarea SE ASIGNA, no cuando alguien le da
 *     "iniciar". Si nadie la inicia, el tiempo corre igual — que es justo lo
 *     que se quiere medir.
 */

import { pool } from './db';

/** Ventana laboral en minutos desde medianoche, hora de Monterrey. */
const INICIO_MIN = 10 * 60 + 10;  // 10:10
const FIN_MIN = 18 * 60;          // 18:00
const MIN_POR_DIA = FIN_MIN - INICIO_MIN; // 470

/** Fecha (YYYY-MM-DD), día de la semana y minuto del día EN MONTERREY. */
const enMonterrey = (d: Date): { dia: string; dow: number; min: number } => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const p = fmt.formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dia: `${get('year')}-${get('month')}-${get('day')}`,
    dow: DOW[get('weekday')] ?? 0,
    min: Number(get('hour')) * 60 + Number(get('minute')),
  };
};

/**
 * Minutos LABORALES entre dos instantes.
 *
 * Recorre día por día en hora de Monterrey. Los días se avanzan sumando 24 h y
 * releyendo la fecha en esa zona: sumar días sobre el UTC se desfasa cuando
 * cambia el horario de verano y acabaría contando una hora de más o de menos.
 *
 * Se topa a 400 días para que un dato corrupto —una fecha del año 2200— no
 * cuelgue el bucle.
 */
export function minutosHabiles(desde: Date, hasta: Date): number {
  if (!(desde instanceof Date) || !(hasta instanceof Date)) return 0;
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return 0;
  if (hasta <= desde) return 0;

  let total = 0;
  let cursor = new Date(desde);
  let vueltas = 0;

  while (cursor < hasta && vueltas < 400) {
    vueltas++;
    const c = enMonterrey(cursor);
    const fin = enMonterrey(hasta);
    const mismoDia = c.dia === fin.dia;

    if (c.dow !== 0 && c.dow !== 6) {
      const arranque = Math.max(c.min, INICIO_MIN);
      const cierre = mismoDia ? Math.min(fin.min, FIN_MIN) : FIN_MIN;
      if (cierre > arranque) total += cierre - arranque;
    }

    if (mismoDia) break;
    // Al día siguiente, a las 00:00 de Monterrey.
    const sig = new Date(cursor.getTime() + 24 * 3600 * 1000);
    const s = enMonterrey(sig);
    cursor = new Date(sig.getTime() - (s.min * 60 * 1000));
  }
  return total;
}

/** "3h 20m" / "2d 1h" — en jornadas laborales, no en días de calendario. */
export const formatoHabil = (min: number): string => {
  if (!(min > 0)) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const jornadas = Math.floor(min / MIN_POR_DIA);
  const resto = min - jornadas * MIN_POR_DIA;
  const h = Math.floor(resto / 60);
  if (jornadas > 0) return `${jornadas}d ${h}h`;
  return `${h}h ${Math.round(resto % 60)}m`;
};

const CUADRANTES = ['fuego', 'estrella', 'delegar', 'eliminar'] as const;
type Cuadrante = typeof CUADRANTES[number];

export type FilaPersona = {
  user_id: number;
  nombre: string;
  rol: string;
  total: number;
  activas: number;
  en_espera: number;
  terminadas: number;
  por_cuadrante: Record<Cuadrante, number>;
  promedio_por_cuadrante: Record<Cuadrante, { minutos: number; texto: string; muestras: number }>;
  promedio_general: { minutos: number; texto: string; muestras: number };
  promedio_confirmacion: { minutos: number; texto: string; muestras: number };
};

/**
 * Arma la tabla de promedios.
 *
 * Se traen las tareas y sus eventos en dos consultas y el cálculo se hace en
 * JS: el horario laboral con festivos y cambio de horario no se expresa bien en
 * SQL, y son cientos de filas, no millones.
 */
export async function calcularPromediosRespuesta(): Promise<{
  personas: FilaPersona[];
  global: {
    por_cuadrante: Record<Cuadrante, { minutos: number; texto: string; muestras: number }>;
    confirmacion: { minutos: number; texto: string; muestras: number };
    jornada: string;
  };
}> {
  const tareas = (await pool.query(`
    SELECT t.id, t.assignee_id, t.eisenhower, t.status, t.created_at, t.completed_at,
           u.full_name, u.role
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
     WHERE t.status <> 'cancelled'`)).rows;

  // Momento en que la tarea quedó RESUELTA por su responsable, y momento en que
  // quien la asignó la confirmó. `assigned` sirve para reiniciar el reloj si la
  // tarea cambió de responsable después de creada.
  const eventos = (await pool.query(`
    SELECT task_id, action, MIN(created_at) AS primera, MAX(created_at) AS ultima
      FROM task_activity
     WHERE action IN ('awaiting_confirmation', 'confirmed', 'completed', 'assigned')
     GROUP BY task_id, action`)).rows;

  const porTarea = new Map<number, Record<string, { primera: Date; ultima: Date }>>();
  for (const e of eventos) {
    const id = Number(e.task_id);
    if (!porTarea.has(id)) porTarea.set(id, {});
    porTarea.get(id)![String(e.action)] = {
      primera: new Date(e.primera), ultima: new Date(e.ultima),
    };
  }

  const acum = new Map<number, FilaPersona & { _sum: Record<string, number[]>; _conf: number[] }>();
  const globalCuad: Record<string, number[]> = { fuego: [], estrella: [], delegar: [], eliminar: [] };
  const globalConf: number[] = [];

  for (const t of tareas) {
    const uid = Number(t.assignee_id);
    if (!acum.has(uid)) {
      acum.set(uid, {
        user_id: uid, nombre: t.full_name || `#${uid}`, rol: t.role || '',
        total: 0, activas: 0, en_espera: 0, terminadas: 0,
        por_cuadrante: { fuego: 0, estrella: 0, delegar: 0, eliminar: 0 },
        promedio_por_cuadrante: {} as any,
        promedio_general: { minutos: 0, texto: '—', muestras: 0 },
        promedio_confirmacion: { minutos: 0, texto: '—', muestras: 0 },
        _sum: { fuego: [], estrella: [], delegar: [], eliminar: [] },
        _conf: [],
      });
    }
    const f = acum.get(uid)!;
    f.total++;

    const cuad = (CUADRANTES.includes(t.eisenhower) ? t.eisenhower : 'eliminar') as Cuadrante;
    f.por_cuadrante[cuad]++;

    if (t.status === 'completed') f.terminadas++;
    else if (t.status === 'awaiting_confirmation') f.en_espera++;
    else f.activas++;

    const ev = porTarea.get(Number(t.id)) || {};
    // El reloj arranca al ASIGNAR: si hubo reasignación, desde la última.
    const inicio = ev['assigned']?.ultima ?? new Date(t.created_at);
    // Y se detiene cuando el responsable la dio por resuelta. Si nunca pasó por
    // "en espera" —se cerró de golpe— vale la fecha de terminada.
    const resuelta = ev['awaiting_confirmation']?.ultima ?? (t.completed_at ? new Date(t.completed_at) : null);

    if (resuelta && resuelta > inicio) {
      const m = minutosHabiles(inicio, resuelta);
      f._sum[cuad]!.push(m);
      globalCuad[cuad]!.push(m);
    }

    // Confirmación: de "resuelta" a "confirmada". Es tiempo de quien asignó, no
    // del responsable, pero se muestra en su fila porque es SU tarea la que
    // quedó esperando.
    const marcada = ev['awaiting_confirmation']?.ultima;
    const confirmada = ev['confirmed']?.ultima ?? ev['completed']?.ultima;
    if (marcada && confirmada && confirmada > marcada) {
      const m = minutosHabiles(marcada, confirmada);
      f._conf.push(m);
      globalConf.push(m);
    }
  }

  const prom = (xs: number[]) => {
    if (!xs.length) return { minutos: 0, texto: '—', muestras: 0 };
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    return { minutos: Math.round(m), texto: formatoHabil(m), muestras: xs.length };
  };

  const personas = Array.from(acum.values()).map((f) => {
    const todos = CUADRANTES.flatMap((c) => f._sum[c] || []);
    f.promedio_por_cuadrante = Object.fromEntries(
      CUADRANTES.map((c) => [c, prom(f._sum[c] || [])])
    ) as any;
    f.promedio_general = prom(todos);
    f.promedio_confirmacion = prom(f._conf);
    const { _sum, _conf, ...limpio } = f as any;
    void _sum; void _conf;
    return limpio as FilaPersona;
  });

  // Quien más carga trae, arriba.
  personas.sort((a, b) => (b.activas + b.en_espera) - (a.activas + a.en_espera) || b.total - a.total);

  return {
    personas,
    global: {
      por_cuadrante: Object.fromEntries(CUADRANTES.map((c) => [c, prom(globalCuad[c] || [])])) as any,
      confirmacion: prom(globalConf),
      jornada: 'Lunes a viernes, 10:10–18:00 (Monterrey). No cuentan fines de semana ni horas fuera de jornada.',
    },
  };
}
