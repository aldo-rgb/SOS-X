/**
 * ¿Qué cola de bodega le toca a cada mostrador?
 *
 * El tablero de mostrador se servía con `_req`: los dos handlers que lo
 * alimentan —getCounterStaffDashboard y getOutboundReadyPackages— tiraban el
 * usuario y contaban sobre toda la empresa, sin un solo filtro de sucursal.
 * Lo único que decidía qué pantalla veías era el rol, así que las 8 cuentas de
 * mostrador del país (MTY, CDMX, Hidalgo TX, Centro CC y Bodega China) leían
 * exactamente los mismos números.
 *
 * Medido el 18-nov-2026, el mostrador de CDMX tenía enfrente: 21 cajas PO Box
 * paradas en la bodega de Estados Unidos, 7 entregas de mostrador que son todas
 * de Hidalgo TX, 172 packing lists de Bodega China y 3 cajas TDI en China.
 * Ni una sola fila de CDMX. Trabajo de otros, y además con el botón para
 * armarles la salida.
 *
 * El filtro NO puede ser por la sucursal de la caja: mientras está en la bodega
 * de origen, `current_branch_id` viene en blanco (las 21 de arriba, las 7 de
 * mostrador y las 238 PO Box sin sucursal). La sucursal se le estampa cuando
 * aterriza en México. Así que se filtra al revés, por la sucursal de quien
 * entra, con el carril que cada bodega alimenta:
 *
 *   Bodega China  →  CEDIS CDMX   (el aéreo y el TDI aterrizan en CDMX)
 *   Hidalgo TX    →  CEDIS MTY    (el PO Box aterriza en MTY)
 *
 * Cada carril lo ven sus dos extremos: la bodega que arma la caja y el CEDIS
 * que la recibe. Nadie más.
 *
 * No se reescribe nada de lo ya guardado: esto solo cambia a quién se le
 * muestra. (Pregunta de Aldo sobre por qué el mostrador de CDMX veía 20 cajas
 * y el gerente de la misma sucursal veía 0.)
 */

export const SUCURSAL = {
    MTY: 1,
    CDMX: 2,
    GDL: 3,
    HIDALGO_TX: 6,
    CENTRO_CC: 7,
    BODEGA_CHINA: 8,
} as const;

/** PO Box: se recibe en Hidalgo TX y aterriza en CEDIS MTY. */
const CARRIL_USA = new Set<number>([SUCURSAL.HIDALGO_TX, SUCURSAL.MTY]);

/** Aéreo, TDI Express y marítimo LOG: salen de Bodega China y aterrizan en CDMX. */
const CARRIL_CHINA = new Set<number>([SUCURSAL.BODEGA_CHINA, SUCURSAL.CDMX]);

/**
 * Quien manda arriba de una sucursal no está parado en ninguna, así que sigue
 * viendo los dos carriles completos. Lo mismo para una cuenta sin sucursal:
 * no hay por dónde rutearla y apagarle el tablero sería peor que el problema.
 */
const MANDA_SOBRE_TODAS = new Set([
    'super_admin', 'Super Admin',
    'admin', 'Admin',
    'director', 'Director',
]);

export interface CarrilDeMostrador {
    branchId: number | null;
    role: string;
    /** Ve la cola de PO Box / Hidalgo TX. */
    usa: boolean;
    /** Ve la cola de Bodega China (aéreo, TDI, marítimo, pagos a proveedor). */
    china: boolean;
}

const normNum = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Qué carriles le tocan a quien hizo la petición. Una sola lectura por id;
 * si la consulta falla se abre todo, porque dejar a un mostrador sin su
 * pantalla es peor que enseñarle de más.
 */
export async function carrilDe(
    pool: { query: (sql: string, params?: any[]) => Promise<any> },
    req: any,
): Promise<CarrilDeMostrador> {
    const userId = normNum(req?.user?.userId ?? req?.user?.id);
    const role = String(req?.user?.role || '');

    if (MANDA_SOBRE_TODAS.has(role) || !userId) {
        return { branchId: null, role, usa: true, china: true };
    }

    let branchId: number | null = null;
    try {
        const r = await pool.query('SELECT branch_id FROM users WHERE id = $1', [userId]);
        branchId = normNum(r.rows[0]?.branch_id);
    } catch (e: any) {
        console.warn('[carrilDeMostrador] no pude leer la sucursal:', e?.message);
        return { branchId: null, role, usa: true, china: true };
    }

    if (branchId === null) return { branchId: null, role, usa: true, china: true };

    return {
        branchId,
        role,
        usa: CARRIL_USA.has(branchId),
        china: CARRIL_CHINA.has(branchId),
    };
}

/** Lo que se le contesta a quien pidió una cola que no es de su carril. */
export const FUERA_DE_CARRIL =
    'Esta cola no es de tu sucursal. El PO Box de Hidalgo TX lo trabajan Hidalgo y CEDIS MTY; '
    + 'lo de Bodega China lo trabajan China y CEDIS CDMX.';
