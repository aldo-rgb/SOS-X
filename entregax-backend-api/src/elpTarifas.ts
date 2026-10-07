/**
 * Precio del contenedor dedicado de las rutas ELP (tarea 671).
 *
 * Hasta ahora el FCL cotizaba un número suelto: `pricing_tiers` → "FCL 40 Pies",
 * 27,000 USD, sin tocarse desde el 31 de julio. Los dos cotizadores —el del
 * cliente y el del asesor— mostraban ese número para cualquier destino. Con los
 * costos de octubre el precio real de El Paso es 31,900, así que el cotizador
 * iba 4,900 USD abajo; y como el cliente puede exigir que se le respete lo que
 * vio, eso no es un dato desactualizado, es dinero.
 *
 * El precio se arma con tres piezas y vive POR RUTA y POR MES:
 *
 *     flete internacional  +  costo de liberación  +  utilidad (fija 5,000)
 *
 * Para octubre en CHN-ELP-MEX: 11,400 + 15,500 + 5,000 = 31,900 USD.
 *
 * Son dos rutas ELP con precios distintos —El Paso y Long Beach son puertos
 * diferentes— así que cada mes se capturan las dos por separado.
 *
 * Encima va el tramo nacional. La liberación ya incluye la entrega en CDMX, así
 * que los estados que cubre el precio base quedan marcados como INCLUIDOS (no
 * con tarifa 0: cero se lee como "no cobramos" y lo que queremos decir es "ya
 * está pagado"). Los demás suman su tarifa, y un estado sin tarifa NO cotiza:
 * devuelve el aviso de contactar al asesor, que es preferible a inventar un
 * precio para un destino al que no sabemos llegar.
 */
import { pool } from './db';

/** Utilidad precalculada que se suma a cada precio mensual. Es fija. */
export const UTILIDAD_USD = 5000;

/** Los cuatro estados que la liberación ya cubre. */
export const ESTADOS_INCLUIDOS = ['CDMX', 'México', 'Nuevo León', 'Jalisco'];

export type CoberturaEstado = 'incluido' | 'con_tarifa' | 'sin_cobertura';

let esquemaListo = false;
export async function asegurarEsquemaTarifas(): Promise<void> {
  if (esquemaListo) return;

  // Precio mensual por ruta. El periodo se guarda como el primer día del mes
  // para poder ordenarlo y compararlo como fecha en vez de como texto.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elp_precios_mensuales (
      id                  SERIAL PRIMARY KEY,
      route_id            INTEGER NOT NULL REFERENCES maritime_routes(id),
      periodo             DATE    NOT NULL,
      flete_usd           NUMERIC(12,2) NOT NULL,
      liberacion_usd      NUMERIC(12,2) NOT NULL,
      utilidad_usd        NUMERIC(12,2) NOT NULL DEFAULT ${UTILIDAD_USD},
      capturado_por       INTEGER REFERENCES users(id),
      capturado_por_nombre TEXT,
      notas               TEXT,
      created_at          TIMESTAMP DEFAULT NOW(),
      updated_at          TIMESTAMP DEFAULT NOW(),
      UNIQUE (route_id, periodo)
    )`);

  // Tarifa del tramo nacional. `cp_desde`/`cp_hasta` van NULOS hoy: la tarifa es
  // por estado. Existen desde el arranque para que el día que haga falta partir
  // Nuevo León entre Monterrey y Linares se agreguen renglones con rango, sin
  // migrar la tabla ni tocar el cotizador: la búsqueda ya prefiere el rango más
  // específico y cae al estado.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elp_tarifas_nacionales (
      id             SERIAL PRIMARY KEY,
      estado         TEXT NOT NULL,
      cp_desde       TEXT,
      cp_hasta       TEXT,
      cobertura      TEXT NOT NULL DEFAULT 'sin_cobertura',
      tarifa_usd     NUMERIC(12,2),
      notas          TEXT,
      actualizado_por INTEGER REFERENCES users(id),
      updated_at     TIMESTAMP DEFAULT NOW(),
      created_at     TIMESTAMP DEFAULT NOW()
    )`);
  // Un solo renglón por estado mientras no haya rangos. Con rangos, uno por
  // combinación.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS elp_tarifas_nac_estado_rango
      ON elp_tarifas_nacionales (estado, COALESCE(cp_desde,''), COALESCE(cp_hasta,''))`);

  esquemaListo = true;
}

/** Los 32 estados, como los escribe el SAT/INEGI. */
export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
  'Chiapas', 'Chihuahua', 'CDMX', 'Coahuila', 'Colima', 'Durango',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'México', 'Michoacán',
  'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro',
  'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco',
  'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

/** Siembra los 32 estados la primera vez, con los cuatro incluidos marcados. */
export async function sembrarEstados(): Promise<void> {
  await asegurarEsquemaTarifas();
  for (const estado of ESTADOS_MX) {
    const incluido = ESTADOS_INCLUIDOS.includes(estado);
    await pool.query(
      `INSERT INTO elp_tarifas_nacionales (estado, cobertura, tarifa_usd)
       VALUES ($1, $2, NULL)
       ON CONFLICT (estado, COALESCE(cp_desde,''), COALESCE(cp_hasta,'')) DO NOTHING`,
      [estado, incluido ? 'incluido' : 'sin_cobertura']
    );
  }
}

/** Primer día del mes de una fecha, que es como se guarda el periodo. */
export function periodoDe(fecha: Date = new Date()): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export type PrecioVigente = {
  route_id: number;
  periodo: string;
  flete_usd: number;
  liberacion_usd: number;
  utilidad_usd: number;
  total_usd: number;
  /** true cuando el precio NO es del mes en curso y se está sosteniendo el anterior. */
  es_del_mes_anterior: boolean;
};

/**
 * Precio vigente de una ruta.
 *
 * Si nadie capturó el del mes en curso se SOSTIENE el último publicado, que es
 * lo que pidió Dirección: preferible cotizar con el precio del mes pasado que
 * dejar de cotizar. El aviso de que hay que actualizarlo lo da la tarea
 * automática, no el silencio del cotizador; por eso se devuelve la bandera, para
 * que quien lo consuma pueda decirlo.
 */
export async function precioVigente(routeId: number, fecha: Date = new Date()): Promise<PrecioVigente | null> {
  await asegurarEsquemaTarifas();
  const per = periodoDe(fecha);
  const r = await pool.query(
    `SELECT route_id, to_char(periodo,'YYYY-MM-DD') AS periodo,
            flete_usd, liberacion_usd, utilidad_usd
       FROM elp_precios_mensuales
      WHERE route_id = $1 AND periodo <= $2::date
      ORDER BY periodo DESC LIMIT 1`,
    [routeId, per]
  );
  const x = r.rows[0];
  if (!x) return null;
  const flete = Number(x.flete_usd) || 0;
  const lib = Number(x.liberacion_usd) || 0;
  const uti = Number(x.utilidad_usd) || 0;
  return {
    route_id: Number(x.route_id),
    periodo: x.periodo,
    flete_usd: flete,
    liberacion_usd: lib,
    utilidad_usd: uti,
    total_usd: +(flete + lib + uti).toFixed(2),
    es_del_mes_anterior: x.periodo !== per,
  };
}

export type TarifaEstado = {
  estado: string;
  cobertura: CoberturaEstado;
  tarifa_usd: number;
};

/**
 * Tarifa nacional de un destino.
 *
 * `cp` se acepta desde hoy aunque todavía no se use para decidir: cuando existan
 * renglones con rango, este mismo llamado empezará a preferirlos sin que el
 * cotizador cambie una línea.
 */
export async function tarifaDeDestino(estado: string, cp?: string | null): Promise<TarifaEstado | null> {
  await asegurarEsquemaTarifas();
  const r = await pool.query(
    `SELECT estado, cobertura, COALESCE(tarifa_usd, 0) AS tarifa_usd
       FROM elp_tarifas_nacionales
      WHERE LOWER(TRIM(estado)) = LOWER(TRIM($1))
        AND ( (cp_desde IS NULL AND cp_hasta IS NULL)
           OR ($2::text IS NOT NULL AND $2::text BETWEEN cp_desde AND cp_hasta) )
      -- El rango específico gana sobre la tarifa del estado completo.
      ORDER BY (cp_desde IS NOT NULL) DESC
      LIMIT 1`,
    [estado, cp || null]
  );
  const x = r.rows[0];
  if (!x) return null;
  return { estado: x.estado, cobertura: x.cobertura as CoberturaEstado, tarifa_usd: Number(x.tarifa_usd) || 0 };
}

export type Cotizacion =
  | { cotiza: true; total_usd: number; base_usd: number; nacional_usd: number;
      cobertura: CoberturaEstado; periodo: string; precio_desactualizado: boolean;
      es_tarifa_pactada?: boolean;
      // Destino sin tarifa cargada: el contenedor SÍ se cotiza, la entrega en
      // su ciudad NO. total_usd es el contenedor solo, y falta sumarle el flete
      // a destino. Quien lo muestre tiene que decirlo con todas sus letras.
      nacional_pendiente?: boolean;
      aviso_nacional?: string;
      desglose: Record<string, number> }
  | { cotiza: false; motivo: string };

/**
 * Precio final de un contenedor dedicado ELP a un destino.
 *
 * Un destino sin tarifa NO cotiza. Devolver el precio base sería peor que no
 * contestar: el cliente vería un número que no cubre llevarle la caja hasta su
 * ciudad, y ya pasó una vez que un cliente exigió que se le respetara lo que el
 * cotizador le mostró.
 */
export async function cotizarContenedorElp(
  routeId: number, estado: string, cp?: string | null, fecha: Date = new Date(),
  legacyClientId?: number | null
): Promise<Cotizacion> {
  // Tarifa pactada: manda sobre el precio del mes. Son acuerdos cerrados con el
  // cliente —S87 tiene 15,000 en la ruta de El Paso cuando el precio de octubre
  // es 31,900— y no se renegocian solos porque suba el flete. El tramo nacional
  // sí se sigue sumando: lo pactado es el contenedor, no la entrega en su
  // ciudad.
  let pactado: number | null = null;
  if (legacyClientId) {
    const r = await pool.query(
      `SELECT custom_price_usd FROM fcl_client_rates
        WHERE legacy_client_id = $1 AND (route_id = $2 OR route_id IS NULL)
          AND custom_price_usd IS NOT NULL
        ORDER BY (route_id IS NOT NULL) DESC LIMIT 1`,
      [legacyClientId, routeId]);
    if (r.rows.length) pactado = Number(r.rows[0].custom_price_usd) || null;
  }

  const precio = await precioVigente(routeId, fecha);
  // Con tarifa pactada NO hace falta precio del mes: el acuerdo ya fija el
  // número. Si no, el cliente con precio cerrado dejaría de cotizar por un dato
  // que a él no le aplica.
  if (!precio && pactado == null) {
    return { cotiza: false, motivo: 'Todavía no hay precio publicado para esta ruta. Contacta a tu asesor.' };
  }
  const dest = await tarifaDeDestino(estado, cp);
  // Destino sin tarifa: ANTES no cotizaba nada. El cliente se iba sin número y
  // sin saber siquiera el orden de magnitud del contenedor, que es la parte que
  // sí sabemos. Ahora se cotiza el contenedor y se marca que FALTA el flete a
  // su ciudad, con `nacional_pendiente`.
  //
  // El riesgo que motivó el "no cotiza" sigue vivo y no desaparece por esto: un
  // cliente puede exigir que se le respete lo que vio en pantalla, y ya pasó.
  // Por eso el total NO incluye la entrega y el aviso viaja junto al precio, no
  // como una nota al pie: quien pinte esto tiene que mostrarlo.
  const sinCobertura = !dest || dest.cobertura === 'sin_cobertura';
  const nacional = sinCobertura ? 0 : (dest!.cobertura === 'incluido' ? 0 : dest!.tarifa_usd);
  const base = pactado != null ? pactado : precio!.total_usd;
  return {
    cotiza: true,
    base_usd: base,
    nacional_usd: nacional,
    total_usd: +(base + nacional).toFixed(2),
    cobertura: sinCobertura ? 'sin_cobertura' : dest!.cobertura,
    ...(sinCobertura ? {
      nacional_pendiente: true,
      aviso_nacional: 'Este precio NO incluye la entrega hasta tu ciudad. '
        + 'Consulta con tu asesor para más detalles.',
    } : {}),
    periodo: pactado != null ? 'tarifa pactada' : precio!.periodo,
    // Un precio pactado nunca está "desactualizado": no depende del mes.
    precio_desactualizado: pactado != null ? false : precio!.es_del_mes_anterior,
    es_tarifa_pactada: pactado != null,
    desglose: pactado != null
      ? { pactado_usd: pactado, nacional_usd: nacional }
      : {
          flete_usd: precio!.flete_usd,
          liberacion_usd: precio!.liberacion_usd,
          utilidad_usd: precio!.utilidad_usd,
          nacional_usd: nacional,
        },
  };
}

/**
 * Opciones que necesita el cotizador para un contenedor dedicado: las rutas que
 * ELP atiende y los estados a los que se entrega.
 *
 * Existe porque sin esto el cotizador no tenía cómo preguntar. El precio por
 * ruta y mes ya estaba construido, pero `/api/public/quote` solo lo usa cuando
 * le llegan `route_id` y `estado`; sin esos dos campos caía al número suelto de
 * siempre. Juan Segura lo probó como cliente el 1-oct: "aún no me pregunta lo
 * de los estados y me sigue dando precio viejo" (tarea 671).
 *
 * Cada estado viene con su cobertura ya resuelta, para que la pantalla pueda
 * avisar ANTES de cotizar que a ese destino no llegamos, en vez de mostrar un
 * precio y retirarlo después.
 */
export async function opcionesCotizadorElp(): Promise<{
  rutas: Array<{ id: number; nombre: string; origen: string; destino: string; cotiza: boolean; motivo?: string }>;
  estados: Array<{ estado: string; cobertura: CoberturaEstado; tarifa_usd: number | null }>;
}> {
  await asegurarEsquemaTarifas();
  await sembrarEstados();

  const r = await pool.query(
    `SELECT id, name, origin, destination FROM maritime_routes
      WHERE COALESCE(elp_enabled, false) = TRUE AND COALESCE(is_active, true) = TRUE
      ORDER BY id`);

  // Una ruta sin precio del mes NO se ofrece como cotizable. Es el caso de Long
  // Beach: se decidió dejarla sin cotizar hasta que capturen su precio, en vez
  // de enseñar uno viejo que ya nadie sostiene.
  const rutas = [];
  for (const x of r.rows) {
    const p = await precioVigente(Number(x.id));
    rutas.push({
      id: Number(x.id),
      nombre: String(x.name || ''),
      origen: String(x.origin || ''),
      destino: String(x.destination || ''),
      cotiza: !!p,
      ...(p ? {} : { motivo: 'Esta ruta todavía no tiene precio del mes capturado.' }),
    });
  }

  const e = await pool.query(
    `SELECT estado, cobertura, tarifa_usd FROM elp_tarifas_nacionales ORDER BY estado`);

  return {
    rutas,
    estados: e.rows.map((x: any) => ({
      estado: String(x.estado),
      cobertura: String(x.cobertura) as CoberturaEstado,
      tarifa_usd: x.tarifa_usd == null ? null : Number(x.tarifa_usd),
    })),
  };
}
