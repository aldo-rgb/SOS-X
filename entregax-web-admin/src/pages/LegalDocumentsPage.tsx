import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Snackbar,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import DescriptionIcon from '@mui/icons-material/Description';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import { List, ListItem, ListItemText, IconButton, Tooltip } from '@mui/material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

interface LegalDocument {
  id: number;
  document_type: string;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
  updated_at: string;
  last_updated_by: number | null;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`document-tabpanel-${index}`}
      aria-labelledby={`document-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function LegalDocumentsPage() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<LegalDocument | null>(null);
  
  // Estados de edición
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [currentDoc, setCurrentDoc] = useState<LegalDocument | null>(null);

  // Estados de versiones / historial
  interface DocumentVersion {
    id: number;
    document_id: number;
    document_type: string;
    title: string;
    content: string;
    version: number;
    saved_by: number | null;
    saved_at: string;
    replaced_by_user_id: number | null;
    replaced_at: string;
    saved_by_name: string | null;
    replaced_by_name: string | null;
  }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<DocumentVersion[]>([]);
  const [versionPreview, setVersionPreview] = useState<DocumentVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  const openHistory = async () => {
    if (!currentDoc) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/legal-documents/${currentDoc.id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data?.success) {
        setHistoryVersions(response.data.history || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar historial');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRestoreVersion = async (version: DocumentVersion) => {
    if (!currentDoc) return;
    if (!confirm(`¿Restaurar el documento a la versión ${version.version}? El estado actual quedará archivado en el historial.`)) return;
    setRestoring(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/legal-documents/${currentDoc.id}/versions/${version.id}/restore`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(`Documento restaurado a la versión ${version.version}`);
      setHistoryOpen(false);
      setVersionPreview(null);
      fetchDocuments();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al restaurar versión');
    } finally {
      setRestoring(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/legal-documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        const docs: LegalDocument[] = response.data.documents;
        setDocuments(docs);
        if (docs.length > 0) {
          // Preservar la pestaña activa si sigue existiendo. Antes
          // siempre hacíamos setCurrentDoc(docs[0]) lo que tras un
          // guardado regresaba la vista a la primera pestaña aunque
          // el usuario estuviera editando otra (caso real: editar
          // Asesores y volver a ver Empresa).
          const idx = Math.min(Math.max(tabValue, 0), docs.length - 1);
          const doc = docs[idx]!;
          setCurrentDoc(doc);
          setEditTitle(doc.title);
          setEditContent(doc.content);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    if (editMode) {
      // Guardar primero si hay cambios
      if (confirm('¿Desea guardar los cambios antes de cambiar de documento?')) {
        handleSave();
      }
    }
    setTabValue(newValue);
    setEditMode(false);
    const doc = documents[newValue];
    if (doc) {
      setCurrentDoc(doc);
      setEditTitle(doc.title);
      setEditContent(doc.content);
    }
  };

  const handleSave = async () => {
    if (!currentDoc) return;

    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${API_URL}/legal-documents/${currentDoc.id}`,
        { title: editTitle, content: editContent },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Actualizar el documento en-place con lo que devolvió el backend
      // — así nos quedamos en la misma pestaña y vemos la versión nueva
      // sin re-fetch global. El re-fetch volvía la vista a documents[0]
      // y daba la sensación de que el cambio no se había guardado.
      const updated: LegalDocument | undefined = response.data?.document;
      if (updated) {
        setDocuments(prev => prev.map(d => (d.id === updated.id ? updated : d)));
        setCurrentDoc(updated);
        setEditTitle(updated.title);
        setEditContent(updated.content);
        const msg = response.data?.message || `Versión ${updated.version} guardada`;
        setSuccess(msg);
      } else {
        setSuccess('Documento actualizado correctamente');
      }
      setEditMode(false);
    } catch (err: any) {
      // Mensaje explícito para los dos errores típicos:
      const status = err?.response?.status;
      const backendMsg = err?.response?.data?.error || err?.response?.data?.message;
      if (status === 403) {
        setError(backendMsg || 'No tienes permiso para editar este documento (se requiere super_admin o abogado).');
      } else if (status === 401) {
        setError('Tu sesión expiró. Vuelve a iniciar sesión.');
      } else {
        setError(backendMsg || `Error al guardar documento (${status || 'sin respuesta'}).`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = (doc: LegalDocument) => {
    setPreviewDoc({ ...doc, title: editTitle, content: editContent });
    setPreviewOpen(true);
  };

  const getDocumentLabel = (type: string) => {
    switch (type) {
      case 'privacy_policy':
        return 'Aviso Privacidad (Empresa)';
      case 'privacy_notice':
        return 'Aviso Privacidad  (Empleados)';
      case 'advisor_privacy_notice':
        return 'Contrato (Asesores)';
      case 'service_contract':
        return 'Contrato de Servicios';
      case 'gex_warranty_policy':
        return 'Garantía Extendida';
      default:
        return type;
    }
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'privacy_policy':
        return '🛡️';
      case 'privacy_notice':
        return '🔒';
      case 'advisor_privacy_notice':
        return '🤝';
      case 'service_contract':
        return '📄';
      case 'gex_warranty_policy':
        return '🛡️';
      default:
        return '📋';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} color="text.primary">
            📜 Documentos Legales
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Administración de contratos y avisos de privacidad
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchDocuments}
            disabled={loading}
          >
            Actualizar
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f9fafb' }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange}
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                py: 2,
              },
              '& .Mui-selected': {
                color: '#F05A28 !important',
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#F05A28',
              },
            }}
          >
            {documents.map((doc) => (
              <Tab
                key={doc.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{getDocumentIcon(doc.document_type)}</span>
                    <span>{getDocumentLabel(doc.document_type)}</span>
                    <Chip 
                      label={`v${doc.version}`} 
                      size="small" 
                      sx={{ 
                        height: 20, 
                        fontSize: '0.7rem',
                        bgcolor: '#F05A28',
                        color: 'white'
                      }} 
                    />
                  </Box>
                }
              />
            ))}
          </Tabs>
        </Box>

        {documents.map((doc, index) => (
          <TabPanel key={doc.id} value={tabValue} index={index}>
            <Box sx={{ p: 3 }}>
              {/* Info del documento */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                  <Chip 
                    label={doc.is_active ? 'Activo' : 'Inactivo'} 
                    color={doc.is_active ? 'success' : 'default'}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Última actualización: {new Date(doc.updated_at).toLocaleString('es-MX')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    startIcon={<HistoryIcon />}
                    onClick={openHistory}
                    size="small"
                    sx={{ borderColor: '#6B7280', color: '#374151' }}
                  >
                    Versiones
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<VisibilityIcon />}
                    onClick={() => handlePreview(doc)}
                    size="small"
                  >
                    Vista Previa
                  </Button>
                  {!editMode ? (
                    <Button
                      variant="contained"
                      startIcon={<EditIcon />}
                      onClick={() => setEditMode(true)}
                      sx={{ 
                        bgcolor: '#F05A28',
                        '&:hover': { bgcolor: '#D94A20' }
                      }}
                      size="small"
                    >
                      Editar
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setEditMode(false);
                          setEditTitle(doc.title);
                          setEditContent(doc.content);
                        }}
                        size="small"
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="contained"
                        startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                        onClick={handleSave}
                        disabled={saving}
                        sx={{ 
                          bgcolor: '#10B981',
                          '&:hover': { bgcolor: '#059669' }
                        }}
                        size="small"
                      >
                        Guardar
                      </Button>
                    </>
                  )}
                </Box>
              </Box>

              <Divider sx={{ mb: 3 }} />

              {/* Editor */}
              <Box>
                <TextField
                  fullWidth
                  label="Título del Documento"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  disabled={!editMode}
                  sx={{ mb: 3 }}
                  InputProps={{
                    sx: { 
                      fontWeight: 600,
                      fontSize: '1.1rem'
                    }
                  }}
                />

                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Contenido del Documento
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  💡 Puedes usar numeración (1., 2., etc.) y saltos de línea para organizar las secciones.
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={20}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  disabled={!editMode}
                  placeholder="Escribe el contenido del documento..."
                  sx={{
                    '& .MuiInputBase-root': {
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      lineHeight: 1.8,
                    }
                  }}
                />

                {editMode && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: '#FEF3C7', borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      ⚠️ <strong>Importante:</strong> Los cambios en estos documentos afectarán a todos los usuarios y clientes.
                      Se incrementará automáticamente la versión al guardar.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </TabPanel>
        ))}
      </Paper>

      {/* Dialog de Vista Previa */}
      <Dialog 
        open={previewOpen} 
        onClose={() => setPreviewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#111', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DescriptionIcon />
          Vista Previa del Documento
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {previewDoc && (
            <Box>
              <Typography variant="h5" fontWeight={700} gutterBottom sx={{ color: '#111' }}>
                {previewDoc.title}
              </Typography>
              <Chip 
                label={`Versión ${previewDoc.version}`} 
                size="small" 
                sx={{ mb: 3, bgcolor: '#F05A28', color: 'white' }}
              />
              <Divider sx={{ mb: 3 }} />
              <Typography 
                variant="body1" 
                sx={{ 
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.8,
                  color: '#374151'
                }}
              >
                {previewDoc.content}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de Historial de Versiones */}
      <Dialog
        open={historyOpen}
        onClose={() => { setHistoryOpen(false); setVersionPreview(null); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#111', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon />
          {versionPreview
            ? `Versión ${versionPreview.version} — ${currentDoc?.title || ''}`
            : `Historial de versiones — ${currentDoc?.title || ''}`}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : versionPreview ? (
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                <Chip label={`v${versionPreview.version}`} size="small" sx={{ bgcolor: '#F05A28', color: 'white' }} />
                <Typography variant="caption" color="text.secondary">
                  Editado por <strong>{versionPreview.saved_by_name || 'Desconocido'}</strong> el {new Date(versionPreview.saved_at).toLocaleString('es-MX')}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Reemplazada por <strong>{versionPreview.replaced_by_name || 'Desconocido'}</strong> el {new Date(versionPreview.replaced_at).toLocaleString('es-MX')}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                {versionPreview.title}
              </Typography>
              <Box sx={{ bgcolor: '#FAFAFA', p: 2, borderRadius: 1, maxHeight: 360, overflow: 'auto', border: '1px solid #E5E7EB' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#374151' }}>
                  {versionPreview.content}
                </Typography>
              </Box>
            </Box>
          ) : historyVersions.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">
                Aún no hay versiones archivadas. Las versiones se generan automáticamente cada vez que alguien edita el documento.
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {historyVersions.map((v) => (
                <ListItem
                  key={v.id}
                  divider
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="Ver contenido">
                        <IconButton size="small" onClick={() => setVersionPreview(v)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Restaurar esta versión">
                        <IconButton
                          size="small"
                          onClick={() => handleRestoreVersion(v)}
                          disabled={restoring}
                          sx={{ color: '#F05A28' }}
                        >
                          <RestoreIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={`v${v.version}`} size="small" sx={{ bgcolor: '#F3F4F6' }} />
                        <Typography variant="body2" fontWeight={600}>{v.title}</Typography>
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography variant="caption" color="text.secondary" component="span">
                          Editado por <strong>{v.saved_by_name || '—'}</strong> el {new Date(v.saved_at).toLocaleString('es-MX')}
                        </Typography>
                        <br />
                        <Typography variant="caption" color="text.secondary" component="span">
                          Reemplazada el {new Date(v.replaced_at).toLocaleString('es-MX')}
                          {v.replaced_by_name ? ` por ${v.replaced_by_name}` : ''}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          {versionPreview ? (
            <>
              <Button onClick={() => setVersionPreview(null)}>Volver al listado</Button>
              <Button
                variant="contained"
                startIcon={restoring ? <CircularProgress size={18} color="inherit" /> : <RestoreIcon />}
                onClick={() => handleRestoreVersion(versionPreview)}
                disabled={restoring}
                sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D94A20' } }}
              >
                Restaurar esta versión
              </Button>
            </>
          ) : (
            <Button onClick={() => setHistoryOpen(false)}>Cerrar</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Snackbar de éxito */}
      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ width: '100%' }}>
          {success}
        </Alert>
      </Snackbar>

      {/* Snackbar de error — top-center con alto z-index para que no se
          quede oculto por la barra del navegador. El Alert dentro del
          Box arriba a veces queda fuera del viewport tras un scroll. */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
