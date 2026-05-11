/**
 * AssetDetailPage.tsx — Ficha pública de un activo.
 *
 * Se monta cuando window.location.pathname empieza con "/asset/" (lo
 * intercepta App.tsx antes del check de auth). Lee el ID del path
 * y pega a GET /api/branch-assets/:id (endpoint público).
 *
 * Sirve para que un supervisor escanee el QR pegado al equipo con
 * la cámara de su celular y vea de inmediato:
 *   - SKU, categoría
 *   - sucursal a la que pertenece
 *   - marca, modelo, S/N
 *   - estado (chip)
 *   - responsable asignado
 *   - foto del equipo
 *   - link a factura
 *
 * No requiere iniciar sesión: la URL viene desde el QR físico,
 * cualquiera con acceso al equipo puede ver la ficha.
 */

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Chip, CircularProgress, Avatar, Button, Divider,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import PersonIcon from '@mui/icons-material/Person';
import EventIcon from '@mui/icons-material/Event';
import ReceiptIcon from '@mui/icons-material/Receipt';

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:3001/api';

interface Asset {
  id: number;
  sku: string;
  category: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
  photo_url: string | null;
  invoice_url: string | null;
  notes: string | null;
  acquisition_date: string | null;
  acquisition_cost: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
  branch_city?: string | null;
  assigned_to_name?: string | null;
  assigned_to_email?: string | null;
}

const statusColor: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  nuevo: 'success',
  excelente: 'success',
  desgastado: 'warning',
  en_reparacion: 'info',
  de_baja: 'error',
};

const statusLabel: Record<string, string> = {
  nuevo: 'Nuevo',
  excelente: 'Excelente',
  desgastado: 'Desgastado',
  en_reparacion: 'En Reparación',
  de_baja: 'De Baja',
};

export default function AssetDetailPage() {
  const id = useMemo(() => {
    const m = window.location.pathname.match(/^\/asset\/(\d+)/);
    return m ? Number(m[1]) : null;
  }, []);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setErr('URL inválida');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/branch-assets/${id}`);
        setAsset(r.data);
      } catch (e: any) {
        setErr(e?.response?.data?.error || 'No se pudo cargar el activo');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (err || !asset) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5', p: 2 }}>
        <Paper sx={{ p: 4, maxWidth: 420, textAlign: 'center', borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={800} color="error">Activo no encontrado</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {err || 'El QR escaneado no corresponde a un activo registrado.'}
          </Typography>
          <Button onClick={() => (window.location.href = '/')} sx={{ mt: 2, bgcolor: '#F05A28', color: '#fff', '&:hover': { bgcolor: '#d94d1f' } }}>
            Ir al portal
          </Button>
        </Paper>
      </Box>
    );
  }

  const sLabel = statusLabel[asset.status] || asset.status;
  const sColor = statusColor[asset.status] || 'default';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', p: 2 }}>
      <Box sx={{ maxWidth: 520, mx: 'auto' }}>
        {/* Header negro */}
        <Box sx={{ bgcolor: '#0a0a0a', color: '#fff', p: 2, borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="caption" sx={{ letterSpacing: 1.5, color: '#ccc', fontWeight: 700 }}>
              ENTREGAX · INVENTARIO
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, mt: 0.5 }}>
              Ficha del equipo
            </Typography>
          </Box>
          <Box sx={{ width: 4, height: 28, bgcolor: '#F05A28' }} />
        </Box>

        <Paper sx={{ borderRadius: '0 0 12px 12px', p: 3 }}>
          {/* Imagen */}
          {asset.photo_url && (
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <img src={asset.photo_url} alt={asset.sku} style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: '1px solid #eee' }} />
            </Box>
          )}

          {/* SKU + estado */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 22, color: '#F05A28', letterSpacing: 1 }}>
              {asset.sku}
            </Typography>
            <Chip label={sLabel} color={sColor} sx={{ fontWeight: 700 }} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1 }}>
            {asset.category.toUpperCase()}
          </Typography>

          {/* Marca / modelo / S/N */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {[asset.brand, asset.model].filter(Boolean).join(' · ') || '—'}
            </Typography>
            {asset.serial_number && (
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                S/N: {asset.serial_number}
              </Typography>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Sucursal */}
          {asset.branch_name && (
            <Row icon={<BusinessIcon fontSize="small" sx={{ color: '#F05A28' }} />}
                 label="Sucursal"
                 value={`${asset.branch_name} (${asset.branch_code})${asset.branch_city ? ` · ${asset.branch_city}` : ''}`} />
          )}

          {/* Responsable */}
          {asset.assigned_to_name && (
            <Row icon={<PersonIcon fontSize="small" sx={{ color: '#F05A28' }} />}
                 label="Responsable"
                 value={asset.assigned_to_name}
                 sub={asset.assigned_to_email || undefined} />
          )}

          {/* Adquisición */}
          {(asset.acquisition_date || asset.acquisition_cost) && (
            <Row icon={<EventIcon fontSize="small" sx={{ color: '#F05A28' }} />}
                 label="Adquisición"
                 value={[
                   asset.acquisition_date ? new Date(asset.acquisition_date).toLocaleDateString('es-MX') : '',
                   asset.acquisition_cost ? `$${Number(asset.acquisition_cost).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN` : '',
                 ].filter(Boolean).join(' · ')} />
          )}

          {/* Factura */}
          {asset.invoice_url && (
            <Box sx={{ mt: 2 }}>
              <Button fullWidth variant="outlined" startIcon={<ReceiptIcon />} component="a" href={asset.invoice_url} target="_blank" sx={{ borderColor: '#F05A28', color: '#F05A28' }}>
                Ver factura de compra
              </Button>
            </Box>
          )}

          {/* Notas */}
          {asset.notes && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#FFFBEB', borderRadius: 2, borderLeft: '4px solid #F59E0B' }}>
              <Typography variant="caption" sx={{ color: '#92400E', fontWeight: 700, letterSpacing: 1 }}>NOTAS</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: '#78350F', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {asset.notes}
              </Typography>
            </Box>
          )}

          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #eee', textAlign: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              ID interno: {asset.id} · EntregaX Paquetería
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

function Row({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'flex-start' }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: '#FFF3E0' }}>{icon}</Avatar>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1, fontWeight: 700 }}>
          {label.toUpperCase()}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </Box>
    </Box>
  );
}
