import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
  Clipboard,
} from 'react-native';
import { Appbar } from 'react-native-paper';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../services/api';
import { useTranslation } from 'react-i18next';

const ORANGE = '#F05A28';
const BLACK = '#111';
const BG = '#F5F5F5';

interface User {
  id: number;
  name?: string;
  full_name?: string;
  email?: string;
  boxId?: string;
}

type RootStackParamList = {
  ServicesGuide: { user: User; token: string };
  RequestAdvisor: { user: User; token: string };
};

interface WarehouseAddress {
  alias: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  business_hours: string | null;
  special_instructions: string | null;
  is_primary: boolean;
}

interface ServiceApiInfo {
  serviceType: string;
  instructions: {
    packaging_instructions: string;
    shipping_instructions: string;
    general_notes: string;
  } | null;
  addresses: WarehouseAddress[];
}

interface ServiceCard {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  timeframe: string;
  idealFor: string;
  benefits: string[];
  serviceType: string;
  accentColor: string;
}

// Static accent colors (not translated)
const SERVICE_ACCENTS: Record<string, string> = {
  china_air: '#1565C0',
  china_sea: '#00695C',
  mx_cedis:  '#2E7D32',
  usa_pobox: '#6A1B9A',
};

type Props = NativeStackScreenProps<RootStackParamList, 'ServicesGuide'>;

export default function ServicesGuideScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const { t } = useTranslation();
  const sg = (k: string) => (t as any)(`servicesGuide.${k}`, { defaultValue: k });

  const SERVICES_I18N: ServiceCard[] = [
    { id: 'china_air', name: sg('services.china_air.name'), emoji: '🇨🇳', tagline: sg('services.china_air.tagline'), timeframe: sg('services.china_air.timeframe'), idealFor: sg('services.china_air.idealFor'), benefits: (t as any)('servicesGuide.services.china_air.benefits', { returnObjects: true }) as string[], serviceType: 'china_air', accentColor: SERVICE_ACCENTS.china_air },
    { id: 'china_sea', name: sg('services.china_sea.name'), emoji: '🇨🇳', tagline: sg('services.china_sea.tagline'), timeframe: sg('services.china_sea.timeframe'), idealFor: sg('services.china_sea.idealFor'), benefits: (t as any)('servicesGuide.services.china_sea.benefits', { returnObjects: true }) as string[], serviceType: 'china_sea', accentColor: SERVICE_ACCENTS.china_sea },
    { id: 'mx_cedis', name: sg('services.mx_cedis.name'), emoji: '🌍', tagline: sg('services.mx_cedis.tagline'), timeframe: sg('services.mx_cedis.timeframe'), idealFor: sg('services.mx_cedis.idealFor'), benefits: (t as any)('servicesGuide.services.mx_cedis.benefits', { returnObjects: true }) as string[], serviceType: 'mx_cedis', accentColor: SERVICE_ACCENTS.mx_cedis },
    { id: 'usa_pobox', name: sg('services.usa_pobox.name'), emoji: '🇺🇸', tagline: sg('services.usa_pobox.tagline'), timeframe: sg('services.usa_pobox.timeframe'), idealFor: sg('services.usa_pobox.idealFor'), benefits: (t as any)('servicesGuide.services.usa_pobox.benefits', { returnObjects: true }) as string[], serviceType: 'usa_pobox', accentColor: SERVICE_ACCENTS.usa_pobox },
  ];

  const [step, setStep] = useState<0 | 1>(0);
  const [selected, setSelected] = useState<ServiceCard | null>(null);
  const [serviceInfo, setServiceInfo] = useState<ServiceApiInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSelect = async (service: ServiceCard) => {
    setSelected(service);
    setServiceInfo(null);
    setStep(1);
    setLoading(true);
    try {
      const res = await api.get(`/api/services/${service.serviceType}/info`);
      setServiceInfo(res.data);
    } catch {
      // No forzamos error — mostramos lo que tengamos
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep(0);
    setSelected(null);
    setServiceInfo(null);
  };

  const getPersonalizedAddress = (addr: WarehouseAddress): string => {
    const name = user.full_name || user.name || 'TU NOMBRE';
    const box = user.boxId || 'S-XXX';
    if (selected?.id === 'usa_pobox') {
      return `${addr.address_line1.replace('(S-Numero de Cliente)', box)}\nATTN: ${name}\n${addr.city}, ${addr.state} ${addr.zip_code}\n${addr.contact_phone || ''}`;
    }
    if (selected?.id === 'china_air' || selected?.id === 'china_sea') {
      return `${addr.address_line1}\n${addr.address_line2 ? addr.address_line2 + '\n' : ''}Shipping Mark / 唛头: ${box}\nContacto: ${addr.contact_name || ''}\n${addr.contact_phone || ''}`;
    }
    return `${addr.address_line1}\n${addr.city}, ${addr.state} ${addr.zip_code}\nA nombre de: ${name} (${box})\n${addr.contact_phone || ''}`;
  };

  const getChineseNote = (): string | null => {
    const box = user.boxId || 'S-XXX';
    if (selected?.id === 'china_sea') {
      return [
        '🇨🇳 中文说明（请转发给您的供应商）:',
        '发货前，请供应商联系 Sankie Guo（郭先生）',
        '电话 / 微信：13828423184',
        '并提供完整装箱单（Packing List），以获取装运单（S/O）。',
        `⚠️ 每箱请贴上唛头标签（Shipping Mark）：${box}`,
        '⚠️ 未提前联系确认，仓库将无法收货。',
      ].join('\n');
    }
    if (selected?.id === 'china_air') {
      return [
        '🇨🇳 中文说明（请转发给您的供应商）:',
        '发货前，请供应商联系冯小姐',
        '电话 / 微信：+13068841004',
        `⚠️ 每箱请贴上唛头标签（Shipping Mark）：${box}`,
        '⚠️ 不接受无唛头货物及到付件。',
      ].join('\n');
    }
    return null;
  };

  const getFullShipmentText = (addr: WarehouseAddress): string => {
    const svcName = selected?.name || 'EntregaX';
    const lines: string[] = [
      `📦 INSTRUCCIONES DE ENVÍO - ${svcName.toUpperCase()}`,
      '',
      '📍 DIRECCIÓN DE ENVÍO:',
      getPersonalizedAddress(addr),
    ];
    if (addr.business_hours) {
      lines.push('', `🕐 Horario: ${addr.business_hours}`);
    }
    if (serviceInfo?.instructions?.packaging_instructions) {
      lines.push('', '📦 INSTRUCCIONES DE EMPAQUE:', serviceInfo.instructions.packaging_instructions);
    }
    if (serviceInfo?.instructions?.shipping_instructions) {
      lines.push('', '🚚 CÓMO ENVIAR:', serviceInfo.instructions.shipping_instructions);
    }
    if (serviceInfo?.instructions?.general_notes) {
      lines.push('', '⚠️ NOTAS IMPORTANTES:', serviceInfo.instructions.general_notes);
    }
    const chineseNote = getChineseNote();
    if (chineseNote) {
      lines.push('', '─'.repeat(30), '', chineseNote);
    }
    lines.push('', '✅ Enviado vía EntregaX Paquetería');
    return lines.join('\n');
  };

  const handleCopy = (addr: WarehouseAddress) => {
    Clipboard.setString(getFullShipmentText(addr));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async (addr: WarehouseAddress) => {
    await Share.share({ message: getFullShipmentText(addr) });
  };

  // ── Paso 0: Selección ─────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={styles.header}>
          <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
          <Appbar.Content title={sg('title')} titleStyle={styles.headerTitle} />
        </Appbar.Header>

        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>{sg('heading')}</Text>
          <Text style={styles.stepHint}>{sg('subheading')}</Text>

          {SERVICES_I18N.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.serviceCard}
              activeOpacity={0.85}
              onPress={() => handleSelect(s)}
            >
              <View style={[styles.serviceEmojiWrap, { backgroundColor: s.accentColor + '15' }]}>
                <Text style={styles.serviceEmoji}>{s.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{s.name}</Text>
                <Text style={styles.serviceTagline}>{s.tagline}</Text>
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={12} color={s.accentColor} />
                  <Text style={[styles.timeBadgeText, { color: s.accentColor }]}>{s.timeframe}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#CCC" />
            </TouchableOpacity>
          ))}

          <View style={styles.advisorBox}>
            <Text style={styles.advisorTitle}>{sg('notSure')}</Text>
            <Text style={styles.advisorText}>{sg('notSureDesc')}</Text>
            <TouchableOpacity
              style={styles.advisorBtn}
              onPress={() => navigation.navigate('RequestAdvisor', { user, token })}
            >
              <Ionicons name="headset" size={18} color={ORANGE} />
              <Text style={styles.advisorBtnText}>{sg('requestAdvisory')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Paso 1: Detalle ───────────────────────────────────────────────────────

  const svc = selected!;

  return (
    <View style={styles.container}>
      {/* Header coloreado con gradiente visual */}
      <View style={[styles.detailHeader, { backgroundColor: svc.accentColor }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.detailEmoji}>{svc.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailTitle}>{svc.name}</Text>
          <Text style={styles.detailTagline}>{svc.tagline}</Text>
        </View>
        <View style={styles.detailTimeBadge}>
          <Ionicons name="time-outline" size={12} color="#fff" />
          <Text style={styles.detailTimeText}>{svc.timeframe}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>

        {/* Beneficios */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ventajas del servicio</Text>
          {svc.benefits.map((b, i) => (
            <Text key={i} style={styles.benefitRow}>{b}</Text>
          ))}
        </View>

        {/* Ideal para */}
        <View style={[styles.idealBox, { borderLeftColor: svc.accentColor }]}>
          <Text style={styles.idealLabel}>Ideal para</Text>
          <Text style={styles.idealText}>{svc.idealFor}</Text>
        </View>

        {/* Dirección(es) */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={svc.accentColor} size="large" />
            <Text style={styles.loadingText}>Cargando dirección…</Text>
          </View>
        ) : serviceInfo?.addresses && serviceInfo.addresses.length > 0 ? (
          serviceInfo.addresses.map((addr, idx) => (
            <View key={idx} style={styles.section}>
              <Text style={styles.sectionTitle}>📍 Tu dirección de envío</Text>
              <Text style={styles.addrSubtitle}>Personalizada con tu número de cliente <Text style={{ fontWeight: '700' }}>{user.boxId}</Text></Text>
              <View style={[styles.addrBox, { borderLeftColor: svc.accentColor }]}>
                <Text style={styles.addrText}>{getPersonalizedAddress(addr)}</Text>
              </View>
              <View style={styles.addrActions}>
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: svc.accentColor }]}
                  onPress={() => handleCopy(addr)}
                >
                  <Ionicons name={copied ? 'checkmark' : 'copy'} size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>{copied ? '¡Copiado!' : 'Copiar todo'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnOutline, { borderColor: svc.accentColor }]}
                  onPress={() => handleShare(addr)}
                >
                  <Ionicons name="share-social" size={16} color={svc.accentColor} />
                  <Text style={[styles.btnOutlineText, { color: svc.accentColor }]}>Compartir</Text>
                </TouchableOpacity>
              </View>
              {addr.business_hours && (
                <View style={styles.hoursRow}>
                  <Ionicons name="time" size={14} color="#888" />
                  <Text style={styles.hoursText}>{addr.business_hours}</Text>
                </View>
              )}
            </View>
          ))
        ) : (
          !loading && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📍 Dirección de envío</Text>
              <Text style={styles.noInfoText}>Contacta a tu asesor para obtener la dirección actualizada de este servicio.</Text>
            </View>
          )
        )}

        {/* Instrucciones */}
        {serviceInfo?.instructions?.packaging_instructions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📦 Instrucciones de empaque</Text>
            <Text style={styles.instrText}>{serviceInfo.instructions.packaging_instructions}</Text>
          </View>
        )}
        {serviceInfo?.instructions?.shipping_instructions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚚 Cómo enviar</Text>
            <Text style={styles.instrText}>{serviceInfo.instructions.shipping_instructions}</Text>
          </View>
        )}
        {serviceInfo?.instructions?.general_notes && (
          <View style={[styles.section, styles.notesSection]}>
            <Text style={styles.sectionTitle}>⚠️ Notas importantes</Text>
            <Text style={styles.instrText}>{serviceInfo.instructions.general_notes}</Text>
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity style={styles.backToList} onPress={handleBack}>
          <Ionicons name="arrow-back-circle-outline" size={20} color={ORANGE} />
          <Text style={styles.backToListText}>Ver otros servicios</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header paso 0
  header: { backgroundColor: BLACK },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Scroll body paso 0
  scrollBody: { padding: 20, paddingBottom: 40 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: BLACK, marginBottom: 6 },
  stepHint: { fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 20 },

  // Tarjeta de servicio (paso 0)
  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  serviceEmojiWrap: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceEmoji: { fontSize: 30 },
  serviceName: { fontSize: 16, fontWeight: '700', color: BLACK, marginBottom: 2 },
  serviceTagline: { fontSize: 12, color: '#777', marginBottom: 6 },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeBadgeText: { fontSize: 11, fontWeight: '600' },

  // Asesor box
  advisorBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    marginTop: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  advisorTitle: { fontSize: 15, fontWeight: '700', color: BLACK, marginBottom: 6 },
  advisorText: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 14 },
  advisorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: ORANGE,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  advisorBtnText: { color: ORANGE, fontWeight: '700', fontSize: 14 },

  // Header paso 1
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 52 : 14,
    paddingBottom: 18,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  detailEmoji: { fontSize: 32 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  detailTagline: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  detailTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  detailTimeText: { fontSize: 11, color: '#fff', fontWeight: '600' },

  // Cuerpo detalle
  detailBody: { padding: 18, paddingBottom: 40 },

  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  notesSection: { backgroundColor: '#FFFDE7' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: BLACK, marginBottom: 10 },

  benefitRow: { fontSize: 13, color: '#444', marginBottom: 5, lineHeight: 20 },

  idealBox: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  idealLabel: { fontSize: 11, fontWeight: '700', color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  idealText: { fontSize: 13, color: '#444' },

  addrSubtitle: { fontSize: 12, color: '#888', marginBottom: 10 },
  addrBox: {
    backgroundColor: '#F8F8F8',
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  addrText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  addrActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  btnOutlineText: { fontWeight: '700', fontSize: 14 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  hoursText: { fontSize: 12, color: '#888' },

  instrText: { fontSize: 13, color: '#555', lineHeight: 21 },

  loadingBox: { alignItems: 'center', paddingVertical: 30, gap: 12 },
  loadingText: { color: '#888', fontSize: 13 },

  noInfoText: { fontSize: 13, color: '#888', lineHeight: 20 },

  backToList: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: ORANGE,
    marginTop: 4,
  },
  backToListText: { color: ORANGE, fontWeight: '700', fontSize: 14 },
});
