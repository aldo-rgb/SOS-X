import { Request, Response } from 'express';
import { pool } from './db';

const REQUIRED_DOCUMENTS: Array<{ document_type: string; title: string; content: string }> = [
  {
    document_type: 'privacy_policy',
    title: 'POLÍTICA DE PRIVACIDAD DE ENTREGAX',
    content:
      '1. RESPONSABLE DEL TRATAMIENTO\n\n' +
      'Logística System Development S.A. de C.V. (EntregaX) es responsable del uso y protección de los datos personales.\n\n' +
      '2. DATOS RECABADOS\n\n' +
      'Podemos recabar datos de identificación, contacto, ubicación, información operativa y datos necesarios para la prestación de servicios logísticos.\n\n' +
      '3. FINALIDADES\n\n' +
      'Usamos los datos para registro de usuarios, operación logística, seguimiento de envíos, soporte, cumplimiento legal y seguridad.\n\n' +
      '4. DERECHOS ARCO\n\n' +
      'Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo a: contacto@entregax.com\n\n' +
      '5. ACTUALIZACIONES\n\n' +
      'Esta política puede actualizarse en cualquier momento. La versión vigente se publica en este módulo.'
  },
  {
    document_type: 'privacy_notice',
    title: 'AVISO DE PRIVACIDAD INTEGRAL DE ENTREGAX',
    content: 'Documento editable desde panel legal.'
  },
  {
    document_type: 'advisor_privacy_notice',
    title: 'AVISO DE PRIVACIDAD Y TÉRMINOS DE COMISIONES PARA ASESORES COMERCIALES',
    content: 'Documento editable desde panel legal.'
  },
  {
    document_type: 'service_contract',
    title: 'CONTRATO DE SERVICIOS (CLIENTES)',
    content: 'Documento editable desde panel legal.'
  }
];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

async function getActiveDocumentByType(documentType: string) {
  const result = await pool.query(
    `
      SELECT title, content, version, updated_at
      FROM legal_documents
      WHERE document_type = $1 AND is_active = true
      LIMIT 1
    `,
    [documentType]
  );

  return result.rows[0] || null;
}

async function ensureRequiredLegalDocuments() {
  for (const doc of REQUIRED_DOCUMENTS) {
    const exists = await pool.query(
      'SELECT id FROM legal_documents WHERE document_type = $1 LIMIT 1',
      [doc.document_type]
    );

    if (exists.rows.length === 0) {
      await pool.query(
        `
          INSERT INTO legal_documents (document_type, title, content, version, is_active)
          VALUES ($1, $2, $3, 1, true)
        `,
        [doc.document_type, doc.title, doc.content]
      );
    }
  }
}

// ==============================================================================
// CONTROLADOR DE DOCUMENTOS LEGALES - SUPER ADMIN
// ==============================================================================

/**
 * Obtiene todos los documentos legales
 * GET /api/legal-documents
 */
export async function getAllLegalDocuments(req: Request, res: Response) {
  try {
    await ensureRequiredLegalDocuments();

    const result = await pool.query(`
      SELECT 
        id,
        document_type,
        title,
        content,
        version,
        is_active,
        last_updated_by,
        created_at,
        updated_at
      FROM legal_documents 
      ORDER BY
        CASE document_type
          WHEN 'privacy_policy' THEN 1
          WHEN 'advisor_privacy_notice' THEN 2
          WHEN 'privacy_notice' THEN 3
          WHEN 'service_contract' THEN 4
          ELSE 99
        END,
        document_type
    `);
    
    res.json({
      success: true,
      documents: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo documentos legales:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener documentos legales'
    });
  }
}

/**
 * Obtiene un documento legal por tipo
 * GET /api/legal-documents/:type
 */
export async function getLegalDocumentByType(req: Request, res: Response) {
  try {
    const { type } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id,
        document_type,
        title,
        content,
        version,
        is_active,
        updated_at
      FROM legal_documents 
      WHERE document_type = $1 AND is_active = true
    `, [type]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Documento no encontrado'
      });
    }
    
    res.json({
      success: true,
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo documento legal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener documento'
    });
  }
}

/**
 * Actualiza un documento legal
 * PUT /api/legal-documents/:id
 */
export async function updateLegalDocument(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const userId = (req as any).user?.id || null;
    
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Título y contenido son requeridos'
      });
    }
    
    // Incrementar versión al actualizar
    const result = await pool.query(`
      UPDATE legal_documents 
      SET 
        title = $1,
        content = $2,
        version = version + 1,
        last_updated_by = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [title, content, userId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Documento no encontrado'
      });
    }
    
    // Registrar en historial
    await pool.query(`
      INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
      VALUES ('UPDATE_LEGAL_DOCUMENT', 'legal_documents', $1, $2, $3)
    `, [id, userId, JSON.stringify({ title, version: result.rows[0].version })]).catch(() => {
      // Si no existe audit_log, ignorar
    });
    
    res.json({
      success: true,
      message: 'Documento actualizado correctamente',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizando documento legal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar documento'
    });
  }
}

/**
 * Crea un nuevo documento legal
 * POST /api/legal-documents
 */
export async function createLegalDocument(req: Request, res: Response) {
  try {
    const { document_type, title, content } = req.body;
    const userId = (req as any).user?.id || null;
    
    if (!document_type || !title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Tipo, título y contenido son requeridos'
      });
    }
    
    // Verificar si ya existe
    const exists = await pool.query(`
      SELECT id FROM legal_documents WHERE document_type = $1
    `, [document_type]);
    
    if (exists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe un documento con ese tipo'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO legal_documents (document_type, title, content, last_updated_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [document_type, title, content, userId]);
    
    res.status(201).json({
      success: true,
      message: 'Documento creado correctamente',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error creando documento legal:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear documento'
    });
  }
}

/**
 * Obtiene el historial de versiones de un documento
 * GET /api/legal-documents/:id/history
 */
export async function getLegalDocumentHistory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        al.id,
        al.action,
        al.details,
        al.created_at,
        u.name as updated_by_name
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.entity_type = 'legal_documents' 
        AND al.entity_id = $1
      ORDER BY al.created_at DESC
      LIMIT 20
    `, [id]);
    
    res.json({
      success: true,
      history: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.json({
      success: true,
      history: []
    });
  }
}

// ==============================================================================
// ENDPOINTS PÚBLICOS - Para apps móviles y web
// ==============================================================================

/**
 * Obtiene el contrato de servicios activo (público)
 * GET /api/public/legal/service-contract
 */
export async function getPublicServiceContract(req: Request, res: Response) {
  try {
    const contract = await getActiveDocumentByType('service_contract');

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: 'Contrato no encontrado'
      });
    }
    
    res.json({
      success: true,
      contract
    });
  } catch (error) {
    console.error('Error obteniendo contrato:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener contrato'
    });
  }
}

/**
 * Obtiene el aviso de privacidad activo (público)
 * GET /api/public/legal/privacy-notice
 */
export async function getPublicPrivacyNotice(req: Request, res: Response) {
  try {
    const privacyNotice = await getActiveDocumentByType('privacy_notice');

    if (!privacyNotice) {
      return res.status(404).json({
        success: false,
        error: 'Aviso de privacidad no encontrado'
      });
    }
    
    res.json({
      success: true,
      privacyNotice
    });
  } catch (error) {
    console.error('Error obteniendo aviso de privacidad:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener aviso de privacidad'
    });
  }
}

/**
 * Obtiene el aviso de privacidad de asesores (público)
 * GET /api/public/legal/advisor-privacy-notice
 */
export async function getPublicAdvisorPrivacyNotice(req: Request, res: Response) {
  try {
    const advisorPrivacyNotice = await getActiveDocumentByType('advisor_privacy_notice');

    if (!advisorPrivacyNotice) {
      return res.status(404).json({
        success: false,
        error: 'Aviso de privacidad para asesores no encontrado'
      });
    }

    res.json({
      success: true,
      advisorPrivacyNotice
    });
  } catch (error) {
    console.error('Error obteniendo aviso de privacidad para asesores:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener aviso de privacidad para asesores'
    });
  }
}

/**
 * Página pública HTML con políticas de privacidad de la empresa
 * GET /legal/privacy-policy
 */
export async function renderPublicPrivacyPoliciesPage(req: Request, res: Response) {
  try {
    const companyPrivacyPolicy = await getActiveDocumentByType('privacy_policy');

    if (!companyPrivacyPolicy) {
      return res.status(404).send('No hay políticas de privacidad publicadas');
    }

    const sections = [
      {
        heading: 'Política de Privacidad (Empresa)',
        ...companyPrivacyPolicy
      }
    ] as Array<{ heading: string; title: string; content: string; version: number; updated_at: string }>;

    const renderedSections = sections
      .map((section) => {
        const heading = escapeHtml(section.heading);
        const title = escapeHtml(section.title);
        const content = escapeHtml(section.content).replace(/\n/g, '<br/>');
        const updatedAt = new Date(section.updated_at).toLocaleString('es-MX');

        return `
          <section class="card">
            <h2>${heading}</h2>
            <h3>${title}</h3>
            <p class="meta">Versión ${section.version} · Actualizado: ${updatedAt}</p>
            <div class="content">${content}</div>
          </section>
        `;
      })
      .join('');

    const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Políticas de Privacidad | EntregaX</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f5f7fb; color:#1f2937; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; }
      .header { background:#111827; color:#fff; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
      .header h1 { margin:0 0 8px; font-size: 28px; }
      .header p { margin:0; opacity:.9; }
      .card { background:#fff; border:1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
      .card h2 { margin: 0 0 8px; font-size: 18px; color:#f05a28; }
      .card h3 { margin: 0 0 6px; font-size: 22px; }
      .meta { color:#6b7280; font-size: 13px; margin: 0 0 14px; }
      .content { line-height: 1.7; white-space: normal; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <h1>Políticas de Privacidad</h1>
        <p>Documentos legales oficiales de EntregaX</p>
      </div>
      ${renderedSections}
    </div>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error renderizando políticas de privacidad públicas:', error);
    res.status(500).send('Error al cargar políticas de privacidad');
  }
}
