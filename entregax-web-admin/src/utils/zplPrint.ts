/**
 * Utilidad de impresión ZPL para impresoras Zebra (4x6 / 203 dpi).
 *
 * Requiere "Zebra Browser Print" instalado en el equipo:
 *   https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities.html
 *
 * El servicio expone una API HTTP local en https://localhost:9101
 *   - GET  /available                -> lista impresoras conectadas
 *   - POST /write    {device, data}  -> envía ZPL crudo a la impresora
 *
 * Si el servicio no está disponible, las funciones devuelven false y el caller
 * puede hacer fallback a impresión por popup HTML.
 */

const BROWSER_PRINT_URL = 'https://localhost:9101';

export type ZebraDevice = {
    name: string;
    uid: string;
    connection: string;
    deviceType: string;
    version: number;
    provider: string;
    manufacturer: string;
};

/** Detecta si Zebra Browser Print está corriendo y hay impresora conectada */
export async function getDefaultZebraPrinter(): Promise<ZebraDevice | null> {
    try {
        const res = await fetch(`${BROWSER_PRINT_URL}/available`, {
            method: 'GET',
            signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const printer = data?.default || data?.printer?.[0] || data?.devices?.[0] || null;
        return printer as ZebraDevice | null;
    } catch {
        return null;
    }
}

/** Envía ZPL crudo a la impresora indicada (o a la default si no se pasa) */
export async function sendZPL(zpl: string, device?: ZebraDevice | null): Promise<boolean> {
    try {
        const printer = device || (await getDefaultZebraPrinter());
        if (!printer) return false;
        const res = await fetch(`${BROWSER_PRINT_URL}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: printer, data: zpl }),
            signal: AbortSignal.timeout(5000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Datos mínimos para generar la etiqueta en ZPL */
export type LabelData = {
    tracking: string;
    clientBoxId?: string;
    boxNumber?: number;
    totalBoxes?: number;
    isMaster?: boolean;
    masterTracking?: string;
    weight?: string | number;
    dimensions?: string;
    receivedAt?: string;
    description?: string;
};

const escapeZpl = (s: string) => (s || '').replace(/[\^~]/g, ' ');

/**
 * Genera ZPL II para una etiqueta 4x6" a 203 dpi (812 x 1218 dots).
 * Layout:
 *   - Header con fecha (esquina superior derecha)
 *   - Tracking grande
 *   - "X de N" si es hija
 *   - QR a https://app.entregax.com/track/{tracking}
 *   - Code128 con tracking sin guiones
 *   - PO Box del cliente en grande
 *   - Peso / dimensiones
 *   - Footer "Hidalgo TX"
 */
export function generateZPL(label: LabelData): string {
    const date = label.receivedAt
        ? new Date(label.receivedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase()
        : new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
    const tracking = escapeZpl(label.tracking);
    const trackingNoDash = tracking.replace(/-/g, '');
    const clientBox = escapeZpl(label.clientBoxId || 'PENDIENTE');
    const boxIndicator = label.isMaster
        ? `${label.totalBoxes || 1} BULTOS`
        : `${label.boxNumber || 1} DE ${label.totalBoxes || 1}`;
    const masterRef = label.masterTracking ? `Master: ${escapeZpl(label.masterTracking)}` : '';
    const weight = label.weight ? `Peso: ${label.weight} kg` : '';
    const dims = label.dimensions ? `Dim: ${escapeZpl(label.dimensions)}` : '';
    const desc = escapeZpl(label.description || 'Hidalgo TX');
    const trackingUrl = `https://app.entregax.com/track/${tracking}`;

    // 4"x6" @ 203dpi = 812 x 1218 dots
    return `^XA
^PW812
^LL1218
^LH0,0
^CI28

^FO580,30^A0N,32,32^FD${date}^FS

${label.isMaster ? '^FO0,90^GB812,50,50,B,0^FS\n^FO50,98^A0N,38,38^FR^FDGUIA MASTER^FS' : ''}

^FO40,160^A0N,55,55^FD${tracking}^FS
^FO40,225^A0N,32,32^FD${boxIndicator}^FS
${masterRef ? `^FO40,265^A0N,24,24^FD${masterRef}^FS` : ''}

^FO40,310^BQN,2,7^FDLA,${trackingUrl}^FS
^FO340,310^BY3,3,140^BCN,140,N,N,N^FD${trackingNoDash}^FS
^FO340,455^A0N,26,26^FD${trackingNoDash}^FS

^FO20,510^GB772,4,4^FS

^FO40,540^A0N,180,180^FD${clientBox}^FS

^FO40,750^A0N,38,38^FD${weight}^FS
^FO40,800^A0N,38,38^FD${dims}^FS

^FO40,1150^A0N,32,32^FD${desc}^FS

^XZ`;
}

/**
 * Imprime un arreglo de etiquetas vía Zebra Browser Print (ZPL directo).
 * Cada etiqueta se envía individualmente, una tras otra.
 *
 * @returns true si TODAS se imprimieron, false si alguna falló o el servicio no está disponible
 */
export async function printLabelsZPL(labels: LabelData[]): Promise<boolean> {
    if (!labels || labels.length === 0) return true;
    const printer = await getDefaultZebraPrinter();
    if (!printer) return false;
    for (const label of labels) {
        const zpl = generateZPL(label);
        const ok = await sendZPL(zpl, printer);
        if (!ok) return false;
        // Pequeño delay entre etiquetas para evitar colisiones en el buffer
        await new Promise((r) => setTimeout(r, 250));
    }
    return true;
}

/** localStorage key para activar/desactivar modo ZPL */
const ZPL_ENABLED_KEY = 'entregax_zpl_enabled';

export function isZplModeEnabled(): boolean {
    return localStorage.getItem(ZPL_ENABLED_KEY) === 'true';
}

export function setZplMode(enabled: boolean): void {
    localStorage.setItem(ZPL_ENABLED_KEY, enabled ? 'true' : 'false');
}
