import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';

/**
 * Archivo pegado a un comentario de tarea.
 *
 * Los comentarios de Grupo Rino llegan con `attachment_url` y el comentario se
 * pintaba como puro texto ("Adjuntó un archivo") sin rastro del archivo. Si la
 * URL es una imagen que podemos cargar, se muestra la miniatura; si no —porque
 * es de su servidor y pide su sesión— queda el enlace, que es mejor que nada.
 */
export default function ComentarioAdjunto({ url }: { url: string }) {
  const [fallo, setFallo] = useState(false);
  const esImagen = /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url);

  if (esImagen && !fallo) {
    return (
      <Box sx={{ mt: 0.75 }}>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Box
            component="img"
            src={url}
            alt="Adjunto"
            onError={() => setFallo(true)}
            sx={{ maxWidth: 220, maxHeight: 220, borderRadius: 1.5, border: '1px solid #E0E0E0', display: 'block' }}
          />
        </a>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 0.5 }}>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.4,
          borderRadius: 1, bgcolor: '#F1F3F4', border: '1px solid #E0E0E0',
        }}>
          <AttachFileIcon sx={{ fontSize: 14, color: '#5F6368' }} />
          <Typography sx={{ fontSize: 11.5, color: '#3C4043', fontWeight: 600 }}>Abrir archivo adjunto</Typography>
        </Box>
      </a>
    </Box>
  );
}
