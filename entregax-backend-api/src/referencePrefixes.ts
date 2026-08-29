/**
 * PREFIJOS DE REFERENCIA — fuente única
 *
 * Una referencia de pago nace con las iniciales de la empresa que cobra:
 * Rodada → RO-, Urban Wod → UW-. El conciliador tiene que reconocer esos
 * prefijos para sacar la referencia del concepto bancario.
 *
 * El problema: esa lista estaba escrita a mano en tres lugares (Syncfy, Belvo y
 * el extractor de Cobranza) y se quedó atrás de la realidad. Faltaban CEX y,
 * en el de Cobranza, hasta UW —250 órdenes de la empresa que más cobra—. Cada
 * empresa nueva nacía invisible para la conciliación sin que nadie se enterara,
 * y sus depósitos caían al emparejamiento por MONTO, que es el camino que acaba
 * pagando la orden de otro cliente.
 *
 * Aquí la lista se calcula: sale del catálogo de empresas activas. Das de alta
 * una empresa y su prefijo queda autorizado solo; la desactivas y deja de
 * estarlo. Nadie tiene que acordarse de tocar un regex.
 */
import { pool } from './db';

/**
 * Prefijos que NO salen de ninguna empresa. Van a mano porque son de flujos,
 * no de razones sociales:
 *   SAF — fondeo de cartera general (referencia fija del cliente)
 *   CEX — cargos extra cobrables
 *   PP  — órdenes del flujo de pago directo
 *   OP  — cobros por Openpay
 *   EF  — el prefijo de respaldo cuando un servicio se quedó sin empresa
 *   US  — de otro sistema. No se concilia: está aquí para que, si aparece, se
 *         RECONOZCA y el abono NO se empareje por monto. Quitarlo reabre el
 *         camino de los 39 abonos que acabaron pagando la orden de otro.
 */
export const PREFIJOS_FIJOS = ['SAF', 'CEX', 'PP', 'OP', 'EF', 'US'];

/** Los que el extractor de Cobranza ignora: no llegan por transferencia. */
export const PREFIJOS_NO_BANCARIOS = ['PP', 'OP', 'EF'];

/**
 * Iniciales de una empresa, con la MISMA regla que usa el generador de
 * referencias. Si las dos se separan, se emitirían referencias con un prefijo
 * que el conciliador no reconoce.
 */
export function prefijoDeEmpresa(companyName?: string | null): string | null {
  if (!companyName) return null;
  const ignorar = ['sa', 'de', 'cv', 's.a.', 'c.v.'];
  const words = String(companyName).trim().split(/\s+/).filter((w) => !ignorar.includes(w.toLowerCase()));
  const [primera, segunda] = words;
  if (primera && segunda) return (primera[0]! + segunda[0]!).toUpperCase();
  if (primera && primera.length >= 2) return primera.substring(0, 2).toUpperCase();
  return null;
}

// Se cachea un minuto: esto corre por cada transacción bancaria sincronizada y
// el catálogo de empresas cambia un par de veces al año.
let cache: { prefijos: string[]; hasta: number } | null = null;
const TTL_MS = 60_000;

/** Tira el caché. Se llama al crear, editar o desactivar una empresa. */
export function invalidarCachePrefijos(): void {
  cache = null;
}

/** Prefijos vigentes: los fijos + las iniciales de cada empresa ACTIVA. */
export async function getPrefijosVigentes(): Promise<string[]> {
  if (cache && Date.now() < cache.hasta) return cache.prefijos;
  const set = new Set(PREFIJOS_FIJOS);
  try {
    const r = await pool.query(
      `SELECT alias, business_name FROM fiscal_emitters WHERE COALESCE(is_active, TRUE) = TRUE`
    );
    for (const row of r.rows) {
      const p = prefijoDeEmpresa(row.alias || row.business_name);
      if (p) set.add(p);
    }
  } catch (e: any) {
    // Sin catálogo se sigue con los fijos: perder la conciliación por completo
    // sería peor que conciliar de menos.
    console.warn('[prefijos] no se pudo leer el catálogo de empresas:', e?.message);
  }
  // Los de 3 letras primero: con SA antes que SAF, el motor probaría la
  // alternativa corta en cada posición antes de llegar a la larga.
  const prefijos = Array.from(set).sort((a, b) => b.length - a.length || a.localeCompare(b));
  cache = { prefijos, hasta: Date.now() + TTL_MS };
  return prefijos;
}

/**
 * Saca la referencia de un concepto bancario, tolerando cómo la escribe el
 * cliente: sin separador, con espacio, en minúscula o pegada a otros dígitos
 * ("7069052981RO054735C0").
 */
export async function extraerReferencia(texto: string): Promise<string | null> {
  const prefijos = await getPrefijosVigentes();
  const re = new RegExp(`(${prefijos.join('|')})[\\s-]*([A-Fa-f0-9]{8})(?![A-Fa-f0-9])`, 'i');
  const m = String(texto || '').match(re);
  if (m && m[1] && m[2]) return `${m[1].toUpperCase()}-${m[2].toUpperCase()}`;
  const tr = String(texto || '').match(/\b(tr_[a-zA-Z0-9]+)\b/);
  return tr && tr[1] ? tr[1] : null;
}
