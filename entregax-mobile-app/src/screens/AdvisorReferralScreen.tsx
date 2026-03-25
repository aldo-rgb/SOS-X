import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

interface Props {
  route: {
    params: {
      user: any;
      token: string;
    };
  };
  navigation: any;
}

interface ReferralData {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  monthlyReferrals: number;
  pendingCommission: number;
}

const AdvisorReferralScreen: React.FC<Props> = ({ route, navigation }) => {
  const { user, token } = route.params;
  const [loading, setLoading] = useState(true);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/advisor/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setReferralData({
          referralCode: data.referral_code || user.referral_code || 'N/A',
          referralLink: `https://entregax.com/registro?ref=${data.referral_code || user.referral_code}`,
          totalReferrals: data.total_referrals || 0,
          monthlyReferrals: data.monthly_referrals || 0,
          pendingCommission: data.pending_commission || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    setCopied(true);
    Alert.alert('¡Copiado!', 'El código ha sido copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareReferralCode = async () => {
    if (!referralData) return;
    
    try {
      await Share.share({
        message: `¡Únete a EntregaX con mi código de referido: ${referralData.referralCode}! 📦\n\nRegístrate aquí: ${referralData.referralLink}\n\n✅ Envíos desde USA y China\n✅ Servicio PO Box gratuito\n✅ Precios competitivos`,
        title: 'Invitación a EntregaX',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const shareViaWhatsApp = async () => {
    if (!referralData) return;
    
    const message = encodeURIComponent(
      `¡Hola! 👋\n\n¿Ya conoces EntregaX? Es el mejor servicio de envíos desde USA y China a México.\n\n🎁 Usa mi código de referido: *${referralData.referralCode}*\n\n📦 Beneficios:\n✅ Servicio PO Box gratuito\n✅ Precios competitivos\n✅ Seguimiento en tiempo real\n\nRegístrate aquí: ${referralData.referralLink}`
    );
    
    const whatsappUrl = `whatsapp://send?text=${message}`;
    
    try {
      const { Linking } = await import('react-native');
      const supported = await Linking.canOpenURL(whatsappUrl);
      
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('Error', 'WhatsApp no está instalado');
      }
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F05A28" />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="share-social" size={40} color="#fff" />
          </View>
          <Text style={styles.headerTitle}>Comparte y Gana</Text>
          <Text style={styles.headerSubtitle}>
            Invita a nuevos clientes y gana comisiones por cada uno
          </Text>
        </View>

        {/* Referral Code Card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Tu Código de Referido</Text>
          <View style={styles.codeContainer}>
            <Text style={styles.codeText}>{referralData?.referralCode || 'N/A'}</Text>
            <TouchableOpacity 
              style={styles.copyButton}
              onPress={() => copyToClipboard(referralData?.referralCode || '')}
            >
              <Ionicons 
                name={copied ? "checkmark-circle" : "copy-outline"} 
                size={24} 
                color={copied ? "#4CAF50" : "#F05A28"} 
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.codeHint}>
            Comparte este código con tus contactos
          </Text>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={28} color="#F05A28" />
            <Text style={styles.statValue}>{referralData?.totalReferrals || 0}</Text>
            <Text style={styles.statLabel}>Referidos Totales</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="calendar" size={28} color="#2196F3" />
            <Text style={styles.statValue}>{referralData?.monthlyReferrals || 0}</Text>
            <Text style={styles.statLabel}>Este Mes</Text>
          </View>
        </View>

        <View style={styles.commissionCard}>
          <Ionicons name="cash" size={32} color="#4CAF50" />
          <View style={styles.commissionInfo}>
            <Text style={styles.commissionLabel}>Comisión Pendiente</Text>
            <Text style={styles.commissionValue}>
              ${(referralData?.pendingCommission || 0).toFixed(2)} MXN
            </Text>
          </View>
        </View>

        {/* Share Buttons */}
        <Text style={styles.shareTitle}>Compartir por:</Text>
        
        <View style={styles.shareButtons}>
          <TouchableOpacity 
            style={[styles.shareButton, styles.whatsappButton]}
            onPress={shareViaWhatsApp}
          >
            <Ionicons name="logo-whatsapp" size={24} color="#fff" />
            <Text style={styles.shareButtonText}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.shareButton, styles.generalShareButton]}
            onPress={shareReferralCode}
          >
            <Ionicons name="share-outline" size={24} color="#fff" />
            <Text style={styles.shareButtonText}>Otras Apps</Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>¿Cómo funciona?</Text>
          
          <View style={styles.instructionItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.instructionText}>
              Comparte tu código con amigos y familiares
            </Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.instructionText}>
              Ellos se registran usando tu código
            </Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.instructionText}>
              Cuando hagan envíos, tú ganas comisión
            </Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>4</Text>
            </View>
            <Text style={styles.instructionText}>
              Recibe tus ganancias cada mes
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  headerCard: {
    backgroundColor: '#F05A28',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
  codeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  codeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#F05A28',
  },
  codeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F05A28',
    letterSpacing: 2,
    marginRight: 12,
  },
  copyButton: {
    padding: 4,
  },
  codeHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  commissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  commissionInfo: {
    marginLeft: 16,
  },
  commissionLabel: {
    fontSize: 14,
    color: '#666',
  },
  commissionValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  shareTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  shareButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  generalShareButton: {
    backgroundColor: '#F05A28',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  instructionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F05A28',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
});

export default AdvisorReferralScreen;
