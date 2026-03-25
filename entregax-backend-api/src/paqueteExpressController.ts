// ============================================
// PAQUETE EXPRESS API CONTROLLER
// Integración con API de Paquete Express (PQTX)
// Servicios: Cotización, Envío, Impresión, Cancelación, Trazabilidad
// ============================================

import { Request, Response } from 'express';
import axios from 'axios';

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

  if (response.data?.header?.staTrans === 'ok' && response.data?.body?.response) {
    cachedJwtToken = response.data.body.response;
    return cachedJwtToken!;
  }

  throw new Error(`Error al obtener token PQTX: ${response.data?.header?.desTrans || 'Unknown error'}`);
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

    if (response.data?.header?.staTrans === 'ok') {
      cachedJwtToken = response.data.body?.response || null;
      res.json({
        success: true,
        token: cachedJwtToken,
        message: 'Token obtenido correctamente'
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data?.header?.desTrans || 'Error al obtener token'
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

    if (response.data?.header?.staTrans === 'ok') {
      res.json({
        success: true,
        quotes: response.data.body?.response || [],
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data?.header?.desTrans || 'Error en cotización',
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

    if (response.data?.header?.staTrans === 'ok') {
      const guiaData = response.data.body?.response;
      const guiaNo = guiaData?.rhGuiaNo || '';
      const message = response.data.body?.message || '';

      res.json({
        success: true,
        trackingNumber: guiaNo,
        message,
        shipment: guiaData,
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data?.header?.desTrans || 'Error al generar envío',
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

    if (response.data?.header?.staTrans === 'ok') {
      res.json({
        success: true,
        message: 'Recolección programada correctamente',
        data: response.data.body?.response || response.data.body,
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data?.header?.desTrans || 'Error al programar recolección',
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

    if (response.data?.header?.staTrans === 'ok') {
      res.json({
        success: true,
        message: `${trackingNumbers.length} guía(s) cancelada(s) correctamente`,
        data: response.data.body,
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data?.header?.desTrans || 'Error al cancelar guía(s)',
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

    res.json({
      success: true,
      tracking: response.data,
    });
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

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 20000,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=PQTX_${trackingNumber}.pdf`);
    res.send(response.data);
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

    if (response.data?.header?.staTrans === 'ok') {
      res.json({
        success: true,
        zpl: response.data.body?.response || response.data.body,
        raw: response.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data?.header?.desTrans || 'Error al obtener ZPL',
        raw: response.data,
      });
    }
  } catch (error: any) {
    console.error('Error en PQTX etiqueta ZPL:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// 9. CONFIG - Obtener configuración actual
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
