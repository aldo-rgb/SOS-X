-- ============================================
-- MIGRACIÓN: Slides del Carrusel de la App
-- Permite gestionar las oportunidades/promociones del carrusel
-- ============================================

-- Tabla principal de slides
CREATE TABLE IF NOT EXISTS carousel_slides (
  id SERIAL PRIMARY KEY,
  
  -- Identificador único del slide
  slide_key VARCHAR(50) UNIQUE NOT NULL,
  
  -- Tipo de slide
  slide_type VARCHAR(20) NOT NULL DEFAULT 'internal' CHECK (slide_type IN ('internal', 'partner', 'promo')),
  
  -- Contenido
  title VARCHAR(100) NOT NULL,
  subtitle VARCHAR(200) NOT NULL,
  cta_text VARCHAR(50) NOT NULL,
  cta_action VARCHAR(100) NOT NULL, -- 'navigate:ScreenName' | 'link:https://...' | 'modal:type'
  
  -- Badge
  badge VARCHAR(30),
  badge_color VARCHAR(20) DEFAULT '#F05A28',
  
  -- Visual
  image_type VARCHAR(20) NOT NULL DEFAULT 'gradient' CHECK (image_type IN ('gradient', 'icon', 'image')),
  image_url TEXT, -- URL de imagen de fondo (si image_type = 'image')
  icon_name VARCHAR(50), -- Nombre del icono Ionicons
  gradient_colors TEXT[] DEFAULT ARRAY['#F05A28', '#C1272D'], -- Array de colores para gradiente
  icon_bg_color VARCHAR(20),
  
  -- Configuración
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  
  -- Segmentación (opcional para futuro)
  target_audience VARCHAR(50) DEFAULT 'all', -- 'all', 'new_users', 'frequent', 'premium'
  
  -- Métricas
  views_count INT DEFAULT 0,
  clicks_count INT DEFAULT 0,
  
  -- Fechas de vigencia
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  
  -- Auditoría
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INT,
  updated_by INT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_carousel_slides_active ON carousel_slides(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_carousel_slides_dates ON carousel_slides(start_date, end_date);

-- Insertar slides predeterminados
INSERT INTO carousel_slides (slide_key, slide_type, title, subtitle, cta_text, cta_action, badge, badge_color, image_type, icon_name, gradient_colors, priority, is_active)
VALUES
  (
    'gex_protection',
    'internal',
    '¿Tu carga sobreviviría a esto?',
    'Los accidentes pasan. Asegura tu tranquilidad por solo el 5% del valor.',
    '🛡️ Activar Protección GEX',
    'navigate:GEXPromo',
    'Recomendado',
    '#10B981',
    'gradient',
    'shield-checkmark',
    ARRAY['#1a237e', '#283593', '#3949ab'],
    1,
    true
  ),
  (
    'air_express',
    'internal',
    'De China a tu puerta en tiempo récord',
    'Nueva ruta Aérea Exprés. Recibe antes, vende más rápido.',
    '✈️ Cotizar Ruta Exprés',
    'navigate:RequestAdvisor',
    '🆕 Nuevo',
    '#F05A28',
    'gradient',
    'airplane',
    ARRAY['#bf360c', '#e64a19', '#ff5722'],
    2,
    true
  ),
  (
    'maritime_savings',
    'internal',
    'Ahorra hasta 70% en tu envío',
    'Consolida tus compras y paga menos flete por CBM.',
    '🚢 Ver Cómo Funciona',
    'navigate:RequestAdvisor',
    'Ahorro',
    '#0097A7',
    'gradient',
    'boat',
    ARRAY['#006064', '#00838f', '#00acc1'],
    3,
    true
  ),
  (
    'referral_program',
    'promo',
    'Invita y gana $500 MXN',
    'Por cada amigo que haga su primer envío, ambos ganan.',
    '🎁 Compartir mi Código',
    'modal:referral',
    'Exclusivo',
    '#9C27B0',
    'gradient',
    'gift',
    ARRAY['#4a148c', '#6a1b9a', '#8e24aa'],
    4,
    true
  )
ON CONFLICT (slide_key) DO NOTHING;

-- Comentarios
COMMENT ON TABLE carousel_slides IS 'Slides del carrusel de oportunidades de la app móvil';
COMMENT ON COLUMN carousel_slides.cta_action IS 'Acción del botón: navigate:ScreenName, link:URL, modal:type';
COMMENT ON COLUMN carousel_slides.gradient_colors IS 'Array de colores para el gradiente de fondo';
