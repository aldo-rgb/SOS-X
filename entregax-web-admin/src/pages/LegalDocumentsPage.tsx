import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  IconButton,
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
import HistoryIcon from '@mui/icons-material/History';
import DescriptionIcon from '@mui/icons-material/Description';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
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
        setDocuments(response.data.documents);
        // Establecer documento inicial
        if (response.data.documents.length > 0) {
          const doc = response.data.documents[0];
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
      await axios.put(
        `${API_URL}/legal-documents/${currentDoc.id}`,
        { title: editTitle, content: editContent },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSuccess('Documento actualizado correctamente');
      setEditMode(false);
      fetchDocuments();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar documento');
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
      case 'privacy_notice':
        return 'Aviso de Privacidad (Empleados)';
      case 'service_contract':
        return 'Contrato de Servicios (Clientes)';
      default:
        return type;
    }
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'privacy_notice':
        return '🔒';
      case 'service_contract':
        return '📄';
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
            {documents.map((doc, index) => (
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

      {/* Snackbar de éxito */}
      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
        message={success}
      />
    </Box>
  );
}
