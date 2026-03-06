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
    Checkbox,
    Snackbar,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Tooltip,
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
    Payment as PaymentIcon,
    CheckCircle as CheckCircleIcon,
    FilterList as FilterIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

// ============================================
// TIPOS
// ============================================

interface CostingConfig {
    id?: number;
    conversion_factor: number;      // Factor de conversión cm→pulg (2.54)
    dimensional_divisor: number;    // Divisor dimensional (10,780)
    base_rate: number;              // Tarifa base USD por pie³ ($75)
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
    created_at: string;
    user_name?: string;
    costing_paid?: boolean;
    costing_paid_at?: string;
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
    const [activeTab, setActiveTab] = useState(1); // 1 = Paquetes (mostrar primero)
    const [loading, setLoading] = useState(false);
    const [packages, setPackages] = useState<PackageCosting[]>([]);
    const [config, setConfig] = useState<CostingConfig>({
        conversion_factor: 2.54,      // cm a pulgadas
        dimensional_divisor: 10780,
        base_rate: 75,                // USD por pie³
        min_cost: 50,
        currency: 'MXN',
        is_active: true,
    });
    const [tcApi, setTcApi] = useState<number>(17.65);  // TC de API (directo)
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

    // Filtros de fecha
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [showPaidFilter, setShowPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('unpaid');

    // Selección de paquetes para pago
    const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [paymentReference, setPaymentReference] = useState('');
    const [processingPayment, setProcessingPayment] = useState(false);
    const [snackbar, setSnackbar] = useState<{open: boolean; message: string; severity: 'success' | 'error'}>({
        open: false,
        message: '',
        severity: 'success'
    });

    // ============================================
    // UTILIDADES (solo admin/super_admin)
    // ============================================
    const getUserRole = (): string => {
        try {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                return user.role || '';
            }
        } catch {
            return '';
        }
        return '';
    };
    const userRole = getUserRole();
    const normalizedRole = userRole.toLowerCase().replace(/\s+/g, '_');
    const canViewUtilidades = ['admin', 'super_admin'].includes(normalizedRole);

    // Estados para Utilidades
    const [utilidadesDateFrom, setUtilidadesDateFrom] = useState<string>('');
    const [utilidadesDateTo, setUtilidadesDateTo] = useState<string>('');
    const [utilidadesPaymentFilter, setUtilidadesPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [utilidadesPackages, setUtilidadesPackages] = useState<any[]>([]);
    const [loadingUtilidades, setLoadingUtilidades] = useState(false);

    // ============================================
    // FUNCIONES DE CÁLCULO
    // ============================================

    const calculateCost = (largo_cm: number, ancho_cm: number, alto_cm: number): { volume_raw: number; volume_adjusted: number; cost: number; cost_usd: number } => {
        // Volumen bruto en cm³
        const volume_raw = largo_cm * ancho_cm * alto_cm;
        
        // Convertir cm a pulgadas (÷ 2.54)
        const largo_pulg = largo_cm / 2.54;
        const ancho_pulg = ancho_cm / 2.54;
        const alto_pulg = alto_cm / 2.54;
        
        // Volumen en pulgadas³
        const volume_adjusted = largo_pulg * ancho_pulg * alto_pulg;
        
        // Pie³ = Volumen pulgadas / Divisor
        const pie3 = volume_adjusted / config.dimensional_divisor;
        
        // Costo USD = Pie³ × Tarifa Base
        let cost_usd = pie3 * config.base_rate;
        
        // Costo MXN = USD × TC de API (directo)
        let cost = cost_usd * tcApi;
        
        // Aplicar mínimo si existe
        if (cost < config.min_cost) {
            cost = config.min_cost;
        }
        
        return { volume_raw, volume_adjusted, cost, cost_usd };
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
            const response = await api.get('/pobox/costing/config');
            if (response.data?.config) {
                setConfig(response.data.config);
            }
        } catch (error) {
            console.log('Usando configuración por defecto');
        }
    };

    // Cargar TC de la API (directo, sin sobreprecio)
    const loadTcApi = async () => {
        try {
            const response = await api.get('/admin/exchange-rate-config');
            if (response.data?.configs) {
                const poboxConfig = response.data.configs.find((c: any) => c.servicio === 'pobox_usa');
                if (poboxConfig?.ultimo_tc_api) {
                    setTcApi(parseFloat(poboxConfig.ultimo_tc_api));
                }
            }
        } catch (error) {
            console.log('Usando TC por defecto');
        }
    };

    const loadPackages = async () => {
        setLoading(true);
        setSelectedPackages([]); // Limpiar selección al recargar
        try {
            // Construir query params con filtros
            const params = new URLSearchParams();
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            if (showPaidFilter === 'paid') params.append('paid', 'true');
            if (showPaidFilter === 'unpaid') params.append('paid', 'false');
            
            const response = await api.get(`/pobox/costing/packages?${params.toString()}`);
            if (response.data?.packages) {
                // Usar costo guardado si existe, sino calcular
                const packagesWithCosts = response.data.packages.map((pkg: any) => {
                    const length = parseFloat(pkg.pkg_length) || 0;
                    const width = parseFloat(pkg.pkg_width) || 0;
                    const height = parseFloat(pkg.pkg_height) || 0;
                    
                    // Si tiene costo guardado, usarlo
                    const savedCost = parseFloat(pkg.pobox_service_cost) || 0;
                    const savedCostUsd = parseFloat(pkg.pobox_cost_usd) || 0;
                    const savedTc = parseFloat(pkg.registered_exchange_rate) || 0;
                    
                    // Si no tiene costo guardado, calcularlo
                    let finalCost = savedCost;
                    let costUsd = savedCostUsd;
                    let tcUsado = savedTc || tcApi;
                    
                    if (savedCost === 0 && length > 0 && width > 0 && height > 0) {
                        const { cost, cost_usd } = calculateCost(length, width, height);
                        finalCost = cost;
                        costUsd = cost_usd;
                        tcUsado = tcApi; // TC actual si no tiene guardado
                    }
                    
                    const { volume_raw, volume_adjusted } = calculateCost(length, width, height);
                    
                    return {
                        ...pkg,
                        pkg_length: length,
                        pkg_width: width,
                        pkg_height: height,
                        volume_raw,
                        volume_adjusted,
                        calculated_cost: finalCost,
                        cost_usd: costUsd,
                        tc_registro: tcUsado,
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
            await api.post('/pobox/costing/config', tempConfig);
            setConfig(tempConfig);
            setEditConfigOpen(false);
            loadPackages(); // Recalcular con nueva config
        } catch (error) {
            console.error('Error guardando configuración:', error);
        }
    };

    // ============================================
    // SELECCIÓN Y PAGO
    // ============================================

    const handleSelectPackage = (pkgId: number) => {
        setSelectedPackages(prev => 
            prev.includes(pkgId) 
                ? prev.filter(id => id !== pkgId)
                : [...prev, pkgId]
        );
    };

    const handleSelectAll = () => {
        const unpaidPackages = packages.filter(p => !p.costing_paid);
        if (selectedPackages.length === unpaidPackages.length) {
            setSelectedPackages([]);
        } else {
            setSelectedPackages(unpaidPackages.map(p => p.id));
        }
    };

    const getSelectedTotal = () => {
        return packages
            .filter(p => selectedPackages.includes(p.id))
            .reduce((sum, p) => sum + (parseFloat(String(p.calculated_cost)) || 0), 0);
    };

    const handleMarkAsPaid = async () => {
        if (selectedPackages.length === 0) return;
        
        setProcessingPayment(true);
        try {
            const totalCost = getSelectedTotal();
            await api.post('/pobox/costing/mark-paid', {
                package_ids: selectedPackages,
                total_cost: totalCost,
                payment_reference: paymentReference
            });
            
            setSnackbar({
                open: true,
                message: `✅ ${selectedPackages.length} paquetes marcados como pagados - Total: $${totalCost.toFixed(2)}`,
                severity: 'success'
            });
            
            setPaymentDialogOpen(false);
            setPaymentReference('');
            setSelectedPackages([]);
            loadPackages();
        } catch (error) {
            console.error('Error marcando paquetes como pagados:', error);
            setSnackbar({
                open: true,
                message: '❌ Error al procesar el pago',
                severity: 'error'
            });
        } finally {
            setProcessingPayment(false);
        }
    };

    // ============================================
    // UTILIDADES (solo admin/super_admin)
    // ============================================
    const loadUtilidadesData = async () => {
        if (!canViewUtilidades) return;
        
        setLoadingUtilidades(true);
        try {
            const params = new URLSearchParams();
            if (utilidadesDateFrom) params.append('date_from', utilidadesDateFrom);
            if (utilidadesDateTo) params.append('date_to', utilidadesDateTo);
            if (utilidadesPaymentFilter !== 'all') params.append('payment_status', utilidadesPaymentFilter);
            
            const response = await api.get(`/pobox/costing/utilidades?${params.toString()}`);
            if (response.data?.packages) {
                setUtilidadesPackages(response.data.packages);
            }
        } catch (error) {
            console.error('Error cargando utilidades:', error);
            setSnackbar({
                open: true,
                message: '❌ Error al cargar datos de utilidades',
                severity: 'error'
            });
        } finally {
            setLoadingUtilidades(false);
        }
    };

    // Estadísticas de utilidades
    // COSTO = calculated_cost (lo que nos cobran)
    // PO BOX = sale_price (lo que cobramos)
    // UTILIDAD = PO BOX - COSTO
    const utilidadesStats = {
        totalCosto: utilidadesPackages.reduce((sum, pkg) => sum + (parseFloat(String(pkg.calculated_cost)) || 0), 0),
        totalVenta: utilidadesPackages.reduce((sum, pkg) => {
            const pobox = parseFloat(String(pkg.sale_price)) || 0;
            const gex = parseFloat(String(pkg.gex_total)) || 0;
            return sum + pobox + gex;
        }, 0),
        totalUtilidad: utilidadesPackages.reduce((sum, pkg) => {
            const costo = parseFloat(String(pkg.calculated_cost)) || 0;
            const pobox = parseFloat(String(pkg.sale_price)) || 0;
            return sum + (pobox - costo);
        }, 0),
        totalPobox: utilidadesPackages.reduce((sum, pkg) => sum + (parseFloat(String(pkg.sale_price)) || 0), 0),
        totalGex: utilidadesPackages.reduce((sum, pkg) => sum + (parseFloat(String(pkg.gex_total)) || 0), 0),
    };

    useEffect(() => {
        loadConfig();
        loadTcApi();
        loadPackages();
    }, []);

    // Agregar columnas calculadas (volumen) pero usar el costo guardado en DB
    useEffect(() => {
        if (packages.length > 0) {
            const recalculated = packages.map((pkg) => {
                const { volume_raw, volume_adjusted } = calculateCost(
                    pkg.pkg_length || 0,
                    pkg.pkg_width || 0,
                    pkg.pkg_height || 0
                );
                // IMPORTANTE: Usar el costo guardado en DB (pobox_service_cost), NO recalcular
                // Solo recalcular si no hay costo guardado (compatibilidad hacia atrás)
                const savedCost = parseFloat(String(pkg.pobox_service_cost)) || 0;
                const savedTc = parseFloat(String(pkg.registered_exchange_rate)) || 0;
                
                return { 
                    ...pkg, 
                    volume_raw, 
                    volume_adjusted, 
                    calculated_cost: savedCost > 0 ? savedCost : calculateCost(pkg.pkg_length || 0, pkg.pkg_width || 0, pkg.pkg_height || 0).cost,
                    tc_registro: savedTc > 0 ? savedTc : tcApi
                };
            });
            setPackages(recalculated);
        }
    }, [config, tcApi]);

    // ============================================
    // ESTADÍSTICAS
    // ============================================

    const unpaidPackages = packages.filter(p => !p.costing_paid);
    
    const stats = {
        totalPackages: packages.length,
        totalCost: packages.reduce((sum, pkg) => sum + (parseFloat(String(pkg.calculated_cost)) || 0), 0),
        avgCost: packages.length > 0 
            ? packages.reduce((sum, pkg) => sum + (parseFloat(String(pkg.calculated_cost)) || 0), 0) / packages.length 
            : 0,
        pendingPayment: unpaidPackages.length,
        selectedCount: selectedPackages.length,
        selectedTotal: getSelectedTotal(),
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
                    1. cm → pulgadas (÷ 2.54) → L × A × H (pulg) ÷ {config.dimensional_divisor.toLocaleString()} = Pie³
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    2. Pie³ × ${config.base_rate} USD × TC API ${tcApi.toFixed(2)} = Costo MXN
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
                                ${Number(stats.totalCost).toFixed(2)}
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
                                ${Number(stats.avgCost).toFixed(2)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ bgcolor: 'info.light', color: 'info.contrastText' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PaymentIcon />
                                <Typography variant="subtitle2">Por Pagar</Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.pendingPayment}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Paper sx={{ mb: 3 }}>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                    <Tab label={t('pobox.costing.calculator', '🧮 Calculadora')} />
                    <Tab label={`📦 Paquetes (${stats.pendingPayment} pendientes)`} />
                    <Tab label={t('pobox.costing.history', '📊 Historial')} />
                    {canViewUtilidades && <Tab label="💵 Utilidades" />}
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
                {/* Filtros */}
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Fecha Desde"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                size="small"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Fecha Hasta"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                size="small"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                                fullWidth
                                select
                                label="Estado de Pago"
                                value={showPaidFilter}
                                onChange={(e) => setShowPaidFilter(e.target.value as any)}
                                size="small"
                                SelectProps={{ native: true }}
                            >
                                <option value="all">Todos</option>
                                <option value="unpaid">Sin Pagar</option>
                                <option value="paid">Pagados</option>
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <Button 
                                fullWidth 
                                variant="contained" 
                                onClick={loadPackages}
                                startIcon={<FilterIcon />}
                            >
                                Filtrar
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>

                {/* Barra de acciones de selección */}
                {selectedPackages.length > 0 && (
                    <Alert 
                        severity="info" 
                        sx={{ mb: 2 }}
                        action={
                            <Button 
                                color="success" 
                                variant="contained"
                                size="small"
                                startIcon={<PaymentIcon />}
                                onClick={() => setPaymentDialogOpen(true)}
                            >
                                Registrar Pago (${Number(stats.selectedTotal).toFixed(2)})
                            </Button>
                        }
                    >
                        <strong>{selectedPackages.length}</strong> paquetes seleccionados - 
                        Total: <strong>${Number(stats.selectedTotal).toFixed(2)}</strong>
                    </Alert>
                )}

                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'primary.main' }}>
                                <TableCell padding="checkbox" sx={{ color: 'white' }}>
                                    <Checkbox
                                        sx={{ color: 'white' }}
                                        indeterminate={selectedPackages.length > 0 && selectedPackages.length < unpaidPackages.length}
                                        checked={unpaidPackages.length > 0 && selectedPackages.length === unpaidPackages.length}
                                        onChange={handleSelectAll}
                                    />
                                </TableCell>
                                <TableCell sx={{ color: 'white' }}>Tracking</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Largo</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Ancho</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Alto</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">TC</TableCell>
                                <TableCell sx={{ color: 'white' }} align="right">Costo</TableCell>
                                <TableCell sx={{ color: 'white' }} align="center">Pago</TableCell>
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
                                    <TableRow 
                                        key={pkg.id} 
                                        hover
                                        selected={selectedPackages.includes(pkg.id)}
                                        sx={{ 
                                            bgcolor: pkg.costing_paid ? 'success.50' : 'inherit',
                                            '&.Mui-selected': { bgcolor: 'primary.50' }
                                        }}
                                    >
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                checked={selectedPackages.includes(pkg.id)}
                                                onChange={() => handleSelectPackage(pkg.id)}
                                                disabled={pkg.costing_paid}
                                            />
                                        </TableCell>
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
                                            {pkg.pkg_length ? Number(pkg.pkg_length).toFixed(1) : '-'} cm
                                        </TableCell>
                                        <TableCell align="center">
                                            {pkg.pkg_width ? Number(pkg.pkg_width).toFixed(1) : '-'} cm
                                        </TableCell>
                                        <TableCell align="center">
                                            {pkg.pkg_height ? Number(pkg.pkg_height).toFixed(1) : '-'} cm
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="body2" color="text.secondary">
                                                ${pkg.tc_registro ? Number(pkg.tc_registro).toFixed(2) : tcApi.toFixed(2)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`$${pkg.calculated_cost ? Number(pkg.calculated_cost).toFixed(2) : '0.00'}`}
                                                color="success"
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            {pkg.costing_paid ? (
                                                <Chip
                                                    icon={<CheckCircleIcon />}
                                                    label="Pagado"
                                                    color="success"
                                                    size="small"
                                                />
                                            ) : (
                                                <Chip
                                                    label="Pendiente"
                                                    color="warning"
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            )}
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

            {/* Tab: Utilidades (solo admin/super_admin) */}
            {canViewUtilidades && (
                <TabPanel value={activeTab} index={3}>
                    {/* Filtros */}
                    <Paper sx={{ p: 2, mb: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    fullWidth
                                    type="date"
                                    label="Fecha Desde"
                                    value={utilidadesDateFrom}
                                    onChange={(e) => setUtilidadesDateFrom(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    size="small"
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    fullWidth
                                    type="date"
                                    label="Fecha Hasta"
                                    value={utilidadesDateTo}
                                    onChange={(e) => setUtilidadesDateTo(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    size="small"
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Estado de Pago</InputLabel>
                                    <Select
                                        value={utilidadesPaymentFilter}
                                        label="Estado de Pago"
                                        onChange={(e) => setUtilidadesPaymentFilter(e.target.value as any)}
                                    >
                                        <MenuItem value="all">Todos</MenuItem>
                                        <MenuItem value="paid">Pagados</MenuItem>
                                        <MenuItem value="unpaid">Sin Pagar</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <Button 
                                    fullWidth 
                                    variant="contained" 
                                    onClick={loadUtilidadesData}
                                    startIcon={<FilterIcon />}
                                >
                                    Filtrar
                                </Button>
                            </Grid>
                        </Grid>
                    </Paper>

                    {/* Cards de Resumen */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <Card sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
                                <CardContent>
                                    <Typography variant="subtitle2">Total Costo</Typography>
                                    <Typography variant="h4" fontWeight="bold">
                                        ${Number(utilidadesStats.totalCosto).toFixed(2)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                                <CardContent>
                                    <Typography variant="subtitle2">Total Venta</Typography>
                                    <Typography variant="h4" fontWeight="bold">
                                        ${Number(utilidadesStats.totalVenta).toFixed(2)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <Card sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
                                <CardContent>
                                    <Typography variant="subtitle2">Utilidad Total</Typography>
                                    <Typography variant="h4" fontWeight="bold">
                                        ${Number(utilidadesStats.totalUtilidad).toFixed(2)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Tabla de Utilidades */}
                    <TableContainer component={Paper}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'primary.main' }}>
                                    <TableCell sx={{ color: 'white' }}>Guía</TableCell>
                                    <TableCell sx={{ color: 'white' }}>Cliente</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">Costo</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">PO Box</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">GEX</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">Costo de Venta</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="right">Utilidad</TableCell>
                                    <TableCell sx={{ color: 'white' }} align="center">Estado</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loadingUtilidades ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                                            <CircularProgress />
                                        </TableCell>
                                    </TableRow>
                                ) : utilidadesPackages.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                                            <Typography color="text.secondary">
                                                {activeTab === 3 ? 'Presiona "Filtrar" para cargar los datos' : 'No hay datos para mostrar'}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    utilidadesPackages.map((pkg) => {
                                        // COSTO = lo que nos cuesta (pobox_service_cost)
                                        const costo = parseFloat(String(pkg.calculated_cost)) || 0;
                                        // GEX = costo adicional de garantía
                                        const gexTotal = parseFloat(String(pkg.gex_total)) || 0;
                                        // Envío nacional (paquetería) - NO se incluye en utilidad
                                        const envioNacional = parseFloat(String(pkg.national_shipping)) || 0;
                                        // Total cobrado al cliente (incluye envío)
                                        const totalCobrado = parseFloat(String(pkg.sale_price)) || 0;
                                        // COSTO DE VENTA = Total - Envío Nacional (solo PO Box + GEX)
                                        const costoVenta = totalCobrado - envioNacional;
                                        // PO BOX = Costo de venta SIN GEX (precio PO Box puro)
                                        const pobox = costoVenta - gexTotal;
                                        // UTILIDAD = Costo de venta - Costo (sin contar envío nacional)
                                        const utilidad = costoVenta - costo;
                                        
                                        return (
                                            <TableRow key={pkg.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {pkg.tracking}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2">
                                                        {pkg.client_name || pkg.user_name || '-'}
                                                    </Typography>
                                                </TableCell>
                                                {/* COSTO = lo que nos cobran */}
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="error.main" fontWeight="medium">
                                                        ${costo.toFixed(2)}
                                                    </Typography>
                                                </TableCell>
                                                {/* PO BOX = lo que cobramos */}
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="text.secondary">
                                                        ${pobox.toFixed(2)}
                                                    </Typography>
                                                </TableCell>
                                                {/* Desglose: GEX */}
                                                <TableCell align="right">
                                                    <Tooltip title={gexTotal > 0 ? `5% Asegurado: $${parseFloat(pkg.gex_insurance || '0').toFixed(2)} + Fijo: $${parseFloat(pkg.gex_fixed || '0').toFixed(2)}` : 'Sin GEX'}>
                                                        <Typography variant="body2" color={gexTotal > 0 ? 'info.main' : 'text.disabled'}>
                                                            ${gexTotal.toFixed(2)}
                                                        </Typography>
                                                    </Tooltip>
                                                </TableCell>
                                                {/* Costo de Venta */}
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="primary.main" fontWeight="medium">
                                                        ${costoVenta.toFixed(2)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Chip
                                                        label={`$${utilidad.toFixed(2)}`}
                                                        color={utilidad >= 0 ? 'success' : 'error'}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    {pkg.client_paid ? (
                                                        <Chip
                                                            icon={<CheckCircleIcon />}
                                                            label="Cobrado"
                                                            color="success"
                                                            size="small"
                                                        />
                                                    ) : (
                                                        <Chip
                                                            label="Por Cobrar"
                                                            color="error"
                                                            size="small"
                                                        />
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>
            )}

            {/* Dialog: Configuración */}
            <Dialog open={editConfigOpen} onClose={() => setEditConfigOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SettingsIcon />
                        {t('pobox.costing.configTitle', 'Configuración de Costeo')}
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    <Alert severity="info" sx={{ mb: 3 }}>
                        <Typography variant="body2">
                            <strong>TC API:</strong> ${tcApi.toFixed(2)} MXN (obtenido de Banxico/ExchangeRate-API)
                        </Typography>
                    </Alert>
                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label="Factor cm → pulgadas"
                                type="number"
                                value={2.54}
                                helperText="Fijo: dividir cm entre 2.54"
                                disabled
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label={t('pobox.costing.divisor', 'Divisor Dimensional')}
                                type="number"
                                value={tempConfig.dimensional_divisor}
                                onChange={(e) => setTempConfig({ ...tempConfig, dimensional_divisor: parseFloat(e.target.value) || 1 })}
                                helperText="Divisor para calcular pie³ (10,780)"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label="Tarifa Base (USD/pie³)"
                                type="number"
                                value={tempConfig.base_rate}
                                onChange={(e) => setTempConfig({ ...tempConfig, base_rate: parseFloat(e.target.value) || 0 })}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                }}
                                helperText="Precio por pie cúbico en USD ($75)"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label={t('pobox.costing.minCost', 'Costo Mínimo MXN')}
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

                    <Alert severity="success" sx={{ mt: 3 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            1. (L×A×H cm) ÷ 2.54 = Volumen pulg³
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            2. Vol pulg³ ÷ {tempConfig.dimensional_divisor.toLocaleString()} = Pie³
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            3. Pie³ × ${tempConfig.base_rate} USD × TC API ${tcApi.toFixed(2)} = MXN
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

            {/* Dialog: Confirmar Pago */}
            <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PaymentIcon color="success" />
                        Registrar Pago de Paquetes
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    <Alert severity="info" sx={{ mb: 3 }}>
                        <Typography variant="body2">
                            Se marcarán <strong>{selectedPackages.length} paquetes</strong> como pagados
                        </Typography>
                    </Alert>
                    
                    <Box sx={{ bgcolor: 'success.50', p: 3, borderRadius: 2, textAlign: 'center', mb: 3 }}>
                        <Typography variant="h6" color="text.secondary">
                            Total a Pagar
                        </Typography>
                        <Typography variant="h3" fontWeight="bold" color="success.main">
                            ${stats.selectedTotal.toFixed(2)}
                        </Typography>
                    </Box>
                    
                    <TextField
                        fullWidth
                        label="Referencia de Pago (opcional)"
                        placeholder="Ej: Transferencia #12345, Efectivo, etc."
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        helperText="Ingresa un número de referencia o nota para identificar este pago"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPaymentDialogOpen(false)} disabled={processingPayment}>
                        Cancelar
                    </Button>
                    <Button 
                        variant="contained" 
                        color="success"
                        startIcon={processingPayment ? <CircularProgress size={20} /> : <CheckCircleIcon />}
                        onClick={handleMarkAsPaid}
                        disabled={processingPayment}
                    >
                        {processingPayment ? 'Procesando...' : 'Confirmar Pago'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar de notificaciones */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert 
                    onClose={() => setSnackbar({ ...snackbar, open: false })} 
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
