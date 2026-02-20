import { Request, Response } from 'express';
import { pool } from './db';

// ==============================================================================
// CONTROLADOR DE DOCUMENTOS LEGALES - SUPER ADMIN
// ==============================================================================

/**
 * Obtiene todos los documentos legales
 * GET /api/legal-documents
 */
export async function getAllLegalDocuments(req: Request, res: Response) {
  try {
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
      ORDER BY document_type
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
    const result = await pool.query(`
      SELECT title, content, version, updated_at
      FROM legal_documents 
      WHERE document_type = 'service_contract' AND is_active = true
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contrato no encontrado'
      });
    }
    
    res.json({
      success: true,
      contract: result.rows[0]
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
    const result = await pool.query(`
      SELECT title, content, version, updated_at
      FROM legal_documents 
      WHERE document_type = 'privacy_notice' AND is_active = true
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Aviso de privacidad no encontrado'
      });
    }
    
    res.json({
      success: true,
      privacyNotice: result.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo aviso de privacidad:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener aviso de privacidad'
    });
  }
}
