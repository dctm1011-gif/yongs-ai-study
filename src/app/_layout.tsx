import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { View, ActivityIndicator, TouchableOpacity, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { getDatabase, ref, set } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import VocaScreen from './voca';
import InvestmentScreen from './investment';
import CultureScreen from './culture';
import ChecklistScreen from './checklist';
import BBCScreen from './bbc';
import SpeakingScreen from './speaking';

const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT ?? 'full';
import LoginScreen from './login';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { AnnouncementModal } from '../components/AnnouncementModal';
import { refreshStudyNotifications } from '../utils/studyNotifications';
import { writeDailySummary, backfillPublicSummaries } from '../utils/dailySummary';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../context/AuthContext';

export const NOTIF_LOG_KEY = 'debug_notif_received_log';

const otaStyles = StyleSheet.create({
  banner: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  bannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

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
  const [applying, setApplying] = useState(false);
  const navigationRef = useRef<any>(null);
  const { isUpdatePending } = __DEV__ ? { isUpdatePending: false } : useUpdates();
  const {
    announcements,
    unreadCount,
    loading,
    markAsRead,
  } = useAnnouncements();

  // 앱 시작 시 오늘치 학습 알림 갱신 (하루 1회만 실행, 로그인 후 uid 확보 시 실행)
  useEffect(() => {
    if (user?.uid) refreshStudyNotifications(user.uid);
  }, [user?.uid]);

  // 앱 시작 및 1시간마다 전체 학습 요약을 공개 경로에 기록 (이메일 리포트용)
  useEffect(() => {
    if (!user?.uid) return;
    writeDailySummary(user.uid).catch(() => {});
    backfillPublicSummaries().catch(() => {}); // 과거 30일 1회 백필
    const interval = setInterval(() => writeDailySummary(user.uid!).catch(() => {}), 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.uid]);

  // Expo push token 취득 → Firebase pushTokens/{uid} 저장
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: '391a8441-ff72-45ea-846f-ceccae07bd15',
        });
        const db = getDatabase(getFirebaseApp());
        await set(ref(db, `pushTokens/${user.uid}`), token.data);
      } catch (e) {
        console.warn('[push] 토큰 저장 실패:', e);
      }
    })();
  }, [user?.uid]);

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

  // 알림 탭 시 Voca 탭으로 이동 (백그라운드에서 탭한 경우 + 앱 완전 종료 후 탭한 경우)
  useEffect(() => {
    // 앱이 완전히 꺼진 상태에서 알림을 탭해 실행된 경우 처리
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) navigationRef.current?.navigate('Voca');
    });
    // 앱이 실행 중이거나 백그라운드에 있을 때 알림을 탭한 경우 처리
    const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      navigationRef.current?.navigate('Voca');
    });
    return () => responseSub.remove();
  }, []);

// 읽지 않은 공지사항이 있으면 자동으로 표시
  useEffect(() => {
    if (!loading && unreadCount > 0) {
      setShowAnnouncements(true);
    }
  }, [loading, unreadCount]);

  const applyUpdate = async () => {
    setApplying(true);
    await Updates.reloadAsync();
  };

  return (
    <View style={{ flex: 1 }}>
      {isUpdatePending && (
        <TouchableOpacity style={otaStyles.banner} onPress={applyUpdate} activeOpacity={0.85} disabled={applying}>
          <MaterialIcons name="system-update" size={16} color="#fff" />
          <Text style={otaStyles.bannerText}>
            {applying ? '적용 중...' : '업데이트 준비됨 — 탭하여 지금 적용'}
          </Text>
        </TouchableOpacity>
      )}
      <NavigationContainer independent={true} ref={navigationRef}>
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
          name="BBC"
          component={BBCScreen}
          options={{
            title: 'English',
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="podcasts" size={26} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Speaking"
          component={SpeakingScreen}
          options={{
            title: 'Talk',
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="record-voice-over" size={26} color={color} />
            ),
          }}
        />
        {APP_VARIANT === 'full' && (
          <Tab.Screen
            name="Investment"
            component={InvestmentScreen}
            options={{
              title: 'Markets',
              tabBarIcon: ({ color }) => (
                <MaterialIcons name="bar-chart" size={26} color={color} />
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
        <Tab.Screen
          name="Checklist"
          component={ChecklistScreen}
          options={{
            title: 'Today',
            tabBarIcon: ({ color }) => (
              <MaterialIcons name="check-circle-outline" size={26} color={color} />
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
