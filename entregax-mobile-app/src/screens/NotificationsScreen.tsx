/**
 * NotificationsScreen.tsx
 * Pantalla de notificaciones del usuario
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Appbar,
  Surface,
  IconButton,
  ActivityIndicator,
  Divider,
  Badge,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { API_URL } from '../services/api';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

// Colores de marca
const BRAND_ORANGE = '#F05A28';
const BRAND_DARK = '#111111';

type RootStackParamList = {
  Notifications: { user: any; token: string };
  Home: { user: any; token: string };
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Notifications'>;
  route: RouteProp<RootStackParamList, 'Notifications'>;
};

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'promo';
  icon: string;
  is_read: boolean;
  action_url?: string;
  data?: any;
  created_at: string;
}

const NotificationsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { user, token } = route.params;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (data.success) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAsRead = async (notificationId: number) => {
    try {
      await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Actualizar estado local
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success': return '#4CAF50';
      case 'error': return '#F44336';
      case 'promo': return BRAND_ORANGE;
      default: return '#2196F3';
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notifications.now');
    if (diffMins < 60) return t('notifications.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('notifications.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('notifications.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const typeColor = getTypeColor(item.type);
    
    return (
      <TouchableOpacity 
        onPress={() => markAsRead(item.id)}
        activeOpacity={0.7}
      >
        <Surface 
          style={[
            styles.notificationCard, 
            !item.is_read && styles.unreadCard
          ]}
        >
          <View style={[styles.iconContainer, { backgroundColor: typeColor + '20' }]}>
            <Icon name={item.icon || 'bell'} size={24} color={typeColor} />
          </View>
          
          <View style={styles.contentContainer}>
            <View style={styles.headerRow}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.timeAgo}>{getTimeAgo(item.created_at)}</Text>
            </View>
            <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
          </View>

          {!item.is_read && (
            <View style={styles.unreadDot} />
          )}
        </Surface>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="bell-off-outline" size={80} color="#ccc" />
      <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('notifications.emptyDesc')}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Appbar.Content title={t('notifications.title')} titleStyle={styles.appbarTitle} />
        {unreadCount > 0 && (
          <Appbar.Action 
            icon="check-all" 
            onPress={markAllAsRead} 
            color="white" 
          />
        )}
      </Appbar.Header>

      {/* Contador de no leídas */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Icon name="bell-ring" size={18} color={BRAND_ORANGE} />
          <Text style={styles.unreadText}>
            {t('notifications.unreadCount', { count: unreadCount })}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND_ORANGE} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderNotification}
          contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[BRAND_ORANGE]}
              tintColor={BRAND_ORANGE}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  appbar: {
    backgroundColor: BRAND_DARK,
  },
  appbarTitle: {
    color: 'white',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 12,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  separator: {
    height: 8,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'white',
    elevation: 1,
  },
  unreadCard: {
    backgroundColor: '#FFF8F5',
    borderLeftWidth: 3,
    borderLeftColor: BRAND_ORANGE,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND_DARK,
    flex: 1,
  },
  timeAgo: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  message: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND_ORANGE,
    marginLeft: 8,
  },
  unreadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    paddingVertical: 8,
    gap: 8,
  },
  unreadText: {
    color: BRAND_ORANGE,
    fontWeight: '600',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default NotificationsScreen;
