import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

interface FeedbackItem {
  id: string;
  date: string;
  time: string;
  content: string;
  status?: 'pending' | 'completed';
}

export default function SettingsScreen() {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  useEffect(() => {
    loadFeedback();
    loadReminderStatus();
    syncWithNetlify(); // 앱 시작 시 Netlify에서 최신 상태 동기화
  }, []);

  const loadFeedback = async () => {
    try {
      const existing = await AsyncStorage.getItem('app_feedback');
      if (existing) {
        setFeedbackList(JSON.parse(existing));
      }
    } catch (error) {
      console.error('피드백 로드 실패:', error);
    }
  };

  const submitFeedback = async () => {
    if (!feedback.trim()) {
      Alert.alert('피드백을 입력해주세요');
      return;
    }

    try {
      setIsSubmitting(true);
      const today = new Date().toISOString().split('T')[0];
      const feedbackEntry: FeedbackItem = {
        id: Date.now().toString(),
        date: today,
        time: new Date().toLocaleTimeString('ko-KR'),
        content: feedback,
        status: 'pending',
      };

      // AsyncStorage와 Netlify에 동시 저장
      const newList = [feedbackEntry, ...feedbackList];
      await AsyncStorage.setItem('app_feedback', JSON.stringify(newList));
      setFeedbackList(newList);

      // Netlify Blobs에 저장
      try {
        const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/app-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feedbackEntry),
        });
        if (response.ok) {
          console.log('✅ Netlify 저장 완료');
        }
      } catch (e) {
        console.log('Netlify 저장 실패 (로컬만 저장됨)');
      }

      Alert.alert('감사합니다!', '피드백이 저장되었습니다.');
      setFeedback('');
    } catch (error) {
      Alert.alert('저장 실패', String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const syncWithNetlify = async () => {
    try {
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/app-feedback');
      const data = await response.json();

      if (data.feedbacks && Array.isArray(data.feedbacks)) {
        await AsyncStorage.setItem('app_feedback', JSON.stringify(data.feedbacks));
        setFeedbackList(data.feedbacks);
        console.log('✅ Netlify에서 동기화 완료');
      }
    } catch (error) {
      console.log('Netlify 동기화 실패:', error);
    }
  };

  const loadReminderStatus = async () => {
    try {
      const status = await AsyncStorage.getItem('reminders_enabled');
      setRemindersEnabled(status === 'true');
    } catch (error) {
      console.error('알림 상태 로드 실패:', error);
    }
  };

  const toggleStudyReminders = async () => {
    try {
      if (!remindersEnabled) {
        // 알림 활성화
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('권한 거부', '알림 권한을 허용해주세요.');
          return;
        }

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('study-reminder', {
            name: 'study-reminder',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#2563eb',
            sound: 'default',
          });
        }

        // 하루 6번: 08:00, 10:00, 12:00, 16:00, 20:00, 22:00
        const times = [8, 10, 12, 16, 20, 22];

        times.forEach((hour) => {
          Notifications.scheduleNotificationAsync({
            content: {
              title: '📚 학습할 시간이에요!',
              body: '오늘도 열심히 학습해보세요. 계속 성장하고 있습니다! 💪',
              data: { type: 'study-reminder' },
              sound: 'default',
            },
            trigger: { type: 'daily', hour, minute: 0 },
          });
        });

        await AsyncStorage.setItem('reminders_enabled', 'true');
        setRemindersEnabled(true);
        Alert.alert('✅ 활성화됨', '매일 6번 학습 알림을 받게 됩니다!');
      } else {
        // 알림 비활성화
        await Notifications.dismissAllNotificationsAsync();
        await AsyncStorage.setItem('reminders_enabled', 'false');
        setRemindersEnabled(false);
        Alert.alert('❌ 비활성화됨', '학습 알림이 꺼졌습니다.');
      }
    } catch (error) {
      Alert.alert('❌ 오류', '알림 설정 실패');
      console.error('알림 설정 실패:', error);
    }
  };

  const deleteFeedback = async (id: string) => {
    try {
      const newList = feedbackList.filter(item => item.id !== id);
      await AsyncStorage.setItem('app_feedback', JSON.stringify(newList));
      setFeedbackList(newList);
      Alert.alert('삭제됨', '피드백이 삭제되었습니다.');
    } catch (error) {
      Alert.alert('삭제 실패', String(error));
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚙️ 설정</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 알림 설정</Text>
          <Text style={styles.feedbackDesc}>
            08:00, 10:00, 12:00, 16:00, 20:00, 22:00에 학습 알림을 받습니다.
          </Text>
          <TouchableOpacity
            style={[styles.testButton, remindersEnabled && styles.testButtonActive]}
            onPress={toggleStudyReminders}
          >
            <Text style={styles.testButtonText}>
              {remindersEnabled ? '🔔 학습 알림 ON' : '🔕 학습 알림 OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💬 피드백</Text>
          <Text style={styles.feedbackDesc}>
            앱을 사용하면서 불편한 점이나 추가했으면 하는 기능을 알려주세요.
          </Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="여기에 의견을 작성해주세요..."
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={4}
            value={feedback}
            onChangeText={setFeedback}
            editable={!isSubmitting}
          />
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={submitFeedback}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? '저장 중...' : '✉️ 피드백 제출'}
            </Text>
          </TouchableOpacity>

          {feedbackList.length > 0 && (
            <View style={styles.feedbackListContainer}>
              <Text style={styles.feedbackListTitle}>제출된 피드백 ({feedbackList.length})</Text>
              {feedbackList.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.feedbackItem,
                    item.status === 'completed' && styles.feedbackItemCompleted,
                  ]}
                >
                  <View style={styles.feedbackContent}>
                    <View style={styles.feedbackMeta}>
                      <Text style={styles.feedbackDate}>{item.date}</Text>
                      <Text style={styles.feedbackTime}>{item.time}</Text>
                      {item.status === 'completed' && (
                        <View style={styles.statusBadge}>
                          <Text style={styles.statusBadgeText}>✅ 반영됨</Text>
                        </View>
                      )}
                      {!item.status && (
                        <View style={styles.statusBadgePending}>
                          <Text style={styles.statusBadgeTextPending}>⏳ 검토중</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.feedbackText}>{item.content}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() =>
                      Alert.alert('삭제 확인', '이 피드백을 삭제하시겠습니까?', [
                        { text: '취소', style: 'cancel' },
                        { text: '삭제', style: 'destructive', onPress: () => deleteFeedback(item.id) },
                      ])
                    }
                  >
                    <Text style={styles.deleteButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>앱 정보</Text>
          <View style={styles.item}>
            <Text style={styles.label}>앱 이름</Text>
            <Text style={styles.value}>YongStudy</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.label}>버전</Text>
            <Text style={styles.value}>1.0.1</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.label}>개발팀</Text>
            <Text style={styles.value}>YongStudy Team</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>주요 기능</Text>
          <View style={styles.item}>
            <Text style={styles.label}>📚 English</Text>
            <Text style={styles.value}>영어 단어 학습</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.label}>🎓 TOEFL</Text>
            <Text style={styles.value}>TOEFL 시험 준비</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.label}>📄 Papers</Text>
            <Text style={styles.value}>연구 논문 열람</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>사용 가능한 콘텐츠</Text>
          <View style={styles.item}>
            <Text style={styles.label}>🔤 단어</Text>
            <Text style={styles.value}>9개</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.label}>📝 토픽</Text>
            <Text style={styles.value}>7개</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.label}>📚 논문</Text>
            <Text style={styles.value}>7개</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  content: {
    padding: 12,
    paddingBottom: 80,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    letterSpacing: 0.5,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  value: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  feedbackDesc: {
    fontSize: 12,
    color: '#64748b',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    lineHeight: 18,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    fontSize: 13,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#10b981',
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  feedbackListContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
  },
  feedbackListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10b981',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  feedbackItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  feedbackContent: {
    flex: 1,
    marginRight: 8,
  },
  feedbackMeta: {
    flexDirection: 'row',
    marginBottom: 6,
    gap: 8,
  },
  feedbackDate: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  feedbackTime: {
    fontSize: 11,
    color: '#cbd5e1',
  },
  feedbackText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  deleteButton: {
    padding: 8,
    marginTop: -2,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  feedbackItemCompleted: {
    backgroundColor: '#f0fdf4',
  },
  statusBadge: {
    backgroundColor: '#d1fae5',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  statusBadgePending: {
    backgroundColor: '#fef3c7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  statusBadgeTextPending: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 16,
  },
  testButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  testButtonActive: {
    backgroundColor: '#10b981',
  },
  testButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
