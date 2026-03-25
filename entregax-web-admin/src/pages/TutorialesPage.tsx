// ============================================
// TUTORIALES PAGE - Página pública
// https://entregax.app/tutoriales
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Container,
  Paper,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Button,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  PersonAdd as PersonAddIcon,
  LocalShipping as ShippingIcon,
  Payment as PaymentIcon,
  CheckCircle as CheckIcon,
  ArrowForward as ArrowForwardIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material';

const ORANGE = '#F05A28';

// ============================================
// DATOS DE TUTORIALES
// ============================================

interface TutorialStep {
  label: string;
  description: string;
  tip?: string;
}

interface Tutorial {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  steps: TutorialStep[];
}

const TUTORIALS: Tutorial[] = [
  {
    id: 'registro',
    icon: <PersonAddIcon sx={{ fontSize: 32 }} />,
    title: 'Cómo Registrarse en EntregaX',
    subtitle: 'Crea tu cuenta con o sin código de referencia',
    color: '#4CAF50',
    steps: [
      {
        label: 'Descarga la App',
        description: 'Descarga la app de EntregaX desde la App Store (iPhone) o Google Play (Android). Busca "EntregaX" en la tienda de tu dispositivo.',
        tip: 'Asegúrate de descargar la app oficial con el logo naranja de EntregaX.',
      },
      {
        label: 'Abre la App y selecciona "Crear Cuenta"',
        description: 'Al abrir la app por primera vez verás la pantalla de inicio de sesión. Presiona el botón "Crear Cuenta" o "Registrarme".',
      },
      {
        label: 'Ingresa tus datos personales',
        description: 'Llena el formulario con tu nombre completo, correo electrónico y número de teléfono. Crea una contraseña segura que recuerdes.',
        tip: 'Usa un correo electrónico al que tengas acceso, ya que recibirás notificaciones de tus paquetes ahí.',
      },
      {
        label: 'Código de Referencia (opcional)',
        description: 'Si un asesor te invitó, ingresa su código de referencia en el campo correspondiente. Esto te conectará con tu asesor asignado que te ayudará con tus envíos. Si no tienes código, simplemente deja este campo vacío y continúa.',
        tip: 'Si tu asesor te compartió un link directo, el código ya estará prellenado automáticamente.',
      },
      {
        label: 'Verifica tu cuenta',
        description: 'Recibirás un código de verificación por SMS o correo electrónico. Ingrésalo para completar tu registro.',
      },
      {
        label: '¡Listo! Ya tienes tu buzón',
        description: 'Una vez verificada tu cuenta, se te asignará un número de buzón (Box ID). Este número es tu dirección personalizada en Estados Unidos y China para recibir paquetes.',
        tip: 'Guarda tu número de buzón (ej: S1, S25), lo necesitarás para dar tu dirección de envío en tiendas online.',
      },
    ],
  },
  {
    id: 'instrucciones-entrega',
    icon: <ShippingIcon sx={{ fontSize: 32 }} />,
    title: 'Cómo Asignar Instrucciones de Entrega',
    subtitle: 'Configura a dónde quieres recibir tus paquetes',
    color: '#2196F3',
    steps: [
      {
        label: 'Abre la app y ve a "Mis Paquetes"',
        description: 'Inicia sesión en la app de EntregaX. En la pantalla principal verás la lista de tus paquetes activos.',
      },
      {
        label: 'Selecciona el paquete',
        description: 'Toca sobre el paquete al que quieres asignarle instrucciones de entrega. Verás el detalle con su tracking, peso y estado actual.',
      },
      {
        label: 'Presiona "Asignar Dirección"',
        description: 'En la parte inferior del detalle del paquete, encontrarás el botón "Asignar Dirección" o "Instrucciones de Entrega". Presiónalo para continuar.',
      },
      {
        label: 'Elige tu opción de entrega',
        description: 'Tienes varias opciones:\n\n• **Recoger en Sucursal**: Tu paquete te esperará en nuestra bodega. Ideal si prefieres recogerlo personalmente.\n\n• **Envío a Domicilio**: Selecciona o agrega una dirección de entrega. Se te mostrarán las opciones de paquetería disponibles con sus precios.',
        tip: 'Si es la primera vez, necesitarás agregar tu dirección completa con calle, número, colonia, ciudad, estado y código postal.',
      },
      {
        label: 'Selecciona paquetería (si aplica)',
        description: 'Si elegiste envío a domicilio, selecciona la paquetería de tu preferencia. Verás el precio de cada opción. Las más comunes son Paquete Express, FedEx, Estafeta y DHL.',
      },
      {
        label: 'Confirma tus instrucciones',
        description: 'Revisa que tu dirección y paquetería sean correctas y presiona "Confirmar". ¡Listo! Tu paquete será enviado según tus instrucciones una vez que realices el pago.',
        tip: 'Puedes modificar tus instrucciones de entrega mientras el paquete esté en bodega y antes de que sea despachado.',
      },
    ],
  },
  {
    id: 'como-pagar',
    icon: <PaymentIcon sx={{ fontSize: 32 }} />,
    title: 'Cómo Realizar tu Pago',
    subtitle: 'Métodos de pago disponibles y paso a paso',
    color: '#FF9800',
    steps: [
      {
        label: 'Abre la app y ve a "Mis Paquetes"',
        description: 'Inicia sesión en la app de EntregaX. En la pantalla principal verás tus paquetes con el monto pendiente de pago.',
      },
      {
        label: 'Selecciona los paquetes a pagar',
        description: 'Puedes seleccionar uno o varios paquetes para pagarlos juntos. Toca los paquetes que deseas pagar, el total se irá sumando automáticamente.',
        tip: 'Es más conveniente pagar varios paquetes juntos en una sola transacción.',
      },
      {
        label: 'Presiona "Pagar"',
        description: 'Una vez seleccionados los paquetes, presiona el botón "Pagar" que aparece en la parte inferior de la pantalla.',
      },
      {
        label: 'Selecciona tu método de pago',
        description: 'Elige entre los métodos disponibles:\n\n• **Tarjeta de crédito/débito**: Pago seguro a través de nuestra pasarela de pagos.\n\n• **Transferencia bancaria**: Realiza una transferencia y sube tu comprobante.\n\n• **Pago en sucursal**: Paga directamente en nuestra oficina.',
      },
      {
        label: 'Completa el pago',
        description: 'Sigue las instrucciones según el método elegido. Si pagas con tarjeta, ingresa los datos de tu tarjeta. Si haces transferencia, usa los datos bancarios que se te muestran y sube el comprobante.',
        tip: 'El pago con tarjeta se acredita al instante. Las transferencias pueden tardar entre 1-24 horas en verificarse.',
      },
      {
        label: '¡Pago confirmado!',
        description: 'Una vez acreditado tu pago, recibirás una confirmación en la app y por correo electrónico. Tu paquete será preparado para envío según tus instrucciones de entrega.',
        tip: 'Si tienes algún problema con tu pago, contacta a tu asesor o a nuestro equipo de soporte.',
      },
    ],
  },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function TutorialesPage() {
  // Read initial hash for expanded tutorial
  const initialHash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
  const [expandedTutorial, setExpandedTutorial] = useState<string | false>(initialHash || false);

  // Scroll to tutorial on mount if hash present
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    }
  }, []);

  const handleAccordionChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedTutorial(isExpanded ? panel : false);
    // Update URL hash
    if (isExpanded) {
      window.history.replaceState(null, '', `#${panel}`);
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      bgcolor: '#FAFAFA',
      pb: 8,
    }}>
      {/* Header */}
      <Box sx={{ 
        background: `linear-gradient(135deg, ${ORANGE} 0%, #FF8A50 100%)`,
        color: 'white',
        py: { xs: 4, md: 6 },
        px: 2,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background decoration */}
        <Box sx={{ 
          position: 'absolute', top: -50, right: -50, width: 200, height: 200, 
          borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.1)' 
        }} />
        <Box sx={{ 
          position: 'absolute', bottom: -30, left: -30, width: 150, height: 150, 
          borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' 
        }} />

        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="h3" fontWeight={800} gutterBottom sx={{ fontSize: { xs: '1.8rem', md: '2.5rem' } }}>
            📚 Tutoriales EntregaX
          </Typography>
          <Typography variant="h6" sx={{ opacity: 0.9, fontWeight: 400, fontSize: { xs: '0.95rem', md: '1.15rem' } }}>
            Aprende a usar nuestra plataforma paso a paso
          </Typography>
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
            {TUTORIALS.map((t) => (
              <Chip
                key={t.id}
                label={t.title.replace('Cómo ', '')}
                onClick={() => {
                  setExpandedTutorial(t.id);
                  setTimeout(() => {
                    document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 300);
                }}
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.2)', 
                  color: 'white', 
                  fontWeight: 600,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' },
                  cursor: 'pointer',
                }}
              />
            ))}
          </Box>
        </Container>
      </Box>

      {/* Tutorials */}
      <Container maxWidth="md" sx={{ mt: -3, position: 'relative', zIndex: 2 }}>
        {TUTORIALS.map((tutorial) => (
          <Accordion
            key={tutorial.id}
            id={tutorial.id}
            expanded={expandedTutorial === tutorial.id}
            onChange={handleAccordionChange(tutorial.id)}
            sx={{
              mb: 2,
              borderRadius: '16px !important',
              overflow: 'hidden',
              '&:before': { display: 'none' },
              boxShadow: expandedTutorial === tutorial.id 
                ? `0 8px 32px ${tutorial.color}30`
                : '0 2px 8px rgba(0,0,0,0.08)',
              transition: 'all 0.3s ease',
              border: expandedTutorial === tutorial.id ? `2px solid ${tutorial.color}40` : '2px solid transparent',
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                py: 1,
                px: { xs: 2, md: 3 },
                '&.Mui-expanded': { 
                  borderBottom: `2px solid ${tutorial.color}20`,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ 
                  width: 56, height: 56, borderRadius: 3,
                  background: `linear-gradient(135deg, ${tutorial.color} 0%, ${tutorial.color}CC 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', flexShrink: 0,
                }}>
                  {tutorial.icon}
                </Box>
                <Box>
                  <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: '1rem', md: '1.15rem' } }}>
                    {tutorial.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {tutorial.subtitle}
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={{ px: { xs: 2, md: 3 }, pb: 3 }}>
              <Stepper 
                orientation="vertical" 
                activeStep={-1}
                sx={{
                  '& .MuiStepConnector-line': {
                    borderColor: `${tutorial.color}40`,
                    minHeight: 20,
                  },
                }}
              >
                {tutorial.steps.map((step, index) => (
                  <Step key={index} active expanded>
                    <StepLabel
                      StepIconComponent={() => (
                        <Box sx={{
                          width: 32, height: 32, borderRadius: '50%',
                          bgcolor: tutorial.color, color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '0.85rem',
                        }}>
                          {index === tutorial.steps.length - 1 ? <CheckIcon sx={{ fontSize: 18 }} /> : index + 1}
                        </Box>
                      )}
                    >
                      <Typography variant="subtitle1" fontWeight={700}>
                        {step.label}
                      </Typography>
                    </StepLabel>
                    <StepContent
                      sx={{
                        borderColor: `${tutorial.color}40`,
                        pl: { xs: 1, md: 2 },
                      }}
                    >
                      <Typography 
                        variant="body2" 
                        color="text.secondary" 
                        sx={{ 
                          mb: step.tip ? 1.5 : 0,
                          lineHeight: 1.7,
                          whiteSpace: 'pre-line',
                        }}
                      >
                        {step.description}
                      </Typography>
                      {step.tip && (
                        <Paper 
                          sx={{ 
                            p: 1.5, 
                            bgcolor: `${tutorial.color}10`, 
                            border: `1px solid ${tutorial.color}30`,
                            borderRadius: 2,
                          }}
                        >
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            💡 <strong>Tip:</strong> {step.tip}
                          </Typography>
                        </Paper>
                      )}
                    </StepContent>
                  </Step>
                ))}
              </Stepper>
            </AccordionDetails>
          </Accordion>
        ))}

        {/* Help Section */}
        <Paper sx={{ 
          mt: 4, p: { xs: 3, md: 4 }, borderRadius: 4, textAlign: 'center',
          background: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
        }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            ¿Necesitas más ayuda?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Nuestro equipo de soporte está disponible para ayudarte
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<PhoneIcon />}
              href="tel:+528119411324"
              sx={{ 
                borderRadius: 3, bgcolor: ORANGE, 
                '&:hover': { bgcolor: '#d14a1e' },
                textTransform: 'none',
                px: 3,
              }}
            >
              Llamar a Soporte
            </Button>
            <Button
              variant="outlined"
              startIcon={<ArrowForwardIcon />}
              href="/"
              sx={{ 
                borderRadius: 3, borderColor: ORANGE, color: ORANGE,
                '&:hover': { borderColor: '#d14a1e', bgcolor: '#FFF3ED' },
                textTransform: 'none',
                px: 3,
              }}
            >
              Ir a EntregaX
            </Button>
          </Box>
        </Paper>

        {/* Footer */}
        <Box sx={{ textAlign: 'center', mt: 4, pb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            © {new Date().getFullYear()} EntregaX — Todos los derechos reservados
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
