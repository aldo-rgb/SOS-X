/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
// ============================================
// EMPLOYEE PROFILE PAGE
// Expediente Digital · Nómina y Seguro · Préstamos · Asistencias
// Línea corporativa EntregaX (light enterprise)
// ============================================

import { useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Tabs, Tab, Button, IconButton, Avatar, Chip, Stack,
  Grid, TextField, MenuItem, Divider, Alert, CircularProgress, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar,
  Card, CardContent, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DescriptionIcon from '@mui/icons-material/Description';
import SaveIcon from '@mui/icons-material/Save';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import PaymentsIcon from '@mui/icons-material/Payments';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import api from '../services/api';

// Corporate light palette (consistente con BranchManagementPage)
const C = {
  bg:        '#ffffff',
  surface:   '#ffffff',
  surfaceAlt:'#f7f7f9',
  border:    '#e5e7eb',
  text:      '#0f172a',
  textMuted: '#64748b',
  orange:    '#F05A28',
  orangeDark:'#C1272D',
  success:   '#16a34a',
  warning:   '#d97706',
  danger:    '#dc2626',
};

const DOC_GROUPS: { key: string; label: string; icon?: string; optional?: boolean; imssOnly?: boolean; advisorRequired?: boolean }[] = [
  { key: 'ine_front', label: 'INE — Anverso', advisorRequired: true },
  { key: 'ine_back', label: 'INE — Reverso', advisorRequired: true },
  { key: 'firma_digital', label: 'Firma Digital', advisorRequired: true },
  { key: 'contract', label: 'Contrato Laboral', advisorRequired: true },
  { key: 'comprobante_domicilio', label: 'Comprobante de Domicilio' },
  { key: 'rfc', label: 'RFC / Constancia Fiscal', optional: true, advisorRequired: true },
  { key: 'curp', label: 'CURP', optional: true },
  { key: 'nss_constancia', label: 'Constancia NSS', imssOnly: true },
  { key: 'aviso_alta_imss', label: 'Aviso Alta IMSS', imssOnly: true },
  { key: 'pagare', label: 'Pagaré Interno (auto)', optional: true },
  { key: 'otro', label: 'Otro Documento', optional: true },
];

// Traducción de roles internos a etiquetas en español
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Administrador',
  admin: 'Administrador',
  accountant: 'Contador',
  hr: 'Recursos Humanos',
  manager: 'Gerente',
  supervisor: 'Supervisor',
  operator: 'Operador',
  driver: 'Chofer',
  warehouse: 'Almacenista',
  cashier: 'Cajero',
  sales: 'Ventas',
  customer_service: 'Atención a Clientes',
  customer: 'Cliente',
  employee: 'Empleado',
  advisor: 'Asesor Comercial',
  asesor: 'Asesor Comercial',
  asesor_lider: 'Asesor Líder',
  sub_advisor: 'Sub-Asesor',
};
const roleLabel = (r?: string | null) =>
  (r && ROLE_LABELS[r]) || (r ? r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—');

const fmtMXN = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n || 0));

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—';

const getInitials = (name: string) =>
  (name || '').split(' ').filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';

interface EmployeeProfilePageProps {
  employeeId: number;
  onBack: () => void;
}

export default function EmployeeProfilePage({ employeeId, onBack }: EmployeeProfilePageProps) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success'|'error'|'warning'|'info' }>({ open: false, msg: '', sev: 'success' });

  const showMsg = (msg: string, sev: 'success'|'error'|'warning'|'info' = 'success') =>
    setSnack({ open: true, msg, sev });

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/hr/employees/${employeeId}/full-profile`);
      setProfile(r.data);
    } catch (e: any) {
      showMsg(e?.response?.data?.error || 'Error cargando perfil', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [employeeId]);

  if (loading || !profile) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: C.orange }} />
      </Box>
    );
  }

  const { user, documents, payroll, loans, antiguedad, vacation_legal, alerts } = profile;

  // Agrupar docs por tipo
  const docsByType: Record<string, any[]> = {};
  (documents || []).forEach((d: any) => {
    (docsByType[d.doc_type] = docsByType[d.doc_type] || []).push(d);
  });

  // 🔗 Fallback: si el asesor / empleado subió archivos durante su registro
  // (INE, firma, RFC, etc.) pero aún no se han migrado a employee_documents,
  // los exponemos como entradas virtuales (sólo lectura) usando users.*_url.
  const VIRTUAL_DOCS: { key: string; url: string | null; label: string }[] = [
    { key: 'ine_front',             url: user?.ine_front_url || null,             label: 'INE — Anverso' },
    { key: 'ine_back',              url: user?.ine_back_url || null,              label: 'INE — Reverso' },
    { key: 'firma_digital',         url: user?.privacy_signature_url || user?.signature_url || null, label: 'Firma Digital' },
    { key: 'rfc',                   url: user?.rfc_url || null,                   label: 'RFC / Constancia Fiscal' },
    { key: 'curp',                  url: user?.curp_url || null,                  label: 'CURP' },
    { key: 'comprobante_domicilio', url: user?.comprobante_domicilio_url || null, label: 'Comprobante de Domicilio' },
    { key: 'contract',              url: user?.contract_pdf_url || null,          label: 'Contrato Laboral' },
  ];
  VIRTUAL_DOCS.forEach((v) => {
    if (v.url && !(docsByType[v.key]?.length)) {
      const raw = String(v.url).trim();
      // Algunos campos guardan base64 puro (sin prefijo data:) o un data URI completo,
      // otros guardan una URL http(s) o una ruta /uploads. Normalizamos:
      const isHttp = /^https?:\/\//i.test(raw);
      const isDataUri = raw.startsWith('data:');
      const isPath = raw.startsWith('/');
      let mime = 'image/jpeg';
      let renderUrl = raw;
      if (isHttp || isPath) {
        const lower = raw.toLowerCase();
        const ext = (lower.split('?')[0].split('.').pop() || '').toLowerCase();
        if (ext === 'pdf') mime = 'application/pdf';
        else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      } else if (isDataUri) {
        const m = raw.match(/^data:([^;]+);/i);
        if (m) mime = m[1];
      } else {
        // base64 puro → envolver como data URI
        // Heurística: PDFs base64 inician con "JVBER"
        if (raw.startsWith('JVBER')) mime = 'application/pdf';
        renderUrl = `data:${mime};base64,${raw}`;
      }
      docsByType[v.key] = [{
        id: `virtual-${v.key}`,
        doc_type: v.key,
        filename: v.label,
        url: renderUrl,
        mime_type: mime,
        uploaded_at: user?.privacy_accepted_at || user?.hire_date || null,
        virtual: true,
      }];
    }
  });

  // Abre un documento en otra pestaña. Chrome bloquea la navegación top-level
  // a URLs data: — los documentos guardados como base64 se convierten a Blob.
  const openDocument = (url?: string | null) => {
    if (!url) return;
    if (/^data:/i.test(url)) {
      try {
        const comma = url.indexOf(',');
        const meta = url.slice(5, comma); // entre "data:" y ","
        const payload = url.slice(comma + 1);
        const mime = (meta.split(';')[0] || 'application/octet-stream').trim();
        const isB64 = /;base64/i.test(meta);
        const binary = isB64 ? atob(payload) : decodeURIComponent(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } catch {
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: C.bg, minHeight: '100vh' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <IconButton onClick={onBack} sx={{ border: `1px solid ${C.border}` }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700, color: C.text }}>
          Expediente del Empleado
        </Typography>
      </Stack>

      {/* Profile Card */}
      <Paper sx={{ p: 3, mb: 2, border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Avatar
            src={user.profile_photo_url || undefined}
            sx={{ width: 96, height: 96, bgcolor: C.orange, fontSize: 32, fontWeight: 700 }}
          >
            {getInitials(user.full_name)}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: C.text }}>{user.full_name}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, mb: 1, flexWrap: 'wrap' }}>
              <Chip label={roleLabel(user.role)} size="small" sx={{ bgcolor: '#fff7ed', color: C.orangeDark, fontWeight: 600 }} />
              {user.employee_number && (
                <Chip label={`No. ${user.employee_number}`} size="small" variant="outlined" />
              )}
              {user.is_advisor ? (
                <Chip
                  size="small"
                  label={user.has_privacy_signature ? 'Aviso firmado ✓' : 'Aviso sin firmar'}
                  sx={{
                    bgcolor: user.has_privacy_signature ? '#dcfce7' : '#fef3c7',
                    color: user.has_privacy_signature ? C.success : C.warning,
                    fontWeight: 600,
                  }}
                />
              ) : (
                <Chip
                  size="small"
                  label={
                    payroll?.imss_status === 'activo' ? 'IMSS: Activo' :
                    payroll?.imss_status === 'baja' ? 'IMSS: Baja' :
                    (payroll?.nss || payroll?.imss_alta_date) ? 'IMSS: Pendiente' :
                    'IMSS: No registrado'
                  }
                  sx={{
                    bgcolor: payroll?.imss_status === 'activo' ? '#dcfce7' : '#fef3c7',
                    color: payroll?.imss_status === 'activo' ? C.success : C.warning,
                    fontWeight: 600,
                  }}
                />
              )}
              {user.is_blocked && <Chip label="DADO DE BAJA" size="small" color="error" />}
            </Stack>
            <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', color: C.textMuted, fontSize: 14 }}>
              <span>📧 {user.email}</span>
              <span>📞 {user.phone || '—'}</span>
              {antiguedad && (
                <span>📅 Antigüedad: <strong style={{ color: C.text }}>{antiguedad.years} años, {antiguedad.months} meses</strong></span>
              )}
            </Stack>
          </Box>
        </Stack>

        {alerts && alerts.length > 0 && (
          <Box sx={{ mt: 2 }}>
            {alerts.map((a: any, idx: number) => (
              <Alert key={idx} severity={a.severity} icon={<WarningAmberIcon />} sx={{ mb: 1 }}>
                <strong>{a.label}</strong> {a.days_remaining < 0
                  ? `venció hace ${Math.abs(a.days_remaining)} días`
                  : `vence en ${a.days_remaining} días`} ({fmtDate(a.expires_at)})
              </Alert>
            ))}
          </Box>
        )}
      </Paper>

      {/* Tabs */}
      <Paper sx={{ border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none', overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v)}
          sx={{
            bgcolor: C.surfaceAlt,
            borderBottom: `1px solid ${C.border}`,
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, color: C.textMuted },
            '& .Mui-selected': { color: C.orange + ' !important' },
            '& .MuiTabs-indicator': { backgroundColor: C.orange, height: 3 },
          }}
        >
          <Tab icon={<FolderSharedIcon />} iconPosition="start" label="Expediente Digital" />
          <Tab icon={<PaymentsIcon />} iconPosition="start" label="Nómina y Seguro" />
          <Tab icon={<ReceiptLongIcon />} iconPosition="start" label="Préstamos" />
          <Tab icon={<AccessTimeIcon />} iconPosition="start" label="Asistencias" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tab === 0 && <ExpedienteTab profile={profile} docsByType={docsByType} onChange={load} onMsg={showMsg} />}
          {tab === 1 && <NominaTab profile={profile} onChange={load} onMsg={showMsg} vacationLegal={vacation_legal} />}
          {tab === 2 && <PrestamosTab loans={loans || []} userId={employeeId} payroll={payroll} onChange={load} onMsg={showMsg} />}
          {tab === 3 && <AsistenciasTab user={user} />}
        </Box>
      </Paper>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snack.sev} variant="filled" sx={{ borderRadius: 2 }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ============================================
// TAB 1: EXPEDIENTE DIGITAL
// ============================================
function ExpedienteTab({ profile, docsByType, onChange, onMsg }: any) {
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [generatingContract, setGeneratingContract] = useState(false);

  const handleGenerateAdvisorContract = async () => {
    if (!profile?.user?.has_privacy_signature) {
      onMsg('El asesor aún no ha firmado el aviso de privacidad desde la app móvil.', 'warning');
      return;
    }
    setGeneratingContract(true);
    try {
      await api.post(`/admin/hr/employees/${profile.user.id}/generate-advisor-contract`);
      onMsg('Contrato generado con la firma digital del asesor', 'success');
      onChange();
    } catch (e: any) {
      onMsg(e?.response?.data?.error || 'Error generando contrato', 'error');
    } finally {
      setGeneratingContract(false);
    }
  };

  const handleUpload = async (docType: string, file: File) => {
    setUploadingType(docType);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      await api.post(`/admin/hr/employees/${profile.user.id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onMsg('Documento subido correctamente', 'success');
      onChange();
    } catch (e: any) {
      onMsg(e?.response?.data?.error || 'Error al subir', 'error');
    } finally {
      setUploadingType(null);
    }
  };

  const handleDelete = async (docId: number) => {
    if (!window.confirm('¿Eliminar este documento del expediente?')) return;
    try {
      await api.delete(`/admin/hr/documents/${docId}`);
      onMsg('Documento eliminado', 'success');
      onChange();
    } catch (e: any) {
      onMsg(e?.response?.data?.error || 'Error al eliminar', 'error');
    }
  };

  return (
    <Grid container spacing={2}>
      {(() => {
        const isAdvisor = !!profile?.user?.is_advisor;
        const p = profile?.payroll || {};
        const hasImss = !!(
          (p.nss && String(p.nss).trim()) ||
          p.imss_alta_date ||
          (p.imss_status && p.imss_status !== 'pendiente' && p.imss_status !== '')
        );
        // Para asesores: SOLO INE (ambos lados), Contrato laboral y RFC. Todos obligatorios.
        // Para empleados: filtra los docs IMSS si no está dado de alta.
        const visibleGroups = isAdvisor
          ? DOC_GROUPS.filter(g => g.advisorRequired)
          : DOC_GROUPS.filter(g => !g.imssOnly || hasImss);
        return visibleGroups.map(g => {
        const docs = docsByType[g.key] || [];
        const latest = docs[0];
        const isImage = latest?.mime_type?.startsWith('image/');
        return (
          <Grid size={{xs:12,sm:6,md:4}} key={g.key}>
            <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none', height: '100%' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                  <DescriptionIcon sx={{ color: C.orange, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{g.label}</Typography>
                  {isAdvisor && g.advisorRequired && (
                    <Chip
                      label="Obligatorio"
                      size="small"
                      sx={{ height: 18, fontSize: 10, bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}
                    />
                  )}
                  {!isAdvisor && g.optional && (
                    <Chip
                      label="No obligatorio"
                      size="small"
                      sx={{ height: 18, fontSize: 10, bgcolor: '#f1f5f9', color: C.textMuted, fontWeight: 600 }}
                    />
                  )}
                  {!isAdvisor && g.imssOnly && (
                    <Chip
                      label="IMSS"
                      size="small"
                      sx={{ height: 18, fontSize: 10, bgcolor: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}
                    />
                  )}
                </Stack>

                {latest ? (
                  <>
                    {isImage ? (
                      <Box
                        component="img"
                        src={latest.url}
                        alt={g.label}
                        sx={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 1, mb: 1, border: `1px solid ${C.border}` }}
                      />
                    ) : (
                      <Box sx={{
                        height: 140, mb: 1, border: `1px dashed ${C.border}`, borderRadius: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: C.surfaceAlt, flexDirection: 'column',
                      }}>
                        <DescriptionIcon sx={{ fontSize: 48, color: C.textMuted }} />
                        <Typography variant="caption" sx={{ color: C.textMuted, mt: 0.5 }}>
                          {(latest.mime_type || 'archivo').split('/')[1]?.toUpperCase()}
                        </Typography>
                      </Box>
                    )}
                    <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', mb: 1 }}>
                      Subido: {fmtDate(latest.uploaded_at)}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        startIcon={<OpenInNewIcon />}
                        onClick={() => openDocument(latest.url)}
                        sx={{ color: C.orange }}
                      >
                        Ver
                      </Button>
                      {!latest.virtual && (
                        <IconButton size="small" color="error" onClick={() => handleDelete(latest.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </>
                ) : (
                  <Box sx={{
                    height: 140, mb: 1, border: `1px dashed ${C.border}`, borderRadius: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: C.surfaceAlt,
                  }}>
                    <Typography variant="caption" sx={{ color: C.textMuted }}>Sin archivo</Typography>
                  </Box>
                )}

                <Button
                  fullWidth
                  variant="outlined"
                  size="small"
                  component="label"
                  startIcon={uploadingType === g.key ? <CircularProgress size={14} /> : <CloudUploadIcon />}
                  disabled={uploadingType === g.key}
                  sx={{ mt: 1, borderColor: C.border, color: C.text, '&:hover': { borderColor: C.orange, bgcolor: '#fff7ed' } }}
                >
                  {latest ? 'Reemplazar' : 'Subir archivo'}
                  <input
                    type="file"
                    hidden
                    accept="image/*,application/pdf"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(g.key, f);
                      e.target.value = '';
                    }}
                  />
                </Button>
                {isAdvisor && g.key === 'contract' && (
                  <Button
                    fullWidth
                    variant="contained"
                    size="small"
                    onClick={handleGenerateAdvisorContract}
                    disabled={generatingContract || !profile?.user?.has_privacy_signature}
                    startIcon={generatingContract ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <DescriptionIcon />}
                    sx={{ mt: 1, bgcolor: C.orange, '&:hover': { bgcolor: C.orangeDark } }}
                  >
                    {latest ? 'Regenerar con firma digital' : 'Generar contrato firmado'}
                  </Button>
                )}
                {isAdvisor && g.key === 'contract' && !profile?.user?.has_privacy_signature && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: C.warning, fontSize: 11 }}>
                    ⚠️ El asesor aún no ha firmado el aviso de privacidad desde la app móvil
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        );
      });
      })()}
    </Grid>
  );
}

// ============================================
// TAB 2: NÓMINA Y SEGURO
// ============================================
function NominaTab({ profile, onChange, onMsg, vacationLegal }: any) {
  const p = profile.payroll || {};
  const initialImssRegistered = !!(
    p.nss || p.imss_alta_date ||
    (p.imss_status && p.imss_status !== 'pendiente' && p.imss_status !== '')
  );
  const [form, setForm] = useState({
    salario_bruto: p.salario_bruto || '',
    salario_neto: p.salario_neto || '',
    sdi: p.sdi || '',
    imss_registered: initialImssRegistered,
    nss: p.nss || '',
    imss_status: p.imss_status || 'pendiente',
    imss_alta_date: p.imss_alta_date ? String(p.imss_alta_date).slice(0, 10) : '',
    imss_baja_date: p.imss_baja_date ? String(p.imss_baja_date).slice(0, 10) : '',
    vacation_days_available: p.vacation_days_available ?? vacationLegal ?? 12,
    vacation_days_taken: p.vacation_days_taken || 0,
    contract_type: p.contract_type || 'indeterminado',
    contract_end_date: p.contract_end_date ? String(p.contract_end_date).slice(0, 10) : '',
    payment_period: p.payment_period || 'quincenal',
    bank_name: p.bank_name || '',
    bank_clabe: p.bank_clabe || '',
    bank_account: p.bank_account || '',
    notes: p.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const update = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      // Si el empleado NO está dado de alta en IMSS, limpiamos los campos relacionados.
      const payload: any = { ...form };
      if (!form.imss_registered) {
        payload.nss = '';
        payload.imss_status = 'pendiente';
        payload.imss_alta_date = '';
        payload.imss_baja_date = '';
      }
      delete payload.imss_registered; // no lo persistimos como columna
      await api.put(`/admin/hr/employees/${profile.user.id}/payroll`, payload);
      onMsg('Información de nómina guardada', 'success');
      onChange();
    } catch (e: any) {
      onMsg(e?.response?.data?.error || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        <strong>Vacaciones por Ley (Art. 76 LFT — Vacaciones Dignas 2023):</strong>{' '}
        Le corresponden <strong>{vacationLegal} días</strong> según su antigüedad.
      </Alert>

      <Box>
        <Typography sx={{ fontWeight: 700, color: C.text, mb: 1.5 }}>💰 Salario y Pagos</Typography>
        <Grid container spacing={2}>
          <Grid size={{xs:12,sm:6,md:3}} >
            <TextField fullWidth label="Salario Bruto (por periodo)" type="number" size="small"
              value={form.salario_bruto} onChange={e => update('salario_bruto', e.target.value)} />
          </Grid>
          <Grid size={{xs:12,sm:6,md:3}} >
            <TextField fullWidth label="Salario Neto" type="number" size="small"
              value={form.salario_neto} onChange={e => update('salario_neto', e.target.value)} />
          </Grid>
          <Grid size={{xs:12,sm:6,md:3}} >
            <TextField fullWidth label="SDI (Salario Diario Integrado)" type="number" size="small"
              value={form.sdi} onChange={e => update('sdi', e.target.value)} />
          </Grid>
          <Grid size={{xs:12,sm:6,md:3}} >
            <TextField select fullWidth label="Periodo de pago" size="small"
              value={form.payment_period} onChange={e => update('payment_period', e.target.value)}>
              <MenuItem value="semanal">Semanal</MenuItem>
              <MenuItem value="quincenal">Quincenal</MenuItem>
              <MenuItem value="mensual">Mensual</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Box>

      <Divider />

      <Box>
        <Typography sx={{ fontWeight: 700, color: C.text, mb: 1.5 }}>🏥 IMSS / Seguridad Social</Typography>
        <Grid container spacing={2}>
          <Grid size={{xs:12,sm:6,md:4}} >
            <TextField
              select fullWidth size="small"
              label="¿Dado de alta en IMSS?"
              value={form.imss_registered ? 'si' : 'no'}
              onChange={e => update('imss_registered', e.target.value === 'si')}
              helperText={form.imss_registered ? 'Captura los datos de la afiliación' : 'No registrado ante el IMSS'}
            >
              <MenuItem value="no">No</MenuItem>
              <MenuItem value="si">Sí</MenuItem>
            </TextField>
          </Grid>
          {form.imss_registered && (
            <>
              <Grid size={{xs:12,sm:6,md:4}} >
                <TextField fullWidth label="NSS (Número de Seguridad Social)" size="small"
                  value={form.nss} onChange={e => update('nss', e.target.value)} />
              </Grid>
              <Grid size={{xs:12,sm:6,md:4}} >
                <TextField select fullWidth label="Estatus IMSS" size="small"
                  value={form.imss_status} onChange={e => update('imss_status', e.target.value)}>
                  <MenuItem value="pendiente">Pendiente</MenuItem>
                  <MenuItem value="activo">Activo (Alta)</MenuItem>
                  <MenuItem value="baja">Baja</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{xs:12,sm:6,md:6}} >
                <TextField fullWidth type="date" label="Fecha de Alta IMSS" size="small"
                  InputLabelProps={{ shrink: true }}
                  value={form.imss_alta_date} onChange={e => update('imss_alta_date', e.target.value)} />
              </Grid>
              <Grid size={{xs:12,sm:6,md:6}} >
                <TextField fullWidth type="date" label="Fecha de Baja IMSS" size="small"
                  InputLabelProps={{ shrink: true }}
                  value={form.imss_baja_date} onChange={e => update('imss_baja_date', e.target.value)} />
              </Grid>
            </>
          )}
        </Grid>
      </Box>

      <Divider />

      <Box>
        <Typography sx={{ fontWeight: 700, color: C.text, mb: 1.5 }}>📄 Contrato y Vacaciones</Typography>
        <Grid container spacing={2}>
          <Grid size={{xs:12,sm:6,md:3}} >
            <TextField select fullWidth label="Tipo de Contrato" size="small"
              value={form.contract_type} onChange={e => update('contract_type', e.target.value)}>
              <MenuItem value="indeterminado">Tiempo Indeterminado</MenuItem>
              <MenuItem value="determinado">Tiempo Determinado</MenuItem>
              <MenuItem value="prueba">Periodo de Prueba</MenuItem>
              <MenuItem value="capacitacion">Capacitación Inicial</MenuItem>
              <MenuItem value="obra">Obra Determinada</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{xs:12,sm:6,md:3}} >
            <TextField fullWidth type="date" label="Fin de Contrato (si aplica)" size="small"
              InputLabelProps={{ shrink: true }}
              value={form.contract_end_date} onChange={e => update('contract_end_date', e.target.value)} />
          </Grid>
          <Grid size={{xs:6,sm:3,md:3}} >
            <TextField fullWidth type="number" label="Vacaciones Disponibles (días)" size="small"
              value={form.vacation_days_available} onChange={e => update('vacation_days_available', e.target.value)} />
          </Grid>
          <Grid size={{xs:6,sm:3,md:3}} >
            <TextField fullWidth type="number" label="Vacaciones Tomadas" size="small"
              value={form.vacation_days_taken} onChange={e => update('vacation_days_taken', e.target.value)} />
          </Grid>
        </Grid>
      </Box>

      <Divider />

      <Box>
        <Typography sx={{ fontWeight: 700, color: C.text, mb: 1.5 }}>🏦 Cuenta Bancaria (depósito de nómina)</Typography>
        <Grid container spacing={2}>
          <Grid size={{xs:12,sm:4}} >
            <TextField fullWidth label="Banco" size="small"
              value={form.bank_name} onChange={e => update('bank_name', e.target.value)} />
          </Grid>
          <Grid size={{xs:12,sm:4}} >
            <TextField fullWidth label="CLABE Interbancaria" size="small" inputProps={{ maxLength: 18 }}
              value={form.bank_clabe} onChange={e => update('bank_clabe', e.target.value)} />
          </Grid>
          <Grid size={{xs:12,sm:4}} >
            <TextField fullWidth label="No. de Cuenta" size="small"
              value={form.bank_account} onChange={e => update('bank_account', e.target.value)} />
          </Grid>
          <Grid size={{xs:12}} >
            <TextField fullWidth multiline minRows={2} label="Notas" size="small"
              value={form.notes} onChange={e => update('notes', e.target.value)} />
          </Grid>
        </Grid>
      </Box>

      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <SaveIcon />}
          disabled={saving}
          onClick={save}
          sx={{ bgcolor: C.orange, '&:hover': { bgcolor: C.orangeDark }, textTransform: 'none', fontWeight: 600 }}
        >
          Guardar Nómina
        </Button>
      </Stack>
    </Stack>
  );
}

// ============================================
// TAB 3: PRÉSTAMOS
// ============================================
function PrestamosTab({ loans, userId, payroll, onChange, onMsg }: any) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ monto_total: '', parcialidades: '6', motivo: '', periodo: 'quincenal', fecha_inicio_descuentos: '' });
  const [lftWarning, setLftWarning] = useState<any>(null);

  const [payDialog, setPayDialog] = useState<{ open: boolean; loan: any | null }>({ open: false, loan: null });
  const [payForm, setPayForm] = useState({ monto: '', notes: '' });

  const totales = useMemo(() => {
    let total = 0, pagado = 0, remanente = 0;
    (loans || []).forEach((l: any) => {
      if (l.status === 'active') {
        total += Number(l.monto_total);
        pagado += Number(l.pagado || 0);
        remanente += Number(l.remanente || 0);
      }
    });
    return { total, pagado, remanente };
  }, [loans]);

  const submitLoan = async (force = false) => {
    if (!form.monto_total || !form.parcialidades) {
      onMsg('Monto y parcialidades son obligatorios', 'warning'); return;
    }
    setCreating(true);
    setLftWarning(null);
    try {
      await api.post(`/admin/hr/employees/${userId}/loans`, {
        monto_total: Number(form.monto_total),
        parcialidades: Number(form.parcialidades),
        motivo: form.motivo,
        periodo: form.periodo,
        fecha_inicio_descuentos: form.fecha_inicio_descuentos || null,
        override_lft: force,
      });
      onMsg('Préstamo registrado y pagaré disponible', 'success');
      setOpen(false);
      setForm({ monto_total: '', parcialidades: '6', motivo: '', periodo: 'quincenal', fecha_inicio_descuentos: '' });
      onChange();
    } catch (e: any) {
      const data = e?.response?.data;
      if (e?.response?.status === 422 && data?.details) {
        setLftWarning(data);
      } else {
        onMsg(data?.error || 'Error al crear préstamo', 'error');
      }
    } finally {
      setCreating(false);
    }
  };

  const submitPayment = async () => {
    if (!payDialog.loan || !payForm.monto) return;
    try {
      await api.post(`/admin/hr/loans/${payDialog.loan.id}/payments`, {
        monto: Number(payForm.monto),
        notes: payForm.notes,
      });
      onMsg('Abono registrado', 'success');
      setPayDialog({ open: false, loan: null });
      setPayForm({ monto: '', notes: '' });
      onChange();
    } catch (e: any) {
      onMsg(e?.response?.data?.error || 'Error al registrar abono', 'error');
    }
  };

  const openPagare = (loanId: number) => {
    const token = localStorage.getItem('token');
    const base = (api.defaults.baseURL || '').replace(/\/$/, '');
    // Abrimos en nueva pestaña con token vía query param? El endpoint requiere Bearer.
    // Como workaround, hacemos fetch + blob URL.
    fetch(`${base}/admin/hr/loans/${loanId}/pagare`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.text()).then(html => {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }).catch(() => onMsg('Error generando pagaré', 'error'));
  };

  const cancelLoanReq = async (loanId: number) => {
    if (!window.confirm('¿Cancelar este préstamo? Esta acción detendrá los descuentos.')) return;
    try {
      await api.post(`/admin/hr/loans/${loanId}/cancel`, {});
      onMsg('Préstamo cancelado', 'success');
      onChange();
    } catch (e: any) {
      onMsg(e?.response?.data?.error || 'Error al cancelar', 'error');
    }
  };

  return (
    <Stack spacing={2}>
      {/* Resumen */}
      <Grid container spacing={2}>
        <Grid size={{xs:12,sm:4}} >
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none' }}>
            <CardContent>
              <Typography variant="caption" sx={{ color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Total Prestado (activo)</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: C.text, mt: 0.5 }}>{fmtMXN(totales.total)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{xs:12,sm:4}} >
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none' }}>
            <CardContent>
              <Typography variant="caption" sx={{ color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Pagado</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: C.success, mt: 0.5 }}>{fmtMXN(totales.pagado)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{xs:12,sm:4}} >
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none' }}>
            <CardContent>
              <Typography variant="caption" sx={{ color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Por Cobrar</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: C.orangeDark, mt: 0.5 }}>{fmtMXN(totales.remanente)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography sx={{ fontWeight: 700, color: C.text }}>Historial de Préstamos</Typography>
        <Button
          variant="contained"
          startIcon={<AddCircleIcon />}
          onClick={() => setOpen(true)}
          disabled={!payroll || !payroll.salario_bruto}
          sx={{ bgcolor: C.orange, '&:hover': { bgcolor: C.orangeDark }, textTransform: 'none', fontWeight: 600 }}
        >
          Nuevo Préstamo
        </Button>
      </Stack>

      {(!payroll || !payroll.salario_bruto) && (
        <Alert severity="warning">
          Configura el <strong>Salario Bruto</strong> del empleado en la pestaña <em>Nómina y Seguro</em> antes de poder otorgar préstamos.
        </Alert>
      )}

      {loans.length === 0 ? (
        <Alert severity="info">No hay préstamos registrados.</Alert>
      ) : (
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: C.surfaceAlt }}>
              <TableCell>Folio</TableCell>
              <TableCell>Fecha</TableCell>
              <TableCell>Monto</TableCell>
              <TableCell>Parcialidades</TableCell>
              <TableCell>Por parcialidad</TableCell>
              <TableCell>Progreso</TableCell>
              <TableCell>Estatus</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loans.map((l: any) => {
              const pct = Math.min(100, (Number(l.pagado) / Number(l.monto_total)) * 100);
              return (
                <TableRow key={l.id}>
                  <TableCell>PAG-{String(l.id).padStart(6, '0')}</TableCell>
                  <TableCell>{fmtDate(l.fecha_solicitud)}</TableCell>
                  <TableCell><strong>{fmtMXN(l.monto_total)}</strong></TableCell>
                  <TableCell>{l.parcialidades} ({l.periodo})</TableCell>
                  <TableCell>{fmtMXN(l.monto_por_parcialidad)}</TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 8, borderRadius: 4, bgcolor: '#e5e7eb',
                          '& .MuiLinearProgress-bar': { bgcolor: l.status === 'paid' ? C.success : C.orange },
                        }}
                      />
                      <Typography variant="caption" sx={{ color: C.textMuted }}>
                        {fmtMXN(l.pagado)} / {fmtMXN(l.monto_total)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={l.status === 'active' ? 'Activo' : l.status === 'paid' ? 'Pagado' : 'Cancelado'}
                      sx={{
                        bgcolor: l.status === 'paid' ? '#dcfce7' : l.status === 'active' ? '#fff7ed' : '#fee2e2',
                        color: l.status === 'paid' ? C.success : l.status === 'active' ? C.orangeDark : C.danger,
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Ver Pagaré">
                      <IconButton size="small" onClick={() => openPagare(l.id)}><DescriptionIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    {l.status === 'active' && (
                      <>
                        <Tooltip title="Registrar Abono">
                          <IconButton size="small" sx={{ color: C.success }} onClick={() => setPayDialog({ open: true, loan: l })}>
                            <PaymentsIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Cancelar">
                          <IconButton size="small" color="error" onClick={() => cancelLoanReq(l.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Diálogo crear préstamo */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Nuevo Préstamo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Monto total (MXN)" type="number" fullWidth size="small"
              value={form.monto_total} onChange={e => setForm({ ...form, monto_total: e.target.value })} />
            <TextField label="Parcialidades" type="number" fullWidth size="small"
              value={form.parcialidades} onChange={e => setForm({ ...form, parcialidades: e.target.value })} />
            <TextField select label="Periodo de descuento" fullWidth size="small"
              value={form.periodo} onChange={e => setForm({ ...form, periodo: e.target.value })}>
              <MenuItem value="semanal">Semanal</MenuItem>
              <MenuItem value="quincenal">Quincenal</MenuItem>
              <MenuItem value="mensual">Mensual</MenuItem>
            </TextField>
            <TextField type="date" label="Inicio de descuentos" fullWidth size="small" InputLabelProps={{ shrink: true }}
              value={form.fecha_inicio_descuentos} onChange={e => setForm({ ...form, fecha_inicio_descuentos: e.target.value })} />
            <TextField label="Motivo" fullWidth size="small" multiline minRows={2}
              value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} />

            {form.monto_total && form.parcialidades && (
              <Alert severity="info">
                Importe por parcialidad estimado: <strong>{fmtMXN(Number(form.monto_total) / Number(form.parcialidades || 1))}</strong>
              </Alert>
            )}

            {lftWarning && (
              <Alert severity="error" icon={<WarningAmberIcon />}>
                <Typography sx={{ fontWeight: 700 }}>Excede el límite legal LFT Art. 110</Typography>
                <Typography variant="body2">{lftWarning.error}</Typography>
                <Box sx={{ mt: 1, fontSize: 13 }}>
                  <div>Descuento solicitado: <strong>{fmtMXN(lftWarning.details.monto_por_parcialidad)}</strong></div>
                  <div>Máximo permitido (30%): <strong>{fmtMXN(lftWarning.details.max_descuento_permitido)}</strong></div>
                  <div>Parcialidades mínimas sugeridas: <strong>{lftWarning.details.suggestion_parcialidades_min}</strong></div>
                </Box>
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setOpen(false); setLftWarning(null); }}>Cancelar</Button>
          {lftWarning && (
            <Button color="warning" onClick={() => submitLoan(true)} disabled={creating}>
              Forzar (asumo responsabilidad)
            </Button>
          )}
          <Button
            variant="contained"
            disabled={creating}
            onClick={() => submitLoan(false)}
            sx={{ bgcolor: C.orange, '&:hover': { bgcolor: C.orangeDark } }}
          >
            {creating ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Crear y generar Pagaré'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo abono */}
      <Dialog open={payDialog.open} onClose={() => setPayDialog({ open: false, loan: null })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Registrar Abono</DialogTitle>
        <DialogContent>
          {payDialog.loan && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info">
                Remanente: <strong>{fmtMXN(payDialog.loan.remanente)}</strong> · Sugerido: {fmtMXN(payDialog.loan.monto_por_parcialidad)}
              </Alert>
              <TextField label="Monto" type="number" fullWidth size="small"
                value={payForm.monto} onChange={e => setPayForm({ ...payForm, monto: e.target.value })} />
              <TextField label="Notas" fullWidth size="small" multiline minRows={2}
                value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPayDialog({ open: false, loan: null })}>Cancelar</Button>
          <Button variant="contained" onClick={submitPayment} sx={{ bgcolor: C.orange, '&:hover': { bgcolor: C.orangeDark } }}>
            Registrar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ============================================
// TAB 4: ASISTENCIAS (placeholder con redirect)
// ============================================
function AsistenciasTab({ user }: any) {
  return (
    <Alert severity="info" sx={{ borderRadius: 2 }}>
      Las asistencias y geocercas del empleado <strong>{user.full_name}</strong> se gestionan desde la sección
      <strong> Recursos Humanos → Asistencias</strong>. Próximamente esta pestaña mostrará un historial filtrado individual.
    </Alert>
  );
}
