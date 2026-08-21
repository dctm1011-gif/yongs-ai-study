import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { ref, get } from 'firebase/database';
import { database } from '../config/firebase';
import { userRef } from './userDb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';

// 8시부터 22시까지 매시간 1개
const START_HOUR = 8;
const END_HOUR = 22;
const LAST_REFRESH_KEY = 'notif_last_refresh_v3';
const BATTERY_ALERTED_KEY = 'notif_battery_alerted';

function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

/**
 * Firebase english/reviewPool에서 단어를 가져와 8~22시 매시간 알림 스케줄링.
 * 복습 횟수(count)가 적은 단어를 우선 배치하고, 하루에 한 번만 갱신한다.
 */
export async function refreshStudyNotifications(uid?: string): Promise<void> {
  try {
    if (!uid) return;

    // 권한 확인 및 자동 요청
    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      granted = newStatus === 'granted';
    }
    if (!granted) return;

    // 알림 채널 설정 (Android)
    if (typeof Notifications.setNotificationChannelAsync === 'function') {
      await Notifications.setNotificationChannelAsync('study-reminder', {
        name: 'study-reminder',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
        sound: 'default',
      });
    }

    const today = getKSTDateString();
    const lastRefresh = await AsyncStorage.getItem(LAST_REFRESH_KEY);
    if (lastRefresh === today) return;

    const snap = await get(userRef(uid, 'english/reviewPool'));
    const raw = snap.exists() ? snap.val() : null;
    const poolList: any[] = raw ? Object.values(raw) : [];

    // 복습 횟수(count) 오름차순 → 동률이면 마지막 복습일 오래된 순
    const words = poolList.sort((a, b) => {
      const ca = a.count ?? 0;
      const cb = b.count ?? 0;
      if (ca !== cb) return ca - cb;
      const da = a.lastReviewedDate ?? '0000-00-00';
      const db2 = b.lastReviewedDate ?? '0000-00-00';
      return da < db2 ? -1 : da > db2 ? 1 : 0;
    });

    const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

    await Notifications.cancelAllScheduledNotificationsAsync();

    for (let i = 0; i < hours.length; i++) {
      const hour = hours[i];
      const w = words.length > 0 ? words[i % words.length] : null;
      const title = w
        ? `${w.emoji ?? '📚'} ${w.word} (${w.meaning})`
        : '📚 학습할 시간이에요!';
      const body = w
        ? `복습할 시간이에요! ${w.word}의 뜻은 무엇일까요?`
        : '오늘도 꾸준히! 계속 성장하고 있어요 💪';

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { type: 'study-reminder', word: w?.word ?? '' },
          sound: 'default',
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DAILY,
          hour,
          minute: 0,
          channelId: 'study-reminder',
        },
      });
    }

    await AsyncStorage.setItem(LAST_REFRESH_KEY, today);
    console.log(`[notif] 알림 갱신 완료: ${today} 리뷰풀 ${words.length}개 → ${hours.length}슬롯`);

    // 배터리 최적화 안내 — 최초 1회만
    if (Platform.OS === 'android') {
      const alerted = await AsyncStorage.getItem(BATTERY_ALERTED_KEY);
      if (!alerted) {
        await AsyncStorage.setItem(BATTERY_ALERTED_KEY, 'true');
        Alert.alert(
          '⚠️ 백그라운드 알림 설정',
          '앱이 닫혀있을 때도 알림을 받으려면:\n\n' +
          '1. 설정 → 앱 → YongStudy\n' +
          '2. 배터리 → 제한 없음 선택\n\n' +
          '지금 설정으로 이동할까요?',
          [
            { text: '나중에', style: 'cancel' },
            { text: '설정 열기', onPress: () => Linking.openSettings() },
          ]
        );
      }
    }
  } catch (e) {
    console.warn('[notif] 알림 갱신 실패:', e);
  }
}

