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
  Image,
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
  MyPaymentMethods: { user: any; token: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'MyPaymentMethods'>;

interface PaymentMethod {
  id: number;
  type: 'card' | 'paypal' | 'bank_transfer';
  last_four?: string;
  card_brand?: string;
  paypal_email?: string;
  bank_name?: string;
  clabe?: string;
  alias: string;
  is_default: boolean;
}

const CARD_BRANDS: Record<string, { icon: string; color: string }> = {
  visa: { icon: 'card', color: '#1A1F71' },
  mastercard: { icon: 'card', color: '#EB001B' },
  amex: { icon: 'card', color: '#006FCF' },
  default: { icon: 'card-outline', color: '#666' },
};

export default function MyPaymentMethodsScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, token } = route.params;
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedType, setSelectedType] = useState<'card' | 'paypal' | 'bank_transfer' | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [cardForm, setCardForm] = useState({
    alias: '',
    card_number: '',
    expiry: '',
    cvv: '',
    holder_name: '',
  });

  const [paypalForm, setPaypalForm] = useState({
    alias: '',
    email: '',
  });

  const [bankForm, setBankForm] = useState({
    alias: '',
    bank_name: '',
    clabe: '',
    beneficiary: '',
  });

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/payment-methods`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setPaymentMethods(data.paymentMethods || []);
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  const resetForms = () => {
    setCardForm({ alias: '', card_number: '', expiry: '', cvv: '', holder_name: '' });
    setPaypalForm({ alias: '', email: '' });
    setBankForm({ alias: '', bank_name: '', clabe: '', beneficiary: '' });
    setSelectedType(null);
  };

  const openAddModal = () => {
    resetForms();
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let body: any = {};

      if (selectedType === 'card') {
        if (!cardForm.card_number || !cardForm.expiry || !cardForm.cvv || !cardForm.holder_name) {
          Alert.alert(t('common.error'), t('payment.fillCardFields'));
          setSaving(false);
          return;
        }
        body = {
          type: 'card',
          alias: cardForm.alias || t('payment.myCard'),
          last_four: cardForm.card_number.slice(-4),
          card_brand: detectCardBrand(cardForm.card_number),
          holder_name: cardForm.holder_name,
        };
      } else if (selectedType === 'paypal') {
        if (!paypalForm.email) {
          Alert.alert(t('common.error'), t('payment.enterPaypalEmail'));
          setSaving(false);
          return;
        }
        body = {
          type: 'paypal',
          alias: paypalForm.alias || t('payment.myPaypal'),
          paypal_email: paypalForm.email,
        };
      } else if (selectedType === 'bank_transfer') {
        if (!bankForm.bank_name || !bankForm.clabe) {
          Alert.alert(t('common.error'), t('payment.fillBankData'));
          setSaving(false);
          return;
        }
        body = {
          type: 'bank_transfer',
          alias: bankForm.alias || t('payment.myAccount'),
          bank_name: bankForm.bank_name,
          clabe: bankForm.clabe,
          beneficiary: bankForm.beneficiary,
        };
      }

      const response = await fetch(`${API_URL}/api/payment-methods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(t('common.success'), t('payment.saved'));
        setShowModal(false);
        resetForms();
        fetchPaymentMethods();
      } else {
        Alert.alert(t('common.error'), data.error || t('payment.saveError'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('payment.connectionError'));
    } finally {
      setSaving(false);
    }
  };

  const detectCardBrand = (number: string): string => {
    const clean = number.replace(/\s/g, '');
    if (/^4/.test(clean)) return 'visa';
    if (/^5[1-5]/.test(clean)) return 'mastercard';
    if (/^3[47]/.test(clean)) return 'amex';
    return 'default';
  };

  const handleDelete = (pm: PaymentMethod) => {
    Alert.alert(
      t('payment.deleteTitle'),
      t('payment.deleteConfirm', { name: pm.alias }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/payment-methods/${pm.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (response.ok) {
                fetchPaymentMethods();
              }
            } catch (error) {
              Alert.alert(t('common.error'), t('payment.deleteError'));
            }
          },
        },
      ]
    );
  };

  const setDefault = async (pmId: number) => {
    try {
      const response = await fetch(`${API_URL}/api/payment-methods/${pmId}/default`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        fetchPaymentMethods();
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('payment.setDefaultError'));
    }
  };

  const renderPaymentMethodIcon = (pm: PaymentMethod) => {
    if (pm.type === 'card') {
      const brand = CARD_BRANDS[pm.card_brand || 'default'] || CARD_BRANDS.default;
      return <Ionicons name={brand.icon as any} size={32} color={brand.color} />;
    }
    if (pm.type === 'paypal') {
      return <Ionicons name="logo-paypal" size={32} color="#003087" />;
    }
    return <Ionicons name="business-outline" size={32} color="#666" />;
  };

  const renderPaymentMethodDetails = (pm: PaymentMethod) => {
    if (pm.type === 'card') {
      return (
        <>
          <Text style={styles.pmTitle}>{pm.alias}</Text>
          <Text style={styles.pmDetails}>
            •••• •••• •••• {pm.last_four}
          </Text>
        </>
      );
    }
    if (pm.type === 'paypal') {
      return (
        <>
          <Text style={styles.pmTitle}>{pm.alias}</Text>
          <Text style={styles.pmDetails}>{pm.paypal_email}</Text>
        </>
      );
    }
    return (
      <>
        <Text style={styles.pmTitle}>{pm.alias}</Text>
        <Text style={styles.pmDetails}>{pm.bank_name}</Text>
        <Text style={styles.pmDetails}>CLABE: ••••{pm.clabe?.slice(-4)}</Text>
      </>
    );
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
        <Appbar.Content title={t('payment.title')} titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {paymentMethods.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="wallet-outline" size={80} color="#ccc" />
            <Text style={styles.emptyTitle}>{t('payment.noMethods')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('payment.addForShipping')}
            </Text>
          </View>
        ) : (
          paymentMethods.map((pm) => (
            <Card key={pm.id} style={styles.card}>
              <Card.Content>
                <View style={styles.cardRow}>
                  <View style={styles.iconContainer}>
                    {renderPaymentMethodIcon(pm)}
                  </View>
                  <View style={styles.pmInfo}>
                    {renderPaymentMethodDetails(pm)}
                    {pm.is_default && (
                      <Chip mode="flat" style={styles.defaultChip} textStyle={styles.defaultChipText}>
                        {t('payment.default')}
                      </Chip>
                    )}
                  </View>
                  <IconButton
                    icon="delete"
                    size={20}
                    iconColor="#f44336"
                    onPress={() => handleDelete(pm)}
                  />
                </View>
                {!pm.is_default && (
                  <TouchableOpacity
                    style={styles.setDefaultButton}
                    onPress={() => setDefault(pm.id)}
                  >
                    <Text style={styles.setDefaultText}>{t('payment.setDefault')}</Text>
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

      {/* Modal para agregar método de pago */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedType ? t('payment.addData') : t('payment.paymentType')}
              </Text>
              <IconButton
                icon={selectedType ? 'arrow-left' : 'close'}
                onPress={() => {
                  if (selectedType) {
                    setSelectedType(null);
                  } else {
                    setShowModal(false);
                  }
                }}
              />
            </View>

            {!selectedType ? (
              <View style={styles.typeSelection}>
                <TouchableOpacity
                  style={styles.typeOption}
                  onPress={() => setSelectedType('card')}
                >
                  <Ionicons name="card" size={40} color={ORANGE} />
                  <Text style={styles.typeText}>{t('payment.card')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.typeOption}
                  onPress={() => setSelectedType('paypal')}
                >
                  <Ionicons name="logo-paypal" size={40} color="#003087" />
                  <Text style={styles.typeText}>PayPal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.typeOption}
                  onPress={() => setSelectedType('bank_transfer')}
                >
                  <Ionicons name="business" size={40} color="#666" />
                  <Text style={styles.typeText}>{t('payment.transfer')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={styles.formContainer}>
                {selectedType === 'card' && (
                  <>
                    <Text style={styles.inputLabel}>{t('payment.aliasOptional')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('payment.cardAliasPlaceholder')}
                      value={cardForm.alias}
                      onChangeText={(text) => setCardForm({ ...cardForm, alias: text })}
                    />
                    <Text style={styles.inputLabel}>{t('payment.cardNumber')} *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="1234 5678 9012 3456"
                      keyboardType="numeric"
                      maxLength={19}
                      value={cardForm.card_number}
                      onChangeText={(text) => setCardForm({ ...cardForm, card_number: text })}
                    />
                    <View style={styles.row}>
                      <View style={styles.halfInput}>
                        <Text style={styles.inputLabel}>{t('payment.expiry')} *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="MM/AA"
                          maxLength={5}
                          value={cardForm.expiry}
                          onChangeText={(text) => setCardForm({ ...cardForm, expiry: text })}
                        />
                      </View>
                      <View style={styles.halfInput}>
                        <Text style={styles.inputLabel}>CVV *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="123"
                          keyboardType="numeric"
                          maxLength={4}
                          secureTextEntry
                          value={cardForm.cvv}
                          onChangeText={(text) => setCardForm({ ...cardForm, cvv: text })}
                        />
                      </View>
                    </View>
                    <Text style={styles.inputLabel}>{t('payment.holderName')} *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('payment.holderPlaceholder')}
                      autoCapitalize="characters"
                      value={cardForm.holder_name}
                      onChangeText={(text) => setCardForm({ ...cardForm, holder_name: text })}
                    />
                  </>
                )}

                {selectedType === 'paypal' && (
                  <>
                    <Text style={styles.inputLabel}>{t('payment.aliasOptional')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('payment.paypalAliasPlaceholder')}
                      value={paypalForm.alias}
                      onChangeText={(text) => setPaypalForm({ ...paypalForm, alias: text })}
                    />
                    <Text style={styles.inputLabel}>{t('payment.paypalEmail')} *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('payment.emailPlaceholder')}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={paypalForm.email}
                      onChangeText={(text) => setPaypalForm({ ...paypalForm, email: text })}
                    />
                  </>
                )}

                {selectedType === 'bank_transfer' && (
                  <>
                    <Text style={styles.inputLabel}>{t('payment.aliasOptional')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('payment.bankAliasPlaceholder')}
                      value={bankForm.alias}
                      onChangeText={(text) => setBankForm({ ...bankForm, alias: text })}
                    />
                    <Text style={styles.inputLabel}>{t('payment.bankName')} *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('payment.bankNamePlaceholder')}
                      value={bankForm.bank_name}
                      onChangeText={(text) => setBankForm({ ...bankForm, bank_name: text })}
                    />
                    <Text style={styles.inputLabel}>CLABE *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('payment.clabePlaceholder')}
                      keyboardType="numeric"
                      maxLength={18}
                      value={bankForm.clabe}
                      onChangeText={(text) => setBankForm({ ...bankForm, clabe: text })}
                    />
                    <Text style={styles.inputLabel}>{t('payment.beneficiary')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t('payment.beneficiaryPlaceholder')}
                      value={bankForm.beneficiary}
                      onChangeText={(text) => setBankForm({ ...bankForm, beneficiary: text })}
                    />
                  </>
                )}

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 50,
    alignItems: 'center',
  },
  pmInfo: {
    flex: 1,
    marginLeft: 12,
  },
  pmTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  pmDetails: {
    color: '#666',
    marginTop: 2,
  },
  defaultChip: {
    backgroundColor: ORANGE + '20',
    alignSelf: 'flex-start',
    marginTop: 6,
    height: 24,
  },
  defaultChipText: {
    color: ORANGE,
    fontSize: 10,
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
    maxHeight: '80%',
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
  typeSelection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 30,
  },
  typeOption: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    width: 100,
  },
  typeText: {
    marginTop: 8,
    fontWeight: '600',
    color: BLACK,
  },
  formContainer: {
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  saveButton: {
    backgroundColor: ORANGE,
    marginTop: 24,
    marginBottom: 30,
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
