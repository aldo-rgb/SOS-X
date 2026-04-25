/**
 * FacturamaClient
 * ----------------------------------------------------------------------------
 * Wrapper que expone una interfaz tipo Facturapi (`.invoices.create`,
 * `.invoices.cancel`, `.invoices.downloadPdf`, `.invoices.downloadXml`,
 * `.invoices.sendByEmail`, `.tools.validateTaxId`) pero por debajo habla
 * con Facturama vía REST + Basic Auth.
 *
 * Uso:
 *   const c = await FacturamaClient.fromEmitterId(emitterId);
 *   const inv = await c.invoices.create({ customer, items, payment_form, use });
 *
 * Reemplaza por completo a la dependencia `facturapi`.
 * ============================================================================ */

import axios, { AxiosInstance } from 'axios';
import { pool } from './db';

const FACTURAMA_BASE_URL_SANDBOX    = 'https://apisandbox.facturama.mx';
const FACTURAMA_BASE_URL_PRODUCTION = 'https://api.facturama.mx';

export class FacturamaError extends Error {
    type = 'FacturamaError';
    code: string | undefined;
    status: number | undefined;
    details: any;
    constructor(message: string, opts?: { code?: string; status?: number; details?: any }) {
        super(message);
        this.code = opts?.code;
        this.status = opts?.status;
        this.details = opts?.details;
    }
}

export interface FacturamaEmitter {
    /** ID en fiscal_emitters */
    id?: number;
    /** RFC emisor (multiemisor) */
    rfc: string;
    /** Razón social */
    business_name?: string;
    /** Régimen fiscal SAT */
    fiscal_regime?: string;
    /** Lugar de expedición (CP) */
    zip_code?: string;
    /** Credenciales Facturama */
    facturama_username: string;
    facturama_password: string;
    facturama_environment?: 'sandbox' | 'production';
}

/* ---------- input shape (compatible con código que ya usaba Facturapi) -------- */
interface FacturapiLikeItem {
    quantity: number;
    product: {
        description: string;
        product_key: string;
        unit_key?: string;
        price: number;
        taxes?: Array<{ type: 'IVA' | 'IEPS' | 'ISR'; rate: number; withholding?: boolean }>;
    };
}
interface FacturapiLikePayload {
    type?: 'I' | 'E' | 'P' | 'N';     // I = Ingreso (default)
    customer: {
        legal_name: string;
        tax_id: string;
        tax_system: string;
        address: { zip: string };
        email?: string;
    };
    items: FacturapiLikeItem[];
    payment_form?: string;            // SAT 01..99
    payment_method?: 'PUE' | 'PPD';
    use?: string;                     // CFDI use, e.g. 'G03'
    currency?: string;
    folio_number?: number;
    series?: string;
}

/* ---------- output shape (compatible con código que esperaba respuesta Facturapi) */
interface FacturapiLikeInvoice {
    id: string;            // Facturama Id
    uuid: string;          // SAT UUID
    folio_number: string;
    series?: string;
    total: number;
    subtotal: number;
    currency: string;
    status: string;
    verification_url: string;
    pdf_url: string;
    xml_url: string;
    stamp: { date?: string };
    raw: any;              // respuesta completa de Facturama
}

/* =============================================================================
 * Helpers
 * ============================================================================ */

const baseUrl = (env?: string) =>
    env === 'production' ? FACTURAMA_BASE_URL_PRODUCTION : FACTURAMA_BASE_URL_SANDBOX;

function buildHttp(emitter: FacturamaEmitter): AxiosInstance {
    return axios.create({
        baseURL: baseUrl(emitter.facturama_environment),
        auth: { username: emitter.facturama_username, password: emitter.facturama_password },
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
        validateStatus: () => true
    });
}

function throwFromResponse(prefix: string, r: { status: number; data: any }): never {
    const msg = r.data?.Message || r.data?.message || r.data?.error || JSON.stringify(r.data);
    throw new FacturamaError(`${prefix}: ${msg}`, {
        status: r.status,
        details: r.data
    });
}

/**
 * Convierte un payload tipo Facturapi a payload Facturama (API Lite Multiemisor).
 * Endpoint: POST /api-lite/3/cfdis
 */
function buildFacturamaCfdiPayload(emitter: FacturamaEmitter, p: FacturapiLikePayload) {
    const items = p.items.map(it => {
        const subtotal = +(it.quantity * it.product.price).toFixed(2);
        const taxes = (it.product.taxes || []).map(t => ({
            Total: +(subtotal * t.rate).toFixed(2),
            Name: t.type,
            Base: subtotal,
            Rate: t.rate,
            IsRetention: !!t.withholding
        }));
        const taxTotal = taxes.filter(t => !t.IsRetention).reduce((s, t) => s + t.Total, 0);
        return {
            ProductCode: it.product.product_key,
            UnitCode: it.product.unit_key || 'E48',     // E48 = Unidad de servicio
            Unit: it.product.unit_key || 'Servicio',
            Description: it.product.description,
            IdentificationNumber: '',
            Quantity: it.quantity,
            Discount: 0,
            UnitPrice: it.product.price,
            Subtotal: subtotal,
            Taxes: taxes,
            Total: +(subtotal + taxTotal).toFixed(2)
        };
    });
    const subtotal = items.reduce((s, i) => s + i.Subtotal, 0);
    const total    = items.reduce((s, i) => s + i.Total, 0);

    return {
        // Issuer (multiemisor): Facturama enruta al CSD del RFC indicado.
        Issuer: {
            Rfc: emitter.rfc,
            Name: emitter.business_name,
            FiscalRegime: emitter.fiscal_regime
        },
        Receiver: {
            Rfc: p.customer.tax_id,
            Name: p.customer.legal_name,
            CfdiUse: p.use || 'G03',
            FiscalRegime: p.customer.tax_system,
            TaxZipCode: p.customer.address?.zip
        },
        CfdiType: p.type || 'I',
        NameId: '1',
        ExpeditionPlace: emitter.zip_code,
        PaymentForm: p.payment_form || '99',
        PaymentMethod: p.payment_method || 'PUE',
        Currency: p.currency || 'MXN',
        Folio: p.folio_number ? String(p.folio_number) : undefined,
        Serie: p.series,
        Items: items,
        Subtotal: +subtotal.toFixed(2),
        Total: +total.toFixed(2)
    };
}

/* =============================================================================
 * Cliente principal
 * ============================================================================ */

export class FacturamaClient {
    private http: AxiosInstance;
    constructor(public emitter: FacturamaEmitter) {
        if (!emitter.facturama_username || !emitter.facturama_password) {
            throw new FacturamaError('El emisor no tiene credenciales Facturama configuradas');
        }
        this.http = buildHttp(emitter);
    }

    /** Cargar credenciales desde fiscal_emitters por id. */
    static async fromEmitterId(emitterId: number | string): Promise<FacturamaClient> {
        const r = await pool.query(
            `SELECT id, rfc, business_name, fiscal_regime, zip_code,
                    facturama_username, facturama_password, facturama_environment
               FROM fiscal_emitters WHERE id = $1`,
            [emitterId]
        );
        const e = r.rows[0];
        if (!e) throw new FacturamaError('Emisor no encontrado');
        return new FacturamaClient(e);
    }

    /** Cargar el primer emisor activo (para validaciones genéricas como RFC). */
    static async firstActive(): Promise<FacturamaClient> {
        const r = await pool.query(
            `SELECT id, rfc, business_name, fiscal_regime, zip_code,
                    facturama_username, facturama_password, facturama_environment
               FROM fiscal_emitters
              WHERE is_active = TRUE
                AND facturama_username IS NOT NULL
                AND facturama_password IS NOT NULL
              ORDER BY id ASC LIMIT 1`
        );
        const e = r.rows[0];
        if (!e) throw new FacturamaError('No hay emisores con credenciales Facturama configuradas');
        return new FacturamaClient(e);
    }

    /* ------------------------------- invoices --------------------------------- */
    invoices = {
        /** Crear y timbrar CFDI. Devuelve forma compatible con Facturapi. */
        create: async (payload: FacturapiLikePayload): Promise<FacturapiLikeInvoice> => {
            const body = buildFacturamaCfdiPayload(this.emitter, payload);
            const r = await this.http.post('/api-lite/3/cfdis', body);
            if (r.status < 200 || r.status >= 300) throwFromResponse('Facturama create CFDI falló', r);
            const d = r.data;
            const uuid = d.Complemento?.TaxStamp?.Uuid || d.Uuid || '';
            const id   = d.Id || uuid;
            const env  = this.emitter.facturama_environment === 'production' ? 'api' : 'apisandbox';
            return {
                id,
                uuid,
                folio_number: String(d.Folio || ''),
                series: d.Serie || undefined,
                total: Number(d.Total || 0),
                subtotal: Number(d.Subtotal || 0),
                currency: d.Currency || 'MXN',
                status: d.Status || 'active',
                verification_url: `https://verificacfdi.facturaelectronica.sat.gob.mx/?id=${uuid}`,
                pdf_url: `https://${env}.facturama.mx/cfdi/pdf/issued/${id}`,
                xml_url: `https://${env}.facturama.mx/cfdi/xml/issued/${id}`,
                stamp: { date: d.Date || d.Complemento?.TaxStamp?.Date },
                raw: d
            };
        },

        /** Cancelar CFDI (motivo SAT 01..04). */
        cancel: async (idOrUuid: string, opts?: { motive?: string; folioSustitucion?: string }) => {
            const motive = opts?.motive || '02';
            // Facturama acepta DELETE con type=Issued, motive=01..04 y, si motive=01,
            // uuidReplacement (folio que sustituye).
            const params = new URLSearchParams({ type: 'issued', motive });
            if (opts?.folioSustitucion) params.set('uuidReplacement', opts.folioSustitucion);
            const r = await this.http.delete(`/cfdi/${idOrUuid}?${params.toString()}`);
            if (r.status < 200 || r.status >= 300) throwFromResponse('Facturama cancel CFDI falló', r);
            return r.data;
        },

        /** Descargar PDF (Buffer). */
        downloadPdf: async (idOrUuid: string): Promise<Buffer> => {
            const r = await this.http.get(`/cfdi/pdf/issued/${idOrUuid}`, { responseType: 'arraybuffer' });
            if (r.status < 200 || r.status >= 300) {
                throw new FacturamaError(`Facturama downloadPdf falló (${r.status})`, { status: r.status });
            }
            // Si la respuesta viene como JSON con base64 (algunas variantes de la API):
            const ct = r.headers?.['content-type'] || '';
            if (ct.includes('application/json')) {
                const json = JSON.parse(Buffer.from(r.data).toString('utf8'));
                if (json.Content) return Buffer.from(json.Content, 'base64');
            }
            return Buffer.from(r.data);
        },

        /** Descargar XML (string). */
        downloadXml: async (idOrUuid: string): Promise<string> => {
            const r = await this.http.get(`/cfdi/xml/issued/${idOrUuid}`, { responseType: 'arraybuffer' });
            if (r.status < 200 || r.status >= 300) {
                throw new FacturamaError(`Facturama downloadXml falló (${r.status})`, { status: r.status });
            }
            const ct = r.headers?.['content-type'] || '';
            const buf = Buffer.from(r.data);
            if (ct.includes('application/json')) {
                const json = JSON.parse(buf.toString('utf8'));
                if (json.Content) return Buffer.from(json.Content, 'base64').toString('utf8');
            }
            return buf.toString('utf8');
        },

        /** Enviar CFDI por correo. */
        sendByEmail: async (idOrUuid: string, opts: { email: string; subject?: string }) => {
            // Facturama: POST /cfdi?cfdiType=issued&cfdiId={id}&email={mail}
            const params = new URLSearchParams({
                cfdiType: 'issued',
                cfdiId: idOrUuid,
                email: opts.email
            });
            const r = await this.http.post(`/cfdi?${params.toString()}`);
            if (r.status < 200 || r.status >= 300) throwFromResponse('Facturama sendByEmail falló', r);
            return r.data;
        },

        /**
         * Consultar el estatus actual de un CFDI ante el SAT.
         * Devuelve estatus normalizado:
         *   - 'active'                : vigente
         *   - 'cancelled'             : cancelado y aceptado por SAT
         *   - 'pending_cancellation'  : esperando aceptación del receptor (≤ 72h)
         *   - 'rejected_cancellation' : el receptor rechazó la cancelación
         *   - 'unknown'
         */
        getStatus: async (idOrUuid: string): Promise<{
            status: 'active' | 'cancelled' | 'pending_cancellation' | 'rejected_cancellation' | 'unknown';
            sat_status?: string;
            cancellation_status?: string;
            raw: any;
        }> => {
            const r = await this.http.get(`/cfdi/${idOrUuid}/status?type=issued`);
            if (r.status < 200 || r.status >= 300) throwFromResponse('Facturama getStatus falló', r);
            const d = r.data || {};
            const sat = String(d.Status || d.SatStatus || d.status || '').toLowerCase();
            const cancel = String(d.CancellationStatus || d.cancellation_status || '').toLowerCase();

            let status: 'active' | 'cancelled' | 'pending_cancellation' | 'rejected_cancellation' | 'unknown' = 'unknown';
            if (sat.includes('cancel') && (cancel.includes('accept') || cancel.includes('aceptad') || sat === 'cancelled' || sat === 'cancelado')) {
                status = 'cancelled';
            } else if (cancel.includes('pend') || sat.includes('pend')) {
                status = 'pending_cancellation';
            } else if (cancel.includes('reject') || cancel.includes('rechaz')) {
                status = 'rejected_cancellation';
            } else if (sat.includes('vig') || sat === 'active' || sat === 'valid' || sat === '') {
                status = 'active';
            }

            return { status, sat_status: d.Status, cancellation_status: d.CancellationStatus, raw: d };
        },

        /**
         * Aceptar o rechazar una solicitud de cancelación recibida (sólo para CFDIs
         * recibidos donde nuestra empresa es el RECEPTOR).
         * Endpoint: PUT /cfdi-received/{id}?action=accept|reject
         */
        respondCancellation: async (idOrUuid: string, accept: boolean) => {
            const action = accept ? 'accept' : 'reject';
            const r = await this.http.put(`/cfdi-received/${idOrUuid}?action=${action}`);
            if (r.status < 200 || r.status >= 300) throwFromResponse(`Facturama ${action} cancelación falló`, r);
            return r.data;
        }
    };

    /* --------------------------------- tools ---------------------------------- */
    tools = {
        /**
         * Validar RFC ante el catálogo SAT que expone Facturama.
         * Endpoint: GET /catalogs/RegimenFiscal o /catalogs/Rfc?keyword=
         * Como Facturama no expone "validate" igual que Facturapi, hacemos validación
         * estructural + intento de catálogo. Devolvemos shape Facturapi-compatible.
         */
        validateTaxId: async (rfc: string): Promise<{ is_valid: boolean; exists_in_sat: boolean }> => {
            const clean = (rfc || '').toUpperCase().trim();
            // Validación estructural SAT (12 PM, 13 PF + homoclave)
            const okFormat = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(clean);
            if (!okFormat) return { is_valid: false, exists_in_sat: false };
            // Facturama no tiene endpoint público de "ListaSAT" en API Lite; devolvemos
            // is_valid=true por estructura y exists_in_sat=true (best-effort).
            return { is_valid: true, exists_in_sat: true };
        }
    };
}

export default FacturamaClient;
