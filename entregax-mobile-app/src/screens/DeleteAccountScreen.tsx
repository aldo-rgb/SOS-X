import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Surface,
  IconButton,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';
import { clearAllSecure } from '../services/secureStorage';

const ORANGE = '#F05A28';
const RED = '#D32F2F';
const BLACK = '#111111';
const GRAY = '#666666';

type Props = {
  navigation: any;
  route: { params: { token: string; user: any } };
};

export default function DeleteAccountScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = password.length >= 4 && confirmText.trim().toUpperCase() === 'ELIMINAR';

  const handleDelete = async () => {
    if (!canSubmit) return;
    Alert.alert(
      '¿Eliminar tu cuenta?',
      'Esta acción no se puede deshacer. Tu información personal será anonimizada de inmediato y los registros transaccionales se conservarán por 30 días por obligaciones fiscales antes de purgarse.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, eliminar',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              const resp = await fetch(`${API_URL}/api/auth/account`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ password, confirm: 'ELIMINAR' }),
              });
              const data = await resp.json().catch(() => ({}));
              if (!resp.ok) {
                Alert.alert('Error', data?.error || 'No se pudo eliminar la cuenta.');
                return;
              }
              // Limpieza local
              await clearAllSecure();
              Alert.alert(
                'Cuenta eliminada',
                'Tus datos personales fueron anonimizados. Lamentamos verte partir.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }),
                  },
                ]
              );
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Error de red');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />

      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          iconColor="#fff"
          size={24}
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>Eliminar mi cuenta</Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* Banner de advertencia */}
          <Surface style={styles.warningBox} elevation={1}>
            <Ionicons name="warning" size={32} color={RED} />
            <Text style={styles.warningTitle}>Esta acción es permanente</Text>
            <Text style={styles.warningBody}>
              Al eliminar tu cuenta perderás acceso a tu casillero, historial de paquetes, saldo a
              favor y datos de perfil.
            </Text>
          </Surface>

          {/* Qué pasará */}
          <Surface style={styles.section} elevation={0}>
            <Text style={styles.sectionTitle}>Qué eliminaremos</Text>
            <Bullet text="Tu nombre, correo electrónico y teléfono se anonimizan inmediatamente." />
            <Bullet text="Tu foto de perfil se borra del servidor." />
            <Bullet text="Suscripciones y cargos recurrentes activos se cancelan." />
            <Bullet text="Cerramos tu sesión en todos los dispositivos." />
            <Divider style={{ marginVertical: 12 }} />
            <Text style={styles.sectionTitle}>Qué conservamos 30 días</Text>
            <Bullet text="Registros de paquetes y pagos (obligación fiscal SAT CFF Art. 30)." />
            <Bullet text="Tras 30 días, los datos se purgan automáticamente." />
          </Surface>

          {/* Confirmación con password */}
          <Surface style={styles.section} elevation={0}>
            <Text style={styles.sectionTitle}>Confirmar identidad</Text>
            <TextInput
              label="Tu contraseña actual"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              mode="outlined"
              outlineColor="#ccc"
              activeOutlineColor={ORANGE}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword((s) => !s)}
                />
              }
              style={styles.input}
            />
            <TextInput
              label='Escribe "ELIMINAR" para confirmar'
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              mode="outlined"
              outlineColor="#ccc"
              activeOutlineColor={RED}
              style={styles.input}
            />
          </Surface>

          <Button
            mode="contained"
            onPress={handleDelete}
            disabled={!canSubmit || submitting}
            loading={submitting}
            buttonColor={RED}
            textColor="#fff"
            style={styles.deleteBtn}
            contentStyle={{ paddingVertical: 6 }}
          >
            Eliminar mi cuenta permanentemente
          </Button>

          <Button mode="text" onPress={() => navigation.goBack()} textColor={GRAY}>
            Cancelar
          </Button>

          <Text style={styles.footnote}>
            ¿Necesitas ayuda? Contáctanos antes de eliminar en soporte@entregax.com
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Bullet = ({ text }: { text: string }) => (
  <View style={styles.bulletRow}>
    <Text style={styles.bulletDot}>•</Text>
    <Text style={styles.bulletText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  header: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 40 },
  warningBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  warningTitle: { fontSize: 18, fontWeight: '700', color: RED, marginTop: 8 },
  warningBody: { textAlign: 'center', color: '#7B1F1F', marginTop: 6, fontSize: 14, lineHeight: 20 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: BLACK, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', marginVertical: 3 },
  bulletDot: { color: ORANGE, marginRight: 6, fontSize: 15 },
  bulletText: { flex: 1, color: '#333', fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: '#fff', marginTop: 10 },
  deleteBtn: { marginTop: 8, borderRadius: 10 },
  footnote: { textAlign: 'center', color: GRAY, fontSize: 12, marginTop: 16 },
});
