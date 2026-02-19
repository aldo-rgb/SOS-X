// ============================================
// PO BOX COSTING PAGE
// Panel de costeo para guías PO Box USA
// Fórmula: Costo = (Volumen Ajustado / 10,780) × 75
// Volumen Ajustado = Largo × Alto × Ancho × 2.45
// ============================================

import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    TextField,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Card,
    CardContent,
    Divider,
    Chip,
    Alert,
    InputAdornment,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tabs,
    Tab,
    Switch,
    FormControlLabel,
} from '@mui/material';
import {
    Calculate as CalculateIcon,
    Save as SaveIcon,
    Refresh as RefreshIcon,
    Settings as SettingsIcon,
    Info as InfoIcon,
    TrendingUp as TrendingUpIcon,
    Inventory as InventoryIcon,
    AttachMoney as MoneyIcon,
    LocalShipping as ShippingIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

// ============================================
// TIPOS
// ============================================

interface CostingConfig {
    id?: number;
    conversion_factor: number;      // Factor de conversión (2.45)
    dimensional_divisor: number;    // Divisor dimensional (10,780)
    base_rate: number;              // Tarifa base por unidad de volumen (75)
    min_cost: number;               // Costo mínimo
    currency: string;               // Moneda (MXN/USD)
    is_active: boolean;
    updated_at?: string;
}

interface PackageCosting {
    id: number;
    tracking: string;
    pkg_length: number;
    pkg_width: number;
    pkg_height: number;
    weight: number;
    volume_raw: number;             // L × A × H
    volume_adjusted: number;        // L × A × H × 2.45
    calculated_cost: number;        // (Vol Ajustado / 10,780) × 75
    status: string;
    received_at: string;
    user_name?: string;
}

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

// ============================================
// COMPONENTES
// ============================================

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`costing-tabpanel-${index}`}
            aria-labelledby={`costing-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
        </div>
    );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function POBoxCostingPage() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [packages, setPackages] = useState<PackageCosting[]>([]);
    const [config, setConfig] = useState<CostingConfig>({
        conversion_factor: 2.45,
        dimensional_divisor: 10780,
        base_rate: 75,
        min_cost: 50,
        currency: 'MXN',
        is_active: true,
    });
    const [editConfigOpen, setEditConfigOpen] = useState(false);
    const [tempConfig, setTempConfig] = useState<CostingConfig>(config);

    // Calculadora manual
    const [manualCalc, setManualCalc] = useState({
        largo: '',
        ancho: '',
        alto: '',
    });
    const [calcResult, setCalcResult] = useState<{
        volume_raw: number;
        volume_adjusted: number;
        cost: number;
    } | null>(null);

    // ============================================
    // FUNCIONES DE CÁLCULO
    // ============================================

    const calculateCost = (largo: number, ancho: number, alto: number): { volume_raw: number; volume_adjusted: number; cost: number } => {
        // Volumen bruto en cm³
        const volume_raw = largo * ancho * alto;
        
        // Volumen ajustado = Volumen × Factor de conversión
        const volume_adjusted = volume_raw * config.conversion_factor;
        
        // Costo = (Volumen Ajustado / Divisor) × Tarifa Base
        let cost = (volume_adjusted / config.dimensional_divisor) * config.base_rate;
        
        // Aplicar mínimo si existe
        if (cost < config.min_cost) {
            cost = config.min_cost;
        }
        
        return { volume_raw, volume_adjusted, cost };
    };

    const handleManualCalculate = () => {
        const largo = parseFloat(manualCalc.largo) || 0;
        const ancho = parseFloat(manualCalc.ancho) || 0;
        const alto = parseFloat(manualCalc.alto) || 0;
        
        if (largo > 0 && ancho > 0 && alto > 0) {
            const result = calculateCost(largo, ancho, alto);
            setCalcResult(result);
        }
    };

    // ============================================
    // CARGA DE DATOS
    // ============================================

    const loadConfig = async () => {
        try {
            const response = await api.get('/api/pobox/costing/config');
            if (response.data?.config) {
                setConfig(response.data.config);
            }
        } catch (error) {
            console.log('Usando configuración por defecto');
        }
    };

    const loadPackages = async () => {
        setLoading(true);
        try {
            const response = await api.get('/api/pobox/costing/packages');
            if (response.data?.packages) {
                // Calcular costos para cada paquete
                const packagesWithCosts = response.data.packages.map((pkg: any) => {
                    const { volume_raw, volume_adjusted, cost } = calculateCost(
                        parseFloat(pkg.pkg_length) || 0,
                        parseFloat(pkg.pkg_width) || 0,
                        parseFloat(pkg.pkg_height) || 0
                    );
                    return {
                        ...pkg,
                        volume_raw,
                        volume_adjusted,
                        calculated_cost: cost,
                    };
                });
                setPackages(packagesWithCosts);
            }
        } catch (error) {
            console.error('Error cargando paquetes:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveConfig = async () => {
        try {
            await api.post('/api/pobox/costing/config', tempConfig);
            setConfig(tempConfig);
            setEditConfigOpen(false);
            loadPackages(); // Recalcular con nueva config
        } catch (error) {
            console.error('Error guardando configuración:', error);
        }
    };

    useEffect(() => {
        loadConfig();
        loadPackages();
    }, []);

    // Recalcular cuando cambie config
    useEffect(() => {
        if (packages.length > 0) {
            const recalculated = packages.map((pkg) => {
                const { volume_raw, volume_adjusted, cost } = calculateCost(
                    pkg.pkg_length || 0,
                    pkg.pkg_width || 0,
                    pkg.pkg_height || 0
                );
                return { ...pkg, volume_raw, volume_adjusted, calculated_cost: cost };
            });
            setPackages(recalculated);
        }
    }, [config]);

    // ============================================
    // ESTADÍSTICAS
    // ============================================

    const stats = {
        totalPackages: packages.length,
        totalCost: packages.reduce((sum, pkg) => sum + (pkg.calculated_cost || 0), 0),
        avgCost: packages.length > 0 
            ? packages.reduce((sum, pkg) => sum + (pkg.calculated_cost || 0), 0) / packages.length 
            : 0,
        pendingCost: packages.filter(p => p.status === 'pending' || p.status === 'received').length,
    };

    // ============================================
    // RENDER
    // ============================================

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" gutterBottom>
                        💰 {t('pobox.costing.title', 'Panel de Costeo PO Box')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('pobox.costing.subtitle', 'Calcula el costo de cada guía basado en dimensiones')}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        startIcon={<SettingsIcon />}
                        onClick={() => {
                            setTempConfig(config);
                            setEditConfigOpen(true);
                        }}
                    >
                        {t('common.settings', 'Configuración')}
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<RefreshIcon />}
                        onClick={loadPackages}
                        disabled={loading}
                    >
                        {t('common.refresh', 'Actualizar')}
                    </Button>
                </Box>
            </Box>

            {/* Fórmula Info Card */}
            <Alert 
                severity="info" 
                icon={<InfoIcon />}
                sx={{ mb: 3 }}
            >
                <Typography variant="subtitle2" fontWeight="bold">
                    {t('pobox.costing.formula', 'Fórmula de Costeo')}:
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                    Costo = (Volumen Ajustado / {config.dimensional_divisor.toLocaleString()}) × ${config.base_rate}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    Volumen Ajustado = Largo × Alto × Ancho × {config.conversion_factor}
                </Typography>
            </Alert>

            {/* Stats Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <InventoryIcon />
                                <Typography variant="subtitle2">Paquetes</Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.totalPackages}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MoneyIcon />
                                <Typography variant="subtitle2">Costo Total</Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                ${stats.totalCost.toFixed(2)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <TrendingUpIcon />
                                <Typography variant="subtitle2">Promedio</Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                ${stats.avgCost.toFixed(2)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'info.light', color: 'info.contrastText' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <ShippingIcon />
                                <Typography variant="subtitle2">Pendientes</Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.pendingCost}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Paper sx={{ mb: 3 }}>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab label={t('pobox.costing.calculator', '🧮 Calculadora')} />
                    <Tab label={t('pobox.costing.packages', '📦 Paquetes')} />
                    <Tab label={t('pobox.costing.history', '📊 Historial')} />
                </Tabs>
            </Paper>

            {/* Tab: Calculadora */}
            <TabPanel value={activeTab} index={0}>
                <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 3 }}>
                            <Typography variant="h6" gutterBottom>
                                🧮 {t('pobox.costing.manualCalc', 'Calculadora Manual')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                {t('pobox.costing.enterDimensions', 'Ingresa las dimensiones de la caja en centímetros')}
                            </Typography>
                            
                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <TextField
                                        fullWidth
                                        label={t('common.length', 'Largo')}
                                        type="number"
                                        value={manualCalc.largo}
                                        onChange={(e) => setManualCalc({ ...manualCalc, largo: e.target.value })}
                                        InputProps={{
                                            endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                        }}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <TextField
                                        fullWidth
                                        label={t('common.width', 'Ancho')}
                                        type="number"
                                        value={manualCalc.ancho}
                                        onChange={(e) => setManualCalc({ ...manualCalc, ancho: e.target.value })}
                                        InputProps={{
                                            endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                        }}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <TextField
                                        fullWidth
                                        label={t('common.height', 'Alto')}
                                        type="number"
                                        value={manualCalc.alto}
                                        onChange={(e) => setManualCalc({ ...manualCalc, alto: e.target.value })}
                                        InputProps={{
                                            endAdornment: <InputAdornment position="end">cm</InputAdornment>,
                                        }}
                                    />
                                </Grid>
                            </Grid>

                            <Button
                                fullWidth
                                variant="contained"
                                size="large"
                                startIcon={<CalculateIcon />}
                                onClick={handleManualCalculate}
                                sx={{ mt: 3 }}
                                disabled={!manualCalc.largo || !manualCalc.ancho || !manualCalc.alto}
                            >
                                {t('common.calculate', 'Calcular')}
                            </Button>
                        </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 3, bgcolor: calcResult ? 'success.50' : 'grey.50', minHeight: 300 }}>
                            <Typography variant="h6" gutterBottom>
                                📊 {t('pobox.costing.result', 'Resultado')}
                            </Typography>
                            
                            {calcResult ? (
                                <Box>
                                    <Divider sx={{ my: 2 }} />
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Volumen Bruto:
                                        </Typography>
                                        <Typography variant="body2" fontWeight="medium">
                                            {calcResult.volume_raw.toLocaleString()} cm³
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Factor de Conversión:
                                        </Typography>
                                        <Typography variant="body2" fontWeight="medium">
                                            × {config.conversion_factor}
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Volumen Ajustado:
                                        </Typography>
                                        <Typography variant="body2" fontWeight="medium">
                                            {calcResult.volume_adjusted.toLocaleString()} cm³
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Divisor Dimensional:
                                        </Typography>
                                        <Typography variant="body2" fontWeight="medium">
                                            ÷ {config.dimensional_divisor.toLocaleString()}
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Tarifa Base:
                                        </Typography>
                                        <Typography variant="body2" fontWeight="medium">
                                            × ${config.base_rate}
                                        </Typography>
                                    </Box>
                                    
                                    <Divider sx={{ my: 2 }} />
                                    
                                    <Box sx={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        bgcolor: 'success.main',
                                        color: 'white',
                                        p: 2,
                                        borderRadius: 2,
                                    }}>
                                        <Typography variant="h6">
                                            💰 COSTO TOTAL:
                                        </Typography>
                                        <Typography variant="h4" fontWeight="bold">
                                            ${calcResult.cost.toFixed(2)} {config.currency}
                                        </Typography>
                                    </Box>
                                    
                                    {calcResult.cost === config.min_cost && (
                                        <Alert severity="warning" sx={{ mt: 2 }}>
                                            Se aplicó el costo mínimo de ${config.min_cost}
                                        </Alert>
                                    )}
                                </Box>
                            ) : (
                                <Box sx={{ 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    height: 200,
                                    color: 'text.secondary'
                                }}>
                                    <CalculateIcon sx={{ fontSize: 60, mb: 2, opacity: 0.3 }} />
                                    <Typography>
                                        {t('pobox.costing.enterDimensionsToCalc', 'Ingresa las dimensiones para calcular')}
                                    </Typography>
                                </Box>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
            </TabPanel>

            {/* Tab: Paquetes */}
            <TabPanel value={activeTab} index={1}>
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'primary.main' }}>
                                <TableCell sx={{ color: 'white' }}>Tracking</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Largo</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Ancho</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Alto</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Vol. Bruto</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Vol. Ajustado</TableCell>
                                <TableCell sx={{ color: 'white' }} align="right">Costo</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Estado</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                                        <CircularProgress />
                                    </TableCell>
                                </TableRow>
                            ) : packages.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                                        <Typography color="text.secondary">
                                            No hay paquetes POBox para mostrar
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                packages.map((pkg) => (
                                    <TableRow key={pkg.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="medium">
                                                {pkg.tracking}
                                            </Typography>
                                            {pkg.user_name && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {pkg.user_name}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            {pkg.pkg_length?.toFixed(1) || '-'} cm
                                        </TableCell>
                                        <TableCell align="center">
                                            {pkg.pkg_width?.toFixed(1) || '-'} cm
                                        </TableCell>
                                        <TableCell align="center">
                                            {pkg.pkg_height?.toFixed(1) || '-'} cm
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2" color="text.secondary">
                                                {pkg.volume_raw?.toLocaleString() || '-'} cm³
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2">
                                                {pkg.volume_adjusted?.toLocaleString() || '-'} cm³
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`$${pkg.calculated_cost?.toFixed(2) || '0.00'}`}
                                                color="success"
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                label={pkg.status}
                                                size="small"
                                                variant="outlined"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </TabPanel>

            {/* Tab: Historial */}
            <TabPanel value={activeTab} index={2}>
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        📊 Historial de costeos - Próximamente
                    </Typography>
                </Paper>
            </TabPanel>

            {/* Dialog: Configuración */}
            <Dialog open={editConfigOpen} onClose={() => setEditConfigOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SettingsIcon />
                        {t('pobox.costing.configTitle', 'Configuración de Costeo')}
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label={t('pobox.costing.conversionFactor', 'Factor de Conversión')}
                                type="number"
                                value={tempConfig.conversion_factor}
                                onChange={(e) => setTempConfig({ ...tempConfig, conversion_factor: parseFloat(e.target.value) || 0 })}
                                helperText="Multiplica el volumen bruto (ej: 2.45)"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label={t('pobox.costing.divisor', 'Divisor Dimensional')}
                                type="number"
                                value={tempConfig.dimensional_divisor}
                                onChange={(e) => setTempConfig({ ...tempConfig, dimensional_divisor: parseFloat(e.target.value) || 1 })}
                                helperText="Divisor del transportista (ej: 10,780)"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label={t('pobox.costing.baseRate', 'Tarifa Base')}
                                type="number"
                                value={tempConfig.base_rate}
                                onChange={(e) => setTempConfig({ ...tempConfig, base_rate: parseFloat(e.target.value) || 0 })}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                }}
                                helperText="Tarifa por unidad de volumen (ej: $75)"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label={t('pobox.costing.minCost', 'Costo Mínimo')}
                                type="number"
                                value={tempConfig.min_cost}
                                onChange={(e) => setTempConfig({ ...tempConfig, min_cost: parseFloat(e.target.value) || 0 })}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                }}
                                helperText="Costo mínimo por paquete"
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={tempConfig.is_active}
                                        onChange={(e) => setTempConfig({ ...tempConfig, is_active: e.target.checked })}
                                    />
                                }
                                label={t('pobox.costing.active', 'Configuración Activa')}
                            />
                        </Grid>
                    </Grid>

                    <Alert severity="info" sx={{ mt: 3 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            Fórmula: Costo = (Vol × {tempConfig.conversion_factor} / {tempConfig.dimensional_divisor.toLocaleString()}) × ${tempConfig.base_rate}
                        </Typography>
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditConfigOpen(false)}>
                        {t('common.cancel', 'Cancelar')}
                    </Button>
                    <Button variant="contained" startIcon={<SaveIcon />} onClick={saveConfig}>
                        {t('common.save', 'Guardar')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
