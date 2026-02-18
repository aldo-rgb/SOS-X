// ============================================
// OPPORTUNITY CAROUSEL - "El Punto Caliente"
// Carrusel de oportunidades premium para engagement
// ============================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Animated,
  Image,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48; // 24px padding each side - más estrecho
const CARD_HEIGHT = 155; // 10% más alto

// Colores de marca
const ORANGE = '#F05A28';
const ORANGE_DARK = '#C1272D';

// 🎯 Configuración de las campañas/oportunidades
export interface Opportunity {
  id: string;
  type: 'internal' | 'partner' | 'promo';
  title: string;
  subtitle: string;
  ctaText: string;
  ctaAction: string; // 'navigate:ScreenName' | 'link:https://...' | 'modal:type'
  badge?: string;
  badgeColor?: string;
  imageType: 'gradient' | 'icon' | 'image';
  imageUrl?: string;
  iconName?: string;
  gradientColors?: string[];
  iconBgColor?: string;
  priority: number;
  isActive: boolean;
}

// Campañas predefinidas
const DEFAULT_OPPORTUNITIES: Opportunity[] = [
  {
    id: 'gex_protection',
    type: 'internal',
    title: '¿Tu carga sobreviviría a esto?',
    subtitle: 'Los accidentes pasan. Asegura tu tranquilidad por solo el 5% del valor.',
    ctaText: '🛡️ Activar Protección GEX',
    ctaAction: 'navigate:GEXPromo',
    badge: 'Recomendado',
    badgeColor: '#10B981',
    imageType: 'gradient',
    gradientColors: ['#1a237e', '#283593', '#3949ab'],
    iconName: 'shield-checkmark',
    priority: 1,
    isActive: true,
  },
  {
    id: 'air_express',
    type: 'internal',
    title: 'De China a tu puerta en tiempo récord',
    subtitle: 'Nueva ruta Aérea Exprés. Recibe antes, vende más rápido.',
    ctaText: '✈️ Cotizar Ruta Exprés',
    ctaAction: 'navigate:RequestAdvisor',
    badge: '🆕 Nuevo',
    badgeColor: '#F05A28',
    imageType: 'gradient',
    gradientColors: ['#bf360c', '#e64a19', '#ff5722'],
    iconName: 'airplane',
    priority: 2,
    isActive: true,
  },
  {
    id: 'maritime_savings',
    type: 'internal',
    title: 'Ahorra hasta 70% en tu envío',
    subtitle: 'Consolida tus compras y paga menos flete por CBM.',
    ctaText: '🚢 Ver Cómo Funciona',
    ctaAction: 'navigate:RequestAdvisor',
    badge: 'Ahorro',
    badgeColor: '#0097A7',
    imageType: 'gradient',
    gradientColors: ['#006064', '#00838f', '#00acc1'],
    iconName: 'boat',
    priority: 3,
    isActive: true,
  },
  {
    id: 'referral_program',
    type: 'promo',
    title: 'Invita y gana $500 MXN',
    subtitle: 'Por cada amigo que haga su primer envío, ambos ganan.',
    ctaText: '🎁 Compartir mi Código',
    ctaAction: 'modal:referral',
    badge: 'Exclusivo',
    badgeColor: '#9C27B0',
    imageType: 'gradient',
    gradientColors: ['#4a148c', '#6a1b9a', '#8e24aa'],
    iconName: 'gift',
    priority: 4,
    isActive: true,
  },
];

interface Props {
  onOpportunityPress?: (opportunity: Opportunity) => void;
  customOpportunities?: Opportunity[];
  autoPlayInterval?: number;
}

export default function OpportunityCarousel({ 
  onOpportunityPress, 
  customOpportunities,
  autoPlayInterval = 5000 
}: Props) {
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [isHidden, setIsHidden] = useState(false); // 🔥 Estado para ocultar temporalmente
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Usar campañas personalizadas o las predefinidas
  const opportunities = (customOpportunities || DEFAULT_OPPORTUNITIES)
    .filter(o => o.isActive)
    .sort((a, b) => a.priority - b.priority);

  // Animación de entrada
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Auto-play del carrusel
  useEffect(() => {
    if (opportunities.length <= 1 || isUserInteracting) return;

    const interval = setInterval(() => {
      const nextIndex = (activeIndex + 1) % opportunities.length;
      scrollViewRef.current?.scrollTo({
        x: nextIndex * CARD_WIDTH,
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [activeIndex, isUserInteracting, opportunities.length, autoPlayInterval]);

  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / CARD_WIDTH);
    if (index !== activeIndex && index >= 0 && index < opportunities.length) {
      setActiveIndex(index);
    }
  };

  const handlePress = (opportunity: Opportunity) => {
    if (onOpportunityPress) {
      onOpportunityPress(opportunity);
    }
  };

  const renderOpportunityCard = (opportunity: Opportunity, index: number) => {
    return (
      <Pressable
        key={opportunity.id}
        onPress={() => handlePress(opportunity)}
        style={({ pressed }) => [
          styles.cardContainer,
          { opacity: pressed ? 0.95 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
        ]}
      >
        <View style={styles.card}>
          {/* Background con gradiente */}
          <LinearGradient
            colors={(opportunity.gradientColors || [ORANGE_DARK, ORANGE]) as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardBackground}
          >
            {/* Badge */}
            {opportunity.badge && (
              <View style={[styles.badge, { backgroundColor: opportunity.badgeColor || ORANGE }]}>
                <Text style={styles.badgeText}>{opportunity.badge}</Text>
              </View>
            )}

            {/* Contenido */}
            <View style={styles.cardContent}>
              {/* Textos */}
              <View style={styles.textContainer}>
                <Text style={styles.title} numberOfLines={2}>
                  {opportunity.title}
                </Text>
                <Text style={styles.subtitle} numberOfLines={2}>
                  {opportunity.subtitle}
                </Text>
              </View>

              {/* CTA Button */}
              <Pressable 
                style={styles.ctaButton}
                onPress={() => handlePress(opportunity)}
              >
                <Text style={styles.ctaText}>{opportunity.ctaText}</Text>
                <Ionicons name="arrow-forward" size={16} color={ORANGE} />
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    );
  };

  if (opportunities.length === 0 || isHidden) return null;

  // Función para ocultar el carrusel
  const handleDismiss = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsHidden(true);
    });
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Carrusel */}
      <View style={styles.carouselWrapper}>
        {/* Carrusel */}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onTouchStart={() => setIsUserInteracting(true)}
          onTouchEnd={() => setTimeout(() => setIsUserInteracting(false), 3000)}
          onMomentumScrollEnd={() => setTimeout(() => setIsUserInteracting(false), 3000)}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH}
          snapToAlignment="start"
          contentContainerStyle={styles.scrollContent}
        >
          {opportunities.map((opp, index) => renderOpportunityCard(opp, index))}
        </ScrollView>
      </View>

      {/* Indicadores de página */}
      {opportunities.length > 1 && (
        <View style={styles.pagination}>
          {opportunities.map((_, index) => (
            <View
              key={index}
              style={[
                styles.paginationDot,
                index === activeIndex && styles.paginationDotActive
              ]}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  carouselWrapper: {
    position: 'relative',
  },
  floatingDismissButton: {
    position: 'absolute',
    top: 8,
    right: 24,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginRight: 0,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cardBackground: {
    flex: 1,
    padding: 20,
    justifyContent: 'flex-end',
  },
  decorativeCircle1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: -50,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  backgroundIconContainer: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  textContainer: {
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: 'white',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 16,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 6,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '700',
    color: ORANGE,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  paginationDotActive: {
    backgroundColor: ORANGE,
    width: 24,
  },
});
