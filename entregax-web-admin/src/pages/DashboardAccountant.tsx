// ============================================
// DASHBOARD - CONTADOR
// Panel limpio para el rol contador: solo lo relevante a facturación
// (facturas pendientes por timbrar por empresa).
// ============================================

import { useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack, CircularProgress, Button } from '@mui/material';
import {
  ReceiptLongOutlined as ReceiptIcon,
  ArrowForwardRounded as ArrowForwardIcon,
  CheckCircleOutlineRounded as CheckIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';

interface PendingEmitter {
  id: number;
  alias: string;
  rfc: string;
  business_name: string;
  pending: number;
}

export default function DashboardAccountant() {
  const [userName, setUserName] = useState('Contador');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingEmitter[]>([]);

  const goToAccounting = (emitterId?: number) => {
    if (emitterId) localStorage.setItem('accounting_preselect_emitter', String(emitterId));
    window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', { detail: { action: 'accounting' } }));
  };

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setUserName(u.name?.split(' ')[0] || 'Contador');
    } catch { /* noop */ }
    api.get('/accounting/pending-stamp-summary')
      .then(res => setPending((res.data?.emitters || []).filter((e: PendingEmitter) => e.pending > 0)))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, []);

  const totalPending = pending.reduce((s, e) => s + e.pending, 0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#F8FAFC', minHeight: '100%' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', letterSpacing: -0.5 }}>
          Hola, <Box component="span" sx={{ color: ORANGE }}>{userName}</Box> 👋
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Typography>
      </Box>

      {/* Sección: Facturas pendientes por timbrar */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Box sx={{ width: 4, height: 18, bgcolor: ORANGE, borderRadius: 1 }} />
        <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', letterSpacing: 0.2, textTransform: 'uppercase' }}>
          Facturas pendientes por timbrar
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: ORANGE }} />
        </Box>
      ) : totalPending === 0 ? (
        <Paper elevation={0} sx={{ p: 4, borderRadius: 2, border: '1px solid #E5E7EB', textAlign: 'center' }}>
          <CheckIcon sx={{ fontSize: 48, color: '#22C55E', mb: 1 }} />
          <Typography sx={{ fontWeight: 700, color: '#0F172A' }}>Todo al día</Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mb: 2 }}>No hay facturas pendientes por timbrar.</Typography>
          <Button variant="outlined" onClick={() => goToAccounting()} sx={{ color: ORANGE, borderColor: ORANGE, textTransform: 'none', fontWeight: 600 }}>
            Ir a Contabilidad
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {pending.map((emp) => (
            <Paper
              key={emp.id}
              onClick={() => goToAccounting(emp.id)}
              elevation={0}
              sx={{
                width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' },
                p: 2, borderRadius: 2, cursor: 'pointer',
                border: '1px solid #FDBA74', bgcolor: '#FFF7ED',
                display: 'flex', alignItems: 'center', gap: 1.5,
                transition: 'box-shadow .18s ease, transform .18s ease',
                '&:hover': { boxShadow: '0 6px 18px rgba(234,88,12,0.18)', transform: 'translateY(-1px)' },
              }}
            >
              <Box sx={{ width: 44, height: 44, borderRadius: 1.5, bgcolor: '#FB923C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ReceiptIcon />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.95rem' }} noWrap>{emp.alias}</Typography>
                <Typography variant="caption" sx={{ color: '#9A3412' }} noWrap>{emp.rfc}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.25 }}>
                  <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#C2410C', lineHeight: 1 }}>{emp.pending}</Typography>
                  <Typography variant="caption" sx={{ color: '#9A3412' }}>{emp.pending === 1 ? 'pendiente' : 'pendientes'}</Typography>
                </Box>
              </Box>
              <ArrowForwardIcon sx={{ color: '#EA580C', flexShrink: 0 }} />
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
