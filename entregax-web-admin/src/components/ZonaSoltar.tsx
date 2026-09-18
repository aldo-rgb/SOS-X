import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { useSoltarArchivos, estiloZonaSoltar } from '../hooks/useSoltarArchivos';

/**
 * Envuelve un bloque para que además se le puedan soltar archivos encima.
 *
 * Es el mismo gancho `useSoltarArchivos`, empaquetado: donde solo hace falta
 * marcar una caja y recibir los archivos, esto deja el cambio en una línea y
 * evita repetir el cableado pantalla por pantalla (tarea 516).
 *
 *   <ZonaSoltar alSoltar={archivos => subirFoto(archivos[0])} soloUno>
 *     …el botón y las miniaturas que ya existían…
 *   </ZonaSoltar>
 */
export default function ZonaSoltar({
  alSoltar,
  soloUno,
  desactivado,
  texto = 'Suelta aquí para adjuntar',
  sx,
  children,
}: {
  alSoltar: (archivos: File[]) => void;
  soloUno?: boolean;
  desactivado?: boolean;
  /** `null` oculta el aviso; útil en cajas chicas donde no cabe. */
  texto?: string | null;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const { arrastrando, props } = useSoltarArchivos(alSoltar, { soloUno, desactivado });
  return (
    <Box {...props} sx={{ ...(sx as any), ...estiloZonaSoltar(arrastrando) }}>
      {arrastrando && texto && (
        <Typography sx={{ textAlign: 'center', color: '#F05A28', fontWeight: 700, fontSize: 13, py: 0.5 }}>
          {texto}
        </Typography>
      )}
      {children}
    </Box>
  );
}
