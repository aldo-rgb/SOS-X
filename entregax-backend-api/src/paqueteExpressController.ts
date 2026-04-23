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
