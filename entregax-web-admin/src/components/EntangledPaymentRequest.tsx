// ============================================================================
// EntangledPaymentRequest
// Componente cliente para crear y consultar solicitudes de pago a proveedores
// internacionales a través del motor ENTANGLED.
// Diseñado para insertarse como pestaña/sección sin afectar el resto del flow.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import DescriptionIcon from '@mui/icons-material/Description';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ContactsIcon from '@mui/icons-material/Contacts';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import EntangledSupplierForm, { EMPTY_SUPPLIER } from './EntangledSupplierForm';
import type { SupplierFormData } from './EntangledSupplierForm';

import { Checkbox, FormControlLabel, Divider, List, ListItem, ListItemText, ListItemSecondaryAction, RadioGroup, Radio, FormControl, Card, CardContent } from '@mui/material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#F05A28';

interface EntangledRequest {
  id: number;
  entangled_transaccion_id: string | null;
  cf_rfc: string;
  cf_razon_social: string;
  cf_email: string;
  op_monto: string | number;
  op_divisa_destino: string;
  op_comprobante_cliente_url?: string;
  estatus_global: string;
  estatus_factura: string;
  estatus_proveedor: string;
  factura_url: string | null;
  factura_emitida_at: string | null;
  comprobante_proveedor_url: string | null;
  proveedor_pagado_at: string | null;
  created_at: string;
  updated_at: string;
}

const REGIMENES_FISCALES = [
  { value: '601', label: '601 - General de Ley Personas Morales' },
  { value: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
  { value: '605', label: '605 - Sueldos y Salarios' },
  { value: '606', label: '606 - Arrendamiento' },
  { value: '612', label: '612 - Personas Físicas con Actividades Empresariales' },
  { value: '621', label: '621 - Incorporación Fiscal' },
  { value: '626', label: '626 - RESICO' },
  { value: '616', label: '616 - Sin obligaciones fiscales' },
];

const USOS_CFDI = [
  { value: 'G01', label: 'G01 - Adquisición de mercancías' },
  { value: 'G03', label: 'G03 - Gastos en general' },
  { value: 'P01', label: 'P01 - Por definir' },
  { value: 'I01', label: 'I01 - Construcciones' },
  { value: 'I02', label: 'I02 - Mobiliario y equipo' },
  { value: 'I04', label: 'I04 - Equipo de cómputo' },
  { value: 'I08', label: 'I08 - Otra maquinaria' },
];

const DIVISAS = ['USD', 'RMB'];

const statusColor = (s: string): 'default' | 'warning' | 'info' | 'success' | 'error' => {
  switch (s) {
    case 'completado':
    case 'emitida':
      return 'success';
    case 'en_proceso':
    case 'enviado':
      return 'info';
    case 'pendiente':
      return 'warning';
    case 'rechazado':
    case 'error_envio':
      return 'error';
    default:
      return 'default';
  }
};

const formatDate = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');
const formatMoney = (v: number | string) =>
  Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  /** Cuando true, oculta el header del componente (útil si se mete dentro de otra página). */
  hideHeader?: boolean;
}

export default function EntangledPaymentRequest({ hideHeader = false }: Props) {
  const { t } = useTranslation();
  const token = useMemo(() => localStorage.getItem('token') || '', []);
  const authHeader = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const [requests, setRequests] = useState<EntangledRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ----- Wizard / flujo v2 -----
  const [requiereFactura, setRequiereFactura] = useState(true);
  const [saveFiscalProfile, setSaveFiscalProfile] = useState(true);
  const [pricing, setPricing] = useState<{ tipo_cambio_usd: number; tipo_cambio_rmb: number; porcentaje_compra: number } | null>(null);
  type EntProviderPub = {
    id: number;
    name: string;
    code: string | null;
    tipo_cambio_usd: number | string;
    tipo_cambio_rmb: number | string;
    porcentaje_compra: number | string;
    bank_accounts: Array<{ currency: string; bank: string; holder: string; account: string; clabe: string; reference: string }>;
    is_default: boolean;
    sort_order: number;
  };
  const [providers, setProviders] = useState<EntProviderPub[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | ''>('');
  const [quote, setQuote] = useState<{ tipo_cambio: number; porcentaje_compra: number; monto_mxn_base: number; monto_mxn_total: number } | null>(null);
  const [lastCreated, setLastCreated] = useState<{ request: unknown; instrucciones_pago: unknown; quote: { tipo_cambio: number; porcentaje_compra: number; monto_mxn_base: number; monto_mxn_total: number } | null } | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // ----- Proveedores de envío (beneficiarios) -----
  interface SavedSupplier extends SupplierFormData {
    id: number;
    is_favorite: boolean;
  }
  const [suppliers, setSuppliers] = useState<SavedSupplier[]>([]);
  const [supplierForm, setSupplierForm] = useState<SupplierFormData>(EMPTY_SUPPLIER);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | 'new'>('new');
  const [saveSupplierForLater, setSaveSupplierForLater] = useState(true);
  const [uploadingSupplier, setUploadingSupplier] = useState(false);
  const [suppliersDialogOpen, setSuppliersDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SavedSupplier | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [form, setForm] = useState({
    rfc: '',
    razon_social: '',
    regimen_fiscal: '601',
    cp: '',
    uso_cfdi: 'G03',
    email: '',
    monto: '',
    divisa_destino: 'USD',
    conceptos: '',
    comprobante_cliente_url: '',
  });

  const loadRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/entangled/payment-requests/me`, {
        headers: authHeader,
      });
      setRequests(r.data || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authHeader, token]);

  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API_URL}/api/entangled/suppliers`, { headers: authHeader });
      setSuppliers(r.data || []);
    } catch (err: unknown) {
      console.error('[ENTANGLED] loadSuppliers:', err);
    }
  }, [authHeader, token]);

  const loadFiscalProfile = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API_URL}/api/entangled/fiscal-profile`, { headers: authHeader });
      const p = r.data;
      if (p) {
        setForm((prev) => ({
          ...prev,
          rfc: p.rfc || '',
          razon_social: p.razon_social || '',
          regimen_fiscal: p.regimen_fiscal || '601',
          cp: p.cp || '',
          uso_cfdi: p.uso_cfdi || 'G03',
          email: p.email || '',
        }));
      }
    } catch (err: unknown) {
      console.error('[ENTANGLED] loadFiscalProfile:', err);
    }
  }, [authHeader, token]);

  const loadPricing = useCallback(async () => {
    if (!token) return;
    try {
      const r = await axios.get(`${API_URL}/api/entangled/providers`, { headers: authHeader });
      const list: EntProviderPub[] = (r.data || []).map((p: EntProviderPub) => ({
        ...p,
        bank_accounts: Array.isArray(p.bank_accounts) ? p.bank_accounts : [],
      }));
      setProviders(list);
      // Seleccionar default o el primero
      const def = list.find((x) => x.is_default) || list[0] || null;
      if (def) {
        setSelectedProviderId((prev) => (prev ? prev : def.id));
        setPricing({
          tipo_cambio_usd: Number(def.tipo_cambio_usd),
          tipo_cambio_rmb: Number(def.tipo_cambio_rmb),
          porcentaje_compra: Number(def.porcentaje_compra),
        });
      }
    } catch (err: unknown) {
      console.error('[ENTANGLED] loadProviders:', err);
    }
  }, [authHeader, token]);

  useEffect(() => {
    loadRequests();
    loadSuppliers();
    loadFiscalProfile();
    loadPricing();
  }, [loadRequests, loadSuppliers, loadFiscalProfile, loadPricing]);

  // Cuando cambia el selector de proveedor en el dialog
  const handlePickSupplier = (raw: string) => {
    const id: number | 'new' = raw === 'new' ? 'new' : Number(raw);
    setSelectedSupplierId(id);
    if (id === 'new') {
      setSupplierForm(EMPTY_SUPPLIER);
      setSaveSupplierForLater(true);
    } else {
      const s = suppliers.find((x) => x.id === id);
      if (s) {
        setSupplierForm({ ...EMPTY_SUPPLIER, ...s });
        setSaveSupplierForLater(false);
        if (s.divisa_default) setForm((p) => ({ ...p, divisa_destino: s.divisa_default }));
      }
    }
  };

  const handleUploadSupplierPhoto = async (file: File) => {
    setUploadingSupplier(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/api/uploads/evidence`, fd, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });
      setSupplierForm((p) => ({ ...p, foto_url: res.data.url }));
    } catch (err: unknown) {
      setSnack({
        open: true,
        severity: 'error',
        message: (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('entangled.messages.error'),
      });
    } finally {
      setUploadingSupplier(false);
    }
  };

  const persistSupplier = async (data: SupplierFormData): Promise<number | null> => {
    try {
      if (data.id) {
        const r = await axios.put(`${API_URL}/api/entangled/suppliers/${data.id}`, data, {
          headers: authHeader,
        });
        return r.data?.id ?? data.id;
      }
      const r = await axios.post(`${API_URL}/api/entangled/suppliers`, data, {
        headers: authHeader,
      });
      return r.data?.id ?? null;
    } catch (err) {
      console.error('[ENTANGLED] persistSupplier:', err);
      return null;
    }
  };

  const handleDeleteSupplier = async (id: number) => {
    if (!confirm(t('entangled.suppliers.confirmDelete', '¿Eliminar este proveedor?'))) return;
    try {
      await axios.delete(`${API_URL}/api/entangled/suppliers/${id}`, { headers: authHeader });
      await loadSuppliers();
    } catch {
      setSnack({ open: true, severity: 'error', message: t('entangled.messages.error') });
    }
  };

  const handleToggleFavorite = async (s: SavedSupplier) => {
    try {
      await axios.put(
        `${API_URL}/api/entangled/suppliers/${s.id}`,
        { ...s, is_favorite: !s.is_favorite },
        { headers: authHeader }
      );
      await loadSuppliers();
    } catch {
      // noop
    }
  };

  const openEditSupplier = (s: SavedSupplier | null) => {
    setEditingSupplier(s);
    if (s) setSupplierForm({ ...EMPTY_SUPPLIER, ...s });
    else setSupplierForm(EMPTY_SUPPLIER);
  };

  const handleSaveStandaloneSupplier = async () => {
    if (!supplierForm.nombre_beneficiario || !supplierForm.numero_cuenta || !supplierForm.banco_nombre) {
      setSnack({
        open: true,
        severity: 'error',
        message: t('entangled.suppliers.requiredFields', 'Completa beneficiario, número de cuenta y banco'),
      });
      return;
    }
    setSavingSupplier(true);
    const id = await persistSupplier({ ...supplierForm, ...(editingSupplier ? { id: editingSupplier.id } : {}) });
    setSavingSupplier(false);
    if (id) {
      setSnack({ open: true, severity: 'success', message: t('entangled.messages.success') });
      setEditingSupplier(null);
      setSupplierForm(EMPTY_SUPPLIER);
      loadSuppliers();
    } else {
      setSnack({ open: true, severity: 'error', message: t('entangled.messages.error') });
    }
  };

  // Subida diferida del comprobante a una solicitud existente
  const handleUploadProofToRequest = async (requestId: number, file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await axios.post(`${API_URL}/api/uploads/evidence`, fd, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });
      await axios.post(
        `${API_URL}/api/entangled/payment-requests/${requestId}/upload-proof`,
        { comprobante_cliente_url: upRes.data.url },
        { headers: authHeader }
      );
      setSnack({ open: true, severity: 'success', message: t('entangled.actions.viewMyProof') });
      loadRequests();
    } catch (err: unknown) {
      setSnack({
        open: true,
        severity: 'error',
        message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('entangled.messages.error'),
      });
    } finally {
      setUploading(false);
    }
  };

  const validateForm = (): string | null => {
    if (requiereFactura) {
      if (!form.rfc || !form.razon_social || !form.cp || !form.email) return t('entangled.messages.requiredFields');
    }
    if (!form.monto || Number(form.monto) <= 0) return t('entangled.messages.requiredFields');
    if (!['USD', 'RMB'].includes(form.divisa_destino)) return t('entangled.messages.requiredFields');
    if (!supplierForm.nombre_beneficiario || !supplierForm.numero_cuenta || !supplierForm.banco_nombre) {
      return t('entangled.suppliers.requiredFields', 'Completa beneficiario, número de cuenta y banco del proveedor de envío');
    }
    if (form.divisa_destino === 'RMB' && !supplierForm.nombre_chino) {
      return t('entangled.suppliers.chineseRequired', 'Para envíos en RMB se requiere el nombre del beneficiario en chino');
    }
    return null;
  };

  // Recalcular quote cuando cambia monto, divisa o proveedor
  useEffect(() => {
    const prov = providers.find((p) => p.id === selectedProviderId);
    if (prov) {
      setPricing({
        tipo_cambio_usd: Number(prov.tipo_cambio_usd),
        tipo_cambio_rmb: Number(prov.tipo_cambio_rmb),
        porcentaje_compra: Number(prov.porcentaje_compra),
      });
    }
  }, [selectedProviderId, providers]);

  // Recalcular quote cuando cambia monto o divisa
  useEffect(() => {
    const m = Number(form.monto);
    if (!pricing || !m || m <= 0) {
      setQuote(null);
      return;
    }
    const tc = form.divisa_destino === 'RMB' ? pricing.tipo_cambio_rmb : pricing.tipo_cambio_usd;
    const base = m * tc;
    const total = base * (1 + pricing.porcentaje_compra / 100);
    setQuote({
      tipo_cambio: tc,
      porcentaje_compra: pricing.porcentaje_compra,
      monto_mxn_base: Number(base.toFixed(2)),
      monto_mxn_total: Number(total.toFixed(2)),
    });
  }, [form.monto, form.divisa_destino, pricing]);

  const handleSubmit = async () => {
    const err = validateForm();
    if (err) {
      setSnack({ open: true, severity: 'error', message: err });
      return;
    }
    setSubmitting(true);
    try {
      // Si pidió guardar perfil fiscal
      if (requiereFactura && saveFiscalProfile) {
        try {
          await axios.put(
            `${API_URL}/api/entangled/fiscal-profile`,
            {
              rfc: form.rfc.trim().toUpperCase(),
              razon_social: form.razon_social.trim(),
              regimen_fiscal: form.regimen_fiscal,
              cp: form.cp.trim(),
              uso_cfdi: form.uso_cfdi,
              email: form.email.trim(),
            },
            { headers: authHeader }
          );
        } catch (e) {
          console.warn('[ENTANGLED] No se pudo guardar perfil fiscal:', e);
        }
      }

      // Si pidió guardar el proveedor para reuso
      let supplierId: number | undefined = supplierForm.id;
      if (selectedSupplierId === 'new' && saveSupplierForLater) {
        const newId = await persistSupplier({ ...supplierForm, divisa_default: form.divisa_destino });
        if (newId) supplierId = newId;
      } else if (selectedSupplierId !== 'new') {
        supplierId = Number(selectedSupplierId);
      }

      const payload: Record<string, unknown> = {
        requiere_factura: requiereFactura,
        provider_id: selectedProviderId || null,
        operacion: {
          montos: Number(form.monto),
          divisa_destino: form.divisa_destino,
          conceptos: requiereFactura
            ? form.conceptos.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        },
        proveedor_envio: {
          supplier_id: supplierId || null,
          nombre_beneficiario: supplierForm.nombre_beneficiario,
          nombre_chino: supplierForm.nombre_chino,
          direccion_beneficiario: supplierForm.direccion_beneficiario,
          numero_cuenta: supplierForm.numero_cuenta,
          iban: supplierForm.iban,
          banco_nombre: supplierForm.banco_nombre,
          banco_direccion: supplierForm.banco_direccion,
          swift_bic: supplierForm.swift_bic,
          aba_routing: supplierForm.aba_routing,
          banco_intermediario_nombre: supplierForm.banco_intermediario_nombre,
          banco_intermediario_swift: supplierForm.banco_intermediario_swift,
          motivo: supplierForm.motivo_default,
          foto_url: supplierForm.foto_url,
        },
      };
      if (requiereFactura) {
        payload.cliente_final = {
          rfc: form.rfc.trim().toUpperCase(),
          razon_social: form.razon_social.trim(),
          regimen_fiscal: form.regimen_fiscal,
          cp: form.cp.trim(),
          uso_cfdi: form.uso_cfdi,
          email: form.email.trim(),
        };
      }

      const res = await axios.post(`${API_URL}/api/entangled/payment-requests`, payload, {
        headers: authHeader,
      });
      setDialogOpen(false);
      setForm({
        rfc: '',
        razon_social: '',
        regimen_fiscal: '601',
        cp: '',
        uso_cfdi: 'G03',
        email: '',
        monto: '',
        divisa_destino: 'USD',
        conceptos: '',
        comprobante_cliente_url: '',
      });
      setSupplierForm(EMPTY_SUPPLIER);
      setSelectedSupplierId('new');
      setSaveSupplierForLater(true);
      // Mostrar instrucciones de pago
      setLastCreated({
        request: res.data?.request,
        instrucciones_pago: res.data?.instrucciones_pago,
        quote: res.data?.quote,
      });
      setInstructionsOpen(true);
      setSnack({
        open: true,
        severity: 'success',
        message:
          res.data?.request?.estatus_global === 'error_envio'
            ? t('entangled.messages.successPending')
            : t('entangled.messages.success'),
      });
      loadRequests();
      loadSuppliers();
      loadFiscalProfile();
    } catch (err: unknown) {
      setSnack({
        open: true,
        severity: 'error',
        message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('entangled.messages.error'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {!hideHeader && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ color: ORANGE }}>
              {t('entangled.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('entangled.subtitle')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="↻">
              <IconButton onClick={loadRequests} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              startIcon={<ContactsIcon />}
              onClick={() => setSuppliersDialogOpen(true)}
              sx={{ borderColor: ORANGE, color: ORANGE }}
            >
              {t('entangled.suppliers.manage', 'Mis proveedores')}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
              sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#D94A1F' } }}
            >
              {t('entangled.newRequest')}
            </Button>
          </Stack>
        </Stack>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {t('entangled.howItWorks')}
        </Typography>
        <Typography variant="body2">{t('entangled.howItWorksDesc')}</Typography>
      </Alert>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>{t('entangled.fields.razonSocial')}</TableCell>
                <TableCell align="right">{t('entangled.fields.amount')}</TableCell>
                <TableCell>{t('entangled.fields.currency')}</TableCell>
                <TableCell>{t('entangled.status.global')}</TableCell>
                <TableCell>{t('entangled.status.factura')}</TableCell>
                <TableCell>{t('entangled.status.proveedor')}</TableCell>
                <TableCell align="center">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body2" color="text.secondary">
                      {t('entangled.messages.empty')}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.id}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {r.cf_razon_social}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.cf_rfc}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">${formatMoney(r.op_monto)}</TableCell>
                    <TableCell>{r.op_divisa_destino}</TableCell>
                    <TableCell>
                      <Chip
                        label={t(`entangled.status.${r.estatus_global}`, r.estatus_global)}
                        color={statusColor(r.estatus_global)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t(`entangled.status.${r.estatus_factura}`, r.estatus_factura)}
                        color={statusColor(r.estatus_factura)}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t(`entangled.status.${r.estatus_proveedor}`, r.estatus_proveedor)}
                        color={statusColor(r.estatus_proveedor)}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        {r.factura_url && (
                          <Tooltip title={t('entangled.actions.viewInvoice') as string}>
                            <IconButton
                              size="small"
                              component="a"
                              href={r.factura_url}
                              target="_blank"
                              rel="noopener"
                            >
                              <DescriptionIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {r.comprobante_proveedor_url && (
                          <Tooltip title={t('entangled.actions.viewProof') as string}>
                            <IconButton
                              size="small"
                              color="success"
                              component="a"
                              href={r.comprobante_proveedor_url}
                              target="_blank"
                              rel="noopener"
                            >
                              <ReceiptLongIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!r.op_comprobante_cliente_url && (
                          <Tooltip title={t('entangled.actions.uploadMyProof', 'Subir mi comprobante') as string}>
                            <IconButton
                              size="small"
                              component="label"
                              disabled={uploading}
                              sx={{ color: ORANGE }}
                            >
                              <ReceiptLongIcon fontSize="small" />
                              <input
                                hidden
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadProofToRequest(r.id, f);
                                  e.target.value = '';
                                }}
                              />
                            </IconButton>
                          </Tooltip>
                        )}
                        {r.op_comprobante_cliente_url && (
                          <Tooltip title={t('entangled.actions.viewMyProof') as string}>
                            <IconButton
                              size="small"
                              component="a"
                              href={r.op_comprobante_cliente_url}
                              target="_blank"
                              rel="noopener"
                              sx={{ color: '#2e7d32' }}
                            >
                              <DescriptionIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {formatDate(r.created_at)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dialog: nueva solicitud — formulario completo en una sola pantalla */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white' }}>
          {t('entangled.newRequest')}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {/* === ¿Requiere factura? === */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              🧾 {t('entangled.wizard.invoiceQuestion', '¿Necesitas factura para este pago?')}
            </Typography>
            <FormControl>
              <RadioGroup
                row
                value={requiereFactura ? 'yes' : 'no'}
                onChange={(e) => setRequiereFactura(e.target.value === 'yes')}
              >
                <FormControlLabel
                  value="yes"
                  control={<Radio sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }} />}
                  label={t('entangled.wizard.invoiceYes', 'Sí, quiero factura (CFDI)')}
                />
                <FormControlLabel
                  value="no"
                  control={<Radio sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }} />}
                  label={t('entangled.wizard.invoiceNo', 'No, sin factura')}
                />
              </RadioGroup>
            </FormControl>
          </Paper>

          {/* === Datos fiscales (solo si requiere factura) === */}
          {requiereFactura && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
                📋 {t('entangled.sections.fiscal')}
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth label={t('entangled.fields.rfc')} value={form.rfc}
                    onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
                    inputProps={{ maxLength: 13 }} required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField
                    fullWidth label={t('entangled.fields.razonSocial')} value={form.razon_social}
                    onChange={(e) => setForm({ ...form, razon_social: e.target.value })} required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    select fullWidth label={t('entangled.fields.regimenFiscal')}
                    value={form.regimen_fiscal}
                    onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })} required
                  >
                    {REGIMENES_FISCALES.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    fullWidth label={t('entangled.fields.cp')} value={form.cp}
                    onChange={(e) => setForm({ ...form, cp: e.target.value.replace(/\D/g, '') })}
                    inputProps={{ maxLength: 5 }} required
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    select fullWidth label={t('entangled.fields.usoCfdi')}
                    value={form.uso_cfdi}
                    onChange={(e) => setForm({ ...form, uso_cfdi: e.target.value })} required
                  >
                    {USOS_CFDI.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth type="email" label={t('entangled.fields.email')} value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} required
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth label={t('entangled.fields.concepts')} value={form.conceptos}
                    onChange={(e) => setForm({ ...form, conceptos: e.target.value })}
                    placeholder="84111506, 90121800"
                    helperText={t('entangled.fields.conceptsHelp', 'Códigos SAT separados por coma (opcional)')}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={saveFiscalProfile}
                        onChange={(e) => setSaveFiscalProfile(e.target.checked)}
                        sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                      />
                    }
                    label={t('entangled.wizard.saveFiscal', 'Guardar estos datos para próximas solicitudes')}
                  />
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* === Proveedor de envío === */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
              🏦 {t('entangled.suppliers.section', 'Proveedor de envío (beneficiario)')}
            </Typography>
            <TextField
              select fullWidth
              label={t('entangled.suppliers.pick', 'Selecciona proveedor')}
              value={String(selectedSupplierId)}
              onChange={(e) => handlePickSupplier(e.target.value)}
              sx={{ mb: 2 }}
            >
              <MenuItem value="new">+ {t('entangled.suppliers.new', 'Nuevo proveedor (capturar datos)')}</MenuItem>
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.is_favorite ? '★ ' : ''}{s.alias || s.nombre_beneficiario}
                  {s.banco_nombre ? ` — ${s.banco_nombre}` : ''}
                  {s.numero_cuenta ? ` (…${s.numero_cuenta.slice(-4)})` : ''}
                </MenuItem>
              ))}
            </TextField>
            <EntangledSupplierForm
              value={supplierForm}
              onChange={setSupplierForm}
              onUploadPhoto={handleUploadSupplierPhoto}
              uploading={uploadingSupplier}
            />
            {selectedSupplierId === 'new' && (
              <FormControlLabel
                sx={{ mt: 1 }}
                control={
                  <Checkbox
                    checked={saveSupplierForLater}
                    onChange={(e) => setSaveSupplierForLater(e.target.checked)}
                    sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                  />
                }
                label={t('entangled.suppliers.saveForLater', 'Guardar este proveedor para próximas solicitudes')}
              />
            )}
          </Paper>

          {/* === Monto y cotización === */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
              💵 {t('entangled.sections.operation')}
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  select fullWidth label="Proveedor ENTANGLED"
                  value={selectedProviderId === '' ? '' : String(selectedProviderId)}
                  onChange={(e) => setSelectedProviderId(e.target.value ? Number(e.target.value) : '')}
                  required
                  helperText={
                    providers.length === 0
                      ? 'No hay proveedores activos configurados'
                      : 'Cada proveedor tiene su propio TC y % de compra'
                  }
                >
                  {providers.map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>
                      {p.name}{p.is_default ? ' · default' : ''} — TC USD ${Number(p.tipo_cambio_usd).toFixed(2)} / TC RMB ${Number(p.tipo_cambio_rmb).toFixed(2)} / {Number(p.porcentaje_compra).toFixed(2)}%
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth type="number" label={t('entangled.fields.amount')}
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  inputProps={{ min: 0, step: '0.01' }} required
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  select fullWidth label={t('entangled.fields.currency')}
                  value={form.divisa_destino}
                  onChange={(e) => setForm({ ...form, divisa_destino: e.target.value })}
                >
                  {DIVISAS.map((d) => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            {quote && (
              <Card sx={{ mt: 2, bgcolor: '#FFF4ED', border: `1px solid ${ORANGE}` }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: ORANGE, mb: 1 }}>
                    {t('entangled.wizard.quote', 'Cotización')}
                  </Typography>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      {t('entangled.wizard.amountSent', 'Monto a enviar al proveedor')}:&nbsp;
                      <strong>{formatMoney(form.monto)} {form.divisa_destino}</strong>
                    </Typography>
                    <Typography variant="body2">
                      {t('entangled.wizard.fxRate', 'Tipo de cambio')}:&nbsp;
                      <strong>${quote.tipo_cambio.toFixed(4)} MXN / {form.divisa_destino}</strong>
                    </Typography>
                    <Typography variant="body2">
                      {t('entangled.wizard.subtotal', 'Subtotal MXN')}:&nbsp;
                      <strong>${formatMoney(quote.monto_mxn_base)}</strong>
                    </Typography>
                    <Typography variant="body2">
                      {t('entangled.wizard.purchaseFee', 'Comisión de compra')} ({quote.porcentaje_compra}%):&nbsp;
                      <strong>${formatMoney(quote.monto_mxn_total - quote.monto_mxn_base)}</strong>
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="h6" sx={{ color: ORANGE }}>
                      {t('entangled.wizard.totalToPay', 'Total a pagar a XOX')}: ${formatMoney(quote.monto_mxn_total)} MXN
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            )}

            <Alert severity="info" sx={{ mt: 2 }}>
              {t('entangled.wizard.proofLater', 'El comprobante de tu transferencia a XOX se sube después, una vez recibas las instrucciones de pago.')}
            </Alert>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !quote}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#D94A1F' } }}
          >
            {submitting ? t('entangled.actions.sending') : t('entangled.actions.submit')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: instrucciones de pago tras crear */}
      <Dialog open={instructionsOpen} onClose={() => setInstructionsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: '#fff' }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleIcon />
            <span>{t('entangled.wizard.instructionsTitle', 'Solicitud creada — Instrucciones de pago')}</span>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {lastCreated?.quote && (
            <Card sx={{ mb: 2, bgcolor: '#FFF4ED' }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: ORANGE, fontWeight: 700 }}>
                  {t('entangled.wizard.totalToPay', 'Total a pagar a XOX')}
                </Typography>
                <Typography variant="h5">
                  ${formatMoney(lastCreated.quote.monto_mxn_total)} MXN
                </Typography>
              </CardContent>
            </Card>
          )}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            {t('entangled.wizard.instructionsHelp', 'Realiza la transferencia con los siguientes datos y luego sube el comprobante en "Mis solicitudes":')}
          </Typography>
          {lastCreated?.instrucciones_pago ? (
            <Box
              component="pre"
              sx={{
                bgcolor: '#f7f7f7',
                p: 2,
                borderRadius: 1,
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 360,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(lastCreated.instrucciones_pago, null, 2)}
            </Box>
          ) : (
            <Alert severity="info">
              {t('entangled.wizard.noInstructions', 'Aún no recibimos las instrucciones del motor. Te las haremos llegar pronto.')}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInstructionsOpen(false)} variant="contained" sx={{ bgcolor: ORANGE }}>
            {t('common.close', 'Cerrar')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Mis Proveedores de envío */}
      <Dialog open={suppliersDialogOpen} onClose={() => setSuppliersDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: '#fff' }}>
          {t('entangled.suppliers.manage', 'Mis proveedores de envío')}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t(
              'entangled.suppliers.manageHelp',
              'Guarda los datos bancarios de tus beneficiarios frecuentes para reutilizarlos en futuras solicitudes.'
            )}
          </Typography>

          {suppliers.length > 0 && (
            <>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                {t('entangled.suppliers.savedList', 'Proveedores guardados')} ({suppliers.length})
              </Typography>
              <List dense sx={{ border: '1px solid #eee', borderRadius: 1, mb: 3 }}>
                {suppliers.map((s) => (
                  <ListItem
                    key={s.id}
                    divider
                    sx={{
                      bgcolor: editingSupplier?.id === s.id ? '#FFF4ED' : 'transparent',
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={() => handleToggleFavorite(s)}
                      sx={{ mr: 1, color: s.is_favorite ? '#F5A623' : '#bbb' }}
                    >
                      {s.is_favorite ? <StarIcon /> : <StarBorderIcon />}
                    </IconButton>
                    <ListItemText
                      primary={
                        <Typography fontWeight={600}>
                          {s.alias || s.nombre_beneficiario}
                          {s.divisa_default && (
                            <Chip
                              size="small"
                              label={s.divisa_default}
                              sx={{ ml: 1, bgcolor: '#FFE5D6', color: ORANGE }}
                            />
                          )}
                        </Typography>
                      }
                      secondary={
                        <>
                          {s.nombre_beneficiario}
                          {s.banco_nombre ? ` · ${s.banco_nombre}` : ''}
                          {s.swift_bic ? ` · SWIFT ${s.swift_bic}` : ''}
                          {s.numero_cuenta ? ` · …${s.numero_cuenta.slice(-4)}` : ''}
                        </>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Button size="small" onClick={() => openEditSupplier(s)}>
                        {t('common.edit', 'Editar')}
                      </Button>
                      <IconButton size="small" onClick={() => handleDeleteSupplier(s.id)} color="error">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </>
          )}

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            {editingSupplier
              ? t('entangled.suppliers.editing', 'Editando proveedor')
              : t('entangled.suppliers.newOne', 'Nuevo proveedor')}
          </Typography>
          <EntangledSupplierForm
            value={supplierForm}
            onChange={setSupplierForm}
            onUploadPhoto={handleUploadSupplierPhoto}
            uploading={uploadingSupplier}
          />
        </DialogContent>
        <DialogActions>
          {editingSupplier && (
            <Button
              onClick={() => {
                setEditingSupplier(null);
                setSupplierForm(EMPTY_SUPPLIER);
              }}
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
          )}
          <Button onClick={() => setSuppliersDialogOpen(false)}>{t('common.close', 'Cerrar')}</Button>
          <Button
            variant="contained"
            onClick={handleSaveStandaloneSupplier}
            disabled={savingSupplier}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#D94A1F' } }}
          >
            {savingSupplier
              ? t('common.saving', 'Guardando...')
              : editingSupplier
              ? t('common.update', 'Actualizar')
              : t('common.save', 'Guardar')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={4500}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
