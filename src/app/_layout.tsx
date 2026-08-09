import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import VocaScreen from './voca';
import TOEFLScreen from './toefl';
import InvestmentScreen from './investment';
import CultureScreen from './culture';

const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT ?? 'full';
import LoginScreen from './login';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { AnnouncementModal } from '../components/AnnouncementModal';
import { refreshStudyNotifications } from '../utils/studyNotifications';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../context/AuthContext';

export const NOTIF_LOG_KEY = 'debug_notif_received_log';

const Tab = createBottomTabNavigator();

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" /></View>;
  }
  if (!user) {
    return <LoginScreen />;
  }
  return <MainTabs />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function MainTabs() {
  const { user } = useAuth();
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const {
    announcements,
    unreadCount,
    loading,
    markAsRead,
  } = useAnnouncements();

  // 앱 시작 시 오늘치 학습 알림 갱신 (하루 1회만 실행)
  useEffect(() => {
    refreshStudyNotifications(user?.uid);
  }, []);

  // 알림 수신 시 로그 기록 (디버그용)
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(async (notification) => {
      const now = new Date(Date.now() + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
      const title = notification.request.content.title ?? '';
      const entry = `[${now}] ${title}`;
      const raw = await AsyncStorage.getItem(NOTIF_LOG_KEY);
      const log: string[] = raw ? JSON.parse(raw) : [];
      log.unshift(entry);
      await AsyncStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(log.slice(0, 50)));
    });
    return () => sub.remove();
  }, []);

// 읽지 않은 공지사항이 있으면 자동으로 표시
  useEffect(() => {
    if (!loading && unreadCount > 0) {
      setShowAnnouncements(true);
    }
  }, [loading, unreadCount]);

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer independent={true}>
        <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#262626',
          tabBarInactiveTintColor: '#8e8e8e',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '400',
            marginTop: 2,
            marginBottom: 4,
          },
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#dbdbdb',
            height: 60,
            paddingTop: 4,
            paddingBottom: 6,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarIconStyle: {
            marginTop: 2,
          },
        }}
      >
        <Tab.Screen
          name="Voca"
          component={VocaScreen}
          options={{
            title: 'Voca',
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="language" size={26} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="TOEFL"
          component={TOEFLScreen}
          options={{
            title: 'TOEFL',
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="school" size={26} color={color} />
            ),
          }}
        />
        {APP_VARIANT === 'full' && (
          <Tab.Screen
            name="Investment"
            component={InvestmentScreen}
            options={{
              title: 'Investment',
              tabBarIcon: ({ color }) => (
                <MaterialIcons name="trending-up" size={26} color={color} />
              ),
            }}
          />
        )}
        <Tab.Screen
          name="Culture"
          component={CultureScreen}
          options={{
            title: 'Korean',
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="menu-book" size={26} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      </NavigationContainer>

      <AnnouncementModal
        visible={showAnnouncements}
        announcements={announcements}
        onClose={() => setShowAnnouncements(false)}
        onMarkAsRead={markAsRead}
      />
    </View>
  );
}
