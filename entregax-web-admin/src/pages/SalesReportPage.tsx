import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  Button,
  Tooltip,
  IconButton,
  CircularProgress,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Card,
  CardContent,
  Collapse,
  type SelectChangeEvent,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import PeopleIcon from '@mui/icons-material/People';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

const API_URL = 'http://localhost:3001/api';

interface SalesData {
  advisor_id: number;
  advisor_name: string;
  team_leader_id: number | null;
  team_leader_name: string | null;
  total_shipments: number;
  total_revenue: string;
  air_shipments: number;
  sea_shipments: number;
  consolidation_shipments: number;
  completed_shipments: number;
  avg_revenue_per_shipment: string;
}

interface ChurnData {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  advisor_name: string | null;
  days_inactive: number;
  recovery_status: string | null;
  last_transaction_date: string | null;
  registered_at: string;
}

interface TeamLeader {
  id: number;
  full_name: string;
}

interface ServiceStats {
  service_type: string;
  count: number;
  revenue: string;
}

export default function SalesReportPage() {
  const { t } = useTranslation();
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Sales Report State
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [serviceStats, setServiceStats] = useState<ServiceStats[]>([]);
  const [totals, setTotals] = useState({ shipments: 0, revenue: '0', advisors: 0 });
  const [teamLeaders, setTeamLeaders] = useState<TeamLeader[]>([]);
  const [expandedTeams, setExpandedTeams] = useState<number[]>([]);
  
  // Churn Report State
  const [churnData, setChurnData] = useState<ChurnData[]>([]);
  const [churnStats, setChurnStats] = useState({ total: 0, in_recovery: 0, churned: 0 });
  
  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [teamLeaderFilter, setTeamLeaderFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  const getToken = () => localStorage.getItem('token') || '';

  // Fetch Team Leaders
  const fetchTeamLeaders = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/crm/team-leaders`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setTeamLeaders(res.data.data || []);
    } catch (err) {
      console.error('Error fetching team leaders:', err);
    }
  };

  // Fetch Sales Report
  const fetchSalesReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('startDate', startDate);
      params.append('endDate', endDate);
      if (teamLeaderFilter) params.append('teamLeaderId', teamLeaderFilter);
      if (serviceFilter) params.append('serviceType', serviceFilter);

      const res = await axios.get(`${API_URL}/admin/crm/reports/sales?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      setSalesData(res.data.data || []);
      setServiceStats(res.data.serviceStats || []);
      setTotals(res.data.totals || { shipments: 0, revenue: '0', advisors: 0 });
    } catch (err) {
      console.error('Error fetching sales report:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, teamLeaderFilter, serviceFilter]);

  // Fetch Churn Report
  const fetchChurnReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/crm/reports/churn`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      setChurnData(res.data.data || []);
      setChurnStats(res.data.stats || { total: 0, in_recovery: 0, churned: 0 });
    } catch {
      console.error('Error fetching churn report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamLeaders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tabIndex === 0) {
      fetchSalesReport();
    } else {
      fetchChurnReport();
    }
  }, [tabIndex, fetchSalesReport, fetchChurnReport]);

  // Group sales by team leader
  const groupedSales = salesData.reduce((acc, sale) => {
    const teamId = sale.team_leader_id || 0;
    if (!acc[teamId]) {
      acc[teamId] = {
        teamLeader: sale.team_leader_name || t('salesReport.noTeamLeader'),
        teamLeaderId: teamId,
        advisors: [],
        totals: { shipments: 0, revenue: 0 }
      };
    }
    acc[teamId].advisors.push(sale);
    acc[teamId].totals.shipments += sale.total_shipments;
    acc[teamId].totals.revenue += parseFloat(sale.total_revenue || '0');
    return acc;
  }, {} as Record<number, { teamLeader: string; teamLeaderId: number; advisors: SalesData[]; totals: { shipments: number; revenue: number } }>);

  const toggleTeam = (teamId: number) => {
    setExpandedTeams(prev => 
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  // Export to Excel
  const handleExportSales = () => {
    const exportData = salesData.map(s => ({
      'Team Leader': s.team_leader_name || 'Sin asignar',
      'Asesor': s.advisor_name,
      'Envíos Totales': s.total_shipments,
      'Aéreos': s.air_shipments,
      'Marítimos': s.sea_shipments,
      'Consolidaciones': s.consolidation_shipments,
      'Completados': s.completed_shipments,
      'Ingresos Totales': `$${parseFloat(s.total_revenue || '0').toFixed(2)}`,
      'Promedio por Envío': `$${parseFloat(s.avg_revenue_per_shipment || '0').toFixed(2)}`,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Ventas');
    XLSX.writeFile(wb, `reporte_ventas_${startDate}_${endDate}.xlsx`);
  };

  const handleExportChurn = () => {
    const exportData = churnData.map(c => ({
      'Casillero': c.box_id,
      'Cliente': c.full_name,
      'Email': c.email,
      'Asesor': c.advisor_name || 'Sin asesor',
      'Días Inactivo': c.days_inactive,
      'Estado': c.recovery_status || 'N/A',
      'Última Transacción': c.last_transaction_date ? new Date(c.last_transaction_date).toLocaleDateString('es-MX') : 'Nunca',
      'Registro': new Date(c.registered_at).toLocaleDateString('es-MX'),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Churn');
    XLSX.writeFile(wb, `reporte_churn_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {t('salesReport.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('salesReport.subtitle')}
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab 
            icon={<TrendingUpIcon />} 
            iconPosition="start" 
            label={t('salesReport.salesTab')} 
          />
          <Tab 
            icon={<PersonOffIcon />} 
            iconPosition="start" 
            label={t('salesReport.churnTab')} 
          />
        </Tabs>
      </Paper>

      {/* Sales Report Tab */}
      {tabIndex === 0 && (
        <>
          {/* Filters */}
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                type="date"
                label={t('salesReport.startDate')}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                size="small"
                type="date"
                label={t('salesReport.endDate')}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>{t('salesReport.teamLeader')}</InputLabel>
                <Select
                  value={teamLeaderFilter}
                  label={t('salesReport.teamLeader')}
                  onChange={(e: SelectChangeEvent) => setTeamLeaderFilter(e.target.value)}
                >
                  <MenuItem value="">{t('common.all')}</MenuItem>
                  {teamLeaders.map(tl => (
                    <MenuItem key={tl.id} value={String(tl.id)}>{tl.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t('salesReport.service')}</InputLabel>
                <Select
                  value={serviceFilter}
                  label={t('salesReport.service')}
                  onChange={(e: SelectChangeEvent) => setServiceFilter(e.target.value)}
                >
                  <MenuItem value="">{t('common.all')}</MenuItem>
                  <MenuItem value="air">{t('salesReport.air')}</MenuItem>
                  <MenuItem value="sea">{t('salesReport.sea')}</MenuItem>
                  <MenuItem value="consolidation">{t('salesReport.consolidations')}</MenuItem>
                </Select>
              </FormControl>
              <Tooltip title={t('common.refresh')}>
                <IconButton onClick={fetchSalesReport}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={handleExportSales}
              >
                {t('salesReport.exportExcel')}
              </Button>
            </Box>
          </Paper>

          {/* Stats Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <LocalShippingIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                  <Box>
                    <Typography variant="h4" fontWeight={700}>{totals.shipments}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('salesReport.totalShipments')}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <AttachMoneyIcon sx={{ fontSize: 40, color: 'success.main' }} />
                  <Box>
                    <Typography variant="h4" fontWeight={700}>{formatCurrency(totals.revenue)}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('salesReport.totalRevenue')}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PeopleIcon sx={{ fontSize: 40, color: 'info.main' }} />
                  <Box>
                    <Typography variant="h4" fontWeight={700}>{totals.advisors}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('salesReport.activeAdvisors')}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Service Stats */}
          {serviceStats.length > 0 && (
            <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
              <Typography variant="subtitle2" gutterBottom>{t('salesReport.service')}</Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {serviceStats.map(stat => (
                  <Chip
                    key={stat.service_type}
                    label={`${stat.service_type}: ${stat.count} - ${formatCurrency(stat.revenue)}`}
                    color={stat.service_type === 'air' ? 'primary' : stat.service_type === 'sea' ? 'info' : 'secondary'}
                  />
                ))}
              </Box>
            </Paper>
          )}

          {/* Grouped Sales Table */}
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : Object.keys(groupedSales).length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">{t('salesReport.noDataForPeriod')}</Typography>
              </Box>
            ) : (
              Object.values(groupedSales).map(team => (
                <Box key={team.teamLeaderId}>
                  {/* Team Leader Header */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 2,
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'primary.dark' }
                    }}
                    onClick={() => toggleTeam(team.teamLeaderId)}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {expandedTeams.includes(team.teamLeaderId) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      <Typography variant="subtitle1" fontWeight={600}>
                        {team.teamLeader}
                      </Typography>
                      <Chip 
                        label={`${team.advisors.length} ${t('salesReport.advisor').toLowerCase()}s`} 
                        size="small" 
                        sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 3 }}>
                      <Typography variant="body2">
                        <strong>{team.totals.shipments}</strong> {t('salesReport.shipments').toLowerCase()}
                      </Typography>
                      <Typography variant="body2">
                        <strong>{formatCurrency(team.totals.revenue)}</strong>
                      </Typography>
                    </Box>
                  </Box>

                  {/* Advisors Table */}
                  <Collapse in={expandedTeams.includes(team.teamLeaderId)}>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                            <TableCell><strong>{t('salesReport.advisor')}</strong></TableCell>
                            <TableCell align="center"><strong>{t('salesReport.shipments')}</strong></TableCell>
                            <TableCell align="center"><strong>{t('salesReport.air')}</strong></TableCell>
                            <TableCell align="center"><strong>{t('salesReport.sea')}</strong></TableCell>
                            <TableCell align="center"><strong>{t('salesReport.consolidations')}</strong></TableCell>
                            <TableCell align="center"><strong>{t('salesReport.completed')}</strong></TableCell>
                            <TableCell align="right"><strong>{t('salesReport.revenue')}</strong></TableCell>
                            <TableCell align="right"><strong>{t('salesReport.avgPerShipment')}</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {team.advisors.map(advisor => (
                            <TableRow key={advisor.advisor_id} hover>
                              <TableCell>{advisor.advisor_name}</TableCell>
                              <TableCell align="center">
                                <Chip label={advisor.total_shipments} size="small" color="primary" />
                              </TableCell>
                              <TableCell align="center">{advisor.air_shipments}</TableCell>
                              <TableCell align="center">{advisor.sea_shipments}</TableCell>
                              <TableCell align="center">{advisor.consolidation_shipments}</TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={advisor.completed_shipments} 
                                  size="small" 
                                  color="success" 
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" fontWeight={500} color="success.main">
                                  {formatCurrency(advisor.total_revenue)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" color="text.secondary">
                                  {formatCurrency(advisor.avg_revenue_per_shipment)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Collapse>
                </Box>
              ))
            )}
          </Paper>
        </>
      )}

      {/* Churn Report Tab */}
      {tabIndex === 1 && (
        <>
          {/* Stats Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PersonOffIcon sx={{ fontSize: 40, color: 'warning.main' }} />
                  <Box>
                    <Typography variant="h4" fontWeight={700}>{churnStats.total}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('salesReport.clientsAtRisk')}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card sx={{ bgcolor: 'warning.light' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TrendingDownIcon sx={{ fontSize: 40, color: 'warning.dark' }} />
                  <Box>
                    <Typography variant="h4" fontWeight={700}>{churnStats.in_recovery}</Typography>
                    <Typography variant="body2">{t('salesReport.inRecovery')}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card sx={{ bgcolor: 'error.light' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PersonOffIcon sx={{ fontSize: 40, color: 'error.dark' }} />
                  <Box>
                    <Typography variant="h4" fontWeight={700}>{churnStats.churned}</Typography>
                    <Typography variant="body2">{t('salesReport.churned')}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Controls */}
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Tooltip title={t('common.refresh')}>
                <IconButton onClick={fetchChurnReport}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={handleExportChurn}
              >
                {t('salesReport.exportExcel')}
              </Button>
            </Box>
          </Paper>

          {/* Churn Table */}
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.03)' }}>
                    <TableCell><strong>{t('salesReport.mailbox')}</strong></TableCell>
                    <TableCell><strong>{t('salesReport.client')}</strong></TableCell>
                    <TableCell><strong>{t('salesReport.advisor')}</strong></TableCell>
                    <TableCell align="center"><strong>{t('salesReport.daysInactive')}</strong></TableCell>
                    <TableCell><strong>{t('salesReport.lastTransaction')}</strong></TableCell>
                    <TableCell><strong>{t('salesReport.status')}</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={40} />
                      </TableCell>
                    </TableRow>
                  ) : churnData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">{t('salesReport.noDataForPeriod')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    churnData.map(client => (
                      <TableRow 
                        key={client.id}
                        sx={{
                          bgcolor: client.recovery_status === 'churned' ? 'rgba(211, 47, 47, 0.05)' :
                                   client.days_inactive >= 90 ? 'rgba(255, 152, 0, 0.1)' : 'transparent'
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{client.box_id}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{client.full_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{client.email}</Typography>
                        </TableCell>
                        <TableCell>{client.advisor_name || '-'}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={`${client.days_inactive} ${t('salesReport.days')}`}
                            size="small"
                            color={client.days_inactive >= 105 ? 'error' : client.days_inactive >= 90 ? 'warning' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          {client.last_transaction_date 
                            ? new Date(client.last_transaction_date).toLocaleDateString('es-MX')
                            : <Chip label={t('salesReport.never')} size="small" color="error" variant="outlined" />
                          }
                        </TableCell>
                        <TableCell>
                          {client.recovery_status === 'in_recovery' && (
                            <Chip label={t('salesReport.inRecovery')} size="small" color="warning" />
                          )}
                          {client.recovery_status === 'churned' && (
                            <Chip label={t('salesReport.churned')} size="small" color="error" />
                          )}
                          {!client.recovery_status && (
                            <Chip label={t('salesReport.noStatus')} size="small" variant="outlined" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
}
