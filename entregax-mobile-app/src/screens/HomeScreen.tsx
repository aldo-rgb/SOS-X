import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  StatusBar,
  Pressable,
  Alert,
  Modal,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  Chip,
  FAB,
  Appbar,
  ActivityIndicator,
  Surface,
  Avatar,
  Icon,
  Checkbox,
  Divider,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { getMyPackagesApi, Package } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { changeLanguage, getCurrentLanguage } from '../i18n';

// Colores de marca
const ORANGE = '#F05A28';
const BLACK = '#111111';

// Colores de estado
const STATUS_COLORS: Record<string, string> = {
  received: '#2196F3',      // Azul - Recibido en casillero
  in_transit: '#F05A28',    // Naranja - En tránsito
  processing: '#9C27B0',    // Morado - Procesando envío
  shipped: '#00BCD4',       // Cyan - Vuelo confirmado
  delivered: '#4CAF50',     // Verde - Entregado
  pending: '#FFC107',       // Amarillo - Pendiente
};

// STATUS_LABELS se define dentro del componente usando t()

type RootStackParamList = {
  Login: undefined;
  Home: { user: any; token: string };
  ConsolidationSummary: { selectedIds: number[]; packages: Package[]; token: string; user: any };
  Payment: { consolidationId: number; weight: number; token: string; user: any };
  MyAddresses: { user: any; token: string };
  MyPaymentMethods: { user: any; token: string };
  MyProfile: { user: any; token: string };
  GEXContract: { package: Package; user: any; token: string };
  RequestAdvisor: { user: any; token: string };
  SupportChat: { user: any; token: string };
  Notifications: { user: any; token: string };
};

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
  route: RouteProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation, route }: HomeScreenProps) {
  const { t } = useTranslation();
  const { user, token } = route.params;
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]); // 🔥 IDs seleccionados
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // 📱 Menú de opciones
  const [showLanguageModal, setShowLanguageModal] = useState(false); // 🌐 Modal de idioma
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());

  // 🔐 Verificar si el usuario está verificado
  const isUserVerified = user.isVerified === true;
  const verificationStatus = user.verificationStatus || 'not_started';
  const isPendingReview = verificationStatus === 'pending_review';

  // 📦 Función para obtener el label de status traducido
  const getStatusLabel = (status: string): string => {
    const statusLabels: Record<string, string> = {
      received: t('status.inWarehouse'),
      in_transit: t('status.inTransit'),
      processing: `📋 ${t('status.processing')}`,
      shipped: `✈️ ${t('status.shipped')}`,
      delivered: t('status.delivered'),
      pending: t('status.pending'),
    };
    return statusLabels[status] || status;
  };

  const fetchPackages = useCallback(async () => {
    try {
      const data = await getMyPackagesApi(user.id, token);
      setPackages(data);
    } catch (error) {
      console.error('Error fetching packages:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id, token]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // 🔄 Refrescar al volver a la pantalla (después de contratar GEX)
  useFocusEffect(
    useCallback(() => {
      fetchPackages();
    }, [fetchPackages])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedIds([]); // Limpiar selección al refrescar
    fetchPackages();
  };

  const handleLogout = () => {
    navigation.replace('Login');
  };

  // 🌐 Cambiar idioma
  const handleChangeLanguage = async (lang: string) => {
    await changeLanguage(lang);
    setCurrentLang(lang);
    setShowLanguageModal(false);
  };

  // 🔥 Lógica de Selección (Toggle) - Solo si está verificado
  const toggleSelection = (id: number) => {
    if (!isUserVerified) {
      Alert.alert(
        isPendingReview ? `⏳ ${t('home.profileInReview')}` : `⚠️ ${t('home.verificationRequired')}`,
        isPendingReview 
          ? t('home.profileInReviewMsg')
          : t('home.verificationRequiredMsg'),
        [{ text: t('home.understood'), style: 'default' }]
      );
      return;
    }
    
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(itemId => itemId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // 🔥 Navegar a Consolidación - Solo si está verificado
  const handleConsolidate = () => {
    if (!isUserVerified) {
      Alert.alert(
        `🔒 ${t('home.actionNotAllowed')}`,
        t('home.actionNotAllowedMsg'),
        [{ text: t('home.understood'), style: 'default' }]
      );
      return;
    }
    
    const selectedPackages = packages.filter(p => selectedIds.includes(p.id));
    navigation.navigate('ConsolidationSummary', {
      selectedIds,
      packages: selectedPackages,
      token,
      user, // 🔥 Pasamos el usuario para crear la consolidación
    });
  };

  const renderPackageCard = ({ item }: { item: Package }) => {
    const statusColor = STATUS_COLORS[item.status] || '#999';
    // Usar statusLabel traducido
    const statusLabel = getStatusLabel(item.status);
    
    // Solo permitimos seleccionar si está "received" (En Bodega) Y usuario verificado
    const isSelectable = item.status === 'received' && isUserVerified;
    const isSelected = selectedIds.includes(item.id);
    
    // Paquete ya fue despachado (vuelo confirmado)
    const isShipped = item.status === 'shipped' || item.consolidation_status === 'shipped';
    
    // 🛡️ Mostrar botón GEX solo si está en bodega o procesando (NO en tránsito, shipped, delivered)
    const canContractGEX = ['received', 'processing'].includes(item.status) && 
                           item.consolidation_status !== 'in_transit' &&
                           item.consolidation_status !== 'shipped';

    const handlePress = () => {
      if (item.status === 'received') {
        toggleSelection(item.id);
      }
    };
    
    // 🛡️ Navegar a contratar GEX
    const handleContractGEX = () => {
      navigation.navigate('GEXContract', {
        package: item,
        user,
        token,
      });
    };

    return (
      <Pressable 
        onPress={handlePress}
        style={({ pressed }) => [
          { opacity: pressed && isSelectable ? 0.7 : 1 }
        ]}
      >
        <Card 
          style={[
            styles.card, 
            isSelected && styles.cardSelected,
            isShipped && styles.cardShipped // Estilo especial para despachados
          ]} 
        >
          {/* 📷 FOTO DEL PAQUETE (Si existe) */}
          {item.image_url ? (
            <Card.Cover 
              source={{ uri: item.image_url }} 
              style={styles.cardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.noImageContainer}>
              <Icon source="camera-off" size={24} color="#ccc" />
              <Text style={styles.noImageText}>{t('home.noPhoto')}</Text>
            </View>
          )}

          <Card.Content style={styles.cardContent}>
            <View style={styles.cardRow}>
              {/* 🔲 Checkbox (solo si es seleccionable) */}
              {isSelectable && (
                <View style={styles.checkboxContainer}>
                  <Checkbox
                    status={isSelected ? 'checked' : 'unchecked'}
                    color={ORANGE}
                    onPress={() => toggleSelection(item.id)}
                  />
                </View>
              )}

              <View style={styles.cardMainContent}>
                {/* Header del paquete */}
                <View style={styles.cardHeader}>
                  <View style={styles.trackingContainer}>
                    <Text style={styles.description} numberOfLines={1}>
                      {item.description || t('home.package')}
                    </Text>
                    <Text style={styles.trackingNumber}>TRN: {item.tracking_internal}</Text>
                  </View>
                </View>
                
                {/* Chip de Estado */}
                <View style={styles.statusRow}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                    <Icon 
                      source={item.status === 'in_transit' ? 'airplane' : 
                              item.status === 'received' ? 'package-variant' :
                              item.status === 'shipped' ? 'airplane-takeoff' :
                              item.status === 'delivered' ? 'check-circle' :
                              item.status === 'processing' ? 'clipboard-text' : 'package-variant'} 
                      size={12} 
                      color={statusColor} 
                    />
                    <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                  
                  {/* 🛡️ Badge de Garantía Extendida */}
                  {item.has_gex && (
                    <View style={styles.gexBadge}>
                      <Icon source="shield-check" size={12} color="#10B981" />
                      <Text style={styles.gexBadgeText}>{t('home.extendedWarranty')}</Text>
                    </View>
                  )}
                </View>

                {/* Información adicional */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoText}>⚖️ {item.weight ? `${item.weight} kg` : '--'}</Text>
                  <Text style={styles.infoText}>📏 {item.dimensions || '--'}</Text>
                  {item.carrier && <Text style={styles.infoText}>🚚 {item.carrier}</Text>}
                </View>

                {/* 💳 Botón de Pago (solo si está despachado) */}
                {isShipped && item.consolidation_id && (
                  <View style={styles.payButtonContainer}>
                    <Pressable
                      style={styles.payButton}
                      onPress={() => navigation.navigate('Payment', {
                        consolidationId: item.consolidation_id!,
                        weight: item.weight || 0,
                        token,
                        user
                      })}
                    >
                      <Icon source="credit-card" size={18} color="#fff" />
                      <Text style={styles.payButtonText}>{t('home.payFreight')}</Text>
                    </Pressable>
                  </View>
                )}

                {/* 🛡️ Botón de Garantía Extendida (solo si está en bodega o procesando) */}
                {canContractGEX && (
                  <View style={styles.gexButtonContainer}>
                    <Pressable
                      style={item.has_gex ? styles.gexButton : styles.gexButtonUnprotected}
                      onPress={item.has_gex ? undefined : handleContractGEX}
                      disabled={item.has_gex}
                    >
                      <Icon source={item.has_gex ? "shield-check" : "shield-off"} size={16} color="#fff" />
                      <Text style={styles.gexButtonText}>
                        {item.has_gex ? t('home.withExtendedWarranty') : t('home.withoutExtendedWarranty')}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>
      </Pressable>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>📭</Text>
      <Text style={styles.emptyTitle}>{t('home.noPackages')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('home.noPackagesDesc')}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={styles.loadingText}>{t('home.loadingPackages')}</Text>
      </View>
    );
  }

  // Contar paquetes en bodega (seleccionables)
  const packagesInWarehouse = packages.filter(p => p.status === 'received').length;

  // Bandera del idioma actual
  const getLanguageFlag = (lang: string) => {
    switch (lang) {
      case 'es': return '🇲🇽';
      case 'en': return '🇺🇸';
      case 'zh': return '🇨🇳';
      default: return '🌐';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      
      {/* Appbar */}
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content 
          title="EntregaX" 
          titleStyle={styles.appbarTitle}
        />
        <TouchableOpacity 
          onPress={() => setShowLanguageModal(true)}
          style={styles.languageButton}
        >
          <Text style={styles.languageFlag}>{getLanguageFlag(currentLang)}</Text>
        </TouchableOpacity>
        <Appbar.Action 
          icon="bell-outline" 
          onPress={() => navigation.navigate('Notifications', { user, token })} 
          color="white" 
        />
        <Appbar.Action icon="menu" onPress={() => setShowMenu(true)} color="white" />
      </Appbar.Header>

      {/* 🌐 Modal de Idioma */}
      <Modal visible={showLanguageModal} animationType="fade" transparent>
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setShowLanguageModal(false)}
        >
          <View style={styles.languageModalContainer}>
            <Text style={styles.languageModalTitle}>{t('profile.selectLanguage')}</Text>
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

      {/* 📱 Modal de Menú */}
      <Modal visible={showMenu} animationType="fade" transparent>
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Avatar.Text 
                size={40} 
                label={user.name?.charAt(0) || 'U'} 
                style={{ backgroundColor: ORANGE }}
              />
              <View style={styles.menuUserInfo}>
                <Text style={styles.menuUserName}>{user.name}</Text>
                <Text style={styles.menuUserEmail}>{user.email}</Text>
              </View>
            </View>
            <Divider />
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyAddresses', { user, token });
              }}
            >
              <Ionicons name="location-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>{t('profile.myAddresses')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyPaymentMethods', { user, token });
              }}
            >
              <Ionicons name="wallet-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>{t('profile.myPaymentMethods')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyProfile', { user, token });
              }}
            >
              <Ionicons name="person-circle-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>{t('profile.title')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('RequestAdvisor', { user, token });
              }}
            >
              <Ionicons name="people-outline" size={24} color={ORANGE} />
              <Text style={[styles.menuItemText, { color: ORANGE }]}>{t('profile.requestAdvisor')}</Text>
              <Ionicons name="chevron-forward" size={20} color={ORANGE} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('SupportChat', { user, token });
              }}
            >
              <Ionicons name="chatbubbles-outline" size={24} color="#2196F3" />
              <Text style={[styles.menuItemText, { color: '#2196F3' }]}>{t('profile.helpCenter')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#2196F3" />
            </TouchableOpacity>

            <Divider style={{ marginVertical: 8 }} />

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                handleLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={24} color="#f44336" />
              <Text style={[styles.menuItemText, { color: '#f44336' }]}>{t('profile.logout')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header con información del usuario */}
      <Surface style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Avatar.Text 
            size={50} 
            label={user.name?.charAt(0) || 'U'} 
            style={{ backgroundColor: ORANGE }}
          />
          <View style={styles.userTextContainer}>
            <Text style={styles.greeting}>{t('home.greeting')}, {user.name?.split(' ')[0]}!</Text>
            <Text style={styles.boxId}>📦 {t('home.mailbox')}: {user.boxId}</Text>
          </View>
        </View>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{packages.length}</Text>
            <Text style={styles.statLabel}>{t('home.packages')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{packagesInWarehouse}</Text>
            <Text style={styles.statLabel}>{t('home.inWarehouse')}</Text>
          </View>
        </View>
      </Surface>

      {/* 🔐 Banner de verificación pendiente */}
      {!isUserVerified && (
        <View style={[styles.verificationBanner, isPendingReview ? styles.pendingBanner : styles.warningBanner]}>
          <Icon source={isPendingReview ? "clock-outline" : "alert-circle"} size={20} color={isPendingReview ? "#ff9800" : "#f44336"} />
          <View style={styles.verificationBannerText}>
            <Text style={[styles.verificationTitle, { color: isPendingReview ? "#e65100" : "#c62828" }]}>
              {isPendingReview ? `⏳ ${t('home.profileInReview')}` : `⚠️ ${t('home.verificationRequired')}`}
            </Text>
            <Text style={styles.verificationSubtitle}>
              {isPendingReview 
                ? t('home.profileInReviewMsg')
                : t('home.verificationRequiredMsg')}
            </Text>
          </View>
        </View>
      )}

      {/* Instrucciones de selección */}
      {packagesInWarehouse > 0 && isUserVerified && (
        <View style={styles.selectionHint}>
          <Text style={styles.selectionHintText}>
            👆 {t('packages.selectForConsolidation')}
          </Text>
        </View>
      )}

      {/* Lista de paquetes */}
      <FlatList
        data={packages}
        renderItem={renderPackageCard}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[ORANGE]}
            tintColor={ORANGE}
          />
        }
        ListEmptyComponent={renderEmptyList}
        showsVerticalScrollIndicator={false}
      />

      {/* 🔥 FAB para ENVIAR (Solo aparece si hay selección) */}
      {selectedIds.length > 0 ? (
        <FAB
          icon="airplane-takeoff"
          label={`${t('home.requestConsolidation')} (${selectedIds.length})`}
          style={styles.fabSend}
          color="white"
          onPress={handleConsolidate}
        />
      ) : (
        <FAB
          icon="plus"
          label={t('home.requestConsolidation')}
          style={styles.fab}
          color="white"
          onPress={() => {
            // TODO: Implementar embarque
            console.log('Enviar paquete');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 15,
    color: '#666',
    fontSize: 16,
  },
  appbar: {
    backgroundColor: BLACK,
    elevation: 0,
  },
  appbarTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 20,
  },
  userHeader: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  userTextContainer: {
    marginLeft: 15,
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BLACK,
  },
  boxId: {
    fontSize: 14,
    color: '#666',
    marginTop: 3,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 15,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#ddd',
    marginHorizontal: 10,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: ORANGE,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  selectionHint: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  selectionHintText: {
    color: '#1976D2',
    fontSize: 12,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: 'white',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: ORANGE,
    borderWidth: 2,
  },
  cardShipped: {
    borderColor: '#00BCD4',
    borderWidth: 2,
    backgroundColor: '#E0F7FA',
  },
  cardImage: {
    height: 140,
  },
  noImageContainer: {
    height: 60,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  noImageText: {
    color: '#999',
    fontSize: 12,
  },
  cardContent: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxContainer: {
    marginRight: 8,
    marginTop: -4,
  },
  cardMainContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  trackingContainer: {
    flex: 1,
    marginRight: 10,
  },
  description: {
    fontSize: 15,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 2,
  },
  trackingNumber: {
    fontSize: 12,
    color: '#666',
  },
  statusChip: {
    height: 28,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  // 🚀 Badge de Estado (mismo diseño que GEX)
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  // 🛡️ Badge GEX
  gexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  gexBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#10B981',
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoText: {
    fontSize: 12,
    color: '#555',
  },
  payButtonContainer: {
    marginTop: 12,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003087', // Azul PayPal
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // 🛡️ Estilos para botón GEX
  gexButtonContainer: {
    marginTop: 8,
  },
  gexButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981', // Verde esmeralda - Protegido
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  gexButtonUnprotected: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444', // Rojo - Sin protección
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  gexButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 30,
    backgroundColor: ORANGE,
  },
  fabSend: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 30,
    backgroundColor: ORANGE,
  },
  // 🔐 Estilos para banner de verificación
  verificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  pendingBanner: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  warningBanner: {
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  verificationBannerText: {
    flex: 1,
  },
  verificationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  verificationSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  // 📱 Estilos para el menú
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
  },
  menuContainer: {
    backgroundColor: 'white',
    marginTop: 60,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f8f8',
  },
  menuUserInfo: {
    marginLeft: 12,
    flex: 1,
  },
  menuUserName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  menuUserEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: BLACK,
  },
  // 🌐 Estilos para selector de idioma
  languageButton: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageFlag: {
    fontSize: 22,
  },
  languageModalContainer: {
    backgroundColor: 'white',
    marginTop: 100,
    marginHorizontal: 40,
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  languageModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
    textAlign: 'center',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginVertical: 4,
  },
  languageOptionActive: {
    backgroundColor: '#FFF3E0',
  },
  languageOptionFlag: {
    fontSize: 28,
    marginRight: 12,
  },
  languageOptionText: {
    flex: 1,
    fontSize: 16,
    color: BLACK,
  },
  languageOptionTextActive: {
    fontWeight: 'bold',
    color: ORANGE,
  },
});
