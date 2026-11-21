import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, readAsStringAsync, moveAsync, EncodingType } from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Alert } from 'react-native';

// Load logo as base64
let logoBase64Cache: string | null = null;

const getLogoBase64 = async (): Promise<string> => {
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const asset = Asset.fromModule(require('../../assets/logo-negro.png'));
    await asset.downloadAsync();
    if (asset.localUri) {
      const base64 = await readAsStringAsync(asset.localUri, {
        encoding: EncodingType.Base64,
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
    pobox_service_cost?: number;
    national_carrier?: string;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
    description?: string;
    service_type?: string;
    // DHL: monto de la guía y de qué se compone (tarea 282).
    venta_mxn?: number;
    import_cost_usd?: number;
    exchange_rate?: number;
    import_tax_mxn?: number;
    national_cost_mxn?: number;
  }>;
  cost_breakdown?: {
    pobox?: number;
    paqueteria?: number;
    gex?: number;
    extra?: number;
    cargos_extra?: number;
    descuento?: number;
    dhl_importacion?: number;
    dhl_impuesto?: number;
    dhl_paqueteria?: number;
    dhl_total_guias?: number;
    dhl_ajuste?: number;
    dhl_tc?: number;
    paqueteria_collect?: boolean;
    paqueteria_carrier?: string;
  };
  // Lo que el cliente ya no transfiere porque se le descontó de su monedero o de
  // su crédito. El total viene NETO, así que sin estos renglones el documento
  // lista guías que suman más que el total a pagar y parece un error de suma:
  // la RO-8183B26D costó tres días de dos equipos buscando una diferencia que
  // era justo el saldo del cliente (tarea 634).
  wallet_applied?: number;
  credit_applied?: number;
  // Destino real de la entrega. Antes el PDF decía siempre "Monterrey, N.L."
  // aunque el paquete fuera a otro estado (TKT-2026-2266: entrega en Veracruz).
  destino?: string;
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
  // Nombre legible de la paquetería (la columna mostraba la clave cruda / 'DHL').
  const carrierNameMap: Record<string, string> = { paquete_express: 'Paquete Express', paquete_express_pc: 'Paquete Express (Por Cobrar)', pqtx_cod: 'Paquete Express (Por Cobrar)', dhl: 'DHL', estafeta: 'Estafeta', fedex: 'FedEx', local: 'EntregaX Local', entregax_local: 'EntregaX Local', entregax_local_mty: 'EntregaX Local MTY', entregax_local_cdmx: 'EntregaX Local CDMX', pickup: 'Pick Up', ocurre: 'Ocurre' };
  const carrierLabel = (c: any): string => { const k = String(c || '').toLowerCase().trim(); if (!k) return '—'; return carrierNameMap[k] || String(c).replace(/[_-]+/g, ' ').replace(/\b\w/g, (mm: string) => mm.toUpperCase()); };
  // Servicio real (era fijo "PO Box USA - Carga Aérea" incluso para DHL).
  const isDhlQuote = (data.packages || []).some((p: any) => /DHL/i.test(String(p.service_type || p.servicio || p.shipment_type || '')) ) || String((data as any).service_type || '').toUpperCase() === 'AA_DHL';
  // 🌎 El origen se leia de un literal: toda cotizacion decia "Estados
  // Unidos", incluso una de carga aerea que sale de China (tarea 1086).
  // Sale del mismo dato que el nombre del servicio: el service_type de
  // las guias. Si la orden mezcla servicios, se nombran los dos.
  const PAIS_DE_ORIGEN: Record<string, string> = {
    POBOX_USA: 'Estados Unidos', AA_DHL: 'Estados Unidos',
    AIR_CHN_MX: 'China', TDI_EXPRESS: 'China', SEA_CHN_MX: 'China', CHINA_SEA: 'China',
  };
  const origenDeLaOrden = Array.from(new Set(
    (data.packages || []).map((i: any) => PAIS_DE_ORIGEN[String(i.service_type || '').toUpperCase()])
                 .filter(Boolean)));
  const origenLabel = origenDeLaOrden.length > 0 ? origenDeLaOrden.join(' + ') : 'Estados Unidos';
  // El servicio tambien salia de un literal: una orden de carga aerea decia
  // "PO Box USA - Carga Aerea". Los otros tres documentos ya lo sacan del dato
  // real; este se habia quedado (tareas 1084 y 1086).
  const NOMBRE_SERVICIO: Record<string, string> = {
    POBOX_USA: 'PO Box USA - Carga Aérea',
    AIR_CHN_MX: 'TDI Aéreo',
    TDI_EXPRESS: 'TDI Express',
    SEA_CHN_MX: 'Marítimo',
  };
  const serviciosDeLaOrden = Array.from(new Set(
    (data.packages || []).map((i: any) => NOMBRE_SERVICIO[String(i.service_type || '').toUpperCase()])
                 .filter(Boolean)));
  const svcLabel = isDhlQuote
    ? 'DHL — Liberación y Envío Nacional'
    : (serviciosDeLaOrden.length > 0 ? serviciosDeLaOrden.join(' + ') : 'PO Box USA - Carga Aérea');
  // Columnas de desglose de una guía DHL: importación, impuestos, envío y total.
  // La importación se saca restando, para que los renglones siempre sumen lo que
  // se está cobrando aunque el tipo de cambio traiga redondeos (tarea 282).
  const montoGuia = (pkg: any): number => Number(pkg.venta_mxn ?? (pkg.pobox_service_cost || pkg.saldo_pendiente || pkg.assigned_cost_mxn || 0));
  const celdasDhl = (pkg: any): string => {
    const celda = (contenido: string, extra = '') => `<td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10.5px;text-align:right;white-space:nowrap;${extra}">${contenido}</td>`;
    const chica = (t: string) => `<br><span style="font-size:8.5px;color:#666;">${t}</span>`;
    const total = montoGuia(pkg);
    const impuestos = Number(pkg.import_tax_mxn) || 0;
    const envio = Number(pkg.national_cost_mxn) || 0;
    const importacion = Math.max(0, total - impuestos - envio);
    const usd = Number(pkg.import_cost_usd) || 0;
    const tc = Number(pkg.exchange_rate) || 0;
    const paqueteria = carrierLabel(pkg.national_carrier);
    return celda(formatCurrency(importacion) + (usd > 0 && tc > 0 ? chica(`${usd.toFixed(2)} USD × $${tc.toFixed(2)}`) : ''))
      + celda(impuestos > 0 ? formatCurrency(impuestos) : '—')
      + celda((envio > 0 ? formatCurrency(envio) : '—') + (envio > 0 && paqueteria !== '—' ? chica(paqueteria) : ''))
      + celda(formatCurrency(total), 'font-weight:600;');
  };
  // Las dos tablas abren el importe en columnas: ocho en DHL (importación,
  // impuestos, envío, total) y ocho en las demás (paquetería, dólares, precio
  // por kilo, peso cobrable, tipo de cambio, total) — tarea 1086.
  const totalCols = 8;
  // Antes sólo salía el total en pesos de cada guía: para saber de dónde venía
  // —cuántos dólares, a qué precio por kilo, sobre qué peso y con qué tipo de
  // cambio— había que preguntar. Ahora el renglón se explica solo.
  const usdTxt = (n: any) => Number(n || 0) > 0
    ? '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const kgTxt = (n: any) => {
    // Los decimales con los que se COBRA.
    //
    // El peso se imprimia redondeado a un decimal y el cobro se hace con el
    // de verdad: una caja de 51x51x61 da 26.44 kg volumetricos, se cobro
    // 26.44 x 16.40 = 433.62, y el renglon decia "26.4 kg", que multiplicado
    // da 432.96. Juan lo leyo como un error de centavos y tenia razon: el
    // documento tiene que poder comprobarse con una calculadora (1086).
    const v = Number(n || 0);
    const txt = Math.abs(v - Number(v.toFixed(1))) < 0.005 ? v.toFixed(1) : v.toFixed(2);
    return txt + ' kg';
  };
  // Lo que no merece columna propia va en letra chica bajo la guía: el peso
  // real, el volumétrico cuando aplica y las medidas de la caja.
  const bajoLaGuia = (p: any): string => {
    const partes: string[] = [];
    const real = Number(p.peso_real != null ? p.peso_real : p.weight) || 0;
    if (real > 0) partes.push(kgTxt(real) + ' real');
    if (Number(p.peso_volumetrico) > 0) partes.push(kgTxt(p.peso_volumetrico) + ' vol');
    if (Number(p.length_cm) > 0 || Number(p.width_cm) > 0 || Number(p.height_cm) > 0) {
      partes.push(p.length_cm + '×' + p.width_cm + '×' + p.height_cm + ' cm');
    }
    // Cuando la tarifa por kilo no explica el precio con el peso cobrable, el
    // peso que sí lo explica se dice aquí: la columna enseña la tarifa y esta
    // línea enseña sobre qué se cobró, en vez de dejar un renglón que no
    // multiplica sin explicación (tarea 1086).
    if (Number(p.peso_cobrado) > 0) partes.push('cobrado sobre ' + kgTxt(p.peso_cobrado));
    return partes.join(' · ');
  };
  const celdasAereo = (p: any): string => {
    const celda = (c: string, extra = '') =>
      '<td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10.5px;'
      + 'text-align:right;white-space:nowrap;' + extra + '">' + c + '</td>';
    const porKg = Number(p.precio_por_kg_usd) || 0;
    // Start Up es un precio PLANO por tramo de peso: no hay precio por kilo que
    // cobrar, y poner el derivado se leería como una tarifa que no existe.
    const esStartUp = String(p.tipo_tarifa || '') === 'SU';
    const tc = Number(p.tc) || 0;
    const cobrable = Number(p.peso_cobrable) || 0;
    return celda(usdTxt(p.costo_usd))
      + celda(esStartUp ? 'plano' : (porKg > 0 ? '$' + porKg.toFixed(2) : '—'))
      + celda(cobrable > 0 ? kgTxt(cobrable) : '—')
      + celda(tc > 0 ? '$' + tc.toFixed(2) : '—')
      + celda(formatCurrency(montoGuia(p)), 'font-weight:600;');
  };
  if (data.packages && data.packages.length > 0) {
    packageRows = data.packages.map((pkg, i) => {
      const tracking = pkg.tracking_internal || '-';
      const intTrk = pkg.international_tracking ? `<br><span style="font-size:9px;color:#000;">${pkg.international_tracking}</span>` : '';
      const weight = pkg.weight ? `${Number(pkg.weight).toFixed(1)} kg` : '—';
      const dims = (pkg.length_cm && pkg.length_cm > 0) || (pkg.width_cm && pkg.width_cm > 0) || (pkg.height_cm && pkg.height_cm > 0)
        ? `${pkg.length_cm}×${pkg.width_cm}×${pkg.height_cm} cm`
        : '—';
      const carrier = carrierLabel(pkg.national_carrier);
      const chica = bajoLaGuia(pkg);
      const comunesDhl = `
          <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px;">${i + 1}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; font-weight: 600;">${tracking}${intTrk}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; text-align: center;">${weight}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; text-align: center;">${dims}</td>`;
      // DHL: el monto de la guía junta importación, impuesto y paquetería. Cada
      // concepto va en su columna para que el cliente lea de corrido de qué se
      // compone lo que paga (tarea 282).
      if (isDhlQuote) return `<tr>${comunesDhl}${celdasDhl(pkg)}</tr>`;
      // En aéreo y PO Box el peso y las medidas bajan a la letra chica: las dos
      // columnas que se liberan son las que abren el importe.
      return `
        <tr>
          <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px;">${i + 1}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; font-weight: 600;">${tracking}${intTrk}${chica ? `<br><span style="font-size:8.5px;color:#666;font-weight:400">${chica}</span>` : ''}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; text-align: center;">${carrier}</td>
          ${celdasAereo(pkg)}
        </tr>`;
    }).join('');
  }

  // Filas de desglose (Paquetería / GEX / Cargos Extra). PO Box queda implícito
  // en las filas por guía; estas tres + el PO Box reconcilian con el TOTAL.
  const bd = data.cost_breakdown || {};
  const breakdownRow = (label: string, val: number, color?: string): string =>
    Number(val) !== 0
      ? `<tr><td style="border-bottom:1px solid #f0f0f0;"></td><td colspan="${totalCols - 2}" style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px;color:${color || '#000'};">${label}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px;text-align:right;font-weight:600;color:${color || '#000'};">${formatCurrency(Number(val))}</td></tr>`
      : '';
  // DHL: cada guía ya trae su desglose arriba; aquí solo la suma y, si el cobro
  // no cuadra con las guías, el ajuste o descuento. Antes el remanente se
  // rotulaba como "Paquetería" aunque fuera importación e impuestos (tarea 282).
  const ajusteDhl = Number(bd.dhl_ajuste) || 0;
  const breakdownRows = isDhlQuote
    ? (pkgCount > 1 ? breakdownRow('Suma de guías', Number(bd.dhl_total_guias) || 0) : '')
      + breakdownRow(ajusteDhl < 0 ? '🏷️ Descuento aplicado' : '➕ Ajuste', ajusteDhl, ajusteDhl < 0 ? '#2E7D32' : '#C2410C')
    :
    breakdownRow('🚚 Paquetería (Envío Nacional)', Number(bd.paqueteria) || 0) +
    breakdownRow('🛡️ GEX — Garantía Extendida', Number(bd.gex) || 0, '#2E7D32') +
    // Separados, no netos: un descuento bajo la etiqueta "Cargos Extra" y en
    // negativo se leía como un cobro (tarea 282). Cae al neto si el backend
    // todavía no manda los campos abiertos.
    (bd.cargos_extra != null || bd.descuento != null
      ? breakdownRow('➕ Cargos Extra', Number(bd.cargos_extra) || 0, '#C2410C')
        + breakdownRow('🏷️ Descuento aplicado', Number(bd.descuento) || 0, '#2E7D32')
      : breakdownRow('➕ Cargos Extra', Number(bd.extra) || 0, '#C2410C'));

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { margin: 30px 40px; size: A4; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #000; font-size: 12px; line-height: 1.5; }
    
    .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 3px solid #FF6B00; margin-bottom: 20px; }
    .logo { height: 55px; }
    .company-info { text-align: right; font-size: 10px; color: #000; }
    .company-info strong { color: #000; font-size: 11px; }
    
    .title-bar { background: linear-gradient(135deg, #FF6B00, #E55A00); color: white; padding: 12px 20px; border-radius: 6px; margin-bottom: 20px; }
    .title-bar h1 { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
    .title-bar .ref { font-size: 11px; opacity: 0.9; margin-top: 2px; }
    
    .section { margin-bottom: 16px; }
    .section-title { font-size: 12px; font-weight: 700; color: #FF6B00; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #FFE0C0; }
    
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
    .info-row { display: flex; gap: 8px; }
    .info-label { color: #000; font-size: 11px; min-width: 120px; }
    .info-value { font-weight: 600; font-size: 11px; color: #000; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #F8F8F8; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #FF6B00; }
    th:last-child { text-align: right; }
    
    .total-row { background: #FFF8F0; }
    .total-row td { padding: 10px; font-weight: 700; font-size: 13px; border-top: 2px solid #FF6B00; }
    
    .payment-box { background: #F9FBF5; border: 1px solid #C8E6C9; border-radius: 8px; padding: 16px; margin-top: 8px; }
    .payment-box .bank-row { margin-bottom: 4px; font-size: 11px; }
    .payment-box .bank-label { color: #000; display: inline-block; min-width: 100px; }
    .payment-box .bank-value { font-weight: 700; color: #000; }
    
    .warning-box { background: #FFF3E0; border-left: 4px solid #FF9800; padding: 10px 14px; margin-top: 12px; border-radius: 0 6px 6px 0; font-size: 10px; color: #E65100; }
    
    .instructions-box { background: #F3F8FF; border: 1px solid #BBDEFB; border-radius: 8px; padding: 14px; margin-top: 12px; }
    .instructions-box h3 { font-size: 11px; color: #1565C0; margin-bottom: 8px; }
    .instructions-box ol { padding-left: 18px; font-size: 10px; color: #000; }
    .instructions-box ol li { margin-bottom: 4px; }
    
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 9px; color: #000; text-align: center; }
    .footer a { color: #FF6B00; text-decoration: none; }
    
    .terms { margin-top: 16px; padding: 12px; background: #FAFAFA; border-radius: 6px; font-size: 8.5px; color: #000; line-height: 1.6; }
    .terms strong { color: #000; }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <div>
      ${logo ? `<img src="${logo}" class="logo" />` : '<div style="font-size:24px;font-weight:800;color:#FF6B00;">EntregaX</div>'}
    </div>
    <div class="company-info">
      <strong>ENTREGAX</strong><br>
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
        <span class="info-value">${svcLabel}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Origen:</span>
        <span class="info-value">${origenLabel}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Destino:</span>
        <span class="info-value">${data.destino ? `${data.destino}, México` : 'Por asignar'}</span>
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
          ${isDhlQuote
            ? `<th style="text-align:center;">Peso</th>
          <th style="text-align:center;">Medidas</th>
          <th style="text-align:right;padding:8px 5px;">Importación</th>
          <th style="text-align:right;padding:8px 5px;">Impuestos</th>
          <th style="text-align:right;padding:8px 5px;">Envío</th>
          <th style="text-align:right;padding:8px 5px;">Total (MXN)</th>`
            : `<th style="text-align:center;padding:8px 5px;">Paquetería</th>
          <th style="text-align:right;padding:8px 5px;">Costo USD</th>
          <th style="text-align:right;padding:8px 5px;">USD / kg</th>
          <th style="text-align:right;padding:8px 5px;">Peso cobrable</th>
          <th style="text-align:right;padding:8px 5px;">T. cambio</th>
          <th style="text-align:right;padding:8px 5px;">Total (MXN)</th>`}
        </tr>
      </thead>
      <tbody>
        ${packageRows}
        ${breakdownRows}
        ${(Number(data.wallet_applied) || 0) > 0 ? `
        <tr>
          <td colspan="${totalCols - 1}" style="text-align:right; padding-right: 10px; color:#2E7D32;">🏷️ Saldo a favor aplicado:</td>
          <td style="text-align:right; color:#2E7D32;">−${formatCurrency(Number(data.wallet_applied))}</td>
        </tr>` : ''}
        ${(Number(data.credit_applied) || 0) > 0 ? `
        <tr>
          <td colspan="${totalCols - 1}" style="text-align:right; padding-right: 10px; color:#1565C0;">💳 Cargado a su línea de crédito:</td>
          <td style="text-align:right; color:#1565C0;">−${formatCurrency(Number(data.credit_applied))}</td>
        </tr>` : ''}
        <tr class="total-row">
          <td colspan="${totalCols - 1}" style="text-align:right; padding-right: 10px;">TOTAL A PAGAR:</td>
          <td style="text-align:right; color: #E65100; font-size: 14px;">${totalFormatted} ${data.currency || 'MXN'}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PAYMENT INSTRUCTIONS -->
  <div class="section">
    <div class="section-title">💳 Instrucciones de Pago</div>
    <p style="font-size: 11px; color: #000; margin-bottom: 8px;">
      Para garantizar el despacho de su mercancía, le solicitamos realizar el pago correspondiente:
    </p>
    <div class="payment-box">
      <div class="bank-row"><span class="bank-label">Banco:</span> <span class="bank-value">${bankInfo?.banco || 'BBVA México'}</span></div>
      <div class="bank-row"><span class="bank-label">Beneficiario:</span> <span class="bank-value">${bankInfo?.beneficiario || 'ENTREGAX'}</span></div>
      <div class="bank-row"><span class="bank-label">Número de Cuenta:</span> <span class="bank-value">${bankInfo?.cuenta || '-'}</span></div>
      <div class="bank-row"><span class="bank-label">CLABE:</span> <span class="bank-value">${bankInfo?.clabe || '-'}</span></div>
      <div class="bank-row"><span class="bank-label">Concepto / Referencia:</span> <span class="bank-value" style="color:#E65100; font-size: 13px;">${data.payment_reference}</span></div>
    </div>

    <div class="warning-box">
      ⚠️ Favor de realizar depósitos de no más de $90,000 pesos por depósito.
    </div>
    <div style="background:#D32F2F;color:#fff;padding:14px 18px;margin-top:12px;border-radius:6px;text-align:center;font-size:12px;font-weight:700;letter-spacing:0.3px;">
      🚨 IMPORTANTE: Debe incluir el número de referencia
      <span style="background:#fff;color:#D32F2F;padding:2px 8px;border-radius:4px;font-size:14px;">${data.payment_reference}</span>
      en el concepto de pago. Sin esta referencia, su pago NO podrá ser acreditado.
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
    ENTREGAX &nbsp;|&nbsp; 📍 Monterrey, N.L., México &nbsp;|&nbsp; 📧 contacto@entregax.com &nbsp;|&nbsp; 🌐 <a href="https://www.entregax.com">www.entregax.com</a><br>
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
