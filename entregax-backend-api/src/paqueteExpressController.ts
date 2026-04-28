// ============================================
// PAQUETE EXPRESS API CONTROLLER
// Integración con API de Paquete Express (PQTX)
// Servicios: Cotización, Envío, Impresión, Cancelación, Trazabilidad
// ============================================

import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from './db';

// ============================================
// CONFIGURACIÓN
// ============================================
const PQTX_BASE_URL = process.env.PQTX_BASE_URL || 'https://qaglp.paquetexpress.com.mx';

// Credenciales para cotización (auth diferente)
const PQTX_QUOTE_USER = process.env.PQTX_QUOTE_USER || 'WSQURBANWOD';
const PQTX_QUOTE_PASSWORD = process.env.PQTX_QUOTE_PASSWORD || '1234';
const PQTX_QUOTE_TOKEN = process.env.PQTX_QUOTE_TOKEN || '4DB7391907B749C5E063350AA8C0215D';

// Credenciales para operaciones (login, envíos, cancelaciones, ZPL)
const PQTX_USER = process.env.PQTX_USER || 'WSQURBANWOD';
const PQTX_PASSWORD = process.env.PQTX_PASSWORD || 'UWEyNzczNjI1MCQ=';
const PQTX_BILL_CLIENT_ID = process.env.PQTX_BILL_CLIENT_ID || '27736250';

// Cache del JWT token
let cachedJwtToken: string | null = null;

// ============================================
// HELPER: Obtener JWT Token (con cache)
// ============================================
async function getJwtToken(): Promise<string> {
  if (cachedJwtToken) return cachedJwtToken;

  const url = `${PQTX_BASE_URL}/RadRestFul/api/rad/loginv1/login`;
  const body = {
    header: {
      security: {
        user: PQTX_USER,
        password: PQTX_PASSWORD
      }
    }
  };

  const response = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  // La API PQTX responde con header:null y token en body.response.data.token
  const respBody = response.data?.body?.response;
  const token = respBody?.data?.token || respBody;

  if (respBody?.success === true && respBody?.data?.token) {
    cachedJwtToken = respBody.data.token;
    return cachedJwtToken!;
  } else if (response.data?.header?.staTrans === 'ok' && typeof token === 'string') {
    cachedJwtToken = token;
    return cachedJwtToken!;
  }

  throw new Error(`Error al obtener token PQTX: ${respBody?.messages || response.data?.header?.desTrans || 'Unknown error'}`);
}

// ============================================
// 1. LOGIN - Obtener token JWT
// POST /api/admin/paquete-express/login
// ============================================
export async function pqtxLogin(req: Request, res: Response) {
  try {
    const url = `${PQTX_BASE_URL}/RadRestFul/api/rad/loginv1/login`;
    const body = {
      header: {
        security: {
          user: PQTX_USER,
          password: PQTX_PASSWORD
        }
      }
    };

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    // La API PQTX responde con header:null y token en body.response.data.token
    const respBody = response.data?.body?.response;

    if (respBody?.success === true && respBody?.data?.token) {
      cachedJwtToken = respBody.data.token;
      res.json({
        success: true,
        token: cachedJwtToken,
        message: 'Token obtenido correctamente'
      });
    } else if (response.data?.header?.staTrans === 'ok') {
      cachedJwtToken = response.data.body?.response || null;
      res.json({
        success: true,
        token: cachedJwtToken,
        message: 'Token obtenido correctamente'
      });
    } else {
      res.status(400).json({
        success: false,
        error: respBody?.messages || response.data?.header?.desTrans || 'Error al obtener token'
      });
    }
  } catch (error: any) {
    console.error('Error en PQTX login:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 2. COTIZACIÓN
// POST /api/admin/paquete-express/quote
// Body: { origin, destination, packages, declaredValue }
// ============================================
export async function pqtxQuote(req: Request, res: Response) {
  try {
    const {
      originZipCode,
      originColony = 'CENTRO',
      destZipCode,
      destColony = 'CENTRO',
      packages = [],
      declaredValue = 1000,
      deliveryType = '1',
      services = ['ALL'],
    } = req.body;

    if (!originZipCode || !destZipCode || packages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere CP origen, CP destino y al menos un paquete'
      });
    }

    const shipments = packages.map((pkg: any, idx: number) => ({
      sequence: idx + 1,
      quantity: pkg.quantity || 1,
      shpCode: pkg.shpCode || '2', // 2 = paquete/caja
      weight: pkg.weight || 1,
      longShip: pkg.length || 30,
      widthShip: pkg.width || 30,
      highShip: pkg.height || 30,
    }));

    const url = `${PQTX_BASE_URL}/WsQuotePaquetexpress/api/apiQuoter/v2/getQuotation`;
    const body = {
      header: {
        security: {
          user: PQTX_QUOTE_USER,
          password: PQTX_QUOTE_PASSWORD,
          type: 1,
          token: PQTX_QUOTE_TOKEN,
        },
        device: {
          appName: 'EntregaX',
          type: 'Web',
          ip: '',
          idDevice: '',
        },
        target: {
          module: 'QUOTER',
          version: '1.0',
          service: 'quoter',
          uri: 'quotes',
          event: 'R',
        },
        output: 'JSON',
        language: null,
      },
      body: {
        request: {
          data: {
            clientAddrOrig: {
              zipCode: originZipCode,
              colonyName: originColony,
            },
            clientAddrDest: {
              zipCode: destZipCode,
              colonyName: destColony,
            },
            services: {
              dlvyType: deliveryType,
              ackType: 'N',
              totlDeclVlue: declaredValue,
              invType: 'A',
              radType: '1',
            },
            otherServices: {
              otherServices: [],
            },
            shipmentDetail: {
              shipments,
            },
            quoteServices: services,
          },
          objectDTO: null,
        },
        response: null,
      },
    };

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    // La API PQTX v2 responde con header:null y datos en body.response
    const respBody = response.data?.body?.response;
    const quotations = respBody?.data?.quotations;

    if (respBody?.success === true && Array.isArray(quotations)) {
      res.json({
        success: true,
        quotes: quotations,
        origin: respBody.data?.clientAddrOrig,
        destination: respBody.data?.clientAddrDest,
        raw: response.data,
      });
    } else if (response.data?.header?.staTrans === 'ok') {
      // Fallback para formato alternativo
      res.json({
        success: true,
        quotes: response.data.body?.response || [],
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: respBody?.messages || response.data?.header?.desTrans || 'Error en cotización',
        raw: response.data,
      });
    }
  } catch (error: any) {
    console.error('Error en PQTX cotización:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 3. GENERAR ENVÍO (crear guía)
// POST /api/admin/paquete-express/shipment
// ============================================
export async function pqtxCreateShipment(req: Request, res: Response) {
  try {
    const token = await getJwtToken();
    const {
      // Origen
      originCountry = 'MEXICO',
      originState,
      originMunicipality,
      originCity,
      originColony,
      originZipCode,
      originStreet,
      originNumber,
      originPhone,
      originName,
      originEmail,
      originContact,
      // Destino
      destCountry = 'MEXICO',
      destState = ' ',
      destMunicipality = ' ',
      destCity = ' ',
      destColony,
      destZipCode,
      destStreet,
      destNumber,
      destPhone,
      destName,
      destEmail,
      destContact,
      // Paquete(s)
      packages = [],
      // Servicio
      serviceType = 'STD-T',
      paymentMode = 'PAID',
      paymentType = 'C',
      comment = '',
      reference = '',
      // SAT
      productIdSAT = '01010101',
    } = req.body;

    if (!originZipCode || !destZipCode || packages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere dirección de origen, destino y al menos un paquete'
      });
    }

    const radSrvcItemDTOList = packages.map((pkg: any) => ({
      srvcId: pkg.type === 'envelope' ? 'ENVELOPES' : 'PACKETS',
      productIdSAT: pkg.productIdSAT || productIdSAT,
      weight: String(pkg.weight || 1),
      volL: String(pkg.length || 30),
      volW: String(pkg.width || 30),
      volH: String(pkg.height || 30),
      cont: pkg.content || 'PAQUETE',
      qunt: String(pkg.quantity || 1),
    }));

    const url = `${PQTX_BASE_URL}/RadRestFul/api/rad/v1/guia`;
    const body = {
      header: {
        security: {
          user: PQTX_USER,
          type: 0,
          token,
        },
        device: {
          appName: null,
          type: null,
          ip: 'entregax',
          idDevice: null,
        },
        target: null,
        output: null,
        language: null,
      },
      body: {
        request: {
          data: [
            {
              billRad: 'REQUEST',
              billClntId: PQTX_BILL_CLIENT_ID,
              pymtMode: paymentMode,
              pymtType: paymentType,
              comt: comment,
              radGuiaAddrDTOList: [
                {
                  addrLin1: originCountry,
                  addrLin3: originState || ' ',
                  addrLin4: originMunicipality || ' ',
                  addrLin5: originCity || ' ',
                  addrLin6: originColony || ' ',
                  zipCode: originZipCode,
                  strtName: originStreet || ' ',
                  drnr: originNumber || 'S/N',
                  phno1: originPhone || '0000000000',
                  phno2: originPhone || '0000000000',
                  clntName: originName || 'ENTREGAX',
                  email: originEmail || 'operaciones@entregax.com',
                  contacto: originContact || originName || 'ENTREGAX',
                  addrType: 'ORIGIN',
                },
                {
                  addrLin1: destCountry,
                  addrLin3: destState,
                  addrLin4: destMunicipality,
                  addrLin5: destCity,
                  addrLin6: destColony || ' ',
                  zipCode: destZipCode,
                  strtName: destStreet || ' ',
                  drnr: destNumber || 'S/N',
                  phno1: destPhone || '0000000000',
                  phno2: destPhone || '0000000000',
                  clntName: destName || 'CLIENTE',
                  email: destEmail || '',
                  contacto: destContact || destName || 'CLIENTE',
                  addrType: 'DESTINATION',
                },
              ],
              radSrvcItemDTOList,
              listSrvcItemDTO: [
                { srvcId: 'EAD', value1: '' },
                { srvcId: 'RAD', value1: '' },
              ],
              typeSrvcId: serviceType,
              listRefs: reference ? [{ grGuiaRefr: reference }] : [],
            },
          ],
          objectDTO: null,
        },
        response: null,
      },
    };

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    // La API PQTX responde con header:null y datos en body.response.data
    const respBody = response.data?.body?.response;
    const guiaData = respBody?.data || respBody;

    if (respBody?.success === true && respBody?.data) {
      // data puede ser string (número de guía) u objeto con propiedades
      const guiaNo = typeof respBody.data === 'string'
        ? respBody.data
        : (respBody.data.rhGuiaNo || respBody.data.guiaNo || '');
      const folioPorte = typeof respBody.objectDTO === 'string'
        ? respBody.objectDTO
        : '';
      const addData = respBody.additionalData || null;

      // Guardar en DB
      try {
        const totalWeight = packages.reduce((s: number, p: any) => s + (Number(p.weight) || 0) * (Number(p.quantity) || 1), 0);
        const totalPieces = packages.reduce((s: number, p: any) => s + (Number(p.quantity) || 1), 0);
        const userId = (req as any).user?.userId || (req as any).user?.id || null;
        await pool.query(
          `INSERT INTO pqtx_shipments (tracking_number, folio_porte, service_type, origin_name, origin_zip_code, origin_city, dest_name, dest_zip_code, dest_city, weight, pieces, subtotal, total, status, created_by, raw_response)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'generated',$14,$15)`,
          [guiaNo, folioPorte, serviceType, originName || 'ENTREGAX', originZipCode, originCity || originMunicipality || '', destName || 'CLIENTE', destZipCode, destCity || destMunicipality || '', totalWeight, totalPieces, addData?.subTotlAmnt || null, addData?.totalAmnt || null, userId, JSON.stringify(response.data)]
        );
      } catch (dbErr: any) {
        console.error('Error guardando guía PQTX en DB:', dbErr.message);
      }

      res.json({
        success: true,
        trackingNumber: guiaNo,
        folioPorte,
        message: respBody.messages || 'Guía generada correctamente',
        shipment: respBody.data,
        additionalData: addData,
        raw: response.data,
      });
    } else if (response.data?.header?.staTrans === 'ok') {
      const guiaNo = guiaData?.rhGuiaNo || '';
      res.json({
        success: true,
        trackingNumber: guiaNo,
        message: response.data.body?.message || '',
        shipment: guiaData,
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: respBody?.messages || response.data?.header?.desTrans || 'Error al generar envío',
        raw: response.data,
      });
    }
  } catch (error: any) {
    console.error('Error en PQTX crear envío:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 4. PROGRAMAR RECOLECCIÓN
// POST /api/admin/paquete-express/pickup
// ============================================
export async function pqtxSchedulePickup(req: Request, res: Response) {
  try {
    const token = await getJwtToken();
    const {
      trackingNumber,
      numberOfPackages = '1',
      pickupDate,
      pickupTimeFrom,
    } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere número de guía'
      });
    }

    // Convert dates to milliseconds timestamp
    const planCollDate = pickupDate ? new Date(pickupDate).getTime() : Date.now();
    const hourFrom = pickupTimeFrom ? new Date(pickupTimeFrom).getTime() : 0;

    const url = `${PQTX_BASE_URL}/RadRestFul/api/rad/v1/order`;
    const body = {
      header: {
        security: {
          user: PQTX_USER,
          type: 0,
          token,
        },
        device: null,
        target: null,
        output: null,
        language: null,
      },
      body: {
        request: {
          data: [
            {
              numbPack: String(numberOfPackages),
              planCollDate,
              hourFrom,
              hourTo: 0,
              guiaNo: trackingNumber,
              radGuiaAddrDTOList: [],
            },
          ],
        },
      },
    };

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    // La API PQTX responde con header:null y datos en body.response.data
    const respBody = response.data?.body?.response;

    if (respBody?.success === true) {
      res.json({
        success: true,
        message: 'Recolección programada correctamente',
        data: respBody.data || respBody,
        raw: response.data,
      });
    } else if (response.data?.header?.staTrans === 'ok') {
      res.json({
        success: true,
        message: 'Recolección programada correctamente',
        data: response.data.body?.response || response.data.body,
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: respBody?.messages || response.data?.header?.desTrans || 'Error al programar recolección',
        raw: response.data,
      });
    }
  } catch (error: any) {
    console.error('Error en PQTX programar recolección:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 5. CANCELAR GUÍA
// POST /api/admin/paquete-express/cancel
// ============================================
export async function pqtxCancel(req: Request, res: Response) {
  try {
    const token = await getJwtToken();
    const { trackingNumbers } = req.body;

    if (!trackingNumbers || !Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere al menos un número de guía para cancelar'
      });
    }

    const url = `${PQTX_BASE_URL}/RadRestFul/api/rad/v1/cancelguia`;
    const body = {
      header: {
        security: {
          user: PQTX_USER,
          token,
        },
      },
      body: {
        request: {
          data: trackingNumbers,
        },
      },
    };

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    // La API PQTX responde con header:null y datos en body.response.data
    const respBody = response.data?.body?.response;

    if (respBody?.success === true) {
      res.json({
        success: true,
        message: `${trackingNumbers.length} guía(s) cancelada(s) correctamente`,
        data: respBody.data || respBody,
        raw: response.data,
      });
    } else if (response.data?.header?.staTrans === 'ok') {
      res.json({
        success: true,
        message: `${trackingNumbers.length} guía(s) cancelada(s) correctamente`,
        data: response.data.body,
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: respBody?.messages || response.data?.header?.desTrans || 'Error al cancelar guía(s)',
        raw: response.data,
      });
    }
  } catch (error: any) {
    console.error('Error en PQTX cancelación:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 6. TRAZABILIDAD (Tracking)
// GET /api/admin/paquete-express/track/:trackingNumber
// ============================================
export async function pqtxTrack(req: Request, res: Response) {
  try {
    const token = await getJwtToken();
    const { trackingNumber } = req.params;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere número de guía'
      });
    }

    const url = `${PQTX_BASE_URL}/ptxws/rest/api/v3/guia/historico/${trackingNumber}/${token}`;

    const response = await axios.get(url, {
      timeout: 15000,
    });

    // Extraer el array de eventos de la estructura PQTX v2: header/body/response/data
    const pqtxData = response.data;
    const events = pqtxData?.body?.response?.data;

    if (Array.isArray(events)) {
      res.json({
        success: true,
        tracking: events,
      });
    } else {
      // Fallback: devolver raw data si la estructura es diferente
      res.json({
        success: true,
        tracking: pqtxData,
      });
    }
  } catch (error: any) {
    console.error('Error en PQTX trazabilidad:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 7. IMPRESIÓN PDF
// GET /api/admin/paquete-express/label/pdf/:trackingNumber
// ============================================
export async function pqtxLabelPdf(req: Request, res: Response) {
  try {
    const { trackingNumber } = req.params;
    const { format = '4x6' } = req.query;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere número de guía'
      });
    }

    let url = `${PQTX_BASE_URL}/wsReportPaquetexpress/GenCartaPorte?trackingNoGen=${trackingNumber}`;
    if (format === '4x6') {
      url += '&measure=4x6';
    }

    console.log(`📄 [PQTX Label PDF] Solicitando: ${url}`);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 20000,
      // No tirar en status 4xx/5xx para poder leer el body de error de PQTX
      validateStatus: () => true,
    });

    const buffer = Buffer.from(response.data);
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    const header = buffer.subarray(0, 5).toString('latin1');

    console.log(`📄 [PQTX Label PDF] status=${response.status} size=${buffer.length} content-type="${contentType}" header="${header}"`);

    // 🛡️ Validar que realmente sea un PDF (magic bytes %PDF-)
    if (response.status !== 200 || !header.startsWith('%PDF-')) {
      // PQTX devolvió HTML, JSON o texto de error
      let errorMessage = `PQTX no devolvió un PDF válido (HTTP ${response.status})`;
      const bodyPreview = buffer.toString('utf8', 0, Math.min(buffer.length, 500));
      console.error(`❌ [PQTX Label PDF] Respuesta inválida. Body preview:\n${bodyPreview}`);

      // Intentar extraer mensaje útil
      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(bodyPreview);
          errorMessage = json.error || json.message || json.desTrans || errorMessage;
        } catch { /* ignore */ }
      } else if (contentType.includes('text/html')) {
        const titleMatch = bodyPreview.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) errorMessage = `PQTX: ${titleMatch[1].trim()}`;
      } else if (bodyPreview.trim().length > 0 && bodyPreview.length < 300) {
        errorMessage = `PQTX: ${bodyPreview.trim()}`;
      }

      return res.status(502).json({
        success: false,
        error: errorMessage,
        tracking: trackingNumber,
        pqtxStatus: response.status,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=PQTX_${trackingNumber}.pdf`);
    res.send(buffer);
  } catch (error: any) {
    console.error('Error en PQTX etiqueta PDF:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 8. IMPRESIÓN ZPL
// GET /api/admin/paquete-express/label/zpl/:trackingNumber
// ============================================
export async function pqtxLabelZpl(req: Request, res: Response) {
  try {
    const token = await getJwtToken();
    const { trackingNumber } = req.params;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere número de guía'
      });
    }

    const url = `${PQTX_BASE_URL}/RadRestFul/api/rad/v1/infotrack`;
    const body = {
      header: {
        security: {
          token,
          user: PQTX_USER,
        },
      },
      body: {
        request: {
          data: {
            header: {},
            solicitudEnvio: {
              datosAdicionales: {
                datoAdicional: [
                  {
                    claveDataAd: 'getZPL',
                    valorDataAd: '1',
                  },
                ],
              },
              rastreo: trackingNumber,
            },
          },
        },
      },
    };

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    // La API PQTX responde con header:null y datos en body.response.data
    const respBody = response.data?.body?.response;

    if (respBody?.success === true) {
      res.json({
        success: true,
        zpl: respBody.data || respBody,
        raw: response.data,
      });
    } else if (response.data?.header?.staTrans === 'ok') {
      res.json({
        success: true,
        zpl: response.data.body?.response || response.data.body,
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: respBody?.messages || response.data?.header?.desTrans || 'Error al obtener ZPL',
        raw: response.data,
      });
    }
  } catch (error: any) {
    console.error('Error en PQTX etiqueta ZPL:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 9. LISTAR GUÍAS GENERADAS
// GET /api/admin/paquete-express/shipments
// ============================================
export async function pqtxListShipments(req: Request, res: Response) {
  try {
    const { search, status, limit = '50', offset = '0', date_from, date_to } = req.query;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (search) {
      where += ` AND (s.tracking_number ILIKE $${idx} OR s.dest_name ILIKE $${idx} OR s.origin_name ILIKE $${idx} OR s.folio_porte ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (status && status !== 'all') {
      where += ` AND s.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (date_from) {
      where += ` AND s.created_at >= $${idx}`;
      params.push(date_from);
      idx++;
    }
    if (date_to) {
      where += ` AND s.created_at <= $${idx}`;
      params.push(`${date_to} 23:59:59`);
      idx++;
    }

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM pqtx_shipments s ${where}`, params);
    const total = parseInt(countRes.rows[0].total);

    // 💰 Totales del rango filtrado (independientes del paginado)
    const sumsRes = await pool.query(
      `SELECT
         COALESCE(SUM(s.total), 0)::float    AS sum_cost_total,
         COALESCE(SUM(s.subtotal), 0)::float AS sum_cost_subtotal,
         COUNT(*)::int                        AS count_all
       FROM pqtx_shipments s ${where}`,
      params
    );

    params.push(Number(limit), Number(offset));
    const result = await pool.query(
      `SELECT
         s.*,
         u.full_name AS created_by_name,
         -- 💰 Precio de venta al cliente (misma regla que pqtxClientQuote):
         --   Si costo_total / pieces < 300  => 400 * pieces
         --   Si costo_total / pieces >= 300 => (ceil(costo/pieces) + 100) * pieces
         CASE
           WHEN COALESCE(s.pieces, 1) <= 0 OR s.total IS NULL THEN NULL
           WHEN (s.total / GREATEST(s.pieces, 1)) < 300
             THEN 400 * GREATEST(s.pieces, 1)
           ELSE (CEIL(s.total / GREATEST(s.pieces, 1)) + 100) * GREATEST(s.pieces, 1)
         END::numeric AS client_price
       FROM pqtx_shipments s
       LEFT JOIN users u ON u.id = s.created_by
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    // Calcular suma de client_price para el rango filtrado (mismo WHERE sin limit/offset)
    const rangeParams = params.slice(0, idx - 1);
    const clientSumRes = await pool.query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN COALESCE(s.pieces, 1) <= 0 OR s.total IS NULL THEN 0
           WHEN (s.total / GREATEST(s.pieces, 1)) < 300
             THEN 400 * GREATEST(s.pieces, 1)
           ELSE (CEIL(s.total / GREATEST(s.pieces, 1)) + 100) * GREATEST(s.pieces, 1)
         END
       ), 0)::float AS sum_client_price
       FROM pqtx_shipments s ${where}`,
      rangeParams
    );

    res.json({
      success: true,
      shipments: result.rows,
      total,
      limit: Number(limit),
      offset: Number(offset),
      totals: {
        costTotal: sumsRes.rows[0].sum_cost_total,
        costSubtotal: sumsRes.rows[0].sum_cost_subtotal,
        clientPrice: clientSumRes.rows[0].sum_client_price,
        profit: clientSumRes.rows[0].sum_client_price - sumsRes.rows[0].sum_cost_total,
        count: sumsRes.rows[0].count_all,
      },
    });
  } catch (error: any) {
    console.error('Error listando guías PQTX:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 10. CONFIG - Obtener configuración actual
// GET /api/admin/paquete-express/config
// ============================================
export async function pqtxGetConfig(req: Request, res: Response) {
  try {
    res.json({
      success: true,
      config: {
        baseUrl: PQTX_BASE_URL,
        user: PQTX_USER,
        billClientId: PQTX_BILL_CLIENT_ID,
        quoteUser: PQTX_QUOTE_USER,
        hasToken: !!cachedJwtToken,
        environment: PQTX_BASE_URL.includes('qa') ? 'QA (Testing)' : 'Producción',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 11. COTIZACIÓN PARA CLIENTE (con regla de utilidad)
// POST /api/shipping/pqtx-quote
// Body: { destZipCode, packageCount, weight, length, width, height }
//
// REGLAS DE PRECIO:
//   - Si cotización PQTX < $300 → cobrar $400 MXN total
//   - Si cotización PQTX >= $300 → cotización + $100 MXN por caja
// ============================================
const PQTX_ORIGIN_ZIP = process.env.PQTX_ORIGIN_ZIP || '64860'; // Bodega MTY

export async function pqtxClientQuote(req: Request, res: Response) {
  try {
    const {
      destZipCode,
      packageCount = 1,
      weight = 1,
      length = 30,
      width = 30,
      height = 30,
    } = req.body;

    if (!destZipCode) {
      return res.status(400).json({ success: false, error: 'Se requiere CP destino' });
    }

    console.log(`[PQTX-CLIENT] Params recibidos: ZIP=${destZipCode}, boxes=${packageCount}, weight=${weight}, dims=${length}x${width}x${height}`);

    // Construir paquetes para la cotización
    const shipments = [];
    for (let i = 0; i < packageCount; i++) {
      shipments.push({
        sequence: i + 1,
        quantity: 1,
        shpCode: '2', // caja/paquete
        weight: weight,
        longShip: length,
        widthShip: width,
        highShip: height,
      });
    }

    const url = `${PQTX_BASE_URL}/WsQuotePaquetexpress/api/apiQuoter/v2/getQuotation`;
    const body = {
      header: {
        security: {
          user: PQTX_QUOTE_USER,
          password: PQTX_QUOTE_PASSWORD,
          type: 1,
          token: PQTX_QUOTE_TOKEN,
        },
        device: { appName: 'EntregaX', type: 'Web', ip: '', idDevice: '' },
        target: { module: 'QUOTER', version: '1.0', service: 'quoter', uri: 'quotes', event: 'R' },
        output: 'JSON',
        language: null,
      },
      body: {
        request: {
          data: {
            clientAddrOrig: { zipCode: PQTX_ORIGIN_ZIP, colonyName: 'CENTRO' },
            clientAddrDest: { zipCode: destZipCode, colonyName: 'CENTRO' },
            services: { dlvyType: '1', ackType: 'N', totlDeclVlue: 1000, invType: 'A', radType: '1' },
            otherServices: { otherServices: [] },
            shipmentDetail: { shipments },
            quoteServices: ['ALL'],
          },
          objectDTO: null,
        },
        response: null,
      },
    };

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    const respBody = response.data?.body?.response;
    const quotations = respBody?.data?.quotations;

    if (!respBody?.success || !Array.isArray(quotations) || quotations.length === 0) {
      // Si no hay cotización disponible, retornar precio fijo de fallback
      console.log('[PQTX-CLIENT] Sin cotización disponible, usando fallback $400/caja');
      return res.json({
        success: true,
        carrier: 'paquete_express',
        name: 'Paquete Express',
        pqtxQuote: null,
        clientPrice: 400 * packageCount,
        pricePerBox: 400,
        packageCount,
        currency: 'MXN',
        rule: 'fallback',
        estimatedDays: '2-4 días hábiles',
      });
    }

    // Tomar la cotización más económica (terrestre normalmente)
    const cheapest = quotations.reduce((min: any, q: any) => {
      const qTotal = parseFloat(q.amount?.totalAmnt || q.totalAmnt || q.totalAmount || q.total || '0');
      const mTotal = parseFloat(min.amount?.totalAmnt || min.totalAmnt || min.totalAmount || min.total || '0');
      return qTotal < mTotal ? q : min;
    }, quotations[0]);

    const pqtxTotal = parseFloat(cheapest.amount?.totalAmnt || cheapest.totalAmnt || cheapest.totalAmount || cheapest.total || '0');

    // REGLA DE UTILIDAD (precio POR CAJA)
    const pqtxPerBox = packageCount > 1 ? pqtxTotal / packageCount : pqtxTotal;
    let pricePerBox: number;
    let clientPrice: number;
    let rule: string;

    if (pqtxPerBox < 300) {
      // Si cotización por caja < $300 → cobrar $400 por caja
      pricePerBox = 400;
      clientPrice = 400 * packageCount;
      rule = 'min_400_per_box';
    } else {
      // Si cotización por caja >= $300 → agregar $100 por caja
      pricePerBox = Math.round(pqtxPerBox + 100);
      clientPrice = pricePerBox * packageCount;
      rule = 'plus_100_per_box';
    }

    console.log(`[PQTX-CLIENT] ZIP=${destZipCode}, boxes=${packageCount}, pqtxQuote=$${pqtxTotal}, pricePerBox=$${pricePerBox}, clientTotal=$${clientPrice}, rule=${rule}`);

    res.json({
      success: true,
      carrier: 'paquete_express',
      name: 'Paquete Express',
      pqtxQuote: pqtxTotal,
      clientPrice,
      pricePerBox,
      packageCount,
      currency: 'MXN',
      rule,
      estimatedDays: cheapest.dlvyEstDate || '2-4 días hábiles',
      serviceName: cheapest.zoneName || cheapest.serviceDescription || 'Terrestre',
    });

  } catch (error: any) {
    console.error('[PQTX-CLIENT] Error en cotización:', error.message);
    // En caso de error de API, retornar precio fijo de fallback
    const fallbackCount = req.body?.packageCount || 1;
    res.json({
      success: true,
      carrier: 'paquete_express',
      name: 'Paquete Express',
      pqtxQuote: null,
      clientPrice: 400 * fallbackCount,
      pricePerBox: 400,
      packageCount: fallbackCount,
      currency: 'MXN',
      rule: 'error_fallback',
      estimatedDays: '2-4 días hábiles',
    });
  }
}

// ============================================
// GENERAR GUÍA PQTX PARA UN PAQUETE EXISTENTE
// POST /api/admin/paquete-express/generate-for-package
// Body: { packageId: number }
// Si el paquete es master con hijas, se genera UNA guía PQTX por cada hija.
// ============================================

interface PqtxAddrCtx {
  recipient_name: string | null;
  street: string | null;
  exterior_number: string | null;
  interior_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
}

async function generateOnePqtxGuide(params: {
  pkgId: number;
  trackingInternal: string;
  // Lista de bultos (cajas). Si hay 1 caja → guía single. Si hay N → guía multipieza.
  pieces: Array<{
    weight: number;
    pkgLength: number;
    pkgWidth: number;
    pkgHeight: number;
    description: string | null;
  }>;
  addr: PqtxAddrCtx;
  userName: string | null;
  userEmail: string | null;
  token: string;
  createdBy: number | null;
  // IDs de hijas para persistir el mismo national_tracking en todas
  childIds?: number[];
}): Promise<{ ok: true; tracking: string; folioPorte: string; labelUrl: string; pieces: number } | { ok: false; error: string; raw?: any }> {
  const PQTX_ORIGIN_ZIP = process.env.PQTX_ORIGIN_ZIP || '64860';
  const PQTX_ORIGIN_CITY = process.env.PQTX_ORIGIN_CITY || 'MONTERREY';
  const PQTX_ORIGIN_STATE = process.env.PQTX_ORIGIN_STATE || 'NUEVO LEON';
  const PQTX_ORIGIN_MUN = process.env.PQTX_ORIGIN_MUN || 'MONTERREY';
  const PQTX_ORIGIN_COL = process.env.PQTX_ORIGIN_COL || 'TORREMOLINOS';
  const PQTX_ORIGIN_STREET = process.env.PQTX_ORIGIN_STREET || 'REVOLUCION SUR';
  const PQTX_ORIGIN_NUM = process.env.PQTX_ORIGIN_NUM || '3866 B8';
  const PQTX_ORIGIN_PHONE = process.env.PQTX_ORIGIN_PHONE || '8120029375';
  const PQTX_ORIGIN_NAME = process.env.PQTX_ORIGIN_NAME || 'ENTREGAX';
  const PQTX_ORIGIN_EMAIL = process.env.PQTX_ORIGIN_EMAIL || 'operaciones@entregax.com';

  const piecesArr = params.pieces && params.pieces.length > 0
    ? params.pieces
    : [{ weight: 1, pkgLength: 30, pkgWidth: 30, pkgHeight: 30, description: null }];

  const totalPieces = piecesArr.length;
  const totalWeight = piecesArr.reduce((acc, p) => acc + (Number(p.weight) || 0), 0) || 1;

  // PQTX espera UN item con qunt = N (número de bultos) para guías multipieza,
  // NO un array de N items. Usamos peso total + dimensiones promedio (o de la primera caja).
  const avgL = piecesArr.reduce((s, p) => s + (Number(p.pkgLength) || 0), 0) / totalPieces || 30;
  const avgW = piecesArr.reduce((s, p) => s + (Number(p.pkgWidth) || 0), 0) / totalPieces || 30;
  const avgH = piecesArr.reduce((s, p) => s + (Number(p.pkgHeight) || 0), 0) / totalPieces || 30;
  const firstDesc = piecesArr.find((p) => p.description)?.description || 'PAQUETE';

  const radSrvcItemDTOList = [{
    srvcId: 'PACKETS',
    productIdSAT: '01010101',
    weight: String(totalWeight.toFixed(2)),
    volL: String(Math.round(avgL)),
    volW: String(Math.round(avgW)),
    volH: String(Math.round(avgH)),
    cont: firstDesc,
    qunt: String(totalPieces),
  }];

  const commentSuffix = totalPieces > 1 ? ` (${totalPieces} cajas)` : '';


  const url = `${PQTX_BASE_URL}/RadRestFul/api/rad/v1/guia`;
  const body = {
    header: {
      security: { user: PQTX_USER, type: 0, token: params.token },
      device: { appName: null, type: null, ip: 'entregax', idDevice: null },
      target: null, output: null, language: null,
    },
    body: {
      request: {
        data: [{
          billRad: 'REQUEST',
          billClntId: PQTX_BILL_CLIENT_ID,
          pymtMode: 'PAID',
          pymtType: 'C',
          comt: `Paquete ${params.trackingInternal}${commentSuffix}`,
          radGuiaAddrDTOList: [
            {
              addrLin1: 'MEXICO',
              addrLin3: PQTX_ORIGIN_STATE,
              addrLin4: PQTX_ORIGIN_MUN,
              addrLin5: PQTX_ORIGIN_CITY,
              addrLin6: PQTX_ORIGIN_COL,
              zipCode: PQTX_ORIGIN_ZIP,
              strtName: PQTX_ORIGIN_STREET,
              drnr: PQTX_ORIGIN_NUM,
              phno1: PQTX_ORIGIN_PHONE,
              phno2: PQTX_ORIGIN_PHONE,
              clntName: PQTX_ORIGIN_NAME,
              email: PQTX_ORIGIN_EMAIL,
              contacto: PQTX_ORIGIN_NAME,
              addrType: 'ORIGIN',
            },
            {
              addrLin1: 'MEXICO',
              addrLin3: (params.addr.state || ' ').toUpperCase(),
              addrLin4: (params.addr.city || ' ').toUpperCase(),
              addrLin5: (params.addr.city || ' ').toUpperCase(),
              addrLin6: (params.addr.neighborhood || ' ').toUpperCase(),
              zipCode: params.addr.zip_code || '',
              strtName: (params.addr.street || ' ').toUpperCase(),
              drnr: (() => {
                const ext = (params.addr.exterior_number || '').toString().trim();
                const intr = (params.addr.interior_number || '').toString().trim();
                if (ext && intr) return `${ext} INT ${intr}`.toUpperCase();
                if (ext) return ext.toUpperCase();
                if (intr) return `S/N INT ${intr}`.toUpperCase();
                return 'S/N';
              })(),
              phno1: (params.addr.phone || '0000000000').replace(/[^0-9]/g, '').slice(-10).padStart(10, '0') || '0000000000',
              phno2: (params.addr.phone || '0000000000').replace(/[^0-9]/g, '').slice(-10).padStart(10, '0') || '0000000000',
              clntName: (params.addr.recipient_name || params.userName || 'CLIENTE').toUpperCase(),
              email: params.userEmail || '',
              contacto: (params.addr.recipient_name || params.userName || 'CLIENTE').toUpperCase(),
              addrType: 'DESTINATION',
            },
          ],
          radSrvcItemDTOList,
          listSrvcItemDTO: [
            { srvcId: 'EAD', value1: '' },
            { srvcId: 'RAD', value1: '' },
          ],
          typeSrvcId: 'STD-T',
          listRefs: params.trackingInternal ? [{ grGuiaRefr: params.trackingInternal }] : [],
        }],
        objectDTO: null,
      },
      response: null,
    },
  };

  console.log(`🚚 [PQTX-GEN] Generando guía para ${params.trackingInternal} (${totalPieces} bulto${totalPieces === 1 ? '' : 's'}, ${totalWeight.toFixed(2)} kg) → ${params.addr.zip_code}`);
  const response = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const respBody = response.data?.body?.response;
  if (respBody?.success !== true || !respBody?.data) {
    return {
      ok: false,
      error: respBody?.messages || response.data?.header?.desTrans || 'Error al generar guía',
      raw: response.data,
    };
  }

  const guiaNo = typeof respBody.data === 'string'
    ? respBody.data
    : (respBody.data.rhGuiaNo || respBody.data.guiaNo || '');
  const folioPorte = typeof respBody.objectDTO === 'string' ? respBody.objectDTO : '';
  const addData = respBody.additionalData || null;
  const labelUrl = `/api/admin/paquete-express/label/pdf/${guiaNo}`;

  // Persistir master
  try {
    await pool.query(
      `UPDATE packages
          SET national_tracking = $1,
              national_label_url = $2,
              national_carrier = COALESCE(national_carrier, 'Paquete Express'),
              updated_at = NOW()
        WHERE id = $3`,
      [guiaNo, labelUrl, params.pkgId]
    );
  } catch (e: any) {
    console.error('No se pudo actualizar packages.national_tracking (master):', e.message);
  }

  // Persistir el MISMO national_tracking en todas las hijas (multipieza)
  if (params.childIds && params.childIds.length > 0) {
    try {
      await pool.query(
        `UPDATE packages
            SET national_tracking = $1,
                national_label_url = $2,
                national_carrier = COALESCE(national_carrier, 'Paquete Express'),
                updated_at = NOW()
          WHERE id = ANY($3::int[])`,
        [guiaNo, labelUrl, params.childIds]
      );
    } catch (e: any) {
      console.error('No se pudo actualizar children.national_tracking:', e.message);
    }
  }

  try {
    await pool.query(
      `INSERT INTO pqtx_shipments (tracking_number, folio_porte, service_type, origin_name, origin_zip_code, origin_city, dest_name, dest_zip_code, dest_city, weight, pieces, subtotal, total, status, created_by, raw_response)
       VALUES ($1,$2,'STD-T',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'generated',$13,$14)`,
      [
        guiaNo, folioPorte,
        PQTX_ORIGIN_NAME, PQTX_ORIGIN_ZIP, PQTX_ORIGIN_CITY,
        (params.addr.recipient_name || params.userName || 'CLIENTE'),
        params.addr.zip_code || '', params.addr.city || '',
        totalWeight,
        totalPieces,
        addData?.subTotlAmnt || null,
        addData?.totalAmnt || null,
        params.createdBy,
        JSON.stringify(response.data),
      ]
    );
  } catch (e: any) {
    console.error('No se pudo guardar pqtx_shipments:', e.message);
  }

  return { ok: true, tracking: guiaNo, folioPorte, labelUrl, pieces: totalPieces };
}

export async function pqtxGenerateForPackage(req: Request, res: Response) {
  try {
    const { packageId } = req.body || {};
    if (!packageId) {
      res.status(400).json({ success: false, error: 'packageId requerido' });
      return;
    }

    // Cargar paquete + dirección + cliente
    const pkgRes = await pool.query(
      `SELECT p.*, u.full_name AS user_name, u.email AS user_email,
              a.recipient_name, a.street, a.exterior_number, a.interior_number,
              a.neighborhood, a.city, a.state, a.zip_code, a.phone, a.reference
         FROM packages p
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN addresses a ON p.assigned_address_id = a.id
        WHERE p.id = $1`,
      [packageId]
    );
    if (pkgRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Paquete no encontrado' });
      return;
    }
    const pkg = pkgRes.rows[0];

    if (!pkg.assigned_address_id || !pkg.zip_code) {
      res.status(400).json({ success: false, error: 'El paquete no tiene dirección de entrega asignada con código postal' });
      return;
    }

    // Buscar hijas (bultos del master)
    const childrenRes = await pool.query(
      `SELECT id, tracking_internal, weight, pkg_length, pkg_width, pkg_height,
              description, box_number, national_tracking, national_label_url
         FROM packages
        WHERE master_id = $1
        ORDER BY box_number, id`,
      [packageId]
    );
    const children = childrenRes.rows;

    // Si ya tiene guía nacional, devolverla (una sola guía multipieza para master + hijas)
    if (pkg.national_tracking) {
      const labelUrl = pkg.national_label_url || `/api/admin/paquete-express/label/pdf/${pkg.national_tracking}`;
      const trackings: Array<{ packageId: number; tracking: string; labelUrl: string; boxNumber: number | null }> = [
        { packageId: pkg.id, tracking: pkg.national_tracking, labelUrl, boxNumber: null },
      ];
      // Asegurar que hijas estén alineadas al mismo tracking (sincronización)
      if (children.length > 0) {
        const stale = children.filter((c: any) => c.national_tracking !== pkg.national_tracking).map((c: any) => c.id);
        if (stale.length > 0) {
          try {
            await pool.query(
              `UPDATE packages SET national_tracking = $1, national_label_url = $2,
                 national_carrier = COALESCE(national_carrier, 'Paquete Express'), updated_at = NOW()
               WHERE id = ANY($3::int[])`,
              [pkg.national_tracking, labelUrl, stale]
            );
          } catch (e: any) { console.error('No se pudo sincronizar hijas:', e.message); }
        }
      }
      res.json({
        success: true,
        alreadyExists: true,
        trackingNumber: pkg.national_tracking,
        labelUrl,
        pieces: Math.max(1, children.length || 1),
        trackings,
      });
      return;
    }

    const token = await getJwtToken();
    const userId = (req as any).user?.userId || (req as any).user?.id || null;

    const addr: PqtxAddrCtx = {
      recipient_name: pkg.recipient_name,
      street: pkg.street,
      exterior_number: pkg.exterior_number,
      interior_number: pkg.interior_number,
      neighborhood: pkg.neighborhood,
      city: pkg.city,
      state: pkg.state,
      zip_code: pkg.zip_code,
      phone: pkg.phone,
    };

    // Construir lista de bultos: hijas si existen, si no master como única caja
    const piecesData = children.length > 0
      ? children.map((c: any) => ({
          weight: Number(c.weight) || Number(pkg.weight) || 1,
          pkgLength: Number(c.pkg_length) || Number(pkg.pkg_length) || 30,
          pkgWidth: Number(c.pkg_width) || Number(pkg.pkg_width) || 30,
          pkgHeight: Number(c.pkg_height) || Number(pkg.pkg_height) || 30,
          description: c.description || pkg.description,
        }))
      : [{
          weight: Number(pkg.weight) || 1,
          pkgLength: Number(pkg.pkg_length) || 30,
          pkgWidth: Number(pkg.pkg_width) || 30,
          pkgHeight: Number(pkg.pkg_height) || 30,
          description: pkg.description,
        }];

    const childIds = children.map((c: any) => c.id);

    const result = await generateOnePqtxGuide({
      pkgId: pkg.id,
      trackingInternal: pkg.tracking_internal,
      pieces: piecesData,
      addr,
      userName: pkg.user_name,
      userEmail: pkg.user_email,
      token,
      createdBy: userId,
      childIds,
    });

    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error, raw: result.raw });
      return;
    }

    res.json({
      success: true,
      multi: piecesData.length > 1,
      pieces: result.pieces,
      trackingNumber: result.tracking,
      folioPorte: result.folioPorte,
      labelUrl: result.labelUrl,
      trackings: [{ packageId: pkg.id, tracking: result.tracking, labelUrl: result.labelUrl, folioPorte: result.folioPorte, boxNumber: null }],
      message: piecesData.length > 1
        ? `Guía multipieza (${result.pieces} cajas) generada correctamente`
        : 'Guía generada correctamente',
    });
  } catch (error: any) {
    console.error('Error en pqtxGenerateForPackage:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}
