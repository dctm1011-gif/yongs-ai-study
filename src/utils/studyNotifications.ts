import * as Notifications from 'expo-notifications';
import { ref, get } from 'firebase/database';
import { database } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_HOURS = [8, 10, 12, 16, 20, 22];
const FALLBACK_BODY = '오늘도 열심히 학습해보세요. 계속 성장하고 있습니다! 💪';
const LAST_REFRESH_KEY = 'notif_last_refresh_date';

function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

/**
 * Firebase에서 오늘의 응원메시지를 읽어 로컬 알림을 재스케줄링한다.
 * - 알림이 꺼져있으면 아무것도 안 함
 * - 오늘 이미 갱신했으면 스킵 (앱을 여러 번 열어도 중복 갱신 없음)
 * - Firebase 데이터 없으면 기본 메시지로 폴백
 */
export async function refreshStudyNotifications(): Promise<void> {
  try {
    const enabled = await AsyncStorage.getItem('reminders_enabled');
    if (enabled !== 'true') return;

    const today = getKSTDateString();
    const lastRefresh = await AsyncStorage.getItem(LAST_REFRESH_KEY);
    if (lastRefresh === today) return;

    const snap = await get(ref(database, `notifications/daily/${today}`));
    const data = snap.exists() ? snap.val() : null;

    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const hour of NOTIFICATION_HOURS) {
      const slot = data?.[hour];
      const title = slot?.word
        ? `📚 ${slot.word} (${slot.meaning})`
        : '📚 학습할 시간이에요!';
      const body = slot?.message || FALLBACK_BODY;

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { type: 'study-reminder', word: slot?.word || '' },
          sound: 'default',
        },
        trigger: { type: 'daily', hour, minute: 0 } as any,
      });
    }

    await AsyncStorage.setItem(LAST_REFRESH_KEY, today);
    console.log(`[notif] 알림 갱신 완료: ${today}`, data ? '(동적)' : '(기본)');
  } catch (e) {
    console.warn('[notif] 알림 갱신 실패:', e);
  }
}

/**
 * 알림을 처음 활성화할 때 호출. 권한·채널 설정 후 스케줄링.
 * lastRefreshDate를 리셋해서 오늘치 갱신을 강제 실행한다.
 */
export async function enableStudyNotifications(): Promise<boolean> {
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
  await refreshStudyNotifications();
  return true;
}

export async function disableStudyNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem('reminders_enabled', 'false');
  await AsyncStorage.removeItem(LAST_REFRESH_KEY);
}
