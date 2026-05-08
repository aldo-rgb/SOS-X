import { useState, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Alert,
  Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

type Concepto = {
  clave_prodserv: string;
  descripcion: string;
  empresa_asignada?: { id?: string; nombre?: string; rfc?: string } | null;
  disponible?: boolean;
};

interface Props {
  providerName: string;
  providerExternalId: string | null;
  token: string | null;
}

/**
 * Buscador de claves SAT — usa /api/entangled/conceptos/search (proxy a /v1/conceptos/search del API ENTANGLED).
 *
 * Comportamiento de "Empresa asignada":
 *  - Si el API devuelve `empresa_asignada` por concepto (filtrado por proveedor_id) → la mostramos.
 *  - Si devuelve `disponible: false` → la clave NO está habilitada con ese proveedor → "No disponible" en rojo.
 *  - Si NO devuelve ninguno de los dos campos → el API aún no soporta este filtrado → mostramos un Alert
 *    informando que ENTANGLED debe agregarlo, y la columna queda en "Pendiente del API".
 */
export default function ClaveSatSearchBlock({ providerName, providerExternalId, token }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Concepto[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [apiSupportsAssignment, setApiSupportsAssignment] = useState<boolean | null>(null);

  const search = useCallback(async () => {
    if (!q.trim() || q.trim().length < 2) {
      setErr('Ingresa al menos 2 caracteres');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await axios.get(`${API_URL}/entangled/conceptos/search`, {
        params: {
          q: q.trim(),
          limit: 25,
          ...(providerExternalId ? { proveedor_id: providerExternalId } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const list: Concepto[] = Array.isArray(r.data?.results)
        ? r.data.results
        : Array.isArray(r.data)
          ? r.data
          : [];
      setResults(list);
      const supports = list.some(c => c.empresa_asignada !== undefined || c.disponible !== undefined);
      setApiSupportsAssignment(supports);
      if (list.length === 0) setErr('Sin resultados para esa búsqueda');
    } catch (e) {
      const errResp = e as { response?: { data?: { error?: string } } };
      setErr(errResp?.response?.data?.error || 'Error consultando el motor SAT');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [q, token, providerExternalId]);

  const copy = (c: string) => {
    navigator.clipboard?.writeText(c);
    setCopied(c);
    setTimeout(() => setCopied(null), 1500);
  };

  const renderEmpresa = (c: Concepto) => {
    if (c.disponible === false) {
      return (
        <Chip
          size="small"
          icon={<CancelIcon />}
          label="No disponible"
          sx={{ bgcolor: 'rgba(244,67,54,0.15)', color: '#d32f2f', fontWeight: 700 }}
        />
      );
    }
    if (c.empresa_asignada && c.empresa_asignada.nombre) {
      return (
        <Box>
          <Chip
            size="small"
            icon={<CheckCircleIcon />}
            label={c.empresa_asignada.nombre}
            sx={{ bgcolor: 'rgba(76,175,80,0.15)', color: '#2e7d32', fontWeight: 700 }}
          />
          {c.empresa_asignada.rfc && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
              RFC: {c.empresa_asignada.rfc}
            </Typography>
          )}
        </Box>
      );
    }
    return (
      <Chip
        size="small"
        label="Pendiente del API"
        sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 600 }}
      />
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          🔎 Motor de claves SAT
        </Typography>
        <Chip size="small" label={providerName} sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 700 }} />
      </Box>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1.5 }}>
        Busca claves del catálogo SAT y verifica si <b>{providerName}</b> tiene una empresa asignada para
        facturarlas. Si la clave no está habilitada con este proveedor, la columna mostrará{' '}
        <b>No disponible</b>.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Ej: ropa, textil, calzado, 84111506"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ flex: 1, minWidth: 280 }}
        />
        <Button variant="contained" onClick={search} disabled={loading} sx={{ bgcolor: '#FF6600', '&:hover': { bgcolor: '#E65100' } }}>
          {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Buscar'}
        </Button>
      </Box>

      {err && <Alert severity={results.length === 0 ? 'info' : 'warning'} sx={{ mt: 1.5 }}>{err}</Alert>}

      {results.length > 0 && apiSupportsAssignment === false && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          <b>⚠️ El catálogo aún no expone la asignación clave SAT → empresa.</b> Cuando los
          campos <code>empresa_asignada</code> y <code>disponible</code> estén disponibles en la
          respuesta del proveedor, esta columna se llenará automáticamente y las claves no
          soportadas se marcarán como <b>No disponible</b>.
        </Alert>
      )}

      {results.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: 130 }}>Clave SAT</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Descripción</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 240 }}>Empresa asignada por {providerName}</TableCell>
                <TableCell sx={{ width: 60 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((c) => (
                <TableRow key={c.clave_prodserv} hover sx={c.disponible === false ? { opacity: 0.55 } : {}}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.clave_prodserv}</TableCell>
                  <TableCell>{c.descripcion}</TableCell>
                  <TableCell>{renderEmpresa(c)}</TableCell>
                  <TableCell>
                    <Tooltip title={copied === c.clave_prodserv ? 'Copiado' : 'Copiar clave'}>
                      <IconButton size="small" onClick={() => copy(c.clave_prodserv)}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
            {results.length} resultado{results.length === 1 ? '' : 's'} · catálogo SAT
            {providerExternalId && <> · filtrado por proveedor_id</>}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
