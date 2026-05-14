/**
 * PhoneVerificationBanner — Banner sticky en dashboard de cliente cuando
 * aún no ha verificado su WhatsApp.
 *
 * Se le pasa el user actual (con phone + phoneVerified). Si está verificado
 * o no es client, no renderiza nada.
 *
 * Botón "Verificar ahora" abre PhoneVerificationDialog.
 */
import { useState } from 'react';
import { Alert, Button, Box } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PhoneVerificationDialog from './PhoneVerificationDialog';

interface Props {
  user: {
    role?: string;
    phone?: string | null;
    phoneVerified?: boolean;
  } | null;
  onVerified?: () => void;
}

const PhoneVerificationBanner: React.FC<Props> = ({ user, onVerified }) => {
  const [open, setOpen] = useState(false);

  if (!user) return null;
  const role = (user.role || '').toLowerCase();
  if (!['client', 'cliente'].includes(role)) return null;
  if (user.phoneVerified === true) return null;
  if (!user.phone) return null;

  return (
    <>
      <Alert
        severity="warning"
        icon={<WhatsAppIcon sx={{ color: '#25D366' }} />}
        sx={{
          mb: 2,
          borderRadius: 2,
          fontWeight: 600,
          alignItems: 'center',
          '& .MuiAlert-message': { width: '100%' },
        }}
        action={
          <Button
            color="inherit"
            size="small"
            variant="contained"
            onClick={() => setOpen(true)}
            sx={{
              fontWeight: 700,
              textTransform: 'none',
              background: 'linear-gradient(90deg, #25D366 0%, #128C7E 100%)',
              color: '#fff',
              '&:hover': { background: 'linear-gradient(90deg, #1FB956 0%, #0E6E63 100%)' },
            }}
          >
            Verificar ahora
          </Button>
        }
      >
        <Box>
          <strong>Verificación de WhatsApp pendiente.</strong>{' '}
          No podrás pagar ni ver costos hasta confirmar tu número.
        </Box>
      </Alert>

      <PhoneVerificationDialog
        open={open}
        phone={user.phone}
        onVerified={() => {
          setOpen(false);
          onVerified?.();
        }}
        onSkip={() => setOpen(false)}
      />
    </>
  );
};

export default PhoneVerificationBanner;
