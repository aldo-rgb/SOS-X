import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, readAsStringAsync, moveAsync } from 'expo-file-system/build/legacy/FileSystem';
import { Asset } from 'expo-asset';
import { Alert } from 'react-native';

// Load logo as base64
let logoBase64Cache: string | null = null;

const getLogoBase64 = async (): Promise<string> => {
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const asset = Asset.fromModule(require('../../assets/logo.png'));
    await asset.downloadAsync();
    if (asset.localUri) {
      const base64 = await readAsStringAsync(asset.localUri, {
        encoding: 'base64',
      });
      logoBase64Cache = `data:image/png;base64,${base64}`;
      return logoBase64Cache;
    }
  } catch (e) {
    console.log('Error loading logo:', e);
  }
  return '';
};

interface PaymentPDFData {
  payment_reference: string;
  amount: number;
  currency: string;
  bank_info?: {
    banco: string;
    cuenta: string;
    clabe: string;
    beneficiario: string;
  };
  packages?: Array<{
    id: number;
    tracking_internal?: string;
    international_tracking?: string;
    weight?: number;
    assigned_cost_mxn?: number;
    saldo_pendiente?: number;
    national_carrier?: string;
  }>;
  userName?: string;
  userCasillero?: string;
  createdAt?: string;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date?: string): string => {
  if (date) {
    return new Date(date).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  return new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const generatePaymentPDF = async (data: PaymentPDFData): Promise<void> => {
  const logo = await getLogoBase64();
  const today = formatDate();
  const totalFormatted = formatCurrency(data.amount);
  const bankInfo = data.bank_info;
  const pkgCount = data.packages?.length || 0;

  // Build package rows
  let packageRows = '';
  if (data.packages && data.packages.length > 0) {
    packageRows = data.packages.map((pkg, i) => {
      const tracking = pkg.tracking_internal || pkg.international_tracking || '-';
      const weight = pkg.weight ? `${Number(pkg.weight).toFixed(1)} lb` : '-';
      const carrier = pkg.national_carrier || '-';
      const cost = formatCurrency(Number(pkg.saldo_pendiente || pkg.assigned_cost_mxn || 0));
      return `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 11px;">${i + 1}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 11px; font-weight: 600;">${tracking}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 11px; text-align: center;">${weight}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 11px; text-align: center;">${carrier}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 11px; text-align: right; font-weight: 600;">${cost}</td>
        </tr>`;
    }).join('');
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { margin: 30px 40px; size: A4; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; font-size: 12px; line-height: 1.5; }
    
    .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 3px solid #FF6B00; margin-bottom: 20px; }
    .logo { height: 55px; }
    .company-info { text-align: right; font-size: 10px; color: #666; }
    .company-info strong { color: #333; font-size: 11px; }
    
    .title-bar { background: linear-gradient(135deg, #FF6B00, #E55A00); color: white; padding: 12px 20px; border-radius: 6px; margin-bottom: 20px; }
    .title-bar h1 { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
    .title-bar .ref { font-size: 11px; opacity: 0.9; margin-top: 2px; }
    
    .section { margin-bottom: 16px; }
    .section-title { font-size: 12px; font-weight: 700; color: #FF6B00; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #FFE0C0; }
    
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
    .info-row { display: flex; gap: 8px; }
    .info-label { color: #888; font-size: 11px; min-width: 120px; }
    .info-value { font-weight: 600; font-size: 11px; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #F8F8F8; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #FF6B00; }
    th:last-child { text-align: right; }
    
    .total-row { background: #FFF8F0; }
    .total-row td { padding: 10px; font-weight: 700; font-size: 13px; border-top: 2px solid #FF6B00; }
    
    .payment-box { background: #F9FBF5; border: 1px solid #C8E6C9; border-radius: 8px; padding: 16px; margin-top: 8px; }
    .payment-box .bank-row { margin-bottom: 4px; font-size: 11px; }
    .payment-box .bank-label { color: #666; display: inline-block; min-width: 100px; }
    .payment-box .bank-value { font-weight: 700; color: #333; }
    
    .warning-box { background: #FFF3E0; border-left: 4px solid #FF9800; padding: 10px 14px; margin-top: 12px; border-radius: 0 6px 6px 0; font-size: 10px; color: #E65100; }
    
    .instructions-box { background: #F3F8FF; border: 1px solid #BBDEFB; border-radius: 8px; padding: 14px; margin-top: 12px; }
    .instructions-box h3 { font-size: 11px; color: #1565C0; margin-bottom: 8px; }
    .instructions-box ol { padding-left: 18px; font-size: 10px; color: #444; }
    .instructions-box ol li { margin-bottom: 4px; }
    
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 9px; color: #999; text-align: center; }
    .footer a { color: #FF6B00; text-decoration: none; }
    
    .terms { margin-top: 16px; padding: 12px; background: #FAFAFA; border-radius: 6px; font-size: 8.5px; color: #999; line-height: 1.6; }
    .terms strong { color: #666; }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <div>
      ${logo ? `<img src="${logo}" class="logo" />` : '<div style="font-size:24px;font-weight:800;color:#FF6B00;">EntregaX</div>'}
    </div>
    <div class="company-info">
      <strong>ENTREGAX S.A. DE C.V.</strong><br>
      📍 Monterrey, Nuevo León, México<br>
      📧 contacto@entregax.com<br>
      🌐 www.entregax.com
    </div>
  </div>

  <!-- TITLE -->
  <div class="title-bar">
    <h1>COTIZACIÓN DE SERVICIOS LOGÍSTICOS</h1>
    <div class="ref">Folio de Referencia: <strong>${data.payment_reference}</strong> &nbsp;|&nbsp; Fecha de Emisión: ${today}</div>
  </div>

  <!-- CLIENT DATA -->
  <div class="section">
    <div class="section-title">1. Datos del Cliente</div>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Nombre / Razón Social:</span>
        <span class="info-value">${data.userName || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Casillero:</span>
        <span class="info-value">${data.userCasillero || '-'}</span>
      </div>
    </div>
  </div>

  <!-- SHIPMENT DETAILS -->
  <div class="section">
    <div class="section-title">2. Detalle del Embarque</div>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Servicio:</span>
        <span class="info-value">PO Box USA - Carga Aérea</span>
      </div>
      <div class="info-row">
        <span class="info-label">Origen:</span>
        <span class="info-value">Estados Unidos</span>
      </div>
      <div class="info-row">
        <span class="info-label">Destino:</span>
        <span class="info-value">Monterrey, N.L., México</span>
      </div>
      <div class="info-row">
        <span class="info-label">Paquetes:</span>
        <span class="info-value">${pkgCount} paquete(s)</span>
      </div>
    </div>
  </div>

  <!-- COST BREAKDOWN -->
  <div class="section">
    <div class="section-title">3. Desglose de Costos (MXN)</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px;">#</th>
          <th>Guía / Tracking</th>
          <th style="text-align:center;">Peso</th>
          <th style="text-align:center;">Paquetería</th>
          <th style="text-align:right;">Monto (MXN)</th>
        </tr>
      </thead>
      <tbody>
        ${packageRows}
        <tr class="total-row">
          <td colspan="4" style="text-align:right; padding-right: 10px;">TOTAL A PAGAR:</td>
          <td style="text-align:right; color: #E65100; font-size: 14px;">${totalFormatted} ${data.currency || 'MXN'}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PAYMENT INSTRUCTIONS -->
  <div class="section">
    <div class="section-title">💳 Instrucciones de Pago</div>
    <p style="font-size: 11px; color: #555; margin-bottom: 8px;">
      Para garantizar el despacho de su mercancía, le solicitamos realizar el pago correspondiente:
    </p>
    <div class="payment-box">
      <div class="bank-row"><span class="bank-label">Banco:</span> <span class="bank-value">${bankInfo?.banco || 'BBVA México'}</span></div>
      <div class="bank-row"><span class="bank-label">Beneficiario:</span> <span class="bank-value">${bankInfo?.beneficiario || 'ENTREGAX S.A. DE C.V.'}</span></div>
      <div class="bank-row"><span class="bank-label">Número de Cuenta:</span> <span class="bank-value">${bankInfo?.cuenta || '-'}</span></div>
      <div class="bank-row"><span class="bank-label">CLABE:</span> <span class="bank-value">${bankInfo?.clabe || '-'}</span></div>
      <div class="bank-row"><span class="bank-label">Concepto / Referencia:</span> <span class="bank-value" style="color:#E65100; font-size: 13px;">${data.payment_reference}</span></div>
    </div>

    <div class="warning-box">
      ⚠️ Favor de realizar depósitos de no más de $90,000 pesos por depósito.
    </div>
  </div>

  <!-- CONFIRMATION -->
  <div class="section">
    <div class="instructions-box">
      <h3>📧 Confirmación de Pago</h3>
      <ol>
        <li>Una vez realizado el pago, ingrese a su portal en <strong>www.entregax.app</strong></li>
        <li>Diríjase a la sección <strong>"Mis Cuentas por Pagar"</strong></li>
        <li>Seleccione la opción <strong>"Órdenes de Pago"</strong></li>
        <li>Envíe el comprobante de pago en formato PDF o JPG</li>
        <li>Para depósitos en efectivo, puede tardar de <strong>24 a 48 horas</strong> en verse reflejado</li>
      </ol>
    </div>
  </div>

  <!-- TERMS -->
  <div class="terms">
    <strong>Términos y Condiciones:</strong><br>
    Los tiempos de tránsito son estimados y están sujetos a revisiones aduanales, clima y disponibilidad de espacio en aerolíneas/navieras.
    Los costos aduanales pueden variar según el dictamen final de la autoridad. Esta cotización no incluye almacenajes prolongados en destino ni maniobras especiales.
    Los precios están expresados en Moneda Nacional (MXN) y son válidos al momento de la emisión de este documento.
  </div>

  <!-- FOOTER -->
  <div class="footer">
    ENTREGAX S.A. DE C.V. &nbsp;|&nbsp; 📍 Monterrey, N.L., México &nbsp;|&nbsp; 📧 contacto@entregax.com &nbsp;|&nbsp; 🌐 <a href="https://www.entregax.com">www.entregax.com</a><br>
    Documento generado el ${today}. Este documento es una cotización informativa y no representa un comprobante fiscal.
  </div>

</body>
</html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // Rename to a meaningful filename
    const newUri = `${cacheDirectory}Cotizacion_${data.payment_reference}.pdf`;
    await moveAsync({ from: uri, to: newUri });

    // Share/download the PDF
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(newUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Cotización ${data.payment_reference}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('PDF Generado', `Archivo guardado en: ${newUri}`);
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    Alert.alert('Error', 'No se pudo generar el PDF');
  }
};
