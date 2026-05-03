import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');

const ORANGE = '#F05A28';
const RED = '#D32F2F';
const DARK = '#0A0A0F';
const DARK_2 = '#13131A';

interface Props {
  navigation: any;
  route: any;
}

/**
 * Pantalla de transición "Accediendo a X-Pay".
 * Diseño corporativo oscuro con acentos naranjas/rojos.
 * Después de ~1.8s navega (replace) al destino real.
 */
export default function ExternalProviderTransitionScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, token, target = 'SupplierPayment' } = route.params || {};

  // Video logo
  const videoPlayer = useVideoPlayer(require('../../assets/logo-xpay-move.mp4'), (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const ringRotate = useRef(new Animated.Value(0)).current;
  const dotsAnim = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  const lineSweep = useRef(new Animated.Value(0)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    StatusBar.setBarStyle('light-content', true);

    // Entrada
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(subtitleFade, {
        toValue: 1,
        duration: 600,
        delay: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Anillo girando (loop)
    Animated.loop(
      Animated.timing(ringRotate, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Línea de escaneo (loop)
    Animated.loop(
      Animated.timing(lineSweep, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ).start();

    // Pulso de los dots
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    pulse(dotsAnim[0], 0).start();
    pulse(dotsAnim[1], 200).start();
    pulse(dotsAnim[2], 400).start();

    // Auto-navegar al destino real luego de 1800ms
    const timer = setTimeout(() => {
      navigation.replace(target, { user, token });
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  const ringInterpolate = ringRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const sweepTranslate = lineSweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK} />

      {/* Acento naranja superior */}
      <View style={styles.cornerTopLeft} />
      <View style={styles.cornerTopRight} />
      <View style={styles.cornerBottomLeft} />
      <View style={styles.cornerBottomRight} />

      {/* Línea de escaneo horizontal */}
      <Animated.View
        style={[
          styles.scanLine,
          { transform: [{ translateX: sweepTranslate }] },
        ]}
      />

      <Animated.View style={[styles.content, { opacity: fadeIn }]}>
        {/* Video logo */}
        <View style={styles.logoWrapper}>
          <VideoView
            player={videoPlayer}
            style={{ width: 220, height: 220 }}
            contentFit="cover"
            nativeControls={false}
          />
        </View>

        {/* Branding */}
        <Animated.Text style={[styles.title, { opacity: fadeIn }]}>
          {(t('xpay.accessing') as string).toUpperCase()}
        </Animated.Text>
        <Animated.Text style={[styles.brand, { opacity: fadeIn }]}>
          {t('xpay.title')}
        </Animated.Text>

        {/* Línea decorativa */}
        <View style={styles.divider}>
          <View style={styles.dividerOrange} />
          <View style={styles.dividerRed} />
        </View>

        {/* Subtítulo */}
        <Animated.Text style={[styles.subtitle, { opacity: subtitleFade }]}>
          {t('xpay.transitionSubtitle')}
        </Animated.Text>

        {/* Dots animados */}
        <View style={styles.dotsRow}>
          {dotsAnim.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                { opacity: anim, backgroundColor: i === 1 ? RED : ORANGE },
              ]}
            />
          ))}
        </View>

        {/* Sello inferior */}
        <Animated.View style={[styles.poweredBy, { opacity: subtitleFade }]}>
          <View style={styles.shieldDot} />
          <Text style={styles.poweredByText}>{t('xpay.secureGateway')}</Text>
          <View style={styles.shieldDot} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Esquinas decorativas estilo HUD
  cornerTopLeft: {
    position: 'absolute',
    top: 60,
    left: 24,
    width: 28,
    height: 28,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: ORANGE,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 60,
    right: 24,
    width: 28,
    height: 28,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: ORANGE,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 60,
    left: 24,
    width: 28,
    height: 28,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: RED,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 60,
    right: 24,
    width: 28,
    height: 28,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: RED,
  },
  // Línea de escaneo horizontal
  scanLine: {
    position: 'absolute',
    width: width * 0.6,
    height: 2,
    top: height / 2 - 1,
    backgroundColor: ORANGE,
    opacity: 0.35,
    shadowColor: ORANGE,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  content: {
    alignItems: 'center',
  },
  // Logo
  logoWrapper: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
    overflow: 'hidden',
    backgroundColor: DARK,
    borderWidth: 2,
    borderColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  ring: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
    borderColor: 'rgba(240, 90, 40, 0.35)',
    borderTopColor: ORANGE,
    borderRightColor: 'transparent',
  },
  ringDotTop: {
    position: 'absolute',
    top: -6,
    left: 84,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  ringDotRight: {
    position: 'absolute',
    top: 84,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RED,
  },
  ringDotBottom: {
    position: 'absolute',
    bottom: -4,
    left: 86,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
    opacity: 0.6,
  },
  innerRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  core: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: DARK_2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  title: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 4,
    marginBottom: 6,
  },
  brand: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 14,
  },
  dividerOrange: {
    width: 32,
    height: 3,
    backgroundColor: ORANGE,
    borderRadius: 2,
    marginRight: 4,
  },
  dividerRed: {
    width: 16,
    height: 3,
    backgroundColor: RED,
    borderRadius: 2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 60,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  poweredBy: {
    position: 'absolute',
    bottom: -120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shieldDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ORANGE,
  },
  poweredByText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '600',
  },
});
