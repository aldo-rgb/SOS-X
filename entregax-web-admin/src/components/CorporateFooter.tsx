// ============================================================
// CorporateFooter — pie de página corporativo común
// para el portal del cliente (DashboardClient y similares).
// Incluye accesos a Aviso de Privacidad, Contacto, Redes Sociales
// y datos de la empresa. Mantiene los colores institucionales
// (naranja #F05A28 sobre fondo oscuro).
// ============================================================

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Link as MuiLink,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
} from '@mui/material';
import InstagramIcon from '@mui/icons-material/Instagram';
import FacebookIcon from '@mui/icons-material/Facebook';
import MusicNoteIcon from '@mui/icons-material/MusicNote'; // proxy para TikTok (MUI no trae icono oficial)
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import ShieldIcon from '@mui/icons-material/Shield';
import DescriptionIcon from '@mui/icons-material/Description';

const ORANGE = '#F05A28';
const DARK = '#111';
const TEXT_LIGHT = 'rgba(255,255,255,0.85)';
const TEXT_MUTED = 'rgba(255,255,255,0.55)';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

type LegalDoc = { title: string; content: string; version?: number; updated_at?: string };

export default function CorporateFooter() {
  const [legalOpen, setLegalOpen] = useState<null | 'privacy_policy' | 'service_contract'>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);

  const openLegal = async (type: 'privacy_policy' | 'service_contract') => {
    setLegalOpen(type);
    setLegalLoading(true);
    setLegalDoc(null);
    try {
      const res = await fetch(`${API_URL}/legal-documents/${type}`);
      if (!res.ok) throw new Error('not ok');
      const data = await res.json();
      if (data?.success && data.document) {
        setLegalDoc({
          title: data.document.title,
          content: data.document.content,
          version: data.document.version,
          updated_at: data.document.updated_at,
        });
      } else {
        setLegalDoc({ title: 'Documento', content: 'No se pudo cargar el contenido.' });
      }
    } catch {
      setLegalDoc({ title: 'Documento', content: 'No se pudo cargar el contenido. Verifica tu conexión.' });
    } finally {
      setLegalLoading(false);
    }
  };

  const year = new Date().getFullYear();

  return (
    <Box component="footer" sx={{ mt: 6, bgcolor: DARK, color: '#fff', borderTop: `4px solid ${ORANGE}`, textAlign: 'center' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 }, mx: 'auto' }}>
        {/* Layout en 4 columnas con flex (no usamos MUI Grid porque la
            v6 cambió el API y rompía el build con types). Las columnas
            se apilan en mobile (xs) y se distribuyen horizontalmente
            en desktop (md+). */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: { xs: 3, md: 4 },
          }}
        >
          {/* Marca + descripción */}
          <Box sx={{ flex: { xs: '1 1 100%', md: '0 1 280px' }, textAlign: 'center' }}>
            <Box
              component="img"
              src="/logo-paqeteria.png"
              alt="EntregaX"
              sx={{ height: { xs: 38, md: 44 }, width: 'auto', display: 'inline-block' }}
            />
            <Typography variant="body2" sx={{ color: TEXT_LIGHT, mt: 1.5, lineHeight: 1.7, mx: 'auto', maxWidth: 360 }}>
              Tu suite logística inteligente. Aéreo y marítimo desde China, PO Box USA y entrega nacional con trazabilidad total.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'center' }}>
              <IconButton
                aria-label="Instagram"
                size="small"
                href="https://www.instagram.com/entregax_paqueteria"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#fff', '&:hover': { bgcolor: ORANGE } }}
              >
                <InstagramIcon fontSize="small" />
              </IconButton>
              <IconButton
                aria-label="Facebook"
                size="small"
                href="https://www.facebook.com/entregax"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#fff', '&:hover': { bgcolor: ORANGE } }}
              >
                <FacebookIcon fontSize="small" />
              </IconButton>
              <IconButton
                aria-label="TikTok"
                size="small"
                href="https://www.tiktok.com/@entregax.mx"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#fff', '&:hover': { bgcolor: ORANGE } }}
              >
                <MusicNoteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Servicios */}
          <Box sx={{ flex: { xs: '1 1 45%', md: '0 1 160px' }, textAlign: 'center' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE, mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
              Servicios
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: TEXT_LIGHT }}>✈️ Aéreo China</Typography>
              <Typography variant="body2" sx={{ color: TEXT_LIGHT }}>🚢 Marítimo China</Typography>
              <Typography variant="body2" sx={{ color: TEXT_LIGHT }}>📦 PO Box USA</Typography>
              <Typography variant="body2" sx={{ color: TEXT_LIGHT }}>🚚 DHL Monterrey</Typography>
            </Box>
          </Box>

          {/* Legal */}
          <Box sx={{ flex: { xs: '1 1 45%', md: '0 1 200px' }, textAlign: 'center' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE, mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
              Legal
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, alignItems: 'center' }}>
              <MuiLink
                component="button"
                onClick={() => openLegal('privacy_policy')}
                sx={{ color: TEXT_LIGHT, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.75, '&:hover': { color: ORANGE } }}
              >
                <ShieldIcon sx={{ fontSize: 16 }} /> Aviso de Privacidad
              </MuiLink>
              <MuiLink
                component="button"
                onClick={() => openLegal('service_contract')}
                sx={{ color: TEXT_LIGHT, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.75, '&:hover': { color: ORANGE } }}
              >
                <DescriptionIcon sx={{ fontSize: 16 }} /> Contrato de Servicios
              </MuiLink>
            </Box>
          </Box>

          {/* Contacto */}
          <Box sx={{ flex: { xs: '1 1 100%', md: '0 1 220px' }, textAlign: 'center' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE, mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
              Contacto
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
              <MuiLink
                href="tel:+528111002021"
                sx={{ color: TEXT_LIGHT, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 1, '&:hover': { color: ORANGE } }}
              >
                <PhoneIcon sx={{ fontSize: 18 }} />
                <span>81 1100 2021</span>
              </MuiLink>
              <MuiLink
                href="mailto:contacto@entregax.com"
                sx={{ color: TEXT_LIGHT, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 1, '&:hover': { color: ORANGE } }}
              >
                <EmailIcon sx={{ fontSize: 18 }} />
                <span>contacto@entregax.com</span>
              </MuiLink>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
            © {year} EntregaX Paquetería — Todos los derechos reservados.
          </Typography>
          <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
            AppSync Powered
          </Typography>
        </Box>
      </Container>

      {/* Modal para mostrar el documento legal seleccionado */}
      <Dialog open={!!legalOpen} onClose={() => setLegalOpen(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
          {legalOpen === 'privacy_policy' ? <ShieldIcon /> : <DescriptionIcon />}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {legalDoc?.title || (legalOpen === 'privacy_policy' ? 'Aviso de Privacidad' : 'Contrato de Servicios')}
            </Typography>
            {legalDoc?.version != null ? (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                Versión {legalDoc.version}
                {legalDoc.updated_at ? ` · ${new Date(legalDoc.updated_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}
              </Typography>
            ) : null}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ mt: 2, maxHeight: 540 }}>
          {legalLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
              <CircularProgress sx={{ color: ORANGE }} />
            </Box>
          ) : (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#374151' }}>
              {legalDoc?.content || ''}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLegalOpen(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
