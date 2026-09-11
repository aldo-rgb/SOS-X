/**
 * Servir el PDF y el XML de una factura desde NUESTRO servidor.
 *
 * El enlace que le dábamos a la gente era el del API de Facturama
 * (`https://api.facturama.mx/cfdi/pdf/issued/<id>`), que responde 401 con
 * `www-authenticate: Basic` a quien no lleve nuestras credenciales. El navegador
 * ve ese 401 y abre la ventana de usuario y contraseña: eso fue lo que reportó
 * el asesor en el TKT-2026-2639. La factura se timbra bien y el PDF existe —
 * lo que estaba mal era el enlace.
 *
 * Aquí se descarga con nuestras credenciales y se transmite. Las 632 facturas
 * emitidas desde mayo quedan arregladas sin tocar un solo renglón de la base,
 * porque el enlace se arma al vuelo desde el UUID.
 *
 * Va SIN sesión, a propósito: el cliente abre su factura desde WhatsApp o desde
 * el correo, donde no hay token. La llave es el UUID del SAT, que no se adivina
 * —es el mismo nivel de secreto que el enlace de Facturama que ya mandábamos, y
 * el mismo que usa el portal del SAT para verificar un CFDI.
 */
import { Request, Response } from 'express';
import { pool } from './db';
import { FacturamaClient } from './facturamaClient';

const webBaseUrl = (): string =>
  (process.env.FRONTEND_URL || 'https://entregax.app').replace(/\/$/, '');

/**
 * El enlace que SÍ se le puede dar a una persona. Se arma desde el UUID del SAT.
 * Si la factura no tiene UUID todavía (timbrado a medias), devuelve null: mejor
 * no dar enlace que dar uno que abre una ventana de contraseña.
 */
export const urlPublicaFactura = (
  uuidSat: string | null | undefined,
  tipo: 'pdf' | 'xml' = 'pdf'
): string | null => {
  const uuid = String(uuidSat || '').trim();
  if (!uuid) return null;
  return `${webBaseUrl()}/factura/${encodeURIComponent(uuid)}${tipo === 'xml' ? '.xml' : '.pdf'}`;
};

/**
 * Trozo de SQL que devuelve el enlace bueno en vez del guardado. Se usa en las
 * consultas que listan facturas para no tener que reescribir cada una ni migrar
 * las 632 filas viejas: el enlace se arma al vuelo desde el UUID.
 *
 * La base sale de una variable de entorno nuestra, no de nada que teclee un
 * usuario, así que interpolarla aquí es seguro.
 */
export const sqlUrlFactura = (alias = 'f', tipo: 'pdf' | 'xml' = 'pdf'): string =>
  `CASE WHEN COALESCE(${alias}.uuid_sat, '') <> '' ` +
  `THEN '${webBaseUrl()}/factura/' || ${alias}.uuid_sat || '.${tipo}' ` +
  `ELSE NULL END`;

/** Busca la factura por UUID del SAT y, si no, por el id de Facturama. */
const buscarFactura = async (clave: string) => {
  const r = await pool.query(
    `SELECT id, uuid_sat, facturama_id, fiscal_emitter_id, folio, serie, status
       FROM facturas_emitidas
      WHERE uuid_sat = $1 OR facturama_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [clave]
  );
  return r.rows[0] || null;
};

/**
 * GET /api/facturas/:clave/pdf
 * GET /api/facturas/:clave/xml
 */
export const servirArchivoFactura = async (req: Request, res: Response): Promise<any> => {
  const tipo = String(req.params.tipo || 'pdf').toLowerCase() === 'xml' ? 'xml' : 'pdf';
  try {
    // El .pdf / .xml del final del enlace bonito se recorta aquí.
    const clave = String(req.params.clave || '').trim().replace(/\.(pdf|xml)$/i, '');
    if (!clave) return res.status(400).send('Falta la factura');

    const f = await buscarFactura(clave);
    if (!f) return res.status(404).send('No encontramos esa factura.');
    if (!f.facturama_id) {
      return res.status(409).send('Esa factura no se emitió por Facturama; no hay archivo que descargar.');
    }

    const cliente = await FacturamaClient.fromEmitterId(f.fiscal_emitter_id);
    const nombre = `${f.serie ? f.serie + '-' : ''}${f.folio || f.uuid_sat || f.facturama_id}.${tipo}`;

    if (tipo === 'pdf') {
      const buf = await cliente.invoices.downloadPdf(f.facturama_id);
      res.setHeader('Content-Type', 'application/pdf');
      // inline: se abre en el visor en vez de descargarse, que es lo que la
      // gente espera al tocar "ver factura".
      res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
      return res.send(buf);
    }
    const xml = await cliente.invoices.downloadXml(f.facturama_id);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    return res.send(xml);
  } catch (e: any) {
    console.error('[factura-archivo]', req.params?.clave, e?.message || e);
    return res.status(502).send('No pudimos traer la factura en este momento. Inténtalo de nuevo en un minuto.');
  }
};
