import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  TextField, Slider, Chip, Stack, Divider, MenuItem, Select, IconButton,
  Button, Alert, Tooltip,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

/**
 * SIMULADOR de bonos para personal operativo. AISLADO A PROPÓSITO:
 * no lee ni escribe metas, comisiones ni pagos reales. Lo único que consulta es
 * cuánta gente hay por puesto, para que los totales signifiquen algo; todo lo
 * demás vive en memoria y se pierde al salir.
 *
 * Existe porque hoy los bonos de este personal NO funcionan: la única meta
 * configurada mide usuarios nuevos, que es métrica de asesor —alguien de bodega
 * nunca la va a cumplir— y no hay ningún monto ni pago en la base. Antes de
 * construir el motor conviene ver cuánto costaría cada esquema.
 */

type Staff = { id: number; full_name: string; role: string };

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Admin', director: 'Director',
  branch_manager: 'Gerente de sucursal', customer_service: 'Servicio a cliente',
  operaciones: 'Operaciones', counter_staff: 'Mostrador', warehouse_ops: 'Operaciones bodega',
  repartidor: 'Repartidor', accountant: 'Contador', monitoreo: 'Monitoreo',
  soporte_tecnico: 'Soporte técnico',
};
const roleLabel = (r: string) => ROLE_LABELS[r] || r;

/** Métricas propuestas. Cada una dice para qué puesto tiene sentido medirla. */
const METRICAS = [
  { key: 'guias_procesadas', label: 'Guías procesadas', unidad: 'guías', para: ['warehouse_ops', 'operaciones', 'counter_staff'] },
  { key: 'entregas_tiempo',  label: 'Entregas a tiempo', unidad: '%',     para: ['repartidor', 'branch_manager', 'operaciones'] },
  { key: 'incidencias',      label: 'Incidencias (menos es mejor)', unidad: 'incidencias', para: ['warehouse_ops', 'repartidor', 'branch_manager'] },
  { key: 'tickets',          label: 'Tickets resueltos', unidad: 'tickets', para: ['customer_service', 'soporte_tecnico', 'monitoreo'] },
  { key: 'cobranza',         label: 'Cobranza conciliada', unidad: 'órdenes', para: ['accountant', 'counter_staff'] },
];
const metricaDe = (k: string) => METRICAS.find(m => m.key === k) || METRICAS[0];

type Regla = {
  id: number;
  rol: string;
  metrica: string;
  meta: number;
  monto: number;          // MXN por persona que cumple
  cumplimiento: number;   // % de la gente del puesto que se espera que cumpla
};

const money = (v: number) =>
  `$${Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let nextId = 1;

export default function SimuladorBonosPanel() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/admin/bonos/staff`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setStaff(r.data?.staff || []);
    } catch { setStaff([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Cuánta gente hay por puesto: es lo que convierte el monto por persona en
  // un costo mensual real.
  const porRol = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of staff) m.set(s.role, (m.get(s.role) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [staff]);

  const agregar = () => {
    const rol = porRol[0]?.[0] || 'warehouse_ops';
    setReglas(rs => [...rs, {
      id: nextId++, rol, metrica: 'guias_procesadas',
      meta: 100, monto: 500, cumplimiento: 60,
    }]);
  };

  const actualizar = (id: number, campo: keyof Regla, valor: any) =>
    setReglas(rs => rs.map(r => (r.id === id ? { ...r, [campo]: valor } : r)));

  const calculadas = useMemo(() => reglas.map(r => {
    const personas = porRol.find(([rol]) => rol === r.rol)?.[1] || 0;
    const cumplen = Math.round(personas * (r.cumplimiento / 100));
    return { ...r, personas, cumplen, costo: cumplen * r.monto };
  }), [reglas, porRol]);

  const totalMes = calculadas.reduce((a, r) => a + r.costo, 0);
  const totalPersonas = calculadas.reduce((a, r) => a + r.cumplen, 0);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <ScienceIcon sx={{ color: '#F05A28' }} />
        <Typography variant="h6" fontWeight={800}>Simulador de bonos por puesto</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Para probar esquemas antes de decidir. Nada de lo que hagas aquí se guarda
        ni afecta metas, comisiones o pagos reales.
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Hoy este personal <strong>no tiene bonos</strong>: la única meta configurada mide usuarios
        nuevos —métrica de asesor, que alguien de bodega nunca va a cumplir— y no existe ningún
        monto ni pago en el sistema. Este simulador sirve para dimensionar cuánto costaría cada
        esquema antes de construirlo.
      </Alert>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1, borderLeft: '4px solid #F05A28' }}>
          <Typography variant="caption" color="text.secondary">Costo mensual simulado</Typography>
          <Typography variant="h4" fontWeight={800} color="#F05A28">{money(totalMes)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {totalPersonas} persona{totalPersonas === 1 ? '' : 's'} cobrarían bono · {money(totalMes * 12)} al año
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 2 }}>
          <Typography variant="caption" color="text.secondary">Personal por puesto (real)</Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {porRol.map(([rol, n]) => (
              <Chip key={rol} size="small" variant="outlined" label={`${roleLabel(rol)}: ${n}`} />
            ))}
            {porRol.length === 0 && <Typography variant="body2" color="text.secondary">Cargando…</Typography>}
          </Stack>
        </Paper>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={800}>Reglas del esquema</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={agregar} variant="outlined">
            Agregar regla
          </Button>
        </Stack>
        <Divider sx={{ mb: 1.5 }} />

        {calculadas.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Agrega una regla para empezar a simular.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>PUESTO</TableCell>
                  <TableCell>QUÉ SE LE MIDE</TableCell>
                  <TableCell align="right">META</TableCell>
                  <TableCell align="right">BONO C/U</TableCell>
                  <TableCell sx={{ minWidth: 170 }}>% QUE LA CUMPLE</TableCell>
                  <TableCell align="right">COSTO / MES</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {calculadas.map((r) => {
                  const m = metricaDe(r.metrica);
                  const encaja = m.para.includes(r.rol);
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Select size="small" value={r.rol} fullWidth
                          onChange={(e) => actualizar(r.id, 'rol', e.target.value)}>
                          {porRol.map(([rol, n]) => (
                            <MenuItem key={rol} value={rol}>{roleLabel(rol)} ({n})</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select size="small" value={r.metrica} fullWidth
                          onChange={(e) => actualizar(r.id, 'metrica', e.target.value)}>
                          {METRICAS.map(mm => (
                            <MenuItem key={mm.key} value={mm.key}>{mm.label}</MenuItem>
                          ))}
                        </Select>
                        {/* Aviso, no bloqueo: medirle tickets a bodega se puede
                            hacer, pero conviene que salte a la vista. */}
                        {!encaja && (
                          <Tooltip title="Esa métrica no suele aplicar a ese puesto. Puedes simularla igual.">
                            <Typography variant="caption" sx={{ color: '#B45309' }}>
                              no es típica de este puesto
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <TextField size="small" type="number" value={r.meta} sx={{ width: 90 }}
                          onChange={(e) => actualizar(r.id, 'meta', Number(e.target.value))}
                          InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">{m.unidad}</Typography> }} />
                      </TableCell>
                      <TableCell align="right">
                        <TextField size="small" type="number" value={r.monto} sx={{ width: 110 }}
                          onChange={(e) => actualizar(r.id, 'monto', Number(e.target.value))} />
                      </TableCell>
                      <TableCell>
                        <Slider size="small" value={r.cumplimiento} min={0} max={100} step={5}
                          valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`}
                          onChange={(_, v) => actualizar(r.id, 'cumplimiento', v as number)} />
                        <Typography variant="caption" color="text.secondary">
                          {r.cumplen} de {r.personas}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {money(r.costo)}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => setReglas(rs => rs.filter(x => x.id !== r.id))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
