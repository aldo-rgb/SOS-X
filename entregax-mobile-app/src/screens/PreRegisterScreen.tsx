import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

const ORANGE = '#F05A28';
const BLACK = '#111111';

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'PreRegister'>;
};

export default function PreRegisterScreen({ navigation }: Props) {
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={BLACK} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                </TouchableOpacity>
                <Image
                    source={require('../../assets/x-logo-entregax.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <View style={{ width: 40 }} />
            </View>

            {/* Contenido */}
            <View style={styles.content}>
                <View style={styles.iconWrap}>
                    <Ionicons name="person-circle-outline" size={72} color={ORANGE} />
                </View>

                <Text style={styles.title}>¿Ya tienes número de cliente?</Text>
                <Text style={styles.subtitle}>
                    Si ya eres cliente de EntregaX, activa tu cuenta aquí
                </Text>

                {/* Sí — cliente existente */}
                <TouchableOpacity
                    style={styles.cardYes}
                    onPress={() => navigation.navigate('ExistingClient')}
                    activeOpacity={0.85}
                >
                    <View style={styles.cardIcon}>
                        <Ionicons name="checkmark-circle" size={32} color={ORANGE} />
                    </View>
                    <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Sí, ya soy cliente</Text>
                        <Text style={styles.cardDesc}>Activa tu cuenta con tu número de casillero</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color="#9CA3AF" />
                </TouchableOpacity>

                {/* No — registro nuevo */}
                <TouchableOpacity
                    style={styles.cardNo}
                    onPress={() => navigation.navigate('Register')}
                    activeOpacity={0.85}
                >
                    <View style={styles.cardIcon}>
                        <Ionicons name="person-add" size={32} color="#FFF" />
                    </View>
                    <View style={styles.cardText}>
                        <Text style={[styles.cardTitle, { color: '#FFF' }]}>No, soy nuevo</Text>
                        <Text style={[styles.cardDesc, { color: 'rgba(255,255,255,0.75)' }]}>Crea tu suite gratis ahora</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        backgroundColor: BLACK,
        paddingTop: 52,
        paddingBottom: 16,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 120,
        height: 32,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 48,
        alignItems: 'center',
    },
    iconWrap: {
        marginBottom: 20,
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: BLACK,
        textAlign: 'center',
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 15,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 40,
        lineHeight: 22,
    },
    cardYes: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 18,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: ORANGE,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    cardNo: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: BLACK,
        borderRadius: 16,
        padding: 18,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    cardIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(240,90,40,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    cardText: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: BLACK,
        marginBottom: 3,
    },
    cardDesc: {
        fontSize: 13,
        color: '#6B7280',
    },
});
