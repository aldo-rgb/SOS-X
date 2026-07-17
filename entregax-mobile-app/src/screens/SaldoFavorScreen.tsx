// ============================================
// PANTALLA SALDO A FAVOR - MONEDERO DIGITAL B2C
// Sistema de billetera con bonos de referidos
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getSecure } from '../services/secureStorage';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';
import { Video, ResizeMode } from 'expo-av';

// Colores
const SEA_COLOR = '#0097A7';
const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const YELLOW = '#FF9800';

interface WalletSaldo {
  saldo_disponible: number;
  saldo_pendiente: number;
  saldo_total: number;
  moneda: string;
  formatted: {
    disponible: string;
    pendiente: string;
    total: string;
  };
}

interface Transaccion {
  id: number;
  tipo: 'ingreso' | 'egreso' | 'pendiente' | 'liberacion' | 'expiracion';
  monto: number;
  saldo_anterior: number;
  saldo_posterior: number;
  concepto: string;
  referencia_tipo?: string;
  fecha_movimiento: string;
}

interface WalletResumen {
  saldo: WalletSaldo | null;
  ultimasTransacciones: Transaccion[];
  estadisticas: {
    total_ingresos: number;
    total_egresos: number;
    transacciones_este_mes: number;
  };
}

export default function SaldoFavorScreen({ navigation }: any) {
  const { i18n } = useTranslation();
  const sl = i18n.language;
  const ST = {
    available:    sl === 'zh' ? '可用余额'      : sl === 'en' ? 'Available Balance'  : 'Saldo Disponible',
    pending:      sl === 'zh' ? '待到账'        : sl === 'en' ? 'pending'            : 'pendiente',
    earned:       sl === 'zh' ? '累计获得'      : sl === 'en' ? 'Total Earned'       : 'Total Ganado',
    used:         sl === 'zh' ? '已使用'        : sl === 'en' ? 'Used'               : 'Usado',
    referrals:    sl === 'zh' ? '推荐人数'      : sl === 'en' ? 'Referrals'          : 'Referidos',
    earnPromo:    sl === 'zh' ? '每推荐一位朋友赚 $500！' : sl === 'en' ? 'Earn $500 per friend!' : '¡Gana $500 por cada amigo!',
    earnPromoSub: sl === 'zh' ? '邀请朋友，他们首次发货时您即可获得奖励' : sl === 'en' ? 'Invite friends and earn when they make their first shipment' : 'Invita amigos y gana cuando hagan su primer envío',
    history:      sl === 'zh' ? '交易记录'      : sl === 'en' ? 'Transaction History' : 'Historial de Movimientos',
    seeAll:       sl === 'zh' ? '查看全部'      : sl === 'en' ? 'See all'            : 'Ver todo',
    seeLess:      sl === 'zh' ? '收起'          : sl === 'en' ? 'See less'           : 'Ver menos',
    noMovements:  sl === 'zh' ? '暂无交易记录'  : sl === 'en' ? 'No transactions yet' : 'Aún no tienes movimientos',
    noMovSub:     sl === 'zh' ? '邀请朋友，他们首次发货时您即可获得余额' : sl === 'en' ? 'Invite friends and earn balance when they make their first shipment' : 'Invita amigos y gana saldo cuando hagan su primer envío',
    howToUse:     sl === 'zh' ? '如何使用余额？' : sl === 'en' ? 'How to use my balance?' : '¿Cómo usar mi saldo?',
    autoApplied:  sl === 'zh' ? '支付运费时自动抵扣' : sl === 'en' ? 'Automatically applied when paying for shipments' : 'Se aplica automáticamente al pagar tus envíos',
  };
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resumen, setResumen] = useState<WalletResumen | null>(null);
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [totalReferidos, setTotalReferidos] = useState(0);
  // Kit de Bienvenida
  const [hasPendingKit, setHasPendingKit] = useState(false);
  const [kitProducts, setKitProducts] = useState<any[]>([]);
  const [kitModalOpen, setKitModalOpen] = useState(false);
  const [selectingKitId, setSelectingKitId] = useState<number | null>(null);
  const [kitDetail, setKitDetail] = useState<any | null>(null);
  const [mainImgIndex, setMainImgIndex] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const openKitDetail = (p: any) => { setMainImgIndex(0); setVideoPlaying(false); setKitDetail(p); };
  const closeKitDetail = () => { setVideoPlaying(false); setKitDetail(null); };

  const fetchWalletData = useCallback(async () => {
    try {
      const token = await getSecure('token');
      if (!token) {
        Alert.alert('Error', 'Sesión expirada');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      const [resumenRes, txRes, referidosRes, kitRes] = await Promise.all([
        fetch(`${API_URL}/api/billetera/resumen`, { headers }),
        fetch(`${API_URL}/api/billetera/transacciones?limit=50`, { headers }),
        fetch(`${API_URL}/api/referidos/mis-referidos`, { headers }),
        fetch(`${API_URL}/api/welcome-kit/my-kit`, { headers }),
      ]);

      if (kitRes.ok) {
        const kitData = await kitRes.json();
        if (kitData.success) {
          setHasPendingKit(!!kitData.has_pending_kit);
          const prods = kitData.products || [];
          setKitProducts(prods);
          // Precargar TODAS las fotos de los regalos en caché para que el detalle
          // abra al instante (sin la sensación de lento).
          prods.forEach((p: any) => (p.photos || []).forEach((ph: any) => {
            if (ph?.url) { Image.prefetch(ph.url).catch(() => {}); }
          }));
        }
      }

      if (resumenRes.ok) {
        const data = await resumenRes.json();
        if (data.success) setResumen(data.data);
      }

      if (txRes.ok) {
        const txData = await txRes.json();
        if (txData.success) setTransacciones(txData.data || []);
      }

      if (referidosRes.ok) {
        const refData = await referidosRes.json();
        if (refData.success) {
          setTotalReferidos(refData.data?.estadisticas?.total_referidos || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching wallet:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWalletData();
  };

  const selectGift = async (productId: number, productName: string) => {
    try {
      setSelectingKitId(productId);
      const token = await getSecure('token');
      const res = await fetch(`${API_URL}/api/welcome-kit/select-gift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ product_id: productId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setKitModalOpen(false);
        setHasPendingKit(false);
        Alert.alert('🎁 ¡Regalo confirmado!', `Elegiste "${productName}". Ya generamos tu guía ${data.tracking}. Captura tus datos de envío en "Sin instrucciones".`);
        fetchWalletData();
      } else {
        Alert.alert('Aviso', data.error || 'No se pudo confirmar tu regalo.');
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo confirmar tu regalo. Intenta de nuevo.');
    } finally {
      setSelectingKitId(null);
    }
  };

  const confirmSelect = (productId: number, productName: string) => {
    Alert.alert(
      'Confirmar regalo',
      `¿Elegir "${productName}"? Solo puedes elegir 1 regalo y no se puede cambiar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Elegir', onPress: () => selectGift(productId, productName) },
      ]
    );
  };

  const formatMoney = (amount: any) => {
    try {
      if (amount == null) return '$0.00';
      const n = typeof amount === 'number' ? amount : parseFloat(`${amount}`);
      if (!isFinite(n)) return '$0.00';
      return `$${n.toFixed(2)}`;
    } catch {
      return '$0.00';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (tipo: string) => {
    switch (tipo) {
      case 'ingreso':
      case 'liberacion':
        return { name: 'arrow-down-circle', color: GREEN };
      case 'egreso':
        return { name: 'arrow-up-circle', color: ORANGE };
      case 'pendiente':
        return { name: 'time', color: YELLOW };
      case 'expiracion':
        return { name: 'close-circle', color: '#999' };
      default:
        return { name: 'swap-horizontal', color: SEA_COLOR };
    }
  };

  const renderTransaction = ({ item }: { item: Transaccion }) => {
    const icon = getTransactionIcon(item.tipo);
    const isPositive = item.tipo === 'ingreso' || item.tipo === 'liberacion';
    
    return (
      <View style={styles.transactionItem}>
        <View style={[styles.transactionIcon, { backgroundColor: `${icon.color}20` }]}>
          <Ionicons name={icon.name as any} size={24} color={icon.color} />
        </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionConcept} numberOfLines={1}>
            {item.concepto}
          </Text>
          <Text style={styles.transactionDate}>{formatDate(item.fecha_movimiento)}</Text>
        </View>
        <Text style={[styles.transactionAmount, { color: isPositive ? GREEN : ORANGE }]}>
          {isPositive ? '+' : '-'}{formatMoney(item.monto)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={SEA_COLOR} />
          <Text style={styles.loadingText}>Cargando saldo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const saldo = resumen?.saldo;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SEA_COLOR} />
        }
      >
        {/* Header con saldo */}
        <LinearGradient
          colors={[SEA_COLOR, '#00838F']}
          style={styles.balanceCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.balanceLabel}>{ST.available}</Text>
          <Text style={styles.balanceAmount}>
            {saldo ? formatMoney(saldo.saldo_disponible) : '$0.00'}
          </Text>
          <Text style={styles.balanceCurrency}>{saldo?.moneda || 'MXN'}</Text>
          
          {saldo && saldo.saldo_pendiente > 0 && (
            <View style={styles.pendingBadge}>
              <Ionicons name="time-outline" size={14} color="#FFF" />
              <Text style={styles.pendingText}>
                {formatMoney(saldo.saldo_pendiente)} {ST.pending}
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* 🎁 Banner Kit de Bienvenida (regalo pendiente) */}
        {hasPendingKit && (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setKitModalOpen(true)}>
            <LinearGradient
              colors={[ORANGE, '#C1272D']}
              style={styles.kitBanner}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.kitBannerIcon}>
                <Text style={{ fontSize: 26 }}>🎁</Text>
                <View style={styles.kitDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.kitBannerTitle}>¡Tienes un regalo pendiente!</Text>
                <Text style={styles.kitBannerSub}>Toca para elegir tu Kit de Bienvenida</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Info cards */}
        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <Ionicons name="trending-up" size={24} color={GREEN} />
            <Text style={styles.infoValue}>
              {formatMoney(resumen?.estadisticas?.total_ingresos || 0)}
            </Text>
            <Text style={styles.infoLabel}>{ST.earned}</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="cart-outline" size={24} color={ORANGE} />
            <Text style={styles.infoValue}>
              {formatMoney(resumen?.estadisticas?.total_egresos || 0)}
            </Text>
            <Text style={styles.infoLabel}>{ST.used}</Text>
          </View>
          <TouchableOpacity
            style={styles.infoCard}
            onPress={() => navigation.navigate('Referidos')}
            activeOpacity={0.7}
          >
            <Ionicons name="people" size={24} color={ORANGE} />
            <Text style={styles.infoValue}>{totalReferidos}</Text>
            <Text style={styles.infoLabel}>{ST.referrals}</Text>
          </TouchableOpacity>
        </View>

        {/* Botón de referidos */}
        <TouchableOpacity 
          style={styles.referralBanner}
          onPress={() => navigation.navigate('Referidos')}
        >
          <LinearGradient
            colors={[ORANGE, '#E64A19']}
            style={styles.referralGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.referralContent}>
              <View style={styles.referralIcon}>
                <Ionicons name="gift" size={32} color="#FFF" />
              </View>
              <View style={styles.referralInfo}>
                <Text style={styles.referralTitle}>{ST.earnPromo}</Text>
                <Text style={styles.referralSubtitle}>{ST.earnPromoSub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Sección de transacciones */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{ST.history}</Text>
            {transacciones.length > 5 && (
              <TouchableOpacity onPress={() => setShowAllTransactions(!showAllTransactions)}>
                <Text style={styles.seeAllText}>
                  {showAllTransactions ? ST.seeLess : ST.seeAll}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {transacciones.length === 0 ? (
            <View style={styles.emptyTransactions}>
              <Ionicons name="wallet-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>{ST.noMovements}</Text>
              <Text style={styles.emptySubtext}>{ST.noMovSub}</Text>
            </View>
          ) : (
            <View>
              {(showAllTransactions ? transacciones : transacciones.slice(0, 5)).map((tx) => (
                <View key={tx.id}>
                  {renderTransaction({ item: tx })}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Información de cómo usar el saldo */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>{ST.howToUse}</Text>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color={GREEN} />
            <Text style={styles.infoText}>
              {ST.autoApplied}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color={GREEN} />
            <Text style={styles.infoText}>
              Puedes elegir cuánto saldo aplicar en cada compra
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color={GREEN} />
            <Text style={styles.infoText}>
              Tu saldo no expira mientras tengas actividad
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modal: elegir regalo del Kit de Bienvenida */}
      <Modal visible={kitModalOpen} animationType="slide" transparent onRequestClose={() => { closeKitDetail(); setKitModalOpen(false); }}>
        <View style={styles.kitModalOverlay}>
          <View style={styles.kitModalCard}>
            {/* Encabezado */}
            <View style={styles.kitModalHeader}>
              {kitDetail ? (
                <TouchableOpacity onPress={closeKitDetail} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="chevron-back" size={24} color="#333" />
                  <Text style={styles.kitModalTitle}>Volver</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.kitModalTitle}>🎁 Elige tu regalo</Text>
              )}
              <TouchableOpacity onPress={() => { closeKitDetail(); setKitModalOpen(false); }}>
                <Ionicons name="close" size={26} color="#333" />
              </TouchableOpacity>
            </View>

            {kitDetail ? (
              /* ===== DETALLE DEL PRODUCTO (visor + miniaturas + video) ===== */
              <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
                {/* Visor principal: foto o video reproduciéndose */}
                {videoPlaying && kitDetail.video_url ? (
                  <Video
                    source={{ uri: kitDetail.video_url }}
                    style={styles.kitDetailImg}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                    isLooping={false}
                  />
                ) : (kitDetail.photos?.[mainImgIndex]?.url) ? (
                  <View style={styles.kitDetailImg}>
                    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                      <ActivityIndicator color={SEA_COLOR} />
                    </View>
                    <Image source={{ uri: kitDetail.photos[mainImgIndex].url }} style={[styles.kitDetailImg, { position: 'absolute' }]} resizeMode="cover" fadeDuration={0} />
                  </View>
                ) : (
                  <View style={[styles.kitDetailImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' }]}>
                    <Text style={{ fontSize: 50 }}>🎁</Text>
                  </View>
                )}

                {/* Tira de miniaturas: fotos + video (con play) */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                  {(kitDetail.photos || []).filter((ph: any) => ph?.url).map((ph: any, i: number) => (
                    <TouchableOpacity key={i} onPress={() => { setVideoPlaying(false); setMainImgIndex(i); }}
                      style={[styles.kitThumb, !videoPlaying && mainImgIndex === i && styles.kitThumbActive]}>
                      <Image source={{ uri: ph.url }} style={styles.kitThumbImg} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                  {!!kitDetail.video_url && (
                    <TouchableOpacity onPress={() => setVideoPlaying(true)} style={[styles.kitThumb, videoPlaying && styles.kitThumbActive]}>
                      {kitDetail.photos?.[0]?.url && <Image source={{ uri: kitDetail.photos[0].url }} style={styles.kitThumbImg} resizeMode="cover" />}
                      <View style={styles.kitThumbPlay}>
                        <Ionicons name="play" size={22} color="#FFF" />
                      </View>
                    </TouchableOpacity>
                  )}
                </ScrollView>

                <Text style={[styles.kitDetailName, { marginTop: 14 }]}>{kitDetail.name}</Text>
                {!!kitDetail.description && <Text style={styles.kitDetailDesc}>{kitDetail.description}</Text>}
                <TouchableOpacity
                  style={[styles.kitChooseBtn, { marginTop: 16 }, selectingKitId != null && { opacity: 0.6 }]}
                  disabled={selectingKitId != null}
                  onPress={() => confirmSelect(kitDetail.id, kitDetail.name)}
                >
                  {selectingKitId === kitDetail.id
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={styles.kitChooseTxt}>Elegir este regalo</Text>}
                </TouchableOpacity>
              </ScrollView>
            ) : (
              /* ===== LISTA DE PRODUCTOS ===== */
              <>
                <Text style={styles.kitModalSub}>Solo puedes elegir 1. Toca un regalo para ver sus detalles.</Text>
                <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
                  {kitProducts.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: '#888', padding: 24 }}>No hay regalos disponibles por ahora.</Text>
                  ) : kitProducts.map((p: any) => (
                    <TouchableOpacity key={p.id} activeOpacity={0.8} style={styles.kitProdCard} onPress={() => openKitDetail(p)}>
                      {p.photos?.[0]?.url ? (
                        <Image source={{ uri: p.photos[0].url }} style={styles.kitProdImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.kitProdImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eee' }]}>
                          <Text style={{ fontSize: 30 }}>🎁</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
                        <Text style={styles.kitProdName}>{p.name}</Text>
                        {!!p.description && <Text style={styles.kitProdDesc} numberOfLines={2}>{p.description}</Text>}
                        <Text style={{ color: '#F05A28', fontSize: 12, fontWeight: '700', marginTop: 6 }}>Ver detalles →</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  kitBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 16, gap: 12 },
  kitBannerIcon: { position: 'relative', width: 40, alignItems: 'center' },
  kitDot: { position: 'absolute', top: -2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFEB3B', borderWidth: 2, borderColor: '#FFF' },
  kitBannerTitle: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  kitBannerSub: { color: '#FFF', opacity: 0.9, fontSize: 12, marginTop: 2 },
  kitModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  kitModalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 },
  kitModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kitModalTitle: { fontSize: 20, fontWeight: '800', color: '#222' },
  kitModalSub: { color: '#888', fontSize: 13, marginTop: 4, marginBottom: 14 },
  kitProdCard: { flexDirection: 'row', backgroundColor: '#FAFAFA', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  kitProdImg: { width: 84, height: 84, borderRadius: 10, backgroundColor: '#eee' },
  kitProdName: { fontSize: 15, fontWeight: '700', color: '#222' },
  kitProdDesc: { fontSize: 12, color: '#777', marginTop: 2 },
  kitChooseBtn: { backgroundColor: '#F05A28', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  kitChooseTxt: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  kitDetailImg: { width: Dimensions.get('window').width - 40, height: 240, borderRadius: 14, backgroundColor: '#eee' },
  kitDetailName: { fontSize: 19, fontWeight: '800', color: '#222', marginBottom: 6 },
  kitDetailDesc: { fontSize: 14, color: '#555', lineHeight: 20 },
  kitThumb: { width: 60, height: 60, borderRadius: 8, marginRight: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: '#eee' },
  kitThumbActive: { borderColor: '#F05A28' },
  kitThumbImg: { width: '100%', height: '100%' },
  kitThumbPlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  
  // Balance card
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  balanceAmount: {
    color: '#FFF',
    fontSize: 42,
    fontWeight: 'bold',
  },
  balanceCurrency: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    marginTop: 4,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  pendingText: {
    color: '#FFF',
    fontSize: 12,
    marginLeft: 4,
  },
  
  // Info cards
  infoCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  
  // Referral banner
  referralBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  referralGradient: {
    padding: 16,
  },
  referralContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  referralIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  referralInfo: {
    flex: 1,
  },
  referralTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  referralSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  
  // Transactions section
  transactionsSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  seeAllText: {
    color: SEA_COLOR,
    fontSize: 14,
    fontWeight: '500',
  },
  
  // Transaction item
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionConcept: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Empty state
  emptyTransactions: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  
  // Info section
  infoSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
});
