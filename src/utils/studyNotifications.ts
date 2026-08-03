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
const LAST_REFRESH_KEY = 'notif_last_refresh_v3'; // v3: 8~22시 매시간

function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Firebase english/reviewPool에서 단어를 가져와 8~22시 매시간 알림 스케줄링.
 * 복습 횟수(count)가 적은 단어를 우선 배치하고, 하루에 한 번만 갱신한다.
 */
export async function refreshStudyNotifications(uid?: string): Promise<void> {
  try {
    const enabled = await AsyncStorage.getItem('reminders_enabled');
    if (enabled !== 'true') return;

    const today = getKSTDateString();
    const lastRefresh = await AsyncStorage.getItem(LAST_REFRESH_KEY);
    if (lastRefresh === today) return;

    if (!uid) return; // uid 없으면 스케줄 불가 (로그인 후 재시도)

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
  } catch (e) {
    console.warn('[notif] 알림 갱신 실패:', e);
  }
}

/**
 * 알림을 처음 활성화할 때 호출. 권한·채널 설정 후 스케줄링.
 * lastRefreshDate를 리셋해서 오늘치 갱신을 강제 실행한다.
 */
export async function enableStudyNotifications(uid?: string): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  if (typeof Notifications.setNotificationChannelAsync === 'function') {
    await Notifications.setNotificationChannelAsync('study-reminder', {
      name: 'study-reminder',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563eb',
      sound: 'default',
    });
  }

  await AsyncStorage.setItem('reminders_enabled', 'true');
  await AsyncStorage.removeItem(LAST_REFRESH_KEY); // 강제 갱신
  await refreshStudyNotifications(uid);

  // Android: 배터리 최적화 제외 안내 (앱이 백그라운드에서도 알림을 받으려면 필요)
  if (Platform.OS === 'android') {
    Alert.alert(
      '⚠️ 백그라운드 알림 설정',
      '앱이 닫혀있을 때도 알림을 받으려면:\n\n' +
      '1. 설정 → 앱 → YongStudy\n' +
      '2. 배터리 → 제한 없음 선택\n' +
      '3. 알람 및 리마인더 → 허용\n\n' +
      '지금 설정으로 이동할까요?',
      [
        { text: '나중에', style: 'cancel' },
        { text: '설정 열기', onPress: () => Linking.openSettings() },
      ]
    );
  }

  return true;
}

export async function disableStudyNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem('reminders_enabled', 'false');
  await AsyncStorage.removeItem(LAST_REFRESH_KEY);
}
