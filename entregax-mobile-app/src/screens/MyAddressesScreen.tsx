import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Appbar,
  Card,
  FAB,
  IconButton,
  ActivityIndicator,
  Chip,
} from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';

type RootStackParamList = {
  Home: { user: any; token: string };
  MyAddresses: { user: any; token: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'MyAddresses'>;

interface Address {
  id: number;
  alias: string;
  recipient_name?: string;
  contact_name?: string;
  street: string;
  exterior_number: string;
  interior_number?: string;
  colony?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zip_code: string;
  country?: string;
  phone?: string;
  reference?: string;
  is_default: boolean;
  default_for_service?: string | null; // Ahora es string separado por comas: "maritime,air"
}

export default function MyAddressesScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, token } = route.params;
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [saving, setSaving] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedAddressForService, setSelectedAddressForService] = useState<Address | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [savingService, setSavingService] = useState(false);

  // Form state
  const [form, setForm] = useState({
    alias: '',
    contact_name: '',
    street: '',
    exterior_number: '',
    interior_number: '',
    colony: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'México',
    phone: '',
    reference: '',
  });

  const fetchAddresses = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setAddresses(data.addresses || []);
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const resetForm = () => {
    setForm({
      alias: '',
      contact_name: '',
      street: '',
      exterior_number: '',
      interior_number: '',
      colony: '',
      city: '',
      state: '',
      zip_code: '',
      country: 'México',
      phone: '',
      reference: '',
    });
    setEditingAddress(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (address: Address) => {
    setEditingAddress(address);
    setForm({
      alias: address.alias || '',
      contact_name: address.recipient_name || address.contact_name || '',
      street: address.street,
      exterior_number: address.exterior_number,
      interior_number: address.interior_number || '',
      colony: address.colony || address.neighborhood || '',
      city: address.city,
      state: address.state,
      zip_code: address.zip_code,
      country: address.country || 'México',
      phone: address.phone || '',
      reference: address.reference || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.contact_name || !form.street || !form.exterior_number || !form.colony || !form.city || !form.state || !form.zip_code) {
      Alert.alert(t('common.error'), t('addresses.fillRequired'));
      return;
    }

    setSaving(true);
    try {
      const url = editingAddress 
        ? `${API_URL}/api/addresses/${editingAddress.id}`
        : `${API_URL}/api/addresses`;
      
      const response = await fetch(url, {
        method: editingAddress ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      
      if (response.ok) {
        Alert.alert(t('common.success'), editingAddress ? t('addresses.updated') : t('addresses.saved'));
        setShowModal(false);
        resetForm();
        fetchAddresses();
      } else {
        Alert.alert(t('common.error'), data.error || t('addresses.saveError'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('addresses.connectionError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (address: Address) => {
    Alert.alert(
      t('addresses.deleteTitle'),
      t('addresses.deleteConfirm', { name: address.alias || address.street }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/addresses/${address.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (response.ok) {
                fetchAddresses();
              }
            } catch (error) {
              Alert.alert(t('common.error'), t('addresses.deleteError'));
            }
          },
        },
      ]
    );
  };

  const setDefaultAddress = async (addressId: number) => {
    try {
      const response = await fetch(`${API_URL}/api/addresses/${addressId}/default`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        fetchAddresses();
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('addresses.setDefaultError'));
    }
  };

  const openServiceModal = (address: Address) => {
    setSelectedAddressForService(address);
    // Parsear los servicios actuales
    const currentServices = address.default_for_service 
      ? address.default_for_service.split(',').filter(s => s.trim())
      : [];
    setSelectedServices(currentServices);
    setShowServiceModal(true);
  };

  const toggleService = (service: string) => {
    setSelectedServices(prev => {
      if (prev.includes(service)) {
        return prev.filter(s => s !== service);
      } else {
        return [...prev, service];
      }
    });
  };

  const saveServices = async () => {
    if (!selectedAddressForService) return;
    
    setSavingService(true);
    try {
      const response = await fetch(`${API_URL}/api/addresses/${selectedAddressForService.id}/default-for-service`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ services: selectedServices.length > 0 ? selectedServices : null }),
      });
      if (response.ok) {
        setShowServiceModal(false);
        setSelectedAddressForService(null);
        setSelectedServices([]);
        fetchAddresses();
        Alert.alert(
          '✅ Guardado', 
          selectedServices.length > 0 
            ? `Esta dirección se usará para: ${selectedServices.map(s => getServiceLabel(s)).join(', ')}`
            : 'Se quitó la asignación de servicios'
        );
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la configuración');
    } finally {
      setSavingService(false);
    }
  };

  const getServiceLabel = (service: string): string => {
    switch (service) {
      case 'maritime': return 'Marítimo';
      case 'air': return 'Aéreo';
      case 'usa': return 'USA';
      case 'all': return 'Todos';
      default: return service;
    }
  };

  const getServiceChips = (serviceString: string | null | undefined): string[] => {
    if (!serviceString) return [];
    return serviceString.split(',').filter(s => s.trim());
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ORANGE} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Appbar.Content title={t('addresses.title')} titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {addresses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={80} color="#ccc" />
            <Text style={styles.emptyTitle}>{t('addresses.noAddresses')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('addresses.addForShipping')}
            </Text>
          </View>
        ) : (
          addresses.map((address) => (
            <Card key={address.id} style={styles.card}>
              <Card.Content>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleContainer}>
                    <Text style={styles.cardTitle}>
                      {address.alias || t('addresses.address')}
                    </Text>
                    {getServiceChips(address.default_for_service).length > 0 && (
                      <View style={styles.serviceChipsRow}>
                        {getServiceChips(address.default_for_service).map((svc) => (
                          <View key={svc} style={styles.serviceChipSmall}>
                            <Text style={styles.serviceChipSmallText}>
                              {svc === 'maritime' ? '🚢 Marítimo' : svc === 'air' ? '✈️ Aéreo' : svc === 'usa' ? '🇺🇸 USA' : '🌐 Todos'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={styles.cardActions}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => openEditModal(address)}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                      iconColor="#f44336"
                      onPress={() => handleDelete(address)}
                    />
                  </View>
                </View>
                <Text style={styles.addressText}>
                  {address.street} #{address.exterior_number}
                  {address.interior_number ? ` Int. ${address.interior_number}` : ''}
                </Text>
                <Text style={styles.addressText}>
                  {address.colony}, {address.city}
                </Text>
                <Text style={styles.addressText}>
                  {address.state}, {address.country} C.P. {address.zip_code}
                </Text>
                {address.phone && (
                  <Text style={styles.phoneText}>📞 {address.phone}</Text>
                )}
                <View style={styles.addressButtonsRow}>
                  {!address.is_default && (
                    <TouchableOpacity 
                      style={styles.setDefaultButton}
                      onPress={() => setDefaultAddress(address.id)}
                    >
                      <Text style={styles.setDefaultText}>{t('addresses.setDefault')}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    style={styles.setServiceButton}
                    onPress={() => openServiceModal(address)}
                  >
                    <Ionicons name="settings-outline" size={16} color={ORANGE} />
                    <Text style={styles.setServiceText}>
                      {address.default_for_service ? 'Cambiar servicio' : 'Asignar a servicio'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        color="white"
        onPress={openAddModal}
      />

      {/* Modal para agregar/editar dirección */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingAddress ? t('addresses.editAddress') : t('addresses.newAddress')}
              </Text>
              <IconButton icon="close" onPress={() => setShowModal(false)} />
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>{t('addresses.aliasOptional')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('addresses.aliasPlaceholder')}
                value={form.alias}
                onChangeText={(text) => setForm({ ...form, alias: text })}
              />

              <Text style={styles.inputLabel}>{t('addresses.contactName')} *</Text>
              <TextInput
                style={styles.input}
                placeholder={t('addresses.contactPlaceholder')}
                value={form.contact_name}
                onChangeText={(text) => setForm({ ...form, contact_name: text })}
              />

              <Text style={styles.inputLabel}>{t('addresses.street')} *</Text>
              <TextInput
                style={styles.input}
                placeholder={t('addresses.streetPlaceholder')}
                value={form.street}
                onChangeText={(text) => setForm({ ...form, street: text })}
              />

              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>{t('addresses.exteriorNumber')} *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="123"
                    value={form.exterior_number}
                    onChangeText={(text) => setForm({ ...form, exterior_number: text })}
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>{t('addresses.interiorNumber')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="A, B, 1..."
                    value={form.interior_number}
                    onChangeText={(text) => setForm({ ...form, interior_number: text })}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>{t('addresses.colony')} *</Text>
              <TextInput
                style={styles.input}
                placeholder={t('addresses.colonyPlaceholder')}
                value={form.colony}
                onChangeText={(text) => setForm({ ...form, colony: text })}
              />

              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>{t('addresses.city')} *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('addresses.cityPlaceholder')}
                    value={form.city}
                    onChangeText={(text) => setForm({ ...form, city: text })}
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>{t('addresses.state')} *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('addresses.statePlaceholder')}
                    value={form.state}
                    onChangeText={(text) => setForm({ ...form, state: text })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>{t('addresses.zipCode')} *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="00000"
                    keyboardType="numeric"
                    value={form.zip_code}
                    onChangeText={(text) => setForm({ ...form, zip_code: text })}
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>{t('addresses.country')}</Text>
                  <TextInput
                    style={styles.input}
                    value={form.country}
                    onChangeText={(text) => setForm({ ...form, country: text })}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>{t('addresses.phone')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('addresses.phonePlaceholder')}
                keyboardType="phone-pad"
                value={form.phone}
                onChangeText={(text) => setForm({ ...form, phone: text })}
              />

              <Text style={styles.inputLabel}>{t('addresses.reference')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('addresses.referencePlaceholder')}
                multiline
                numberOfLines={3}
                value={form.reference}
                onChangeText={(text) => setForm({ ...form, reference: text })}
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {editingAddress ? t('common.update') : t('common.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal para seleccionar servicios predeterminados */}
      <Modal visible={showServiceModal} animationType="slide" transparent>
        <View style={styles.serviceModalOverlay}>
          <View style={styles.serviceModalContent}>
            <View style={styles.serviceModalHeader}>
              <View style={styles.serviceModalHeaderIcon}>
                <Ionicons name="location" size={28} color={ORANGE} />
              </View>
              <Text style={styles.serviceModalTitle}>Asignar a servicios</Text>
              <Text style={styles.serviceModalSubtitle}>
                Selecciona los servicios para los que esta dirección se usará automáticamente
              </Text>
            </View>

            <View style={styles.serviceOptionsContainer}>
              <TouchableOpacity 
                style={[styles.serviceOptionCard, selectedServices.includes('maritime') && styles.serviceOptionCardActive]}
                onPress={() => toggleService('maritime')}
              >
                <View style={styles.serviceOptionLeft}>
                  <Text style={styles.serviceOptionEmoji}>🚢</Text>
                  <View>
                    <Text style={styles.serviceOptionName}>Marítimo</Text>
                    <Text style={styles.serviceOptionDescription}>Envíos por barco desde China</Text>
                  </View>
                </View>
                <View style={[styles.checkbox, selectedServices.includes('maritime') && styles.checkboxChecked]}>
                  {selectedServices.includes('maritime') && (
                    <Ionicons name="checkmark" size={16} color="white" />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.serviceOptionCard, selectedServices.includes('air') && styles.serviceOptionCardActive]}
                onPress={() => toggleService('air')}
              >
                <View style={styles.serviceOptionLeft}>
                  <Text style={styles.serviceOptionEmoji}>✈️</Text>
                  <View>
                    <Text style={styles.serviceOptionName}>Aéreo</Text>
                    <Text style={styles.serviceOptionDescription}>Envíos express por avión</Text>
                  </View>
                </View>
                <View style={[styles.checkbox, selectedServices.includes('air') && styles.checkboxChecked]}>
                  {selectedServices.includes('air') && (
                    <Ionicons name="checkmark" size={16} color="white" />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.serviceOptionCard, selectedServices.includes('usa') && styles.serviceOptionCardActive]}
                onPress={() => toggleService('usa')}
              >
                <View style={styles.serviceOptionLeft}>
                  <Text style={styles.serviceOptionEmoji}>🇺🇸</Text>
                  <View>
                    <Text style={styles.serviceOptionName}>USA</Text>
                    <Text style={styles.serviceOptionDescription}>Consolidación de paquetes USA</Text>
                  </View>
                </View>
                <View style={[styles.checkbox, selectedServices.includes('usa') && styles.checkboxChecked]}>
                  {selectedServices.includes('usa') && (
                    <Ionicons name="checkmark" size={16} color="white" />
                  )}
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.serviceModalFooter}>
              <TouchableOpacity 
                style={styles.cancelServiceButton}
                onPress={() => {
                  setShowServiceModal(false);
                  setSelectedAddressForService(null);
                  setSelectedServices([]);
                }}
              >
                <Text style={styles.cancelServiceButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.saveServiceButton, savingService && styles.saveServiceButtonDisabled]}
                onPress={saveServices}
                disabled={savingService}
              >
                {savingService ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="white" />
                    <Text style={styles.saveServiceButtonText}>
                      {selectedServices.length > 0 ? 'Guardar' : 'Quitar asignación'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  appbar: {
    backgroundColor: BLACK,
  },
  appbarTitle: {
    color: 'white',
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BLACK,
    marginTop: 20,
  },
  emptySubtitle: {
    color: '#666',
    marginTop: 8,
  },
  card: {
    marginBottom: 12,
    backgroundColor: 'white',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  defaultChip: {
    backgroundColor: ORANGE + '20',
    height: 22,
    paddingHorizontal: 0,
  },
  defaultChipText: {
    color: ORANGE,
    fontSize: 10,
    marginHorizontal: 8,
    marginVertical: 0,
  },
  cardActions: {
    flexDirection: 'row',
  },
  addressText: {
    color: '#555',
    marginTop: 2,
  },
  phoneText: {
    color: '#666',
    marginTop: 8,
  },
  setDefaultButton: {
    paddingVertical: 8,
  },
  setDefaultText: {
    color: ORANGE,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 30,
    backgroundColor: ORANGE,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
  },
  modalForm: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  saveButton: {
    backgroundColor: ORANGE,
    margin: 16,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  serviceChip: {
    backgroundColor: '#2196F320',
    height: 22,
    paddingHorizontal: 0,
  },
  serviceChipText: {
    color: '#2196F3',
    fontSize: 10,
    marginHorizontal: 8,
    marginVertical: 0,
  },
  addressButtonsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  setServiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  setServiceText: {
    color: ORANGE,
    fontWeight: '600',
    fontSize: 14,
  },
  serviceChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  serviceChipSmall: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 4,
  },
  serviceChipSmallText: {
    color: '#1976D2',
    fontSize: 11,
    fontWeight: '600',
  },
  serviceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  serviceModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    overflow: 'hidden',
  },
  serviceModalHeader: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FAFAFA',
  },
  serviceModalHeaderIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ORANGE + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 6,
  },
  serviceModalSubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  serviceOptionsContainer: {
    padding: 16,
  },
  serviceOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginBottom: 12,
    backgroundColor: 'white',
  },
  serviceOptionCardActive: {
    borderColor: ORANGE,
    backgroundColor: ORANGE + '08',
  },
  serviceOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  serviceOptionEmoji: {
    fontSize: 32,
  },
  serviceOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  serviceOptionDescription: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  serviceModalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    backgroundColor: '#FAFAFA',
    gap: 12,
  },
  cancelServiceButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  cancelServiceButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
  saveServiceButton: {
    flex: 1.5,
    padding: 14,
    borderRadius: 10,
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveServiceButtonDisabled: {
    opacity: 0.7,
  },
  saveServiceButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
});
