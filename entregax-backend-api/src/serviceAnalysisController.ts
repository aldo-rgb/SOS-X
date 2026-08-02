// ============================================================================
// ✨ ANÁLISIS DE VENTAS POR SERVICIO (IA / OpenAI)
// ============================================================================
// Recibe la serie de datos de un servicio (dinero/guías/peso/volumen por
// periodo) y devuelve un análisis con consejos para mejorar las ventas, usando
// el contexto del servicio de EntregaX. Solo lectura; no escribe nada.
// ============================================================================

import { Request, Response } from 'express';
import OpenAI from 'openai';

let openaiInstance: OpenAI | null = null;
const getOpenAI = (): OpenAI => {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
    openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiInstance;
};

// Contexto de cada servicio para que la IA "conozca" el negocio.
const SERVICE_CONTEXT: Record<string, string> = {
  todos: 'Resultado GENERAL de toda la empresa EntregaX (suma de todos los servicios).',
  tdi_aereo: 'TDI Aéreo: importación de carga aérea desde China a México. Se cobra por kg cobrable.',
  tdi_express: 'TDI Express: envío aéreo express desde China a México (más rápido, mayor precio/kg).',
  maritimo: 'Marítimo China: importación de carga marítima (contenedores FCL/LCL) desde China a México.',
  pobox_usa: 'PO Box USA: casillero en Estados Unidos; el cliente compra en USA y EntregaX consolida y reenvía a México. Se cobra por volumen.',
  dhl: 'DHL Monterrey: envíos nacionales dentro de México (última milla / paquetería nacional).',
  gex: 'GEX: garantía/seguro de envío (póliza con fee). Protege el valor de la mercancía.',
  xpay: 'X-Pay: pagos a proveedores en el extranjero (China/USA) por cuenta del cliente. Se cobra margen sobre el tipo de cambio.',
};

const SERVICE_NAME: Record<string, string> = {
  todos: 'Toda la empresa', tdi_aereo: 'TDI Aéreo', tdi_express: 'TDI Express',
  maritimo: 'Marítimo China', pobox_usa: 'PO Box USA', dhl: 'DHL Monterrey',
  gex: 'GEX', xpay: 'X-Pay',
};

const money = (v: number) => `$${Math.round(Number(v) || 0).toLocaleString('es-MX')}`;

// POST /api/packages/service-analysis  { service, group_by, series: [{bucket, money, count, weight, volume}] }
export const generateServiceAnalysis = async (req: Request, res: Response): Promise<any> => {
  try {
    const service = String(req.body?.service || '');
    const groupBy = String(req.body?.group_by || 'month');
    const series: any[] = Array.isArray(req.body?.series) ? req.body.series : [];
    const ctx = SERVICE_CONTEXT[service];
    if (!ctx) return res.status(400).json({ error: 'Servicio no válido' });
    if (series.length === 0) return res.status(400).json({ error: 'Sin datos para analizar' });

    const periodo = groupBy === 'day' ? 'día' : groupBy === 'week' ? 'semana' : 'mes';
    // Resumen compacto de la serie para el prompt.
    const filas = series.slice(-18).map((s) =>
      `${s.bucket}: dinero ${money(s.money)}, guías ${Number(s.count) || 0}, peso ${Math.round(Number(s.weight) || 0)}kg, volumen ${(Number(s.volume) || 0).toFixed(2)}m³`
    ).join('\n');
    const totalDinero = series.reduce((a, s) => a + (Number(s.money) || 0), 0);
    const totalGuias = series.reduce((a, s) => a + (Number(s.count) || 0), 0);

    const systemPrompt =
      `Eres un analista de negocio senior de EntregaX, una paquetería/logística internacional en México. ` +
      `Analizas el desempeño de un servicio y das recomendaciones prácticas y accionables para AUMENTAR LAS VENTAS. ` +
      `Sé concreto, directo y usa el contexto del servicio. Responde en español, con formato claro (viñetas), máximo ~250 palabras. ` +
      `No inventes datos que no estén en la serie.`;

    const userPrompt =
      `SERVICIO: ${SERVICE_NAME[service]}\n` +
      `CONTEXTO: ${ctx}\n\n` +
      `DATOS por ${periodo} (dinero en MXN):\n${filas}\n\n` +
      `Totales del periodo: dinero ${money(totalDinero)}, guías ${totalGuias}.\n\n` +
      `Dame: 1) un análisis breve de la tendencia (crecimiento/caída, estacionalidad, meses fuertes/débiles), ` +
      `2) 3-5 consejos concretos y accionables para mejorar las ventas de ESTE servicio, ` +
      `3) una acción prioritaria para el próximo ${periodo}.`;

    const model = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o-mini';
    const completion = await getOpenAI().chat.completions.create({
      model,
      temperature: 0.5,
      max_tokens: 700,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const analysis = completion.choices?.[0]?.message?.content?.trim() || 'No se pudo generar el análisis.';
    return res.json({ success: true, service, analysis });
  } catch (err: any) {
    console.error('[service-analysis]', err.message);
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'IA no configurada (OPENAI_API_KEY)' });
    return res.status(500).json({ error: 'No se pudo generar el análisis' });
  }
};
