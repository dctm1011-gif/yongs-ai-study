import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import EnglishScreen from './english';
import TOEFLScreen from './toefl';
import SettingsScreen from './settings';
import InvestmentScreen from './investment';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { AnnouncementModal } from '../components/AnnouncementModal';
import { refreshStudyNotifications } from '../utils/studyNotifications';
import * as Notifications from 'expo-notifications';

const Tab = createBottomTabNavigator();

export default function RootLayout() {
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const {
    announcements,
    unreadCount,
    loading,
    markAsRead,
  } = useAnnouncements();

  // 앱 시작 시 오늘치 학습 알림 갱신 (하루 1회만 실행)
  useEffect(() => {
    refreshStudyNotifications();
  }, []);

  // TODO: 테스트용 — 확인 후 삭제
  useEffect(() => {
    Notifications.scheduleNotificationAsync({
      content: {
        title: '📚 languish (시들다)',
        body: '힘들어도 languish하지 말고 자신을 믿고 나아가! 당신은 할 수 있어! 💪',
        data: { type: 'study-reminder', word: 'languish' },
        sound: 'default',
      },
      trigger: { type: 'timeInterval', seconds: 10, repeats: false } as any,
    });
  }, []);

  // 읽지 않은 공지사항이 있으면 자동으로 표시
  useEffect(() => {
    if (!loading && unreadCount > 0) {
      setShowAnnouncements(true);
    }
  }, [loading, unreadCount]);

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer>
        <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#ccc',
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: 2,
            marginBottom: 4,
          },
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#e5e7eb',
            height: 56,
            paddingTop: 4,
            paddingBottom: 4,
            elevation: 2,
          },
          tabBarIconStyle: {
            marginTop: 2,
          },
        }}
      >
        <Tab.Screen
          name="English"
          component={EnglishScreen}
          options={{
            title: 'English',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="language" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="TOEFL"
          component={TOEFLScreen}
          options={{
            title: 'TOEFL',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="school" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="settings" size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Investment"
          component={InvestmentScreen}
          options={{
            title: 'Investment',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="trending-up" size={24} color={color} />
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
