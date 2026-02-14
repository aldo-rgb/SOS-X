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
}

export default function MyAddressesScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, token } = route.params;
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [saving, setSaving] = useState(false);

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
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>
                      {address.alias || t('addresses.address')}
                    </Text>
                    {address.is_default && (
                      <Chip mode="flat" style={styles.defaultChip} textStyle={styles.defaultChipText}>
                        {t('addresses.default')}
                      </Chip>
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
                {!address.is_default && (
                  <TouchableOpacity 
                    style={styles.setDefaultButton}
                    onPress={() => setDefaultAddress(address.id)}
                  >
                    <Text style={styles.setDefaultText}>{t('addresses.setDefault')}</Text>
                  </TouchableOpacity>
                )}
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
    height: 24,
  },
  defaultChipText: {
    color: ORANGE,
    fontSize: 10,
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
    marginTop: 12,
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
});
