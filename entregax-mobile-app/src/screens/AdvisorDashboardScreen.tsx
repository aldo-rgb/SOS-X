// ============================================
// ADVISOR DASHBOARD SCREEN
// Panel principal del asesor con estadísticas
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Share,
  Alert,
  Clipboard,
  Modal,
  StatusBar,
  Image,
} from 'react-native';
import {
  Text,
  Avatar,
  ActivityIndicator,
  Chip,
  Divider,
  Surface,
  Appbar,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';
import { changeLanguage, getCurrentLanguage } from '../i18n';

const { width } = Dimensions.get('window');
const ORANGE = '#F05A28';
const BLACK = '#111111';

interface AdvisorDashboardData {
  advisor: {
    id: number;
    fullName: string;
    email: string;
    referralCode: string;
    boxId: string;
    role: string;
    joinedAt: string;
  };
  clients: {
    total: number;
    new7d: number;
    new30d: number;
    verified: number;
    pendingVerification: number;
    active: number;
    dormant: number;
  };
  shipments: {
    inTransit: number;
    awaitingPayment: number;
    missingInstructions: number;
  };
  commissions: {
    monthVolumeMxn: number;
    monthPaidCount: number;
  };
  subAdvisors: number;
}

// Helper para obtener bandera del idioma
const getLanguageFlag = (lang: string) => {
  switch (lang) {
    case 'es': return '🇲🇽';
    case 'en': return '🇺🇸';
    case 'zh': return '🇨🇳';
    default: return '🇲🇽';
  }
};

export default function AdvisorDashboardScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AdvisorDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/api/advisor/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        throw new Error('Error al cargar datos');
      }
      
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      console.error('Error loading advisor dashboard:', err);
      setError(err.message || 'Error al cargar el dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const copyReferralCode = () => {
    if (data?.advisor.referralCode) {
      Clipboard.setString(data.advisor.referralCode);
      Alert.alert('✅ Copiado', 'Código de referido copiado al portapapeles');
    }
  };

  const shareReferralCode = async () => {
    if (data?.advisor.referralCode) {
      try {
        await Share.share({
          message: `¡Únete a EntregaX con mi código ${data.advisor.referralCode} y obtén beneficios exclusivos! 📦✈️ Descarga la app: https://entregax.com/app`,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    }
  };

  const handleChangeLanguage = async (lang: string) => {
    await changeLanguage(lang);
    setCurrentLang(lang);
    setShowLanguageModal(false);
  };

  const handleLogout = () => {
    setShowMenu(false);
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Cerrar Sesión', 
          style: 'destructive',
          onPress: () => navigation.replace('Login')
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={styles.loadingText}>Cargando dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="warning-outline" size={48} color="#f44336" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadDashboard}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) return null;

  const stats = [
    { label: 'Total Clientes', value: data.clients.total, icon: 'people', color: ORANGE },
    { label: 'Nuevos (7d)', value: data.clients.new7d, icon: 'person-add', color: '#4CAF50' },
    { label: 'Activos', value: data.clients.active, icon: 'checkmark-circle', color: '#2196F3' },
    { label: 'Dormidos', value: data.clients.dormant, icon: 'moon', color: '#9E9E9E' },
  ];

  const shipmentStats = [
    { label: 'En Tránsito', value: data.shipments.inTransit, icon: 'airplane', color: '#2196F3' },
    { label: 'Por Pagar', value: data.shipments.awaitingPayment, icon: 'card', color: '#FF9800' },
    { label: 'Sin Instruc.', value: data.shipments.missingInstructions, icon: 'alert-circle', color: '#f44336' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      
      {/* Header con Logo */}
      <Appbar.Header style={styles.appbar}>
        <View style={{ paddingLeft: 16, justifyContent: 'center' }}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={{ width: 120, height: 36, resizeMode: 'contain' }}
          />
        </View>
        <View style={{ flex: 1 }} />
        
        {/* Botón de Idioma */}
        <TouchableOpacity 
          onPress={() => setShowLanguageModal(true)}
          style={styles.languageButton}
        >
          <Text style={styles.languageFlag}>{getLanguageFlag(currentLang)}</Text>
        </TouchableOpacity>
        
        {/* Avatar con Menú */}
        <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.avatarButton}>
          <Avatar.Text 
            size={36} 
            label={(data.advisor.fullName || user.name || 'U').substring(0, 2).toUpperCase()} 
            style={{ backgroundColor: ORANGE }}
          />
        </TouchableOpacity>
      </Appbar.Header>

      {/* Modal de Idioma */}
      <Modal visible={showLanguageModal} animationType="fade" transparent>
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setShowLanguageModal(false)}
        >
          <View style={styles.languageModalContainer}>
            <Text style={styles.languageModalTitle}>Seleccionar Idioma</Text>
            <Divider style={{ marginVertical: 10 }} />
            
            <TouchableOpacity 
              style={[styles.languageOption, currentLang === 'es' && styles.languageOptionActive]}
              onPress={() => handleChangeLanguage('es')}
            >
              <Text style={styles.languageOptionFlag}>🇲🇽</Text>
              <Text style={[styles.languageOptionText, currentLang === 'es' && styles.languageOptionTextActive]}>
                Español
              </Text>
              {currentLang === 'es' && <Ionicons name="checkmark" size={20} color={ORANGE} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.languageOption, currentLang === 'en' && styles.languageOptionActive]}
              onPress={() => handleChangeLanguage('en')}
            >
              <Text style={styles.languageOptionFlag}>🇺🇸</Text>
              <Text style={[styles.languageOptionText, currentLang === 'en' && styles.languageOptionTextActive]}>
                English
              </Text>
              {currentLang === 'en' && <Ionicons name="checkmark" size={20} color={ORANGE} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.languageOption, currentLang === 'zh' && styles.languageOptionActive]}
              onPress={() => handleChangeLanguage('zh')}
            >
              <Text style={styles.languageOptionFlag}>🇨🇳</Text>
              <Text style={[styles.languageOptionText, currentLang === 'zh' && styles.languageOptionTextActive]}>
                中文
              </Text>
              {currentLang === 'zh' && <Ionicons name="checkmark" size={20} color={ORANGE} />}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal de Menú de Usuario */}
      <Modal visible={showMenu} animationType="fade" transparent>
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            {/* Header del menú */}
            <View style={styles.menuHeader}>
              <Avatar.Text 
                size={50} 
                label={(data.advisor.fullName || user.name || 'U').substring(0, 2).toUpperCase()} 
                style={{ backgroundColor: ORANGE }}
              />
              <View style={styles.menuUserInfo}>
                <Text style={styles.menuUserName}>{data.advisor.fullName || user.name}</Text>
                <Text style={styles.menuUserEmail}>{data.advisor.email || user.email}</Text>
                <Chip 
                  mode="flat" 
                  textStyle={{ fontSize: 10, color: ORANGE }}
                  style={{ backgroundColor: '#FFF3E0', height: 22, marginTop: 4 }}
                >
                  💼 Asesor
                </Chip>
              </View>
            </View>
            
            <Divider style={{ marginVertical: 8 }} />
            
            {/* Opciones del menú */}
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyProfile', { user, token });
              }}
            >
              <Ionicons name="person-outline" size={22} color="#333" />
              <Text style={styles.menuItemText}>Mi Perfil</Text>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('Verification', { user, token });
              }}
            >
              <Ionicons name="shield-checkmark-outline" size={22} color="#333" />
              <Text style={styles.menuItemText}>Verificación</Text>
              {!user.isVerified && (
                <View style={styles.menuBadge}>
                  <Text style={styles.menuBadgeText}>Pendiente</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('HelpCenter', { user, token });
              }}
            >
              <Ionicons name="help-circle-outline" size={22} color="#333" />
              <Text style={styles.menuItemText}>Centro de Ayuda</Text>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <Divider style={{ marginVertical: 8 }} />

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={22} color="#f44336" />
              <Text style={[styles.menuItemText, { color: '#f44336' }]}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Card */}
        <Surface style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>
            👋 ¡Hola, {(data.advisor.fullName || user.name || '').split(' ')[0]}!
          </Text>
          <Text style={styles.welcomeSubtext}>
            Panel de Asesor • {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </Surface>

        {/* Referral Code Card */}
        <Surface style={styles.referralCard}>
          <View style={styles.referralHeader}>
            <Ionicons name="gift-outline" size={24} color={ORANGE} />
            <Text style={styles.referralLabel}>Tu Código de Referido</Text>
          </View>
          <Text style={styles.referralCode}>{data.advisor.referralCode || 'Sin código'}</Text>
          <View style={styles.referralActions}>
            <TouchableOpacity style={styles.referralButton} onPress={copyReferralCode}>
              <Ionicons name="copy-outline" size={20} color="#fff" />
              <Text style={styles.referralButtonText}>Copiar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.referralButton, styles.shareButton]} onPress={shareReferralCode}>
              <Ionicons name="share-social-outline" size={20} color={ORANGE} />
              <Text style={[styles.referralButtonText, { color: ORANGE }]}>Compartir</Text>
            </TouchableOpacity>
          </View>
        </Surface>

        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>👥 Mis Clientes</Text>
        <View style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <TouchableOpacity 
              key={index} 
              style={styles.statCard}
              onPress={() => navigation.navigate('AdvisorClients', { user, token })}
            >
              <Ionicons name={stat.icon as any} size={24} color={stat.color} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Shipments Stats */}
        <Text style={styles.sectionTitle}>📦 Embarques de Clientes</Text>
        <View style={styles.shipmentStats}>
          {shipmentStats.map((stat, index) => (
            <View key={index} style={styles.shipmentStatItem}>
              <View style={[styles.shipmentIcon, { backgroundColor: stat.color + '20' }]}>
                <Ionicons name={stat.icon as any} size={20} color={stat.color} />
              </View>
              <Text style={styles.shipmentValue}>{stat.value}</Text>
              <Text style={styles.shipmentLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Commissions Card */}
        <Text style={styles.sectionTitle}>💰 Comisiones del Mes</Text>
        <Surface style={styles.commissionsCard}>
          <View style={styles.commissionRow}>
            <View>
              <Text style={styles.commissionLabel}>Volumen Facturado</Text>
              <Text style={styles.commissionValue}>
                ${data.commissions.monthVolumeMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </Text>
            </View>
            <Chip icon="receipt" mode="outlined" textStyle={{ color: ORANGE }}>
              {data.commissions.monthPaidCount} pagos
            </Chip>
          </View>
          <TouchableOpacity 
            style={styles.viewCommissionsButton}
            onPress={() => navigation.navigate('AdvisorCommissions', { user, token })}
          >
            <Text style={styles.viewCommissionsText}>Ver Historial de Comisiones</Text>
            <Ionicons name="chevron-forward" size={20} color={ORANGE} />
          </TouchableOpacity>
        </Surface>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>⚡ Acciones Rápidas</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.quickAction}
            onPress={() => navigation.navigate('AdvisorClients', { user, token })}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: ORANGE + '20' }]}>
              <Ionicons name="people" size={24} color={ORANGE} />
            </View>
            <Text style={styles.quickActionText}>Mis Clientes</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickAction}
            onPress={() => navigation.navigate('AdvisorCommissions', { user, token })}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#4CAF50' + '20' }]}>
              <Ionicons name="cash" size={24} color="#4CAF50" />
            </View>
            <Text style={styles.quickActionText}>Comisiones</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickAction}
            onPress={shareReferralCode}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#2196F3' + '20' }]}>
              <Ionicons name="share-social" size={24} color="#2196F3" />
            </View>
            <Text style={styles.quickActionText}>Referir</Text>
          </TouchableOpacity>
          
          {data.subAdvisors > 0 && (
            <TouchableOpacity 
              style={styles.quickAction}
              onPress={() => navigation.navigate('AdvisorTeam', { user, token })}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#9C27B0' + '20' }]}>
                <Ionicons name="people-circle" size={24} color="#9C27B0" />
              </View>
              <Text style={styles.quickActionText}>Mi Equipo ({data.subAdvisors})</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Pending Verification Alert */}
        {data.clients.pendingVerification > 0 && (
          <Surface style={styles.alertCard}>
            <Ionicons name="alert-circle" size={24} color="#FF9800" />
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Clientes Pendientes</Text>
              <Text style={styles.alertText}>
                {data.clients.pendingVerification} cliente(s) esperan verificación
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => navigation.navigate('AdvisorClients', { user, token, filter: 'pending' })}
            >
              <Ionicons name="chevron-forward" size={24} color="#666" />
            </TouchableOpacity>
          </Surface>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
  },
  errorText: {
    marginTop: 12,
    color: '#f44336',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: ORANGE,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#111',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  referralCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  referralLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  referralCode: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  referralActions: {
    flexDirection: 'row',
    gap: 12,
  },
  referralButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  shareButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: ORANGE,
  },
  referralButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: (width - 44) / 2,
    alignItems: 'center',
    elevation: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  shipmentStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 1,
  },
  shipmentStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  shipmentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  shipmentValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  shipmentLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  commissionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 1,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  commissionLabel: {
    fontSize: 12,
    color: '#666',
  },
  commissionValue: {
    fontSize: 24,
    fontWeight: '800',
    color: ORANGE,
    marginTop: 4,
  },
  viewCommissionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  viewCommissionsText: {
    color: ORANGE,
    fontWeight: '600',
    fontSize: 14,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  quickAction: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: (width - 44) / 2,
    elevation: 1,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 1,
  },
  alertContent: {
    flex: 1,
    marginLeft: 12,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
  },
  alertText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  // Header styles
  appbar: {
    backgroundColor: BLACK,
    elevation: 4,
  },
  languageButton: {
    padding: 8,
    marginRight: 4,
  },
  languageFlag: {
    fontSize: 22,
  },
  avatarButton: {
    marginRight: 12,
  },
  welcomeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  welcomeSubtext: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  // Modal styles
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 16,
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: 280,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  menuUserInfo: {
    marginLeft: 12,
    flex: 1,
  },
  menuUserName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  menuUserEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  menuBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  menuBadgeText: {
    fontSize: 10,
    color: '#E65100',
    fontWeight: '600',
  },
  languageModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: 260,
    elevation: 8,
  },
  languageModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 2,
  },
  languageOptionActive: {
    backgroundColor: '#FFF3E0',
  },
  languageOptionFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  languageOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  languageOptionTextActive: {
    color: ORANGE,
    fontWeight: '600',
  },
});
