// ============================================
// CONFIRM DIALOG (Corporativo EntregaX)
// Reemplaza window.confirm() con un diálogo MUI
// con diseño corporativo, ícono, severidad y acciones claras.
// ============================================

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
} from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import type { ReactNode } from 'react';

export type ConfirmSeverity = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  severity?: ConfirmSeverity;
  loading?: boolean;
}

const SEVERITY = {
  danger:  { color: '#d32f2f', soft: 'rgba(211,47,47,0.10)', icon: <DeleteForeverRoundedIcon /> },
  warning: { color: '#F05A28', soft: 'rgba(240,90,40,0.10)', icon: <WarningAmberRoundedIcon /> },
  info:    { color: '#0288d1', soft: 'rgba(2,136,209,0.10)', icon: <InfoOutlinedIcon /> },
} as const;

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  severity = 'warning',
  loading = false,
}: ConfirmDialogProps) {
  const palette = SEVERITY[severity];

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
          boxShadow: '0 10px 40px rgba(15,23,42,0.18)',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          position: 'relative',
          px: 3,
          pt: 3,
          pb: 2,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
          bgcolor: '#ffffff',
        }}
      >
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            bgcolor: palette.soft,
            color: palette.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            '& svg': { fontSize: 26 },
          }}
        >
          {palette.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DialogTitle
            sx={{
              p: 0,
              fontSize: 17,
              fontWeight: 700,
              color: '#0f172a',
              lineHeight: 1.3,
            }}
          >
            {title}
          </DialogTitle>
        </Box>
        <IconButton
          onClick={onClose}
          disabled={loading}
          size="small"
          sx={{
            color: '#94a3b8',
            mt: -0.5,
            '&:hover': { bgcolor: '#f1f5f9', color: '#475569' },
          }}
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Mensaje */}
      <DialogContent sx={{ px: 3, pt: 0, pb: 2 }}>
        <Typography variant="body2" sx={{ color: '#475569', lineHeight: 1.55, fontSize: 14 }}>
          {message}
        </Typography>
      </DialogContent>

      {/* Acciones */}
      <DialogActions
        sx={{
          px: 3,
          py: 2,
          bgcolor: '#f8fafc',
          borderTop: '1px solid #e5e7eb',
          gap: 1,
        }}
      >
        <Button
          onClick={onClose}
          disabled={loading}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            color: '#475569',
            px: 2.5,
            '&:hover': { bgcolor: '#e2e8f0' },
          }}
        >
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          variant="contained"
          disableElevation
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            px: 2.5,
            bgcolor: palette.color,
            color: '#fff',
            '&:hover': { bgcolor: palette.color, filter: 'brightness(0.92)' },
          }}
        >
          {loading ? 'Procesando…' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
