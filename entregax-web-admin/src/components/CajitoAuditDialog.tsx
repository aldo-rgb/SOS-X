import { useEffect, useState, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, List, ListItemButton, ListItemText,
    CircularProgress, Alert, Chip, IconButton, Stack, Divider,
    TextField, MenuItem, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BuildIcon from '@mui/icons-material/Build';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

interface Conversation {
    id: number;
    title: string | null;
    started_at: string;
    last_activity_at: string;
    total_tokens_in: number | null;
    total_tokens_out: number | null;
    model: string | null;
    user_id?: number;
    user_name?: string;
}

interface Message {
    id: number;
    role: string;
    content: string | null;
    tool_name: string | null;
    tool_args: any;
    tool_result: any;
    tokens_in?: number | null;
    tokens_out?: number | null;
    created_at: string;
    user_name?: string;
    conversation_id?: number;
    title?: string | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    isSuperAdmin: boolean;
}

const roleLabel: Record<string, { label: string; color: any }> = {
    user: { label: 'Usuario', color: 'primary' },
    assistant: { label: 'Cajito', color: 'secondary' },
    tool: { label: 'Herramienta', color: 'info' },
    system: { label: 'Sistema', color: 'default' },
};

const fmt = (s: string) => {
    try { return new Date(s).toLocaleString(); } catch { return s; }
};

const CajitoAuditDialog = ({ open, onClose, isSuperAdmin }: Props) => {
    const [mode, setMode] = useState<'mine' | 'all'>('mine');
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selected, setSelected] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [auditMessages, setAuditMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [limit, setLimit] = useState(200);

    const token = localStorage.getItem('token');
    const authHeaders = { Authorization: `Bearer ${token}` };

    const loadConversations = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API_URL}/cajito/conversations`, { headers: authHeaders });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setConversations(data.conversations || []);
        } catch (e: any) {
            setError(e?.message || 'Error cargando conversaciones');
        } finally { setLoading(false); }
    }, [token]);

    const loadConversation = useCallback(async (c: Conversation) => {
        setSelected(c); setMessages([]); setLoading(true); setError(null);
        try {
            const res = await fetch(`${API_URL}/cajito/conversations/${c.id}`, { headers: authHeaders });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setMessages(data.messages || []);
        } catch (e: any) {
            setError(e?.message || 'Error cargando mensajes');
        } finally { setLoading(false); }
    }, [token]);

    const loadAudit = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API_URL}/admin/cajito/audit?limit=${limit}`, { headers: authHeaders });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setAuditMessages(data.messages || []);
        } catch (e: any) {
            setError(e?.message || 'Error cargando auditoría');
        } finally { setLoading(false); }
    }, [token, limit]);

    useEffect(() => {
        if (!open) return;
        setSelected(null); setMessages([]); setError(null);
        if (mode === 'mine') loadConversations();
        else loadAudit();
    }, [open, mode, loadConversations, loadAudit]);

    const renderMessage = (m: Message) => {
        const rl = roleLabel[m.role] || { label: m.role, color: 'default' };
        const isTool = m.role === 'tool' || !!m.tool_name;
        return (
            <Box key={m.id} sx={{ mb: 2, p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: isTool ? 'grey.50' : 'background.paper' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap' }}>
                    <Chip label={rl.label} size="small" color={rl.color} />
                    {m.tool_name && <Chip icon={<BuildIcon sx={{ fontSize: 14 }} />} label={m.tool_name} size="small" variant="outlined" />}
                    {m.user_name && <Chip label={m.user_name} size="small" variant="outlined" />}
                    <Typography variant="caption" color="text.secondary">{fmt(m.created_at)}</Typography>
                    {(m.tokens_in || m.tokens_out) ? (
                        <Typography variant="caption" color="text.secondary">
                            in:{m.tokens_in || 0} out:{m.tokens_out || 0}
                        </Typography>
                    ) : null}
                </Stack>
                {m.content && (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.content}
                    </Typography>
                )}
                {m.tool_args && (
                    <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Args:</Typography>
                        <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {typeof m.tool_args === 'string' ? m.tool_args : JSON.stringify(m.tool_args, null, 2)}
                        </pre>
                    </Box>
                )}
                {m.tool_result && (
                    <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Result:</Typography>
                        <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflow: 'auto' }}>
                            {typeof m.tool_result === 'string' ? m.tool_result : JSON.stringify(m.tool_result, null, 2)}
                        </pre>
                    </Box>
                )}
            </Box>
        );
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '85vh' } }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
                <Box sx={{ fontSize: '1.4rem' }}>🤖</Box>
                <Typography variant="h6" component="span" fontWeight={600}>
                    Cajito — Historial y Auditoría
                </Typography>
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" onClick={() => (mode === 'mine' ? (selected ? loadConversation(selected) : loadConversations()) : loadAudit())} disabled={loading}>
                    <RefreshIcon />
                </IconButton>
                <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider' }}>
                    {isSuperAdmin && (
                        <ToggleButtonGroup
                            value={mode}
                            exclusive
                            size="small"
                            onChange={(_, v) => v && setMode(v)}
                        >
                            <ToggleButton value="mine">Mis conversaciones</ToggleButton>
                            <ToggleButton value="all">Auditoría global</ToggleButton>
                        </ToggleButtonGroup>
                    )}
                    {mode === 'all' && (
                        <TextField
                            select size="small" label="Límite" value={limit}
                            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                            sx={{ width: 140 }}
                        >
                            {[50, 100, 200, 500, 1000].map(n => <MenuItem key={n} value={n}>{n} mensajes</MenuItem>)}
                        </TextField>
                    )}
                    <Box sx={{ flex: 1 }} />
                    {loading && <CircularProgress size={20} />}
                </Box>

                {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

                <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
                    {mode === 'mine' ? (
                        <>
                            <Box sx={{ width: 320, borderRight: 1, borderColor: 'divider', overflow: 'auto' }}>
                                {conversations.length === 0 && !loading && (
                                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                        Sin conversaciones aún.
                                    </Typography>
                                )}
                                <List dense disablePadding>
                                    {conversations.map(c => (
                                        <ListItemButton
                                            key={c.id}
                                            selected={selected?.id === c.id}
                                            onClick={() => loadConversation(c)}
                                        >
                                            <ListItemText
                                                primary={c.title || `Conversación #${c.id}`}
                                                secondary={`${fmt(c.last_activity_at)} · in:${c.total_tokens_in || 0} out:${c.total_tokens_out || 0}`}
                                                primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
                                                secondaryTypographyProps={{ fontSize: 11 }}
                                            />
                                        </ListItemButton>
                                    ))}
                                </List>
                            </Box>
                            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                                {!selected && (
                                    <Typography variant="body2" color="text.secondary">
                                        Selecciona una conversación a la izquierda.
                                    </Typography>
                                )}
                                {selected && (
                                    <>
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                            <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setSelected(null)}>
                                                Volver
                                            </Button>
                                            <Typography variant="subtitle1" fontWeight={600}>
                                                {selected.title || `Conversación #${selected.id}`}
                                            </Typography>
                                            {selected.model && <Chip label={selected.model} size="small" variant="outlined" />}
                                        </Stack>
                                        {messages.map(renderMessage)}
                                    </>
                                )}
                            </Box>
                        </>
                    ) : (
                        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                            {auditMessages.length === 0 && !loading && (
                                <Typography variant="body2" color="text.secondary">
                                    No hay mensajes para mostrar.
                                </Typography>
                            )}
                            {auditMessages.map(renderMessage)}
                        </Box>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cerrar</Button>
            </DialogActions>
        </Dialog>
    );
};

export default CajitoAuditDialog;
