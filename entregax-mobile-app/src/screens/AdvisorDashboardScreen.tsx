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
  Linking,
  Modal,
  StatusBar,
  Image,
  TextInput,
} from 'react-native';
import { Text, Avatar, ActivityIndicator, Chip, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';
import { changeLanguage, getCurrentLanguage } from '../i18n';
import { registerForPushNotifications, subscribeNotificationListeners } from '../services/pushClient';

const { width } = Dimensions.get('window');
const ORANGE  = '#F05A28';
const BLACK   = '#111111';
const RED     = '#C62828';
const CARD_BG = '#FFFFFF';
const BG      = '#F4F4F6';
const TEXT    = '#111111';
const SUBTEXT = '#666666';

interface AdvisorDashboardData {
  advisor: {
    id: number; fullName: string; email: string;
    referralCode: string; boxId: string; role: string; joinedAt: string;
    canRecovery: boolean;
  };
  clients: {
    total: number; new7d: number; new30d: number;
    verified: number; pendingVerification: number; active: number; dormant: number;
  };
  shipments: {
    inTransit: number; awaitingPayment: number;
    missingInstructions: number; unidentifiedPackages: number;
  };
  commissions: { monthVolumeMxn: number; monthPaidCount: number; monthCommissionMxn: number; };
  subAdvisors: number;
}

const getLanguageFlag = (lang: string) => {
  switch (lang) {
    case 'es': return '🇲🇽';
    case 'en': return '🇺🇸';
    case 'zh': return '🇨🇳';
    default:   return '🇲🇽';
  }
};

export default function AdvisorDashboardScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const { t } = useTranslation();
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [data, setData]                 = useState<AdvisorDashboardData | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [showMenu, setShowMenu]         = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [currentLang, setCurrentLang]   = useState(getCurrentLanguage());
  const [hideCommission, setHideCommission] = useState(false);
  const [unreadNotif, setUnreadNotif]   = useState(0);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(user.profilePhotoUrl || null);
  const [showQrModal, setShowQrModal]   = useState(false);

  // Modal selector de cliente (En Tránsito)
  const [showTransitModal, setShowTransitModal]     = useState(false);
  const [transitClientsLoading, setTransitClientsLoading] = useState(false);
  const [transitClients, setTransitClients]         = useState<{ id: number; name: string; boxId: string }[]>([]);
  const [transitClientSearch, setTransitClientSearch] = useState('');

  // 📊 KPIs (tarifas y TC) para asesores
  const [rates, setRates] = useState<{
    precio_tdi_aereo_usd: number | null;
    precio_tdi_express_usd: number | null;
    tc_envio_dinero: number | null;
    tc_operativo: number | null;
  } | null>(null);

  // Reactivación de Clientes (Chartback)
  interface ActivityEntry { ts: string; type: string; advisor: string; note?: string; callback_at?: string; asesor?: string; }
  interface ChartbackClient { id: number; box_id: string; full_name: string | null; email: string | null; phone: string | null; asesor: string | null; chartback_status: string | null; next_contact_at: string | null; chartback_activity: ActivityEntry[] | null; chartback_notes: string | null; }
  const [chartbackClients, setChartbackClients] = useState<ChartbackClient[]>([]);
  const [chartbackLoading, setChartbackLoading] = useState(false);
  const [showChartbackModal, setShowChartbackModal] = useState(false);
  const [chartbackSearch, setChartbackSearch] = useState('');
  const [chartbackTab, setChartbackTab] = useState<'active' | 'history'>('active');
  interface HistoryEntry { id: number; box_id: string; full_name: string; chartback_status: string | null; activity: ActivityEntry; }
  const [chartbackHistory, setChartbackHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // CRM
  const [crmClient, setCrmClient] = useState<ChartbackClient | null>(null);
  const [showCrmMenu, setShowCrmMenu] = useState(false);
  const [crmSaving, setCrmSaving] = useState(false);
  const [crmNote, setCrmNote] = useState('');
  const [crmError, setCrmError] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Set<number>>(new Set());

  const crmAction = async (clientId: number, body: object): Promise<{ ok: boolean; error?: string }> => {
    try {
      const r = await fetch(`${API_URL}/api/advisor/legacy/chartback/${clientId}/action`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error || 'Error' };
      return { ok: true };
    } catch { return { ok: false, error: 'Error de red' }; }
  };

  const loadChartback = useCallback(async () => {
    setChartbackLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/legacy/chartback`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setChartbackClients(d.clients || []);
      }
    } catch {}
    finally { setChartbackLoading(false); }
  }, [token]);

  const loadChartbackHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/legacy/chartback/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setChartbackHistory(d.history || []);
      }
    } catch {}
    finally { setHistoryLoading(false); }
  }, [token]);

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);
      const [dashRes, photoRes, notifRes, ratesRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/advisor/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/auth/profile-photo`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/notifications/unread-count`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/advisor/rates`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (dashRes.status === 'fulfilled' && dashRes.value.ok) {
        const dashData = await dashRes.value.json();
        setData(dashData);
        if (dashData?.advisor?.profilePhotoUrl) setProfilePhoto(dashData.advisor.profilePhotoUrl);
      } else {
        throw new Error('Error al cargar datos');
      }
      if (photoRes.status === 'fulfilled' && photoRes.value.ok) {
        const pd = await photoRes.value.json();
        if (pd.profile_photo_url) setProfilePhoto(pd.profile_photo_url);
      }
      if (notifRes.status === 'fulfilled' && notifRes.value.ok) {
        const nd = await notifRes.value.json();
        setUnreadNotif(nd.count || nd.unread || 0);
      }
      if (ratesRes.status === 'fulfilled' && ratesRes.value.ok) {
        const rd = await ratesRes.value.json();
        if (rd?.success && rd.rates) setRates(rd.rates);
      }
    } catch (err: any) {
      console.error('Error loading advisor dashboard:', err);
      setError(err.message || 'Error al cargar el dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { loadDashboard(); loadChartback(); }, [loadDashboard, loadChartback]);

  useEffect(() => {
    registerForPushNotifications(token).catch(() => {});
    const cleanup = subscribeNotificationListeners({
      onTapped: (response) => {
        const d: any = response.notification.request.content.data || {};
        if (d.screen === 'AdvisorPackages' && d.filter)
          (navigation as any).navigate('AdvisorPackages', { user, token, filter: d.filter });
        else if (d.type === 'support_reply' && d.ticket_id)
          (navigation as any).navigate('SupportChat', { user, token, ticketId: Number(d.ticket_id) });
      },
    });
    return () => { if (cleanup) cleanup(); };
  }, [token, user, navigation]);

  const onRefresh = () => { setRefreshing(true); loadDashboard(); loadChartback(); };

  const openTransitClientPicker = async () => {
    setTransitClientSearch('');
    setShowTransitModal(true);
    setTransitClientsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/shipments?filter=in_transit&limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const seen = new Set<number>();
      const clients: { id: number; name: string; boxId: string }[] = [];
      for (const s of json.shipments || []) {
        const cId = s.clientId ?? s.client_id;
        if (cId && !seen.has(cId)) {
          seen.add(cId);
          clients.push({
            id: cId,
            name: s.clientName ?? s.client_name ?? '—',
            boxId: s.clientBoxId ?? s.client_box_id ?? '',
          });
        }
      }
      clients.sort((a, b) => a.name.localeCompare(b.name));
      setTransitClients(clients);
    } catch {
      setTransitClients([]);
    } finally {
      setTransitClientsLoading(false);
    }
  };

  const copyReferralCode = () => {
    if (data?.advisor.referralCode) {
      Clipboard.setString(data.advisor.referralCode);
      Alert.alert('✅ Copiado', 'Código copiado al portapapeles');
    }
  };

  const shareReferralCode = async () => {
    if (data?.advisor.referralCode) {
      const url = `https://entregax.app/register?ref=${data.advisor.referralCode}`;
      const message = `¡Hola! Te invito a usar EntregaX para tus envíos internacionales. Regístrate aquí: ${url}`;
      try {
        await Share.share({ message });
      } catch {}
    }
  };

  const handleChangeLanguage = async (lang: string) => {
    await changeLanguage(lang);
    setCurrentLang(lang);
    setShowLangModal(false);
  };

  const handleLogout = () => {
    setShowMenu(false);
    Alert.alert('Cerrar Sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar Sesión', style: 'destructive', onPress: () => navigation.replace('Login') },
    ]);
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={s.loadingText}>Cargando...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Ionicons name="warning-outline" size={48} color={RED} />
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={loadDashboard}>
          <Text style={s.retryBtnText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) return null;

  const firstName = (data.advisor.fullName || user.name || '').split(' ')[0];
  const initials  = (data.advisor.fullName || user.name || 'U').substring(0, 2).toUpperCase();
  const today     = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  const clientStats = [
    { label: 'Total',       value: data.clients.total,   icon: 'people',           color: ORANGE },
    { label: 'Nuevos (7d)', value: data.clients.new7d,   icon: 'person-add',       color: '#4CAF50' },
    { label: 'Activos',     value: data.clients.active,  icon: 'checkmark-circle', color: '#2196F3' },
    { label: 'Dormidos',    value: data.clients.dormant, icon: 'moon',             color: '#9E9E9E' },
  ];

  const shipmentStats = [
    { label: 'En Tránsito', value: data.shipments.inTransit,           icon: 'airplane',     color: '#2196F3', filter: 'in_transit',           accent: false },
    { label: 'Por Pagar',   value: data.shipments.awaitingPayment,     icon: 'card',         color: '#FF9800', filter: 'awaiting_payment',     accent: false },
    { label: 'Sin Instruc.',value: data.shipments.missingInstructions, icon: 'alert-circle', color: RED,       filter: 'missing_instructions', accent: true  },
    { label: 'Sin Cliente', value: data.shipments.unidentifiedPackages,icon: 'help-circle',  color: ORANGE,    filter: 'unidentified',         accent: true  },
  ];

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <Image source={require('../../assets/logo.png')} style={s.logo} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setShowLangModal(true)} style={s.langBtn}>
          <Text style={s.langFlag}>{getLanguageFlag(currentLang)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ChatList', { user, token })} style={s.headerIconBtn}>
          <Ionicons name="chatbubble-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('AdvisorNotifications', { user, token })} style={s.headerIconBtn}>
          <View>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unreadNotif > 0 && (
              <View style={s.notifBadge}>
                <Text style={s.notifBadgeText}>{unreadNotif > 99 ? '99+' : unreadNotif}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMenu(true)} style={s.avatarBtn}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={s.avatarImg} />
          ) : (
            <Avatar.Text size={38} label={initials} style={{ backgroundColor: ORANGE }} />
          )}
        </TouchableOpacity>
      </View>

      {/* ── LANGUAGE MODAL ── */}
      <Modal visible={showLangModal} animationType="fade" transparent>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowLangModal(false)}>
          <View style={s.langModal}>
            <Text style={s.langModalTitle}>Seleccionar Idioma</Text>
            <Divider style={{ marginVertical: 10, backgroundColor: '#333' }} />
            {[{ code: 'es', flag: '🇲🇽', label: 'Español' }, { code: 'en', flag: '🇺🇸', label: 'English' }, { code: 'zh', flag: '🇨🇳', label: '中文' }].map(l => (
              <TouchableOpacity key={l.code} style={[s.langOption, currentLang === l.code && s.langOptionActive]} onPress={() => handleChangeLanguage(l.code)}>
                <Text style={s.langOptionFlag}>{l.flag}</Text>
                <Text style={[s.langOptionText, currentLang === l.code && { color: ORANGE, fontWeight: '700' }]}>{l.label}</Text>
                {currentLang === l.code && <Ionicons name="checkmark" size={18} color={ORANGE} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── USER MENU MODAL ── */}
      <Modal visible={showMenu} animationType="fade" transparent>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={s.menuModal}>
            <View style={s.menuTop}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={s.menuAvatarImg} />
              ) : (
                <Avatar.Text size={48} label={initials} style={{ backgroundColor: ORANGE }} />
              )}
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={s.menuName}>{data.advisor.fullName || user.name}</Text>
                <Text style={s.menuEmail}>{data.advisor.email || user.email}</Text>
                <View style={s.menuBadge}><Text style={s.menuBadgeText}>💼 Asesor</Text></View>
              </View>
            </View>
            <Divider style={{ backgroundColor: '#2A2A2A', marginVertical: 8 }} />
            {[
              { icon: 'person-outline', label: 'Mi Perfil', screen: 'MyProfile' },
              ...(['asesor_lider', 'advisor', 'super_admin', 'admin', 'director'].includes(String(data.advisor.role || user.role))
                ? [{ icon: 'people-outline', label: 'Mi Equipo', screen: 'AdvisorTeam' }]
                : []),
            ].map(item => (
              <TouchableOpacity key={item.screen} style={s.menuItem} onPress={() => { setShowMenu(false); navigation.navigate(item.screen as any, { user, token }); }}>
                <Ionicons name={item.icon as any} size={20} color="#aaa" />
                <Text style={s.menuItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#444" />
              </TouchableOpacity>
            ))}
            <Divider style={{ backgroundColor: '#2A2A2A', marginVertical: 8 }} />
            <TouchableOpacity style={s.menuItem} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color={RED} />
              <Text style={[s.menuItemText, { color: RED }]}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── SCROLL CONTENT ── */}
      <ScrollView
        style={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} tintColor={ORANGE} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card — con código de asesor integrado */}
        <View style={s.hero}>
          <View style={s.heroAccent} />
          {/* Fila superior: saludo + badge */}
          <View style={s.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroGreeting}>Bienvenido,</Text>
              <Text style={s.heroName}>{firstName}</Text>
              <Text style={s.heroDate}>{today}</Text>
            </View>
            <View style={s.heroBadge}>
              <Ionicons name="briefcase" size={13} color={ORANGE} />
              <Text style={s.heroBadgeText}>ASESOR</Text>
            </View>
          </View>
          {/* Divisor */}
          <View style={s.heroDivider} />
          {/* Fila inferior: código + botones */}
          <View style={s.heroCodeRow}>
            <Ionicons name="gift" size={14} color={ORANGE} />
            <Text style={s.heroCode}>{data.advisor.referralCode || '—'}</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={s.heroCodeBtnOutline} onPress={copyReferralCode}>
              <Ionicons name="copy-outline" size={18} color={ORANGE} />
            </TouchableOpacity>
            <TouchableOpacity style={s.heroCodeBtnOutline} onPress={shareReferralCode}>
              <Ionicons name="share-social-outline" size={18} color={ORANGE} />
            </TouchableOpacity>
            <TouchableOpacity style={s.heroCodeBtnOutline} onPress={() => setShowQrModal(true)}>
              <Ionicons name="qr-code-outline" size={18} color={ORANGE} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Modal QR */}
        <Modal visible={showQrModal} transparent animationType="fade" onRequestClose={() => setShowQrModal(false)}>
          <TouchableOpacity style={s.qrOverlay} activeOpacity={1} onPress={() => setShowQrModal(false)}>
            <View style={s.qrBox}>
              <Text style={s.qrTitle}>Mi código de asesor</Text>
              <Text style={s.qrCode}>{data?.advisor.referralCode || '—'}</Text>
              {data?.advisor.referralCode ? (
                <QRCode value={`https://entregax.app/register?ref=${data.advisor.referralCode}`} size={200} color={BLACK} backgroundColor="#fff" />
              ) : null}
              <TouchableOpacity style={s.qrClose} onPress={() => setShowQrModal(false)}>
                <Text style={s.qrCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Modal selector de cliente (En Tránsito) ── */}
        <Modal visible={showTransitModal} transparent animationType="slide" onRequestClose={() => setShowTransitModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' }}>
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD' }} />
              </View>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: BLACK }}>Embarques en Tránsito</Text>
                  <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Selecciona un cliente</Text>
                </View>
                <TouchableOpacity onPress={() => setShowTransitModal(false)} style={{ padding: 6 }}>
                  <Ionicons name="close" size={22} color="#666" />
                </TouchableOpacity>
              </View>
              {/* Search */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#F4F4F6', borderRadius: 10, paddingHorizontal: 10, height: 40 }}>
                <Ionicons name="search-outline" size={16} color="#999" />
                <TextInput
                  style={{ flex: 1, marginLeft: 8, fontSize: 14, color: BLACK }}
                  placeholder="Buscar cliente..."
                  placeholderTextColor="#BBB"
                  value={transitClientSearch}
                  onChangeText={setTransitClientSearch}
                />
              </View>
              {/* List */}
              {transitClientsLoading ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={ORANGE} />
                  <Text style={{ color: '#999', marginTop: 10, fontSize: 13 }}>Cargando clientes...</Text>
                </View>
              ) : transitClients.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Ionicons name="airplane-outline" size={40} color="#DDD" />
                  <Text style={{ color: '#999', marginTop: 10, fontSize: 13 }}>Sin embarques en tránsito</Text>
                </View>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
                  {transitClients
                    .filter(c => {
                      const q = transitClientSearch.toLowerCase();
                      return !q || c.name.toLowerCase().includes(q) || c.boxId.toLowerCase().includes(q);
                    })
                    .map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}
                        onPress={() => {
                          setShowTransitModal(false);
                          navigation.navigate('AdvisorPackages', { user, token, filter: 'in_transit', clientId: c.id, clientName: c.name });
                        }}
                      >
                        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: ORANGE + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: ORANGE }}>{c.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: BLACK }}>{c.name}</Text>
                          {c.boxId ? <Text style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{c.boxId}</Text> : null}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#CCC" />
                      </TouchableOpacity>
                    ))
                  }
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* 📊 Widget de KPIs en vivo (tarifas y tipos de cambio) */}
        {rates && (
          <View style={s.kpiCard}>
            <View style={s.kpiHeader}>
              <Ionicons name="trending-up" size={14} color={ORANGE} />
              <Text style={s.kpiHeaderText}>Tarifas y TC en vivo</Text>
            </View>
            <View style={s.kpiGrid}>
              <View style={s.kpiItem}>
                <Text style={s.kpiLabel}>TDI Aéreo</Text>
                <Text style={s.kpiValue}>
                  {rates.precio_tdi_aereo_usd != null
                    ? `$${rates.precio_tdi_aereo_usd.toFixed(2)}`
                    : '—'}
                </Text>
                <Text style={s.kpiUnit}>USD/kg</Text>
              </View>
              <View style={s.kpiDivider} />
              <View style={s.kpiItem}>
                <Text style={s.kpiLabel}>TDI Express</Text>
                <Text style={s.kpiValue}>
                  {rates.precio_tdi_express_usd != null
                    ? `$${rates.precio_tdi_express_usd.toFixed(2)}`
                    : '—'}
                </Text>
                <Text style={s.kpiUnit}>USD/kg</Text>
              </View>
              <View style={s.kpiDivider} />
              <View style={s.kpiItem}>
                <Text style={s.kpiLabel}>TC Envío $</Text>
                <Text style={s.kpiValue}>
                  {rates.tc_envio_dinero != null
                    ? `$${rates.tc_envio_dinero.toFixed(2)}`
                    : '—'}
                </Text>
                <Text style={s.kpiUnit}>MXN/USD</Text>
              </View>
            </View>
          </View>
        )}

        {/* Embarques */}
        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>EMBARQUES DE CLIENTES</Text>
        </View>
        <View style={s.grid2}>
          {shipmentStats.map((st, i) => (
            <TouchableOpacity
              key={i}
              style={[s.shipCard, st.accent && s.shipCardAccent]}
              onPress={() =>
                st.filter === 'in_transit'
                  ? openTransitClientPicker()
                  : st.filter === 'awaiting_payment'
                  ? navigation.navigate('AdvisorPaymentOrders', { user, token })
                  : navigation.navigate('AdvisorPackages', { user, token, filter: st.filter })
              }
            >
              <View style={[s.shipCardBar, { backgroundColor: ORANGE }]} />
              <View style={[s.shipIcon, { backgroundColor: st.color + '22' }]}>
                <Ionicons name={st.icon as any} size={22} color={st.color} />
              </View>
              <Text style={[s.shipValue, st.accent && { color: st.color }]}>{st.value}</Text>
              <Text style={s.shipLabel}>{st.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Comisiones */}
        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>COMISIONES DEL MES</Text>
        </View>
        <View style={s.commCard}>
          <View style={s.commRow}>
            <View>
              <Text style={s.commSubLabel}>Total generado</Text>
              <Text style={s.commAmount}>
                {hideCommission ? '• • • • •' : `$${(data.commissions.monthCommissionMxn || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setHideCommission(h => !h)} style={s.commEyeBtn}>
              <Ionicons name={hideCommission ? 'eye-off' : 'eye'} size={20} color="#888" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.commLink} onPress={() => navigation.navigate('AdvisorCommissions', { user, token })}>
            <Text style={s.commLinkText}>Ver historial completo</Text>
            <Ionicons name="arrow-forward" size={16} color={ORANGE} />
          </TouchableOpacity>
        </View>

        {/* Mis Clientes */}
        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>MIS CLIENTES</Text>
        </View>
        <View style={s.grid2}>
          {clientStats.map((st, i) => (
            <TouchableOpacity key={i} style={s.clientCard} onPress={() => navigation.navigate('AdvisorClients', { user, token })}>
              <View style={[s.clientCardBar, { backgroundColor: ORANGE }]} />
              <Ionicons name={st.icon as any} size={22} color={st.color} style={{ marginBottom: 8 }} />
              <Text style={s.clientCardValue}>{st.value}</Text>
              <Text style={s.clientCardLabel}>{st.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Mi Equipo — solo cuando tiene sub-asesores */}
        {data.subAdvisors > 0 && (
          <>
            <View style={s.sectionHeader}>
              <View style={s.sectionBar} />
              <Text style={s.sectionTitle}>MI EQUIPO</Text>
            </View>
            <TouchableOpacity
              style={s.teamCard}
              onPress={() => navigation.navigate('AdvisorTeam' as any, { user, token })}
            >
              <View style={[s.supportIcon, { backgroundColor: '#673AB722' }]}>
                <Ionicons name="people" size={26} color="#673AB7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.teamCardTitle}>Gestionar Sub-Asesores</Text>
                <Text style={s.teamCardSub}>Comisiones, tarifas y rendimiento del equipo</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#aaa" />
            </TouchableOpacity>
          </>
        )}

        {/* Reactivación de Clientes (Chartback) — solo si el asesor tiene permiso */}
        {data.advisor.canRecovery && (
          <>
            <View style={s.sectionHeader}>
              <View style={s.sectionBar} />
              <Text style={s.sectionTitle}>REACTIVACIÓN DE CLIENTES</Text>
            </View>
            <TouchableOpacity
              style={s.chartbackCard}
              activeOpacity={0.8}
              onPress={() => { setChartbackSearch(''); setShowChartbackModal(true); loadChartback(); }}
            >
              <View style={[s.chartbackAccent, { backgroundColor: '#1565C0' }]} />
              <View style={s.chartbackIconWrap}>
                <Ionicons name="refresh-circle" size={36} color="#1565C0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.chartbackCount}>
                  {chartbackLoading ? '—' : chartbackClients.length}
                </Text>
                <Text style={s.chartbackLabel}>clientes para reactivar</Text>
              </View>
              <View style={s.chartbackArrow}>
                <Text style={s.chartbackArrowText}>Ver lista</Text>
                <Ionicons name="arrow-forward" size={16} color="#1565C0" />
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* Cotizaciones */}
        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>COTIZACIONES FORMALES</Text>
        </View>
        <View style={s.supportRow}>
          <TouchableOpacity style={s.supportBtn} onPress={() => navigation.navigate('AdvisorQuotes' as any, { user, token, initialTab: 'generar' })}>
            <View style={[s.supportIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="calculator" size={26} color={ORANGE} />
            </View>
            <Text style={s.supportBtnLabel}>Generar Cotización</Text>
            <Text style={s.supportBtnSub}>Cotizacion PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.supportBtn} onPress={() => navigation.navigate('AdvisorQuotes' as any, { user, token, initialTab: 'mias', hideGenerate: true })}>
            <View style={[s.supportIcon, { backgroundColor: '#FFF8E1' }]}>
              <Ionicons name="document-text" size={26} color="#FF9800" />
            </View>
            <Text style={s.supportBtnLabel}>Mis Cotizaciones</Text>
            <Text style={s.supportBtnSub}>Pendientes e historial</Text>
          </TouchableOpacity>
        </View>

        {/* Soporte */}
        <View style={s.sectionHeader}>
          <View style={s.sectionBar} />
          <Text style={s.sectionTitle}>SOPORTE Y ATENCIÓN</Text>
        </View>
        <View style={s.supportRow}>
          <TouchableOpacity style={s.supportBtn} onPress={() => navigation.navigate('AdvisorSupportTicket', { user, token })}>
            <View style={[s.supportIcon, { backgroundColor: ORANGE + '22' }]}>
              <Ionicons name="add-circle" size={26} color={ORANGE} />
            </View>
            <Text style={s.supportBtnLabel}>Levantar Ticket</Text>
            <Text style={s.supportBtnSub}>Nuevo reporte</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.supportBtn} onPress={() => navigation.navigate('AdvisorClientTickets', { user, token })}>
            <View style={[s.supportIcon, { backgroundColor: '#1565C022' }]}>
              <Ionicons name="ticket" size={26} color="#1E88E5" />
            </View>
            <Text style={s.supportBtnLabel}>Mis Tickets</Text>
            <Text style={s.supportBtnSub}>Ver historial</Text>
          </TouchableOpacity>
        </View>

        {/* Alerta verificaciones pendientes */}
        {data.clients.pendingVerification > 0 && (
          <TouchableOpacity style={s.alertCard} onPress={() => navigation.navigate('AdvisorClients', { user, token, filter: 'pending' })}>
            <View style={s.alertLeft}>
              <Ionicons name="alert-circle" size={22} color={RED} />
              <View style={{ marginLeft: 12 }}>
                <Text style={s.alertTitle}>Verificaciones pendientes</Text>
                <Text style={s.alertSub}>{data.clients.pendingVerification} cliente(s) esperan revisión</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#555" />
          </TouchableOpacity>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Modal Reactivación de Clientes (Chartback) ── */}
      <Modal visible={showChartbackModal} animationType="slide" transparent onRequestClose={() => setShowChartbackModal(false)}>
        <View style={s.chartbackOverlay}>
          <View style={s.chartbackModal}>
            {/* Handle */}
            <View style={s.chartbackHandle} />

            {/* Header */}
            <View style={s.chartbackModalHeader}>
              <Ionicons name="refresh-circle" size={22} color="#1565C0" />
              <Text style={s.chartbackModalTitle}>Reactivación de Clientes</Text>
              <TouchableOpacity onPress={() => setShowChartbackModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#0F172A', borderRadius: 10, padding: 3 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: chartbackTab === 'active' ? '#1565C0' : 'transparent' }}
                onPress={() => setChartbackTab('active')}
              >
                <Text style={{ color: chartbackTab === 'active' ? '#fff' : '#888', fontSize: 13, fontWeight: '600' }}>
                  Activos ({chartbackClients.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: chartbackTab === 'history' ? '#1E3A5F' : 'transparent' }}
                onPress={() => { setChartbackTab('history'); loadChartbackHistory(); }}
              >
                <Text style={{ color: chartbackTab === 'history' ? '#60A5FA' : '#888', fontSize: 13, fontWeight: '600' }}>
                  Historial
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search (solo en tab activos) */}
            {chartbackTab === 'active' && (
            <View style={s.chartbackSearchWrap}>
              <Ionicons name="search" size={16} color="#888" style={{ marginRight: 8 }} />
              <TextInput
                style={s.chartbackSearchInput}
                placeholder="Buscar por nombre, correo o casillero..."
                placeholderTextColor="#aaa"
                value={chartbackSearch}
                onChangeText={setChartbackSearch}
                autoCorrect={false}
              />
            </View>
            )}

            {/* Tab: Historial */}
            {chartbackTab === 'history' && (
              historyLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <ActivityIndicator color="#60A5FA" />
                </View>
              ) : chartbackHistory.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="time-outline" size={40} color="#334155" />
                  <Text style={{ color: '#666', marginTop: 10, fontSize: 14 }}>Sin movimientos registrados</Text>
                </View>
              ) : (() => {
                const typeIcon = (t: string) => t === 'whatsapp' ? 'logo-whatsapp' : t === 'no_answer' ? 'call-outline' : t === 'callback' ? 'calendar-outline' : t === 'recovered' ? 'checkmark-circle' : 'create-outline';
                const typeLabel = (t: string) => t === 'whatsapp' ? 'WhatsApp' : t === 'no_answer' ? 'No contestó' : t === 'callback' ? 'Callback' : t === 'recovered' ? 'Recuperado' : 'Nota';
                const typeColor = (t: string) => t === 'whatsapp' ? '#25D366' : t === 'recovered' ? '#4ADE80' : t === 'no_answer' ? '#F59E0B' : t === 'callback' ? '#A78BFA' : '#60A5FA';
                return (
                  <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                    {chartbackHistory.map((row, idx) => (
                      <View key={idx} style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#1E2A3A' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{ marginTop: 2 }}>
                            <Ionicons name={typeIcon(row.activity.type) as any} size={18} color={typeColor(row.activity.type)} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ color: typeColor(row.activity.type), fontWeight: '700', fontSize: 13 }}>
                                {typeLabel(row.activity.type)}
                              </Text>
                              <Text style={{ color: '#475569', fontSize: 11 }}>
                                {new Date(row.activity.ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                            <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 1 }}>
                              {row.full_name || row.box_id}
                              <Text style={{ color: '#475569' }}> · {row.box_id}</Text>
                            </Text>
                            {row.activity.note ? (
                              <Text style={{ color: '#CBD5E1', fontSize: 12, marginTop: 3, fontStyle: 'italic' }}>"{row.activity.note}"</Text>
                            ) : null}
                            {row.activity.callback_at ? (
                              <Text style={{ color: '#A78BFA', fontSize: 12, marginTop: 3 }}>
                                Agendar: {new Date(row.activity.callback_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            ) : null}
                            <Text style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                              Asesor: {row.activity.advisor}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                    <View style={{ height: 20 }} />
                  </ScrollView>
                );
              })()
            )}

            {/* Tab: Lista activos */}
            {chartbackTab === 'active' && (chartbackLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator color="#1565C0" />
              </View>
            ) : (() => {
              const q = chartbackSearch.toLowerCase().trim();
              const filtered = q
                ? chartbackClients.filter(c =>
                    (c.full_name || '').toLowerCase().includes(q) ||
                    (c.email || '').toLowerCase().includes(q) ||
                    (c.box_id || '').toLowerCase().includes(q)
                  )
                : chartbackClients;
              if (filtered.length === 0) {
                return (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="people-outline" size={40} color="#ccc" />
                    <Text style={{ color: '#999', marginTop: 8 }}>Sin clientes</Text>
                  </View>
                );
              }
              return (
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {filtered.map((c, idx) => (
                    <View key={c.id} style={[s.chartbackItem, idx > 0 && { borderTopWidth: 1, borderTopColor: '#1E2A3A' }]}>
                      <Text style={s.chartbackItemName}>{c.full_name || 'Sin nombre'}</Text>
                      <Text style={s.chartbackItemBox}>{c.box_id}</Text>
                      {/* Botones de contacto */}
                      <View style={s.chartbackBtnsRow}>
                        {c.phone ? (
                          <TouchableOpacity style={s.chartbackBtnCall} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                            <Ionicons name="call" size={13} color="#fff" />
                            <Text style={s.chartbackBtnText}>Llamar</Text>
                          </TouchableOpacity>
                        ) : null}
                        {c.phone ? (
                          <TouchableOpacity style={s.chartbackBtnWA} onPress={async () => {
                            const num = (c.phone || '').replace(/\D/g, '');
                            Linking.openURL(`https://wa.me/${num}`);
                            await crmAction(c.id, { action: 'whatsapp' });
                            loadChartback();
                          }}>
                            <Ionicons name="logo-whatsapp" size={13} color="#fff" />
                            <Text style={s.chartbackBtnText}>WhatsApp</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={s.chartbackBtnNoAnswer}
                          onPress={() => { setCrmClient(c); setCrmNote(''); setCrmError(''); setShowCrmMenu(true); }}
                        >
                          <Ionicons name="options" size={13} color="#fff" />
                          <Text style={s.chartbackBtnText}>Registrar</Text>
                        </TouchableOpacity>
                      </View>
                      {/* Historial de actividad */}
                      {(() => {
                        const acts = (c.chartback_activity || []).slice().reverse();
                        if (acts.length === 0) return null;
                        const isExpanded = expandedHistory.has(c.id);
                        const visible = isExpanded ? acts : acts.slice(0, 2);
                        const typeIcon = (t: string) => t === 'whatsapp' ? 'logo-whatsapp' : t === 'no_answer' ? 'call-outline' : t === 'callback' ? 'calendar-outline' : t === 'recovered' ? 'checkmark-circle' : 'create-outline';
                        const typeLabel = (t: string) => t === 'whatsapp' ? 'WA' : t === 'no_answer' ? 'No contestó' : t === 'callback' ? 'Callback' : t === 'recovered' ? 'Recuperado' : 'Nota';
                        return (
                          <View style={{ marginTop: 6 }}>
                            <View style={s.activityHeader}>
                              <Ionicons name="time-outline" size={11} color="#334155" />
                              <Text style={s.activityHeaderText}>HISTORIAL</Text>
                            </View>
                            {visible.map((a, ai) => (
                              <View key={ai} style={s.activityRow}>
                                <Ionicons name={typeIcon(a.type) as any} size={12} color={a.type === 'whatsapp' ? '#25D366' : a.type === 'recovered' ? '#4ADE80' : a.type === 'no_answer' ? '#F59E0B' : '#60A5FA'} />
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                    <Text style={s.activityType}>{typeLabel(a.type)}</Text>
                                    <Text style={s.activityAdvisor}>{a.advisor}</Text>
                                  </View>
                                  <Text style={s.activityTs}>
                                    {new Date(a.ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </Text>
                                  {a.note ? <Text style={s.activityNote} numberOfLines={2}>{a.note}</Text> : null}
                                  {a.callback_at ? <Text style={s.activityNote}>Agendar: {new Date(a.callback_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text> : null}
                                </View>
                              </View>
                            ))}
                            {acts.length > 2 && (
                              <TouchableOpacity style={s.activityToggle} onPress={() => setExpandedHistory(prev => {
                                const next = new Set(prev);
                                isExpanded ? next.delete(c.id) : next.add(c.id);
                                return next;
                              })}>
                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={11} color="#60A5FA" />
                                <Text style={s.activityToggleText}>{isExpanded ? 'Ocultar' : `Ver ${acts.length - 2} más`}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                  ))}
                  <View style={{ height: 20 }} />
                </ScrollView>
              );
            })())}

            {/* ── Overlay CRM dentro del modal (evita modal anidado) ── */}
            {showCrmMenu && crmClient && (
              <View style={s.crmOverlay}>
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => !crmSaving && setShowCrmMenu(false)} />
                <View style={s.crmBox}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 }}>
                    {crmClient.full_name || 'Cliente'}
                  </Text>
                  <Text style={{ color: '#60A5FA', fontSize: 12, marginBottom: 12 }}>{crmClient.box_id}</Text>

                  {/* Campo de notas global */}
                  <TextInput
                    style={s.crmNoteInput}
                    placeholder="Notas del resultado (opcional)..."
                    placeholderTextColor="#475569"
                    value={crmNote}
                    onChangeText={setCrmNote}
                    multiline
                    editable={!crmSaving}
                  />

                  {/* Error display */}
                  {!!crmError && (
                    <View style={s.crmErrorBox}>
                      <Ionicons name="alert-circle" size={14} color="#F87171" />
                      <Text style={s.crmErrorText}>{crmError}</Text>
                    </View>
                  )}

                  {crmSaving ? (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <ActivityIndicator color="#60A5FA" />
                    </View>
                  ) : (<>
                    {/* No contestó */}
                    <TouchableOpacity style={s.crmOption} onPress={async () => {
                      setCrmSaving(true); setCrmError('');
                      const r = await crmAction(crmClient.id, { action: 'no_answer', notes: crmNote });
                      setCrmSaving(false);
                      if (r.ok) { setShowCrmMenu(false); setCrmNote(''); loadChartback(); }
                      else setCrmError(r.error || 'Error');
                    }}>
                      <View style={[s.crmOptionIcon, { backgroundColor: '#F59E0B22' }]}>
                        <Ionicons name="call-outline" size={20} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.crmOptionTitle}>No contestó</Text>
                        <Text style={s.crmOptionSub}>Vuelve a aparecer en 24 horas</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Registrar nota de llamada (dejé mensaje, habló con alguien, etc.) */}
                    <TouchableOpacity style={s.crmOption} onPress={async () => {
                      if (!crmNote.trim()) { setCrmError('Escribe una nota antes de registrar la llamada'); return; }
                      setCrmSaving(true); setCrmError('');
                      const r = await crmAction(crmClient.id, { action: 'call_note', notes: crmNote });
                      setCrmSaving(false);
                      if (r.ok) { setShowCrmMenu(false); setCrmNote(''); loadChartback(); }
                      else setCrmError(r.error || 'Error');
                    }}>
                      <View style={[s.crmOptionIcon, { backgroundColor: '#7C3AED22' }]}>
                        <Ionicons name="create-outline" size={20} color="#A78BFA" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.crmOptionTitle}>Registrar nota de llamada</Text>
                        <Text style={s.crmOptionSub}>Guarda notas sin cambiar el estado</Text>
                      </View>
                    </TouchableOpacity>

                    <Text style={{ color: '#475569', fontSize: 10, fontWeight: '700', marginTop: 12, marginBottom: 6, letterSpacing: 0.5 }}>
                      ME CONTESTÓ — AGENDAR CALLBACK
                    </Text>

                    {[
                      { label: 'Mañana', sub: 'Llamar mañana', days: 1 },
                      { label: 'En 3 días', sub: 'Llamar en 3 días', days: 3 },
                      { label: 'En 1 semana', sub: 'Llamar en 7 días', days: 7 },
                      { label: 'En 2 semanas', sub: 'Llamar en 14 días', days: 14 },
                    ].map(opt => (
                      <TouchableOpacity key={opt.days} style={s.crmOption} onPress={async () => {
                        setCrmSaving(true); setCrmError('');
                        const cb = new Date(Date.now() + opt.days * 86400000).toISOString();
                        const r = await crmAction(crmClient.id, { action: 'callback', callback_at: cb, notes: crmNote });
                        setCrmSaving(false);
                        if (r.ok) { setShowCrmMenu(false); setCrmNote(''); loadChartback(); }
                        else setCrmError(r.error || 'Error');
                      }}>
                        <View style={[s.crmOptionIcon, { backgroundColor: '#1565C022' }]}>
                          <Ionicons name="calendar-outline" size={20} color="#60A5FA" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.crmOptionTitle}>{opt.label}</Text>
                          <Text style={s.crmOptionSub}>{opt.sub}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}

                    <View style={{ height: 1, backgroundColor: '#334155', marginVertical: 10 }} />

                    <TouchableOpacity style={s.crmOption} onPress={async () => {
                      setCrmSaving(true); setCrmError('');
                      const r = await crmAction(crmClient.id, { action: 'recovered', notes: crmNote });
                      setCrmSaving(false);
                      if (r.ok) { setShowCrmMenu(false); setCrmNote(''); loadChartback(); }
                      else setCrmError(r.error || 'Error');
                    }}>
                      <View style={[s.crmOptionIcon, { backgroundColor: '#16A34A22' }]}>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#4ADE80" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.crmOptionTitle, { color: '#4ADE80' }]}>Cliente recuperado ✓</Text>
                        <Text style={s.crmOptionSub}>Sale del chartback permanentemente</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => { setShowCrmMenu(false); setCrmNote(''); setCrmError(''); }} style={{ alignItems: 'center', paddingTop: 14 }}>
                      <Text style={{ color: '#64748B', fontSize: 13 }}>Cancelar</Text>
                    </TouchableOpacity>
                  </>)}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const CARD_RADIUS = 14;

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: BG },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG, padding: 24 },
  loadingText: { marginTop: 12, color: '#aaa', fontSize: 15 },
  errorText:   { marginTop: 12, color: RED, fontSize: 15, textAlign: 'center' },
  retryBtn:    { marginTop: 20, backgroundColor: ORANGE, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 10 },
  retryBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },

  // Header
  header: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  logo:    { width: 192, height: 58, resizeMode: 'contain' },
  langBtn: { padding: 8, marginRight: 4 },
  headerIconBtn: { padding: 8, marginRight: 2 },
  notifBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: RED, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  avatarImg: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: ORANGE },
  menuAvatarImg: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: ORANGE },
  langFlag:{ fontSize: 22 },
  avatarBtn: { marginLeft: 4 },

  // Scroll
  scroll: { flex: 1 },

  // Hero
  hero: {
    backgroundColor: CARD_BG,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: CARD_RADIUS,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },
  heroAccent:      { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: ORANGE, borderTopLeftRadius: CARD_RADIUS, borderBottomLeftRadius: CARD_RADIUS },
  heroTop:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  heroGreeting:    { color: '#888', fontSize: 12, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase' },
  heroName:        { color: '#111', fontSize: 26, fontWeight: '900', marginTop: 2 },
  heroDate:        { color: '#888', fontSize: 12, marginTop: 5, textTransform: 'capitalize' },
  heroBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ORANGE + '18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  heroBadgeText:   { color: ORANGE, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  heroDivider:     { height: 1, backgroundColor: '#F0F0F0', marginBottom: 12 },
  heroCodeRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroCode:        { color: '#111', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  heroCodeBtn:     { alignItems: 'center', justifyContent: 'center', backgroundColor: ORANGE, borderRadius: 8, padding: 8 },
  heroCodeBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroCodeBtnOutline:     { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: ORANGE, borderRadius: 8, padding: 8 },
  qrOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  qrBox:       { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', gap: 12, width: 280 },
  qrTitle:     { fontSize: 16, fontWeight: '700', color: BLACK },
  qrCode:      { fontSize: 18, fontWeight: '800', color: ORANGE, letterSpacing: 1 },
  qrClose:     { marginTop: 8, backgroundColor: ORANGE, borderRadius: 8, paddingHorizontal: 32, paddingVertical: 10 },
  qrCloseText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  heroCodeBtnOutlineText: { color: ORANGE, fontSize: 12, fontWeight: '700' },

  // 📊 KPI widget — Tarifas y TC en vivo
  kpiCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  kpiHeaderText: { fontSize: 11, fontWeight: '700', color: ORANGE, letterSpacing: 0.8 },
  kpiGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  kpiLabel: { fontSize: 10, fontWeight: '600', color: SUBTEXT, marginBottom: 2, textAlign: 'center' },
  kpiValue: { fontSize: 16, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  kpiUnit: { fontSize: 9, color: '#999', marginTop: 1 },
  kpiDivider: { width: 1, height: 32, backgroundColor: '#EEEEEE' },


  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 20, marginBottom: 10, gap: 8 },
  sectionBar:    { width: 3, height: 16, backgroundColor: ORANGE, borderRadius: 2 },
  sectionTitle:  { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  // Client grid
  grid2: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 12, gap: 8, marginBottom: 4 },

  clientCard: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 16,
    width: (width - 40) / 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },
  clientCardBar:   { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS },
  clientCardValue: { fontSize: 30, fontWeight: '900', color: TEXT, marginTop: 4 },
  clientCardLabel: { fontSize: 12, color: SUBTEXT, marginTop: 4, textAlign: 'center' },

  // Shipment cards
  shipCard: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 16,
    width: (width - 40) / 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },
  shipCardAccent: {},
  shipCardBar:    { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS },
  shipIcon:       { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  shipValue:      { fontSize: 30, fontWeight: '900', color: TEXT },
  shipLabel:      { fontSize: 12, color: SUBTEXT, marginTop: 3, textAlign: 'center' },

  // Commissions
  commCard: {
    backgroundColor: CARD_BG,
    marginHorizontal: 16,
    borderRadius: CARD_RADIUS,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginBottom: 4,
  },
  commRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  commSubLabel: { color: '#666', fontSize: 12, fontWeight: '500', letterSpacing: 0.5 },
  commAmount:   { color: ORANGE, fontSize: 26, fontWeight: '900', marginTop: 4, letterSpacing: 0.5 },
  commEyeBtn:   { padding: 8 },
  commLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  commLinkText: { color: ORANGE, fontWeight: '600', fontSize: 13 },

  // Support
  teamCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD_BG, marginHorizontal: 16, borderRadius: CARD_RADIUS,
    padding: 16, marginBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  teamCardTitle: { fontSize: 14, fontWeight: '700', color: BLACK },
  teamCardSub:   { fontSize: 12, color: SUBTEXT, marginTop: 2 },

  supportRow: { flexDirection: 'row', marginHorizontal: 12, gap: 8, marginBottom: 4 },
  supportBtn: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  supportIcon:    { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  supportBtnLabel:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  supportBtnSub:  { color: '#666', fontSize: 11, marginTop: 2 },

  // Chartback widget
  chartbackCard: {
    backgroundColor: CARD_BG,
    marginHorizontal: 16,
    borderRadius: CARD_RADIUS,
    padding: 18,
    borderWidth: 1,
    borderColor: '#C5D8F5',
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  chartbackAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: CARD_RADIUS, borderBottomLeftRadius: CARD_RADIUS },
  chartbackIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1565C018', alignItems: 'center', justifyContent: 'center' },
  chartbackCount: { fontSize: 30, fontWeight: '900', color: '#1565C0', lineHeight: 34 },
  chartbackLabel: { fontSize: 12, color: '#555', marginTop: 2 },
  chartbackArrow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chartbackArrowText: { color: '#1565C0', fontWeight: '600', fontSize: 13 },

  // Chartback modal
  chartbackOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  chartbackModal: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '78%',
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  chartbackHandle: { width: 40, height: 4, backgroundColor: '#334155', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  chartbackModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  chartbackModalTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  chartbackModalSub: { color: '#64748B', fontSize: 12, marginBottom: 12 },
  chartbackSearchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E2A3A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  chartbackSearchInput: { flex: 1, color: '#fff', fontSize: 14, padding: 0 },
  chartbackItem: { paddingVertical: 14 },
  chartbackItemName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  chartbackItemBox: { color: '#60A5FA', fontSize: 12, fontWeight: '700', marginTop: 2 },
  chartbackBtnsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chartbackBtnCall: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#16A34A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  chartbackBtnWA: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  chartbackBtnNoAnswer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  chartbackBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // CRM overlay (dentro del modal de chartback)
  crmOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, borderRadius: 20, zIndex: 10 },
  crmBox: { backgroundColor: '#0F172A', borderRadius: 16, padding: 18, width: '100%', borderWidth: 1, borderColor: '#1E2A3A' },
  crmOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  crmOptionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  crmOptionTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  crmOptionSub: { color: '#64748B', fontSize: 11, marginTop: 1 },
  crmNoteInput: { backgroundColor: '#1E2A3A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 13, minHeight: 56, marginBottom: 10, borderWidth: 1, borderColor: '#334155', textAlignVertical: 'top' },
  crmErrorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#F8717122', borderRadius: 8, padding: 10, marginBottom: 10 },
  crmErrorText: { color: '#F87171', fontSize: 12, flex: 1 },
  activityEntry: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  activityText: { color: '#475569', fontSize: 10, flex: 1 },
  activityHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  activityHeaderText: { color: '#334155', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#1E2A3A' },
  activityType: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  activityAdvisor: { color: '#64748B', fontSize: 10, flex: 1 },
  activityTs: { color: '#334155', fontSize: 9, marginTop: 1 },
  activityNote: { color: '#94A3B8', fontSize: 10, marginTop: 2, fontStyle: 'italic' },
  activityToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 5, justifyContent: 'center' },
  activityToggleText: { color: '#60A5FA', fontSize: 10 },

  // Alert
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A0A0A',
    borderWidth: 1,
    borderColor: RED + '55',
    borderRadius: CARD_RADIUS,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
  },
  alertLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  alertTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  alertSub:   { color: '#888', fontSize: 11, marginTop: 2 },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 110, paddingRight: 16 },

  langModal: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, width: 250, borderWidth: 1, borderColor: '#2A2A2A' },
  langModalTitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  langOption:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 8, borderRadius: 8 },
  langOptionActive: { backgroundColor: ORANGE + '18' },
  langOptionFlag: { fontSize: 22, marginRight: 12 },
  langOptionText: { flex: 1, color: '#ccc', fontSize: 15 },

  menuModal: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, width: 285, borderWidth: 1, borderColor: '#2A2A2A' },
  menuTop:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  menuName:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  menuEmail: { color: '#666', fontSize: 12, marginTop: 2 },
  menuBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ORANGE + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5, alignSelf: 'flex-start' },
  menuBadgeText: { color: ORANGE, fontSize: 10, fontWeight: '700' },
  menuItem:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  menuItemText: { flex: 1, color: '#ccc', fontSize: 14 },
});
