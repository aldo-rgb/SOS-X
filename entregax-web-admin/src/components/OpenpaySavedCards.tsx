/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenpaySavedCards
 *
 * Sección que se monta dentro del modal de pago. Lista las tarjetas guardadas
 * del usuario en Openpay (a través de /api/payments/openpay/cards) y permite:
 *
 *   - Elegir una tarjeta guardada → cobrar con source_id (sin redirect).
 *   - Agregar una tarjeta nueva → tokeniza con Openpay.js (PCI), la guarda y
 *     opcionalmente cobra con ella.
 *
 * El componente NO hace el cobro: solo gestiona la selección/tokenización y
 * publica vía props los datos requeridos para el cobro:
 *
 *   onSelectionChange({ mode: 'saved', cardId, deviceSessionId })
 *   onSelectionChange({ mode: 'new',   tokenId, deviceSessionId, saveCard })
 *   onSelectionChange(null)  → ninguna selección válida aún
 *
 * Requisitos: el host debe haber inyectado `https://js.openpay.mx/openpay.v1.min.js`
 * y `https://js.openpay.mx/openpay-data.v1.min.js` en el index.html.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import AddCardIcon from '@mui/icons-material/AddCard';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import api from '../services/api';

declare global {
  interface Window {
    OpenPay?: any;
  }
}

export interface OpenpaySavedCard {
  id: string;
  brand: string;
  cardNumber: string; // últimos 4
  holderName: string;
  expirationMonth: string;
  expirationYear: string;
  bank?: string | null;
}

export type OpenpaySelection =
  | { mode: 'saved'; cardId: string; deviceSessionId: string }
  | { mode: 'new'; tokenId: string; deviceSessionId: string; saveCard: boolean }
  | null;

interface Props {
  service?: string; // por defecto 'aereo'
  onSelectionChange: (sel: OpenpaySelection) => void;
}

const OpenpaySavedCards: React.FC<Props> = ({ service = 'aereo', onSelectionChange }) => {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<OpenpaySavedCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string>('');
  const [publicKey, setPublicKey] = useState<string>('');
  const [sandbox, setSandbox] = useState<boolean>(true);

  const [mode, setMode] = useState<'saved' | 'new'>('saved');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [deviceSessionId, setDeviceSessionId] = useState<string>('');

  // Form para nueva tarjeta
  const [holderName, setHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv2, setCvv2] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [tokenizing, setTokenizing] = useState(false);
  const [newCardToken, setNewCardToken] = useState<string>('');
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Cargar tarjetas + credenciales públicas
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [pkRes, cardsRes] = await Promise.all([
          api.get(`/payments/openpay/public-key?service=${service}`),
          api.get(`/payments/openpay/cards?service=${service}`),
        ]);
        if (!mounted) return;
        if (pkRes.data?.success) {
          setMerchantId(pkRes.data.merchantId);
          setPublicKey(pkRes.data.publicKey);
          setSandbox(!!pkRes.data.sandbox);
        }
        const list: OpenpaySavedCard[] = cardsRes.data?.cards || [];
        setCards(list);
        if (list.length > 0) {
          setMode('saved');
          setSelectedCardId(list[0]!.id);
        } else {
          setMode('new');
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e.response?.data?.error || e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [service]);

  // Inicializar OpenPay JS y obtener device_session_id
  useEffect(() => {
    if (!merchantId || !publicKey || !window.OpenPay) return;
    try {
      window.OpenPay.setId(merchantId);
      window.OpenPay.setApiKey(publicKey);
      window.OpenPay.setSandboxMode(!!sandbox);
      const dsid = window.OpenPay.deviceData.setup();
      setDeviceSessionId(dsid);
    } catch (e: any) {
      console.error('OpenPay setup error:', e);
      setError('No se pudo inicializar OpenPay JS: ' + (e?.message || e));
    }
  }, [merchantId, publicKey, sandbox]);

  // Publicar selección al padre
  useEffect(() => {
    if (!deviceSessionId) {
      onSelectionChange(null);
      return;
    }
    if (mode === 'saved' && selectedCardId) {
      onSelectionChange({ mode: 'saved', cardId: selectedCardId, deviceSessionId });
    } else if (mode === 'new' && newCardToken) {
      onSelectionChange({ mode: 'new', tokenId: newCardToken, deviceSessionId, saveCard });
    } else {
      onSelectionChange(null);
    }
  }, [mode, selectedCardId, newCardToken, deviceSessionId, saveCard, onSelectionChange]);

  const canTokenize = useMemo(() => {
    return (
      holderName.trim().length > 2 &&
      cardNumber.replace(/\s/g, '').length >= 13 &&
      /^\d{1,2}$/.test(expMonth) &&
      /^\d{2}$/.test(expYear) &&
      /^\d{3,4}$/.test(cvv2)
    );
  }, [holderName, cardNumber, expMonth, expYear, cvv2]);

  const tokenizeNewCard = () => {
    if (!window.OpenPay) {
      setTokenError('OpenPay JS no está cargado.');
      return;
    }
    setTokenizing(true);
    setTokenError(null);
    setNewCardToken('');
    const cardData = {
      card_number: cardNumber.replace(/\s/g, ''),
      holder_name: holderName.trim(),
      expiration_year: expYear,
      expiration_month: expMonth.padStart(2, '0'),
      cvv2,
    };
    window.OpenPay.token.create(
      cardData,
      (resp: any) => {
        setTokenizing(false);
        setNewCardToken(resp.data.id);
      },
      (err: any) => {
        setTokenizing(false);
        const msg =
          err?.data?.description || err?.message || 'No se pudo validar la tarjeta. Verifica los datos.';
        setTokenError(msg);
      }
    );
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!window.confirm('¿Eliminar esta tarjeta guardada?')) return;
    try {
      await api.delete(`/payments/openpay/cards/${cardId}?service=${service}`);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      if (selectedCardId === cardId) setSelectedCardId('');
    } catch (e: any) {
      alert(e.response?.data?.error || e.message);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {cards.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Tus tarjetas guardadas
          </Typography>
          <RadioGroup
            value={mode === 'saved' ? selectedCardId : ''}
            onChange={(e) => {
              setMode('saved');
              setSelectedCardId(e.target.value);
              setNewCardToken('');
            }}
          >
            <Stack spacing={1}>
              {cards.map((c) => (
                <Paper
                  key={c.id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderColor: mode === 'saved' && selectedCardId === c.id ? 'primary.main' : 'divider',
                    bgcolor: mode === 'saved' && selectedCardId === c.id ? 'action.hover' : 'transparent',
                  }}
                >
                  <FormControlLabel
                    value={c.id}
                    control={<Radio />}
                    sx={{ flex: 1, m: 0 }}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CreditCardIcon color="primary" />
                        <Box>
                          <Typography variant="body1" fontWeight={600}>
                            {c.brand?.toUpperCase()} •••• {c.cardNumber}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {c.holderName} · Vence {c.expirationMonth}/{c.expirationYear}
                            {c.bank ? ` · ${c.bank}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                  <IconButton size="small" onClick={() => handleDeleteCard(c.id)} title="Eliminar tarjeta">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ))}
            </Stack>
          </RadioGroup>
          <Divider sx={{ my: 2 }} />
        </>
      )}

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderColor: mode === 'new' ? 'primary.main' : 'divider',
          bgcolor: mode === 'new' ? 'action.hover' : 'transparent',
        }}
      >
        <FormControlLabel
          control={
            <Radio
              checked={mode === 'new'}
              onChange={() => {
                setMode('new');
                setSelectedCardId('');
              }}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AddCardIcon color="primary" />
              <Typography fontWeight={600}>Pagar con una tarjeta nueva</Typography>
            </Box>
          }
          sx={{ m: 0 }}
        />

        {mode === 'new' && (
          <Box sx={{ mt: 2 }}>
            <Stack spacing={1.5}>
              <TextField
                size="small"
                label="Nombre del titular"
                value={holderName}
                onChange={(e) => {
                  setHolderName(e.target.value);
                  setNewCardToken('');
                }}
                fullWidth
              />
              <TextField
                size="small"
                label="Número de tarjeta"
                value={cardNumber}
                onChange={(e) => {
                  setCardNumber(e.target.value.replace(/[^0-9 ]/g, ''));
                  setNewCardToken('');
                }}
                inputProps={{ maxLength: 19 }}
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Mes (MM)"
                  value={expMonth}
                  onChange={(e) => {
                    setExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2));
                    setNewCardToken('');
                  }}
                  sx={{ width: 110 }}
                />
                <TextField
                  size="small"
                  label="Año (AA)"
                  value={expYear}
                  onChange={(e) => {
                    setExpYear(e.target.value.replace(/\D/g, '').slice(0, 2));
                    setNewCardToken('');
                  }}
                  sx={{ width: 110 }}
                />
                <TextField
                  size="small"
                  label="CVV"
                  value={cvv2}
                  onChange={(e) => {
                    setCvv2(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setNewCardToken('');
                  }}
                  sx={{ width: 110 }}
                />
              </Stack>
              <FormControlLabel
                control={
                  <Checkbox checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />
                }
                label="Guardar esta tarjeta para futuros pagos"
              />
              {tokenError && <Alert severity="error">{tokenError}</Alert>}
              {newCardToken ? (
                <Alert severity="success">Tarjeta validada correctamente. Lista para pagar.</Alert>
              ) : (
                <Button
                  variant="outlined"
                  onClick={tokenizeNewCard}
                  disabled={!canTokenize || tokenizing || !deviceSessionId}
                  startIcon={tokenizing ? <CircularProgress size={18} /> : null}
                >
                  {tokenizing ? 'Validando…' : 'Validar tarjeta'}
                </Button>
              )}
            </Stack>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default OpenpaySavedCards;
