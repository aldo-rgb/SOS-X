// ============================================
// CAROUSEL CONTROLLER
// Gestión de slides del carrusel de la app móvil
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { uploadToS3, isS3Configured } from './s3Service';

// ============================================
// INTERFACES
// ============================================

interface CarouselSlide {
  id: number;
  slide_key: string;
  slide_type: 'internal' | 'partner' | 'promo';
  title: string;
  subtitle: string;
  cta_text: string;
  cta_action: string;
  badge?: string;
  badge_color?: string;
  image_type: 'gradient' | 'icon' | 'image';
  image_url?: string;
  icon_name?: string;
  gradient_colors?: string[];
  icon_bg_color?: string;
  priority: number;
  is_active: boolean;
  target_audience?: string;
  views_count?: number;
  clicks_count?: number;
  start_date?: Date;
  end_date?: Date;
  created_at?: Date;
  updated_at?: Date;
}

// ============================================
// API PÚBLICA (para la app móvil)
// ============================================

/**
 * Obtener slides activos para la app
 * GET /api/carousel/slides
 */
export const getActiveSlides = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    
    const result = await pool.query(`
      SELECT 
        slide_key as id,
        slide_type as type,
        title,
        subtitle,
        cta_text as "ctaText",
        cta_action as "ctaAction",
        badge,
        badge_color as "badgeColor",
        image_type as "imageType",
        image_url as "imageUrl",
        icon_name as "iconName",
        gradient_colors as "gradientColors",
        icon_bg_color as "iconBgColor",
        priority,
        is_active as "isActive"
      FROM carousel_slides
      WHERE is_active = true
        AND (start_date IS NULL OR start_date <= $1)
        AND (end_date IS NULL OR end_date >= $1)
      ORDER BY priority ASC
    `, [now]);

    // Registrar vistas (de forma asíncrona, no bloqueante)
    if (result.rows.length > 0) {
      const slideKeys = result.rows.map((s: { id: string }) => s.id);
      pool.query(`
        UPDATE carousel_slides 
        SET views_count = views_count + 1 
        WHERE slide_key = ANY($1)
      `, [slideKeys]).catch(() => {}); // Ignorar errores
    }

    res.json({
      success: true,
      slides: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo slides:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener slides',
      slides: []
    });
  }
};

/**
 * Registrar click en un slide
 * POST /api/carousel/slides/:key/click
 */
export const registerSlideClick = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    
    await pool.query(`
      UPDATE carousel_slides 
      SET clicks_count = clicks_count + 1 
      WHERE slide_key = $1
    `, [key]);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error registrando click:', error);
    res.status(500).json({ success: false });
  }
};

// ============================================
// API DE ADMINISTRACIÓN
// ============================================

/**
 * Obtener todos los slides (admin)
 * GET /api/admin/carousel/slides
 */
export const getAllSlides = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        cs.*,
        u1.full_name as created_by_name,
        u2.full_name as updated_by_name
      FROM carousel_slides cs
      LEFT JOIN users u1 ON cs.created_by = u1.id
      LEFT JOIN users u2 ON cs.updated_by = u2.id
      ORDER BY cs.priority ASC
    `);

    res.json({
      success: true,
      slides: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo slides:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener slides'
    });
  }
};

/**
 * Obtener un slide por ID
 * GET /api/admin/carousel/slides/:id
 */
export const getSlideById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM carousel_slides WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Slide no encontrado'
      });
    }

    res.json({
      success: true,
      slide: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error obteniendo slide:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener slide'
    });
  }
};

/**
 * Crear nuevo slide
 * POST /api/admin/carousel/slides
 */
export const createSlide = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      slide_key,
      slide_type = 'internal',
      title,
      subtitle,
      cta_text,
      cta_action,
      badge,
      badge_color = '#F05A28',
      image_type = 'gradient',
      image_url,
      icon_name,
      gradient_colors = ['#F05A28', '#C1272D'],
      icon_bg_color,
      priority = 100,
      is_active = true,
      target_audience = 'all',
      start_date,
      end_date
    } = req.body;

    // Validaciones
    if (!slide_key || !title || !subtitle || !cta_text || !cta_action) {
      return res.status(400).json({
        success: false,
        message: 'Campos requeridos: slide_key, title, subtitle, cta_text, cta_action'
      });
    }

    // Verificar que slide_key sea único
    const existingCheck = await pool.query(
      'SELECT id FROM carousel_slides WHERE slide_key = $1',
      [slide_key]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un slide con esa clave'
      });
    }

    const result = await pool.query(`
      INSERT INTO carousel_slides (
        slide_key, slide_type, title, subtitle, cta_text, cta_action,
        badge, badge_color, image_type, image_url, icon_name,
        gradient_colors, icon_bg_color, priority, is_active,
        target_audience, start_date, end_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      slide_key, slide_type, title, subtitle, cta_text, cta_action,
      badge, badge_color, image_type, image_url, icon_name,
      gradient_colors, icon_bg_color, priority, is_active,
      target_audience, start_date || null, end_date || null, userId
    ]);

    console.log(`✅ Slide creado: ${slide_key}`);

    res.status(201).json({
      success: true,
      message: 'Slide creado exitosamente',
      slide: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creando slide:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear slide'
    });
  }
};

/**
 * Actualizar slide
 * PUT /api/admin/carousel/slides/:id
 */
export const updateSlide = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const {
      slide_key,
      slide_type,
      title,
      subtitle,
      cta_text,
      cta_action,
      badge,
      badge_color,
      image_type,
      image_url,
      icon_name,
      gradient_colors,
      icon_bg_color,
      priority,
      is_active,
      target_audience,
      start_date,
      end_date
    } = req.body;

    // Verificar que existe
    const existingCheck = await pool.query(
      'SELECT id FROM carousel_slides WHERE id = $1',
      [id]
    );

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Slide no encontrado'
      });
    }

    // Si cambia slide_key, verificar que no exista
    if (slide_key) {
      const keyCheck = await pool.query(
        'SELECT id FROM carousel_slides WHERE slide_key = $1 AND id != $2',
        [slide_key, id]
      );
      if (keyCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro slide con esa clave'
        });
      }
    }

    const result = await pool.query(`
      UPDATE carousel_slides SET
        slide_key = COALESCE($1, slide_key),
        slide_type = COALESCE($2, slide_type),
        title = COALESCE($3, title),
        subtitle = COALESCE($4, subtitle),
        cta_text = COALESCE($5, cta_text),
        cta_action = COALESCE($6, cta_action),
        badge = $7,
        badge_color = COALESCE($8, badge_color),
        image_type = COALESCE($9, image_type),
        image_url = $10,
        icon_name = $11,
        gradient_colors = COALESCE($12, gradient_colors),
        icon_bg_color = $13,
        priority = COALESCE($14, priority),
        is_active = COALESCE($15, is_active),
        target_audience = COALESCE($16, target_audience),
        start_date = $17,
        end_date = $18,
        updated_at = NOW(),
        updated_by = $19
      WHERE id = $20
      RETURNING *
    `, [
      slide_key, slide_type, title, subtitle, cta_text, cta_action,
      badge, badge_color, image_type, image_url, icon_name,
      gradient_colors, icon_bg_color, priority, is_active,
      target_audience, start_date || null, end_date || null, userId, id
    ]);

    console.log(`✅ Slide actualizado: ${id}`);

    res.json({
      success: true,
      message: 'Slide actualizado exitosamente',
      slide: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error actualizando slide:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar slide'
    });
  }
};

/**
 * Eliminar slide
 * DELETE /api/admin/carousel/slides/:id
 */
export const deleteSlide = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM carousel_slides WHERE id = $1 RETURNING slide_key',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Slide no encontrado'
      });
    }

    console.log(`✅ Slide eliminado: ${result.rows[0].slide_key}`);

    res.json({
      success: true,
      message: 'Slide eliminado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error eliminando slide:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar slide'
    });
  }
};

/**
 * Reordenar slides
 * PUT /api/admin/carousel/slides/reorder
 */
export const reorderSlides = async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // Array de { id, priority }

    if (!Array.isArray(order)) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de orden'
      });
    }

    // Actualizar prioridades
    for (const item of order) {
      await pool.query(
        'UPDATE carousel_slides SET priority = $1 WHERE id = $2',
        [item.priority, item.id]
      );
    }

    console.log(`✅ Slides reordenados: ${order.length} items`);

    res.json({
      success: true,
      message: 'Orden actualizado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error reordenando slides:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reordenar slides'
    });
  }
};

/**
 * Toggle estado activo de un slide
 * PATCH /api/admin/carousel/slides/:id/toggle
 */
export const toggleSlideActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const result = await pool.query(`
      UPDATE carousel_slides 
      SET is_active = NOT is_active,
          updated_at = NOW(),
          updated_by = $1
      WHERE id = $2
      RETURNING id, slide_key, is_active
    `, [userId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Slide no encontrado'
      });
    }

    const slide = result.rows[0];
    console.log(`✅ Slide ${slide.slide_key} ${slide.is_active ? 'activado' : 'desactivado'}`);

    res.json({
      success: true,
      message: `Slide ${slide.is_active ? 'activado' : 'desactivado'}`,
      is_active: slide.is_active
    });
  } catch (error) {
    console.error('❌ Error toggling slide:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del slide'
    });
  }
};

/**
 * Obtener estadísticas del carrusel
 * GET /api/admin/carousel/stats
 */
export const getCarouselStats = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_slides,
        COUNT(*) FILTER (WHERE is_active = true) as active_slides,
        SUM(views_count) as total_views,
        SUM(clicks_count) as total_clicks,
        CASE 
          WHEN SUM(views_count) > 0 
          THEN ROUND((SUM(clicks_count)::DECIMAL / SUM(views_count)) * 100, 2)
          ELSE 0 
        END as click_rate
      FROM carousel_slides
    `);

    // Top slides por clicks
    const topSlides = await pool.query(`
      SELECT slide_key, title, views_count, clicks_count,
        CASE 
          WHEN views_count > 0 
          THEN ROUND((clicks_count::DECIMAL / views_count) * 100, 2)
          ELSE 0 
        END as ctr
      FROM carousel_slides
      WHERE views_count > 0
      ORDER BY clicks_count DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      stats: result.rows[0],
      top_slides: topSlides.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas'
    });
  }
};

/**
 * Duplicar un slide
 * POST /api/admin/carousel/slides/:id/duplicate
 */
export const duplicateSlide = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    // Obtener slide original
    const original = await pool.query(
      'SELECT * FROM carousel_slides WHERE id = $1',
      [id]
    );

    if (original.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Slide no encontrado'
      });
    }

    const slide = original.rows[0];
    const newKey = `${slide.slide_key}_copy_${Date.now()}`;

    const result = await pool.query(`
      INSERT INTO carousel_slides (
        slide_key, slide_type, title, subtitle, cta_text, cta_action,
        badge, badge_color, image_type, image_url, icon_name,
        gradient_colors, icon_bg_color, priority, is_active,
        target_audience, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, $15, $16)
      RETURNING *
    `, [
      newKey, slide.slide_type, `${slide.title} (copia)`, slide.subtitle,
      slide.cta_text, slide.cta_action, slide.badge, slide.badge_color,
      slide.image_type, slide.image_url, slide.icon_name, slide.gradient_colors,
      slide.icon_bg_color, slide.priority + 1, slide.target_audience, userId
    ]);

    console.log(`✅ Slide duplicado: ${newKey}`);

    res.status(201).json({
      success: true,
      message: 'Slide duplicado exitosamente',
      slide: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error duplicando slide:', error);
    res.status(500).json({
      success: false,
      message: 'Error al duplicar slide'
    });
  }
};

/**
 * Subir imagen de fondo para slide
 * POST /api/admin/carousel/upload
 */
export const uploadSlideImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    let imageUrl: string;

    // Usar S3 si está configurado
    if (isS3Configured() && req.file.buffer) {
      console.log('☁️ Subiendo imagen de carrusel a AWS S3...');
      const timestamp = Date.now();
      const ext = req.file.originalname.split('.').pop() || 'jpg';
      const s3Key = `carousel/slide-${timestamp}.${ext}`;
      imageUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
      console.log(`✅ Imagen subida a S3: ${imageUrl}`);
    } else {
      // Fallback a almacenamiento local
      imageUrl = `/uploads/carousel/${req.file.filename}`;
      console.log(`✅ Imagen de carrusel subida localmente: ${imageUrl}`);
    }

    res.json({
      success: true,
      message: 'Imagen subida exitosamente',
      image_url: imageUrl,
      filename: req.file.filename || imageUrl.split('/').pop()
    });
  } catch (error) {
    console.error('❌ Error subiendo imagen:', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir imagen'
    });
  }
};
