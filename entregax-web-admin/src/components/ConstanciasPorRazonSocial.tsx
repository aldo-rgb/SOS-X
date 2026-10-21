/**
 * ConstanciasPorRazonSocial — una constancia por cada razón social a la que
 * factura el cliente, no una sola por cliente.
 *
 * El defecto que arregla (tarea 879): la constancia se guardaba en un único
 * renglón por cliente, así que quien factura a varias razones sociales solo
 * podía tener una y cada carga pisaba la anterior. La orden XP992718 salió con
 * la constancia de otra empresa y la factura se emitió mal.
 *
 * Al subir, el backend lee el RFC impreso DENTRO del PDF y rechaza el archivo
 * si no es el de la razón social elegida. Esa comprobación es la única que ve
 * el CONTENIDO: separar el almacén por RFC asegura de dónde sale el archivo,
 * no qué dice.
 *
 * Un solo componente para los dos roles: el cliente para sí mismo y el asesor
 * o el staff en nombre de un cliente. Es lo que hace que web y app queden con
 * la misma regla sin escribirla dos veces por rol.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Chip, Stack, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Link,
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import UploadIcon from '@mui/icons-material/UploadFile';
import api from '../services/api';
import { useSoltarArchivos } from '../hooks/useSoltarArchivos';

const ORANGE = '#F05A28';

type Constancia = {
  tiene: boolean;
  constancia_url: string | null;
  constancia_filename: string | null;
  issued_at: string | null;
  valid_until: string | null;
  vigente: boolean;
  dias_para_vencer: number | null;
};
export type RazonSocial = {
  id: number;
  razon_social: string;
  rfc: string;
  codigo_postal?: string;
  is_default?: boolean;
  constancia: Constancia;
};

type Props = {
  /** undefined = el usuario logueado gestiona las suyas */
  clientUserId?: number;
  onChange?: () => void;
};

const rutas = (clientUserId?: number) => clientUserId
  ? { list: `/advisor/clients/${clientUserId}/razones-sociales`,
      post: (pid: number) => `/advisor/clients/${clientUserId}/razones-sociales/${pid}/constancia` }
  : { list: '/fiscal/razones-sociales',
      post: (pid: number) => `/fiscal/razones-sociales/${pid}/constancia` };

const ConstanciasPorRazonSocial: React.FC<Props> = ({ clientUserId, onChange }) => {
  const r = rutas(clientUserId);
  const [lista, setLista] = useState<RazonSocial[]>([]);
  const [cargando, setCargando] = useState(false);
  const [elegida, setElegida] = useState<RazonSocial | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fechaManual, setFechaManual] = useState('');
  const [pideFecha, setPideFecha] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { arrastrando, props: propsSoltar } = useSoltarArchivos(
    (archivos) => { setArchivo(archivos[0]); setError(null); setPideFecha(false); setFechaManual(''); },
    { desactivado: subiendo, soloUno: true }
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api.get(r.list);
      setLista(Array.isArray(res.data?.profiles) ? res.data.profiles : []);
    } catch { setLista([]); } finally { setCargando(false); }
  }, [r.list]);

  useEffect(() => { void cargar(); }, [cargar]);

  const subir = async () => {
    if (!elegida || !archivo) return;
    setSubiendo(true); setError(null); setAviso(null);
    try {
      const fd = new FormData();
      fd.append('constancia', archivo);
      if (fechaManual) fd.append('issued_at', fechaManual);
      const res = await api.post(r.post(elegida.id), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.aviso) setAviso(res.data.aviso);
      setElegida(null); setArchivo(null); setFechaManual(''); setPideFecha(false);
      await cargar();
      onChange?.();
    } catch (e: any) {
      const d = e?.response?.data;
      if (d?.error === 'no_issue_date') { setPideFecha(true); setError(d.message); }
      else setError(d?.message || d?.error || 'No se pudo subir la constancia');
    } finally { setSubiendo(false); }
  };

  const faltan = lista.filter(x => !x.constancia?.tiene).length;

  if (!cargando && lista.length <= 1) return null; // con una sola razón social el panel de arriba basta

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <ReceiptIcon sx={{ color: ORANGE, fontSize: 20 }} />
        <Typography variant="subtitle2" fontWeight={700}>Constancia por razón social</Typography>
        {faltan > 0 && <Chip size="small" color="warning" label={`${faltan} sin constancia`} />}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Este cliente factura a {lista.length} razones sociales y cada una necesita la suya. La orden
        sale con la constancia de la razón social que se le haya puesto; si falta, sale sin constancia
        antes que con la equivocada.
      </Typography>

      {cargando ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={22} /></Box>
      ) : (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {lista.map((x) => {
            const c = x.constancia || ({} as Constancia);
            return (
              <Box key={x.id} sx={{
                display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
                p: 1, borderRadius: 1.5, border: '1px solid', borderColor: c.tiene ? '#C8E6C9' : '#FFCC80',
                bgcolor: c.tiene ? '#F1F8E9' : '#FFF8E1',
              }}>
                <Box sx={{ flex: 1, minWidth: 180 }}>
                  <Typography variant="body2" fontWeight={700} noWrap>{x.razon_social}</Typography>
                  <Typography variant="caption" color="text.secondary">{x.rfc}</Typography>
                </Box>
                {c.tiene ? (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Chip size="small" color={c.vigente ? 'success' : 'error'}
                      label={c.vigente ? `Vigente${c.dias_para_vencer != null ? ` · ${c.dias_para_vencer} d` : ''}` : 'Vencida'} />
                    {c.constancia_url && (
                      <Link href={c.constancia_url} target="_blank" rel="noopener" variant="caption">Ver</Link>
                    )}
                  </Stack>
                ) : (
                  <Chip size="small" color="warning" label="Sin constancia" />
                )}
                <Button size="small" startIcon={<UploadIcon />}
                  onClick={() => { setElegida(x); setArchivo(null); setError(null); setAviso(null); setPideFecha(false); setFechaManual(''); }}>
                  {c.tiene ? 'Reemplazar' : 'Subir'}
                </Button>
              </Box>
            );
          })}
        </Stack>
      )}

      {aviso && <Alert severity="warning" sx={{ mt: 1.5 }}>{aviso}</Alert>}

      <Dialog open={!!elegida} onClose={() => { if (!subiendo) setElegida(null); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Constancia de {elegida?.razon_social}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              Tiene que ser la constancia del RFC <b>{elegida?.rfc}</b>. Si el documento está a nombre
              de otra empresa no se va a guardar: lo revisamos leyendo el RFC impreso dentro del archivo.
            </Alert>
            <Box {...propsSoltar} sx={{
              p: 3, borderRadius: 2, textAlign: 'center', cursor: 'pointer',
              border: '2px dashed', borderColor: arrastrando ? ORANGE : '#CFD8DC',
              bgcolor: arrastrando ? '#FFF3E0' : 'transparent',
            }}>
              <input id={`csf-rs-${elegida?.id || 'x'}`} type="file" accept=".pdf,image/*" hidden
                onChange={(e) => { setArchivo(e.target.files?.[0] || null); setError(null); setPideFecha(false); }} />
              <label htmlFor={`csf-rs-${elegida?.id || 'x'}`} style={{ cursor: 'pointer' }}>
                <Typography variant="body2" fontWeight={600}>
                  {archivo ? archivo.name : 'Haz clic o arrastra la constancia (PDF, JPG o PNG)'}
                </Typography>
              </label>
            </Box>
            {pideFecha && (
              <TextField label="Fecha de emisión" type="date" value={fechaManual}
                onChange={(e) => setFechaManual(e.target.value)} InputLabelProps={{ shrink: true }}
                helperText="La que aparece en la constancia (Lugar y fecha de emisión)." />
            )}
            {error && <Alert severity={pideFecha ? 'warning' : 'error'}>{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { if (!subiendo) setElegida(null); }} disabled={subiendo}>Cancelar</Button>
          <Button variant="contained" sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94d1f' } }}
            onClick={subir} disabled={!archivo || subiendo || (pideFecha && !fechaManual)}>
            {subiendo ? 'Subiendo…' : 'Subir y validar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ConstanciasPorRazonSocial;
