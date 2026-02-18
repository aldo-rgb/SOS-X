// ============================================
// CAROUSEL SLIDES PAGE
// Gestión de slides del carrusel de la app móvil
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Grid,
  Tooltip,
  LinearProgress,
  Divider,
  FormControlLabel,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  Visibility as PreviewIcon,
  VisibilityOff as HideIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Analytics as StatsIcon,
  Smartphone as PhoneIcon,
  Refresh as RefreshIcon,
  TouchApp as ClickIcon,
  RemoveRedEye as ViewsIcon,
  ColorLens as ColorIcon,
  CloudUpload as CloudUploadIcon
} from '@mui/icons-material';

// Iconos disponibles de Ionicons
const AVAILABLE_ICONS = [
  'airplane', 'boat', 'car', 'gift', 'shield-checkmark', 'star', 'heart',
  'flash', 'rocket', 'diamond', 'trophy', 'medal', 'flag', 'cart',
  'pricetag', 'ticket', 'time', 'calendar', 'wallet', 'card'
];

// Presets de gradientes
const GRADIENT_PRESETS = [
  { name: 'Naranja EntregaX', colors: ['#F05A28', '#C1272D'] },
  { name: 'Azul Marino', colors: ['#1a237e', '#283593', '#3949ab'] },
  { name: 'Naranja Fuego', colors: ['#bf360c', '#e64a19', '#ff5722'] },
  { name: 'Azul Océano', colors: ['#006064', '#00838f', '#00acc1'] },
  { name: 'Púrpura', colors: ['#4a148c', '#6a1b9a', '#8e24aa'] },
  { name: 'Verde Éxito', colors: ['#1b5e20', '#2e7d32', '#43a047'] },
  { name: 'Dorado', colors: ['#ff6f00', '#ff8f00', '#ffa000'] },
  { name: 'Rosa', colors: ['#880e4f', '#ad1457', '#c2185b'] },
];

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
  start_date?: string;
  end_date?: string;
  created_at?: string;
}

interface Stats {
  total_slides: number;
  active_slides: number;
  total_views: number;
  total_clicks: number;
  click_rate: number;
}

const emptySlide: Partial<CarouselSlide> = {
  slide_key: '',
  slide_type: 'internal',
  title: '',
  subtitle: '',
  cta_text: '',
  cta_action: '',
  badge: '',
  badge_color: '#F05A28',
  image_type: 'gradient',
  icon_name: 'star',
  gradient_colors: ['#F05A28', '#C1272D'],
  priority: 100,
  is_active: true,
  target_audience: 'all'
};

export default function CarouselSlidesPage() {
  const token = localStorage.getItem('token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Estados
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<Partial<CarouselSlide> | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSlide, setPreviewSlide] = useState<CarouselSlide | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [uploading, setUploading] = useState(false);

  // Cargar datos
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [slidesRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/carousel/slides`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/admin/carousel/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (slidesRes.ok) {
        const data = await slidesRes.json();
        setSlides(data.slides || []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [API_URL, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Crear/Editar slide
  const handleSave = async () => {
    if (!editingSlide) return;

    try {
      const isNew = !editingSlide.id;
      const url = isNew 
        ? `${API_URL}/api/admin/carousel/slides`
        : `${API_URL}/api/admin/carousel/slides/${editingSlide.id}`;
      
      const response = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editingSlide)
      });

      if (response.ok) {
        setSnackbar({ 
          open: true, 
          message: isNew ? 'Slide creado exitosamente' : 'Slide actualizado exitosamente', 
          severity: 'success' 
        });
        setDialogOpen(false);
        setEditingSlide(null);
        fetchData();
      } else {
        const error = await response.json();
        setSnackbar({ open: true, message: error.message || 'Error al guardar', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
    }
  };

  // Subir imagen
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setSnackbar({ open: true, message: 'Solo se permiten imágenes JPG, PNG, WEBP o GIF', severity: 'error' });
      return;
    }

    // Validar tamaño (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'La imagen no debe superar 5MB', severity: 'error' });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_URL}/api/admin/carousel/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        // Construir URL completa para la imagen
        const fullUrl = `${API_URL}${data.image_url}`;
        setEditingSlide({ 
          ...editingSlide, 
          image_url: fullUrl,
          image_type: 'image'
        });
        setSnackbar({ open: true, message: 'Imagen subida exitosamente', severity: 'success' });
      } else {
        const error = await response.json();
        setSnackbar({ open: true, message: error.message || 'Error al subir imagen', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
    } finally {
      setUploading(false);
    }
  };

  // Toggle activo
  const handleToggle = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/carousel/slides/${id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        fetchData();
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al cambiar estado', severity: 'error' });
    }
  };

  // Eliminar
  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar este slide?')) return;

    try {
      const response = await fetch(`${API_URL}/api/admin/carousel/slides/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        setSnackbar({ open: true, message: 'Slide eliminado', severity: 'success' });
        fetchData();
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
    }
  };

  // Duplicar
  const handleDuplicate = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/carousel/slides/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        setSnackbar({ open: true, message: 'Slide duplicado', severity: 'success' });
        fetchData();
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al duplicar', severity: 'error' });
    }
  };

  // Mover prioridad
  const handleMove = async (id: number, direction: 'up' | 'down') => {
    const index = slides.findIndex(s => s.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === slides.length - 1) return;

    const newSlides = [...slides];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Intercambiar prioridades
    const tempPriority = newSlides[index].priority;
    newSlides[index].priority = newSlides[swapIndex].priority;
    newSlides[swapIndex].priority = tempPriority;

    // Enviar al servidor
    try {
      await fetch(`${API_URL}/api/admin/carousel/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          order: newSlides.map(s => ({ id: s.id, priority: s.priority }))
        })
      });
      fetchData();
    } catch {
      setSnackbar({ open: true, message: 'Error al reordenar', severity: 'error' });
    }
  };

  // Calcular CTR
  const calculateCTR = (views: number, clicks: number) => {
    if (!views || views === 0) return '0%';
    return ((clicks / views) * 100).toFixed(1) + '%';
  };

  // Renderizar preview del gradiente
  const renderGradientPreview = (colors: string[]) => {
    const gradient = colors.length > 1 
      ? `linear-gradient(135deg, ${colors.join(', ')})` 
      : colors[0] || '#F05A28';
    return (
      <Box
        sx={{
          width: 60,
          height: 35,
          borderRadius: 1,
          background: gradient,
          border: '1px solid rgba(0,0,0,0.1)'
        }}
      />
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon color="primary" /> Carrusel de la App
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestiona los slides promocionales que aparecen en la app móvil
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchData}
          >
            Actualizar
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingSlide({ ...emptySlide });
              setDialogOpen(true);
            }}
          >
            Nuevo Slide
          </Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Total Slides</Typography>
                <Typography variant="h4" fontWeight="bold">{stats.total_slides}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#e8f5e9' }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Activos</Typography>
                <Typography variant="h4" fontWeight="bold" color="success.main">
                  {stats.active_slides}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ViewsIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" color="text.secondary">Vistas Totales</Typography>
                </Box>
                <Typography variant="h4" fontWeight="bold">
                  {Number(stats.total_views || 0).toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card sx={{ bgcolor: '#fff3e0' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ClickIcon color="warning" fontSize="small" />
                  <Typography variant="subtitle2" color="text.secondary">CTR Promedio</Typography>
                </Box>
                <Typography variant="h4" fontWeight="bold" color="warning.main">
                  {stats.click_rate}%
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabla de Slides */}
      <Paper sx={{ p: 2 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell width={50}><strong>#</strong></TableCell>
                <TableCell width={80}><strong>Visual</strong></TableCell>
                <TableCell><strong>Título / Subtítulo</strong></TableCell>
                <TableCell><strong>CTA</strong></TableCell>
                <TableCell><strong>Badge</strong></TableCell>
                <TableCell align="center"><strong>Estado</strong></TableCell>
                <TableCell align="center"><strong>Métricas</strong></TableCell>
                <TableCell align="center"><strong>Orden</strong></TableCell>
                <TableCell align="center"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {slides.map((slide, index) => (
                <TableRow 
                  key={slide.id} 
                  sx={{ 
                    '&:hover': { bgcolor: '#fafafa' },
                    opacity: slide.is_active ? 1 : 0.6
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {slide.priority}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {slide.image_type === 'gradient' && slide.gradient_colors && (
                      renderGradientPreview(slide.gradient_colors)
                    )}
                    {slide.image_type === 'image' && slide.image_url && (
                      <Box
                        component="img"
                        src={slide.image_url}
                        sx={{ width: 60, height: 35, borderRadius: 1, objectFit: 'cover' }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight="bold" sx={{ mb: 0.5 }}>
                      {slide.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {slide.subtitle.substring(0, 60)}...
                    </Typography>
                    <Chip 
                      label={slide.slide_key} 
                      size="small" 
                      variant="outlined"
                      sx={{ mt: 0.5, fontSize: '0.65rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{slide.cta_text}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      → {slide.cta_action}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {slide.badge && (
                      <Chip 
                        label={slide.badge} 
                        size="small"
                        sx={{ 
                          bgcolor: slide.badge_color || '#F05A28',
                          color: 'white'
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={slide.is_active}
                      onChange={() => handleToggle(slide.id)}
                      color="success"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="caption">
                        👁️ {Number(slide.views_count || 0).toLocaleString()}
                      </Typography>
                      <Typography variant="caption">
                        👆 {Number(slide.clicks_count || 0).toLocaleString()}
                      </Typography>
                      <Chip 
                        label={`CTR: ${calculateCTR(slide.views_count || 0, slide.clicks_count || 0)}`}
                        size="small"
                        color={Number(slide.clicks_count || 0) > 0 ? 'success' : 'default'}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <IconButton 
                        size="small" 
                        onClick={() => handleMove(slide.id, 'up')}
                        disabled={index === 0}
                      >
                        <ArrowUpIcon fontSize="small" />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        onClick={() => handleMove(slide.id, 'down')}
                        disabled={index === slides.length - 1}
                      >
                        <ArrowDownIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Vista previa">
                        <IconButton 
                          size="small" 
                          color="info"
                          onClick={() => {
                            setPreviewSlide(slide);
                            setPreviewOpen(true);
                          }}
                        >
                          <PreviewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => {
                            setEditingSlide(slide);
                            setDialogOpen(true);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicar">
                        <IconButton 
                          size="small" 
                          color="secondary"
                          onClick={() => handleDuplicate(slide.id)}
                        >
                          <DuplicateIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDelete(slide.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {slides.length === 0 && !loading && (
          <Box sx={{ textAlign: 'center', py: 5 }}>
            <PhoneIcon sx={{ fontSize: 60, color: '#ccc', mb: 2 }} />
            <Typography color="text.secondary">
              No hay slides configurados. Crea el primero!
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Dialog Crear/Editar */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingSlide?.id ? 'Editar Slide' : 'Nuevo Slide'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Identificador */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Clave única (slide_key)"
                value={editingSlide?.slide_key || ''}
                onChange={(e) => setEditingSlide({ ...editingSlide, slide_key: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                helperText="Identificador único, ej: black_friday_2025"
                disabled={!!editingSlide?.id}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select
                  value={editingSlide?.slide_type || 'internal'}
                  label="Tipo"
                  onChange={(e) => setEditingSlide({ ...editingSlide, slide_type: e.target.value as any })}
                >
                  <MenuItem value="internal">🏠 Interno (EntregaX)</MenuItem>
                  <MenuItem value="partner">🤝 Partner</MenuItem>
                  <MenuItem value="promo">🎁 Promoción</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Contenido */}
            <Grid size={12}>
              <Divider sx={{ my: 1 }}>Contenido</Divider>
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Título"
                value={editingSlide?.title || ''}
                onChange={(e) => setEditingSlide({ ...editingSlide, title: e.target.value })}
                placeholder="¿Tu carga sobreviviría a esto?"
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Subtítulo"
                value={editingSlide?.subtitle || ''}
                onChange={(e) => setEditingSlide({ ...editingSlide, subtitle: e.target.value })}
                placeholder="Los accidentes pasan. Asegura tu tranquilidad..."
              />
            </Grid>

            {/* CTA */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Texto del botón (CTA)"
                value={editingSlide?.cta_text || ''}
                onChange={(e) => setEditingSlide({ ...editingSlide, cta_text: e.target.value })}
                placeholder="🛡️ Activar Protección"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Acción del CTA"
                value={editingSlide?.cta_action || ''}
                onChange={(e) => setEditingSlide({ ...editingSlide, cta_action: e.target.value })}
                placeholder="navigate:GEXPromo"
                helperText="navigate:Screen, link:URL, modal:type"
              />
            </Grid>

            {/* Badge */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Badge (etiqueta)"
                value={editingSlide?.badge || ''}
                onChange={(e) => setEditingSlide({ ...editingSlide, badge: e.target.value })}
                placeholder="🆕 Nuevo"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Color del Badge"
                type="color"
                value={editingSlide?.badge_color || '#F05A28'}
                onChange={(e) => setEditingSlide({ ...editingSlide, badge_color: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <Box 
                      sx={{ 
                        width: 24, 
                        height: 24, 
                        bgcolor: editingSlide?.badge_color || '#F05A28',
                        borderRadius: 1,
                        mr: 1
                      }} 
                    />
                  )
                }}
              />
            </Grid>

            {/* Visual */}
            <Grid size={12}>
              <Divider sx={{ my: 1 }}>Visual</Divider>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo de fondo</InputLabel>
                <Select
                  value={editingSlide?.image_type || 'gradient'}
                  label="Tipo de fondo"
                  onChange={(e) => setEditingSlide({ ...editingSlide, image_type: e.target.value as any })}
                >
                  <MenuItem value="gradient">🎨 Gradiente</MenuItem>
                  <MenuItem value="image">🖼️ Imagen</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {editingSlide?.image_type === 'gradient' && (
              <>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <FormControl fullWidth>
                    <InputLabel>Preset de gradiente</InputLabel>
                    <Select
                      value=""
                      label="Preset de gradiente"
                      onChange={(e) => {
                        const preset = GRADIENT_PRESETS.find(p => p.name === e.target.value);
                        if (preset) {
                          setEditingSlide({ ...editingSlide, gradient_colors: preset.colors });
                        }
                      }}
                    >
                      {GRADIENT_PRESETS.map(preset => (
                        <MenuItem key={preset.name} value={preset.name}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {renderGradientPreview(preset.colors)}
                            <Typography>{preset.name}</Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={12}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Colores actuales:</Typography>
                    {(editingSlide?.gradient_colors || []).map((color, i) => (
                      <TextField
                        key={i}
                        type="color"
                        value={color}
                        onChange={(e) => {
                          const newColors = [...(editingSlide?.gradient_colors || [])];
                          newColors[i] = e.target.value;
                          setEditingSlide({ ...editingSlide, gradient_colors: newColors });
                        }}
                        sx={{ width: 60 }}
                        size="small"
                      />
                    ))}
                    {renderGradientPreview(editingSlide?.gradient_colors || [])}
                  </Box>
                </Grid>
              </>
            )}

            {editingSlide?.image_type === 'image' && (
              <Grid size={12}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Input para subir imagen */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button
                      variant="outlined"
                      component="label"
                      disabled={uploading}
                      startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                    >
                      {uploading ? 'Subiendo...' : 'Subir Imagen'}
                      <input
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleImageUpload}
                      />
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      JPG, PNG, WEBP o GIF. Máximo 5MB. Recomendado 16:9
                    </Typography>
                  </Box>
                  
                  {/* O ingresar URL manual */}
                  <TextField
                    fullWidth
                    label="O ingresa URL de imagen"
                    value={editingSlide?.image_url || ''}
                    onChange={(e) => setEditingSlide({ ...editingSlide, image_url: e.target.value })}
                    placeholder="https://..."
                    size="small"
                  />

                  {/* Preview de la imagen */}
                  {editingSlide?.image_url && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        Vista previa:
                      </Typography>
                      <Box
                        component="img"
                        src={editingSlide.image_url}
                        alt="Preview"
                        sx={{
                          maxWidth: '100%',
                          maxHeight: 200,
                          borderRadius: 2,
                          border: '1px solid #ddd'
                        }}
                        onError={(e: any) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </Box>
                  )}
                </Box>
              </Grid>
            )}

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Icono</InputLabel>
                <Select
                  value={editingSlide?.icon_name || 'star'}
                  label="Icono"
                  onChange={(e) => setEditingSlide({ ...editingSlide, icon_name: e.target.value })}
                >
                  {AVAILABLE_ICONS.map(icon => (
                    <MenuItem key={icon} value={icon}>{icon}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Prioridad"
                value={editingSlide?.priority || 100}
                onChange={(e) => setEditingSlide({ ...editingSlide, priority: parseInt(e.target.value) || 100 })}
                helperText="Menor número = aparece primero"
              />
            </Grid>

            {/* Estado */}
            <Grid size={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editingSlide?.is_active !== false}
                    onChange={(e) => setEditingSlide({ ...editingSlide, is_active: e.target.checked })}
                    color="success"
                  />
                }
                label="Slide activo"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSave}
            disabled={!editingSlide?.slide_key || !editingSlide?.title}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Preview */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="xs">
        <DialogTitle>Vista Previa del Slide</DialogTitle>
        <DialogContent>
          {previewSlide && (
            <Box
              sx={{
                width: 300,
                height: 170,
                borderRadius: 2,
                overflow: 'hidden',
                position: 'relative',
                background: previewSlide.image_type === 'gradient' && previewSlide.gradient_colors
                  ? `linear-gradient(135deg, ${previewSlide.gradient_colors.join(', ')})`
                  : previewSlide.image_url
                    ? `url(${previewSlide.image_url})`
                    : '#F05A28'
              }}
            >
              {/* Badge */}
              {previewSlide.badge && (
                <Chip
                  label={previewSlide.badge}
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    bgcolor: previewSlide.badge_color,
                    color: 'white',
                    fontWeight: 'bold'
                  }}
                />
              )}
              
              {/* Content */}
              <Box sx={{ 
                position: 'absolute', 
                bottom: 0, 
                left: 0, 
                right: 0,
                p: 2,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))'
              }}>
                <Typography variant="subtitle1" fontWeight="bold" color="white">
                  {previewSlide.title}
                </Typography>
                <Typography variant="caption" color="rgba(255,255,255,0.8)">
                  {previewSlide.subtitle}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  sx={{ mt: 1, bgcolor: 'white', color: '#333', fontSize: '0.7rem' }}
                >
                  {previewSlide.cta_text}
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
