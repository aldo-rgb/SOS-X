// ============================================================================
// ™️ CATÁLOGO DE MARCAS REGISTRADAS
// ============================================================================
// Qué marcas SÍ podemos manejar y de quién son.
//
// El problema que resuelve: un asesor reporta por ticket que su cliente es
// dueño de una marca, se anexan fotos del producto y ahí muere. La próxima vez
// que esa marca aparezca en una caja, nadie en bodega sabe si está permitida ni
// de quién es, y hay que volver a preguntar.
//
// Aquí Servicio a Cliente deja el registro completo:
//   · cómo se escribe y cómo SE PRONUNCIA (nombre fonético: así la busca quien
//     solo la oyó por teléfono, y así se evita confundir dos marcas que suenan
//     igual pero se escriben distinto)
//   · el logo en foto con fondo blanco
//   · de qué cliente es, con su número de casillero
//   · la carta del IMPI en PDF, si la tienen (opcional: casi nunca la traen el
//     mismo día, y esperarla significaría no registrar nada)
//
// Estatus:
//   pendiente  → falta algo para poder usarla (típicamente el logo)
//   autorizada → completa; esta marca la podemos manejar
//   rechazada  → la revisamos y NO la manejamos (queda, para no volver a
//                revisar lo mismo dentro de tres meses)
// ============================================================================

import { Request, Response } from 'express';
import { pool } from './db';
import { uploadToS3, isS3Configured, getSignedUrlForKey } from './s3Service';

let schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marcas_registradas (
      id SERIAL PRIMARY KEY,
      marca TEXT NOT NULL,
      marca_normalizada TEXT NOT NULL,
      nombre_fonetico TEXT,
      logo_key TEXT,
      logo_fondo_blanco BOOLEAN,
      carta_impi_key TEXT,
      carta_impi_nombre TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      box_id TEXT,
      cliente_nombre TEXT,
      productos TEXT,
      estatus TEXT NOT NULL DEFAULT 'pendiente',
      motivo TEXT,
      notas TEXT,
      evidencias JSONB DEFAULT '[]'::jsonb,
      ticket_folio TEXT,
      registrado_por INTEGER,
      autorizado_por INTEGER,
      autorizado_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Una marca viva no puede estar dos veces: el catálogo existe justamente para
  // contestar "¿de quién es esta marca?" con una sola respuesta. Las rechazadas
  // quedan fuera del índice para poder volver a intentarlo si cambia la
  // situación.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS marcas_registradas_norm_uniq
      ON marcas_registradas (marca_normalizada)
      WHERE estatus <> 'rechazada'
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS marcas_registradas_user ON marcas_registradas (user_id)`).catch(() => {});
  schemaReady = true;
}

// "Blugo", "BLUGO ®" y "blu go" son la misma marca para efectos de buscarla.
export const normalizarMarca = (s: string): string =>
  String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const firmar = async (key: string | null | undefined): Promise<string | null> => {
  if (!key) return null;
  try { return await getSignedUrlForKey(key, 6 * 3600); } catch { return null; }
};

const firmarEvidencias = async (ev: any): Promise<Array<{ key: string; url: string | null }>> => {
  const arr: any[] = Array.isArray(ev) ? ev : [];
  const out: Array<{ key: string; url: string | null }> = [];
  for (const e of arr) {
    const key = typeof e === 'string' ? e : (e?.key || '');
    if (!key) continue;
    out.push({ key, url: await firmar(key) });
  }
  return out;
};

const conUrls = async (row: any) => ({
  ...row,
  logo_url: await firmar(row.logo_key),
  carta_impi_url: await firmar(row.carta_impi_key),
  evidencias: await firmarEvidencias(row.evidencias),
});

// Lo que le falta a un registro para poder decir "esta marca sí la manejamos".
export const faltantes = (row: any): string[] => {
  const f: string[] = [];
  if (!String(row?.marca || '').trim()) f.push('nombre de la marca');
  if (!String(row?.nombre_fonetico || '').trim()) f.push('nombre fonético');
  if (!row?.logo_key) f.push('logo con fondo blanco');
  if (!row?.user_id && !String(row?.box_id || '').trim()) f.push('cliente');
  return f;
};

// ============================================================================
// GET /api/admin/marcas-registradas?q=&estatus=
// ============================================================================
export const listarMarcas = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const q = String(req.query.q || '').trim();
    const estatus = String(req.query.estatus || '').trim();
    const where: string[] = [];
    const params: any[] = [];
    if (q) {
      params.push(`%${q}%`);
      params.push(`%${normalizarMarca(q)}%`);
      where.push(`(m.marca ILIKE $${params.length - 1} OR m.nombre_fonetico ILIKE $${params.length - 1}
                   OR m.box_id ILIKE $${params.length - 1} OR m.cliente_nombre ILIKE $${params.length - 1}
                   OR m.productos ILIKE $${params.length - 1} OR m.marca_normalizada LIKE $${params.length})`);
    }
    if (estatus) { params.push(estatus); where.push(`m.estatus = $${params.length}`); }

    const r = await pool.query(
      `SELECT m.*, u.full_name AS cliente_actual, u.box_id AS box_actual,
              reg.full_name AS registrado_por_nombre, aut.full_name AS autorizado_por_nombre
         FROM marcas_registradas m
         LEFT JOIN users u   ON u.id = m.user_id
         LEFT JOIN users reg ON reg.id = m.registrado_por
         LEFT JOIN users aut ON aut.id = m.autorizado_por
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY CASE m.estatus WHEN 'pendiente' THEN 1 WHEN 'autorizada' THEN 2 ELSE 3 END,
                 m.marca ASC`,
      params
    );
    const data = await Promise.all(r.rows.map(async (row: any) => ({
      ...(await conUrls(row)),
      faltantes: faltantes(row),
    })));
    const stats = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE estatus = 'autorizada')::int AS autorizadas,
             COUNT(*) FILTER (WHERE estatus = 'pendiente')::int  AS pendientes,
             COUNT(*) FILTER (WHERE estatus = 'rechazada')::int  AS rechazadas
        FROM marcas_registradas`);
    res.json({ success: true, data, stats: stats.rows[0] });
  } catch (error: any) {
    console.error('Error listarMarcas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// GET /api/admin/marcas-registradas/buscar-cliente?q=
// ============================================================================
export const buscarClienteMarca = async (req: Request, res: Response): Promise<any> => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const like = `%${q}%`;
    const r = await pool.query(
      `SELECT id, full_name, box_id, phone, email
         FROM users
        WHERE role = 'client'
          AND (full_name ILIKE $1 OR box_id ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)
        ORDER BY (box_id ILIKE $1) DESC, full_name ASC
        LIMIT 20`,
      [like]
    );
    res.json({ success: true, data: r.rows });
  } catch (error: any) {
    console.error('Error buscarClienteMarca:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// GET /api/admin/marcas-registradas/consultar?marca=
// Para bodega/asesor: "¿esta marca la podemos manejar y de quién es?"
// ============================================================================
export const consultarMarca = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const marca = String(req.query.marca || '').trim();
    if (!marca) return res.status(400).json({ success: false, error: 'Falta la marca' });
    const r = await pool.query(
      `SELECT m.*, u.full_name AS cliente_actual, u.box_id AS box_actual
         FROM marcas_registradas m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.marca_normalizada = $1 ORDER BY m.estatus = 'rechazada' ASC LIMIT 1`,
      [normalizarMarca(marca)]
    );
    if (!r.rows[0]) return res.json({ success: true, registrada: false, data: null });
    res.json({ success: true, registrada: true, data: await conUrls(r.rows[0]) });
  } catch (error: any) {
    console.error('Error consultarMarca:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// POST /api/admin/marcas-registradas/upload-logo  (multipart "file")
// ============================================================================
export const subirLogoMarca = async (req: Request, res: Response): Promise<any> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !file.buffer) return res.status(400).json({ success: false, error: 'No se recibió imagen' });
    const mime = (file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      return res.status(400).json({ success: false, error: 'El logo debe ser una imagen (JPG, PNG o WEBP)' });
    }
    if (!isS3Configured()) return res.status(500).json({ success: false, error: 'Almacenamiento no configurado (S3)' });

    // El fondo blanco se MIDE, no se promete. Se revisa el marco de la imagen:
    // si viene recortado contra una mesa de madera o la foto del producto, aquí
    // se nota. No bloquea la subida —la vista la tiene la persona, no yo— pero
    // queda la bandera para que el catálogo no se llene de fotos de bodega.
    let fondoBlanco: boolean | null = null;
    const buffer = file.buffer;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp');
      const { data, info } = await sharp(buffer).removeAlpha().resize(120, 120, { fit: 'inside' })
        .raw().toBuffer({ resolveWithObject: true });
      const w = info.width, h = info.height, ch = info.channels;
      let total = 0, claros = 0;
      const px = (x: number, y: number) => {
        const i = (y * w + x) * ch;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        total++; if (lum >= 235) claros++;
      };
      for (let x = 0; x < w; x++) { px(x, 0); px(x, h - 1); }
      for (let y = 0; y < h; y++) { px(0, y); px(w - 1, y); }
      fondoBlanco = total > 0 && claros / total >= 0.9;
    } catch (e: any) {
      console.warn('[marcas] no se pudo revisar el fondo del logo:', e?.message);
    }

    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const key = `marcas-registradas/logo-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    await uploadToS3(buffer, key, mime);
    res.json({ success: true, key, url: await firmar(key), fondo_blanco: fondoBlanco });
  } catch (error: any) {
    console.error('Error subirLogoMarca:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// POST /api/admin/marcas-registradas/upload-carta  (multipart "file", PDF)
// ============================================================================
export const subirCartaImpi = async (req: Request, res: Response): Promise<any> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !file.buffer) return res.status(400).json({ success: false, error: 'No se recibió el archivo' });
    const mime = (file.mimetype || '').toLowerCase();
    const esPdf = mime === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
    if (!esPdf) return res.status(400).json({ success: false, error: 'La carta del IMPI debe ser un PDF' });
    if (!isS3Configured()) return res.status(500).json({ success: false, error: 'Almacenamiento no configurado (S3)' });
    const key = `marcas-registradas/impi-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`;
    await uploadToS3(file.buffer, key, 'application/pdf');
    res.json({ success: true, key, url: await firmar(key), nombre: file.originalname || 'carta-impi.pdf' });
  } catch (error: any) {
    console.error('Error subirCartaImpi:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// POST /api/admin/marcas-registradas
// ============================================================================
export const crearMarca = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const b = req.body || {};
    const marca = String(b.marca || '').trim();
    if (!marca) return res.status(400).json({ success: false, error: 'Falta el nombre de la marca' });
    const norm = normalizarMarca(marca);
    if (!norm) return res.status(400).json({ success: false, error: 'El nombre de la marca no es válido' });

    // Si ya está registrada y viva, no se duplica: se dice de quién es.
    const dup = await pool.query(
      `SELECT m.id, m.marca, m.box_id, m.cliente_nombre, m.estatus
         FROM marcas_registradas m
        WHERE m.marca_normalizada = $1 AND m.estatus <> 'rechazada' LIMIT 1`,
      [norm]
    );
    if (dup.rows[0]) {
      const d = dup.rows[0];
      return res.status(409).json({
        success: false,
        error: `"${d.marca}" ya está en el catálogo a nombre de ${d.cliente_nombre || 'otro cliente'}`
             + (d.box_id ? ` (${d.box_id})` : '') + '.',
        duplicado: d,
      });
    }

    const usuario = (req as any).user || {};
    const row = {
      marca,
      nombre_fonetico: String(b.nombre_fonetico || '').trim() || null,
      logo_key: b.logo_key || null,
      logo_fondo_blanco: typeof b.logo_fondo_blanco === 'boolean' ? b.logo_fondo_blanco : null,
      carta_impi_key: b.carta_impi_key || null,
      carta_impi_nombre: b.carta_impi_nombre || null,
      user_id: b.user_id ? Number(b.user_id) : null,
      box_id: String(b.box_id || '').trim().toUpperCase() || null,
      cliente_nombre: String(b.cliente_nombre || '').trim() || null,
      productos: String(b.productos || '').trim() || null,
      notas: String(b.notas || '').trim() || null,
      ticket_folio: String(b.ticket_folio || '').trim() || null,
      evidencias: JSON.stringify(Array.isArray(b.evidencias) ? b.evidencias : []),
    };
    // Nace autorizada si no le falta nada; si no, queda pendiente con la lista
    // de lo que falta a la vista. Nunca se autoriza sola una marca sin logo.
    const estatus = faltantes(row).length === 0 ? 'autorizada' : 'pendiente';

    const r = await pool.query(
      `INSERT INTO marcas_registradas
         (marca, marca_normalizada, nombre_fonetico, logo_key, logo_fondo_blanco,
          carta_impi_key, carta_impi_nombre, user_id, box_id, cliente_nombre,
          productos, estatus, notas, evidencias, ticket_folio, registrado_por,
          autorizado_por, autorizado_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,
               CASE WHEN $12 = 'autorizada' THEN $16 ELSE NULL END,
               CASE WHEN $12 = 'autorizada' THEN NOW() ELSE NULL END)
       RETURNING *`,
      [row.marca, norm, row.nombre_fonetico, row.logo_key, row.logo_fondo_blanco,
       row.carta_impi_key, row.carta_impi_nombre, row.user_id, row.box_id, row.cliente_nombre,
       row.productos, estatus, row.notas, row.evidencias, row.ticket_folio, usuario.id || null]
    );
    res.json({ success: true, data: await conUrls(r.rows[0]), faltantes: faltantes(r.rows[0]) });
  } catch (error: any) {
    console.error('Error crearMarca:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// PUT /api/admin/marcas-registradas/:id
// ============================================================================
export const actualizarMarca = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const b = req.body || {};
    const actual = await pool.query(`SELECT * FROM marcas_registradas WHERE id = $1`, [id]);
    if (!actual.rows[0]) return res.status(404).json({ success: false, error: 'No existe esa marca' });

    const prev = actual.rows[0];
    const marca = b.marca !== undefined ? String(b.marca || '').trim() : prev.marca;
    if (!marca) return res.status(400).json({ success: false, error: 'Falta el nombre de la marca' });
    const norm = normalizarMarca(marca);

    if (norm !== prev.marca_normalizada) {
      const dup = await pool.query(
        `SELECT marca, box_id, cliente_nombre FROM marcas_registradas
          WHERE marca_normalizada = $1 AND estatus <> 'rechazada' AND id <> $2 LIMIT 1`,
        [norm, id]
      );
      if (dup.rows[0]) {
        return res.status(409).json({
          success: false,
          error: `"${dup.rows[0].marca}" ya está en el catálogo a nombre de ${dup.rows[0].cliente_nombre || 'otro cliente'}.`,
        });
      }
    }

    const v = (campo: string, def: any) => (b[campo] !== undefined ? b[campo] : def);
    const destino = {
      marca,
      nombre_fonetico: b.nombre_fonetico !== undefined ? (String(b.nombre_fonetico || '').trim() || null) : prev.nombre_fonetico,
      logo_key: v('logo_key', prev.logo_key) || null,
      user_id: b.user_id !== undefined ? (b.user_id ? Number(b.user_id) : null) : prev.user_id,
      box_id: b.box_id !== undefined ? (String(b.box_id || '').trim().toUpperCase() || null) : prev.box_id,
    };

    // Autorizar exige el registro completo: así "autorizada" significa siempre
    // lo mismo y bodega puede confiar en el catálogo sin abrir cada ficha.
    let estatus = b.estatus !== undefined ? String(b.estatus) : prev.estatus;
    if (estatus === 'autorizada') {
      const falta = faltantes({ ...prev, ...destino });
      if (falta.length) {
        return res.status(400).json({
          success: false,
          error: `No se puede autorizar: falta ${falta.join(', ')}.`,
          faltantes: falta,
        });
      }
    }
    if (!['pendiente', 'autorizada', 'rechazada'].includes(estatus)) estatus = prev.estatus;

    const usuario = (req as any).user || {};
    const r = await pool.query(
      `UPDATE marcas_registradas SET
         marca = $2, marca_normalizada = $3,
         nombre_fonetico = $4,
         logo_key = $5,
         logo_fondo_blanco = $6,
         carta_impi_key = $7, carta_impi_nombre = $8,
         user_id = $9, box_id = $10, cliente_nombre = $11,
         productos = $12, estatus = $13, motivo = $14, notas = $15,
         evidencias = $16::jsonb, ticket_folio = $17,
         autorizado_por = CASE WHEN $13 = 'autorizada' AND estatus <> 'autorizada' THEN $18 ELSE autorizado_por END,
         autorizado_at  = CASE WHEN $13 = 'autorizada' AND estatus <> 'autorizada' THEN NOW() ELSE autorizado_at END,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, destino.marca, norm, destino.nombre_fonetico, destino.logo_key,
       b.logo_fondo_blanco !== undefined ? b.logo_fondo_blanco : prev.logo_fondo_blanco,
       v('carta_impi_key', prev.carta_impi_key) || null,
       v('carta_impi_nombre', prev.carta_impi_nombre) || null,
       destino.user_id, destino.box_id,
       b.cliente_nombre !== undefined ? (String(b.cliente_nombre || '').trim() || null) : prev.cliente_nombre,
       b.productos !== undefined ? (String(b.productos || '').trim() || null) : prev.productos,
       estatus,
       b.motivo !== undefined ? (String(b.motivo || '').trim() || null) : prev.motivo,
       b.notas !== undefined ? (String(b.notas || '').trim() || null) : prev.notas,
       JSON.stringify(b.evidencias !== undefined ? (Array.isArray(b.evidencias) ? b.evidencias : []) : (prev.evidencias || [])),
       b.ticket_folio !== undefined ? (String(b.ticket_folio || '').trim() || null) : prev.ticket_folio,
       usuario.id || null]
    );
    res.json({ success: true, data: await conUrls(r.rows[0]), faltantes: faltantes(r.rows[0]) });
  } catch (error: any) {
    console.error('Error actualizarMarca:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// DELETE /api/admin/marcas-registradas/:id
// ============================================================================
export const borrarMarca = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const r = await pool.query(`DELETE FROM marcas_registradas WHERE id = $1 RETURNING id`, [id]);
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'No existe esa marca' });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error borrarMarca:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
