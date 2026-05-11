// ============================================
// COMMISSION RATES TABLE
// Tabla de Tarifas de Comisión por Servicio
// Manejo especial de GEX (cuota variable + comisión fija)
// Reutilizable: usada en Ajustes del Sistema
// ============================================

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, Button, InputAdornment,
  Chip, Avatar, CircularProgress, Alert, Snackbar, Tooltip,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import FlightIcon from '@mui/icons-material/Flight';
import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SecurityIcon from '@mui/icons-material/Security';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const ORANGE = '#F05A28';
const BLACK = '#111';

interface CommissionRate {
  id: number;
  service_type: string;
  label: string;
  percentage: number;
  leader_override: number;
  fiscal_emitter_id: number | null;
  fixed_fee: number;
  is_gex: boolean;
  updated_at: string;
}

const getServiceIcon = (serviceType: string) => {
  if (serviceType.includes('gex')) return <SecurityIcon />;
  if (serviceType.includes('aereo')) return <FlightIcon />;
  if (serviceType.includes('maritimo')) return <DirectionsBoatIcon />;
  return <LocalShippingIcon />;
};

const getServiceColor = (serviceType: string) => {
  if (serviceType.includes('gex')) return '#9c27b0';
  if (serviceType.includes('aereo')) return '#2196f3';
  if (serviceType.includes('maritimo')) return '#00bcd4';
  if (serviceType.includes('pobox') || serviceType.includes('usa')) return ORANGE;
  return '#4caf50';
};

export default function CommissionRatesTable() {
  const { i18n } = useTranslation();
  const [rates, setRates] = useState<CommissionRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const getToken = () => localStorage.getItem('token');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const ratesRes = await axios.get(`${API_URL}/admin/commissions`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setRates(ratesRes.data);
    } catch (error) {
      console.error('Error loading commissions:', error);
      setSnackbar({ open: true, message: 'Error al cargar tarifas', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpdate = async (id: number, newPercentage: number, newOverride: number, newEmitterId: number | null, fixedFee?: number) => {
    try {
      await axios.put(`${API_URL}/admin/commissions`,
        { id, percentage: newPercentage, leader_override: newOverride, fixed_fee: fixedFee },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      await axios.post(`${API_URL}/admin/fiscal/assign-service`,
        { serviceId: id, emitterId: newEmitterId },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      ).catch(() => { /* opcional */ });
      setSnackbar({ open: true, message: i18n.language === 'es' ? 'Tarifa actualizada' : 'Rate updated', severity: 'success' });
      loadData();
    } catch (error) {
      console.error('Error updating rate:', error);
      setSnackbar({ open: true, message: 'Error al actualizar', severity: 'error' });
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <>
      <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden', mb: 3 }}>
        <Box sx={{ bgcolor: BLACK, px: 3, py: 2 }}>
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
            📊 {i18n.language === 'es' ? 'Tarifas de Comisión por Servicio' : 'Commission Rates by Service'}
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mx: 2, mt: 2 }}>
          <Typography variant="body2">
            {i18n.language === 'es'
              ? 'Estos porcentajes se aplican al valor del envío cuando un cliente referido realiza un pago.'
              : 'These percentages apply to shipment value when a referred client makes a payment.'}
          </Typography>
        </Alert>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {i18n.language === 'es' ? 'Tipo de Servicio' : 'Service Type'}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  {i18n.language === 'es' ? 'Comisión (%)' : 'Commission (%)'}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  <Tooltip title={i18n.language === 'es' ? 'La comisión se divide 50% para el asesor líder y 50% para el subasesor. GEX es pago completo al subasesor.' : 'Commission is split 50% to lead advisor and 50% to sub-advisor. GEX pays full amount to sub-advisor.'}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      {i18n.language === 'es' ? 'Split Asesor / Sub' : 'Split Advisor / Sub'}
                      <SupervisorAccountIcon fontSize="small" />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  {i18n.language === 'es' ? 'Acción' : 'Action'}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rates.map((rate) => (
                <CommissionRow key={rate.id} rate={rate} onSave={handleUpdate} language={i18n.language} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

interface CommissionRowProps {
  rate: CommissionRate;
  onSave: (id: number, percentage: number, override: number, emitterId: number | null, fixedFee?: number) => void;
  language: string;
}

function CommissionRow({ rate, onSave, language }: CommissionRowProps) {
  const [val, setVal] = useState<string>(rate.percentage.toString());
  const [fixedFeeVal, setFixedFeeVal] = useState<string>((rate.fixed_fee || 0).toString());
  const [saving, setSaving] = useState(false);

  const hasChanged = parseFloat(val) !== rate.percentage ||
    (rate.is_gex && parseFloat(fixedFeeVal) !== (rate.fixed_fee || 0));

  const handleSave = async () => {
    setSaving(true);
    await onSave(
      rate.id,
      parseFloat(val),
      0,
      null,
      rate.is_gex ? parseFloat(fixedFeeVal) : undefined
    );
    setSaving(false);
  };

  const getRowBgColor = () => {
    if (rate.is_gex) return '#f3e5f5';
    if (rate.service_type.includes('aereo')) return '#e3f2fd';
    if (rate.service_type.includes('maritimo')) return '#e0f7fa';
    if (rate.service_type.includes('pobox') || rate.service_type.includes('usa')) return '#fff3e0';
    return '#e8f5e9';
  };

  return (
    <TableRow hover sx={{ bgcolor: getRowBgColor() }}>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: `${getServiceColor(rate.service_type)}20`, color: getServiceColor(rate.service_type) }}>
            {getServiceIcon(rate.service_type)}
          </Avatar>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography fontWeight="bold">{rate.label}</Typography>
              {rate.is_gex && (
                <Chip label="GEX" size="small" sx={{ bgcolor: '#9c27b0', color: 'white', height: 20, fontSize: '0.65rem' }} />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">{rate.service_type}</Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell align="center">
        <TextField
          type="number" size="small" value={val}
          onChange={(e) => setVal(e.target.value)}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
          sx={{ width: 100 }}
          helperText={rate.is_gex ? (language === 'es' ? 'Cuota variable' : 'Variable fee') : ''}
        />
      </TableCell>
      {rate.is_gex ? (
        <TableCell align="center">
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <TextField
              type="number" size="small" value={fixedFeeVal}
              onChange={(e) => setFixedFeeVal(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
              sx={{ width: 120, '& .MuiOutlinedInput-root': { bgcolor: '#e1bee7' } }}
              helperText={language === 'es' ? 'Comisión fija' : 'Fixed commission'}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {language === 'es' ? 'Pago completo al subasesor' : 'Full payment to sub-advisor'}
            </Typography>
          </Box>
        </TableCell>
      ) : (
        <TableCell align="center">
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label="50% / 50%"
              size="small"
              sx={{ bgcolor: '#fff8e1', border: '1px solid #ffc107', fontWeight: 'bold', fontSize: '0.85rem', px: 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {language === 'es' ? 'Asesor / Subasesor' : 'Advisor / Sub-advisor'}
            </Typography>
          </Box>
        </TableCell>
      )}
      <TableCell align="center">
        <Button
          variant="contained" size="small"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave} disabled={!hasChanged || saving}
          sx={{ background: hasChanged ? `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` : 'grey.300' }}
        >
          {language === 'es' ? 'Guardar' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  );
}
