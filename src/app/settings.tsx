import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAST_BUILD_TIME } from '../constants/buildInfo';
import { enableStudyNotifications, disableStudyNotifications } from '../utils/studyNotifications';

interface FeedbackItem {
  id: string;
  date: string;
  time: string;
  content: string;
  status?: 'completed';
}

export default function SettingsScreen() {
  const [feedback, setFeedback] = useState('');
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [buildTime, setBuildTime] = useState<string>('');

  useEffect(() => {
    loadFeedback();
    loadReminderStatus();
    loadBuildTime();
  }, []);

  const loadBuildTime = async () => {
    if (LAST_BUILD_TIME) {
      setBuildTime(LAST_BUILD_TIME);
    }
  };

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

  const submitFeedback = () => {
    if (!feedback.trim()) {
      Alert.alert('피드백을 입력해주세요');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const feedbackEntry: FeedbackItem = {
      id: Date.now().toString(),
      date: today,
      time: new Date().toLocaleTimeString('ko-KR'),
      content: feedback,
      status: 'completed',
    };

    const newList = [feedbackEntry, ...feedbackList];
    setFeedbackList(newList);
    setFeedback('');

    AsyncStorage.setItem('app_feedback', JSON.stringify(newList)).catch(() => {
      console.warn('로컬 저장 실패');
    });
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
        const ok = await enableStudyNotifications();
        if (!ok) {
          Alert.alert('권한 거부', '알림 권한을 허용해주세요.');
          return;
        }
        setRemindersEnabled(true);
        Alert.alert('✅ 활성화됨', '8시~22시 매시간 복습 단어 알림을 받게 됩니다!');
      } else {
        await disableStudyNotifications();
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
        {buildTime && (
          <View style={styles.buildInfoContainer}>
            <Text style={styles.buildInfoLabel}>📦 최종 빌드</Text>
            <Text style={styles.buildInfoTime}>{buildTime}</Text>
          </View>
        )}

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
          />
          <TouchableOpacity
            style={styles.submitButton}
            onPress={submitFeedback}
          >
            <Text style={styles.submitButtonText}>✉️ 피드백 제출</Text>
          </TouchableOpacity>

          {feedbackList.length > 0 && (
            <View style={styles.feedbackListContainer}>
              <Text style={styles.feedbackListTitle}>제출된 피드백 ({feedbackList.length})</Text>
              {feedbackList.map((item) => (
                <View key={item.id} style={styles.feedbackItem}>
                  <View style={styles.feedbackContent}>
                    <View style={styles.feedbackMeta}>
                      <Text style={styles.feedbackDate}>{item.date}</Text>
                      <Text style={styles.feedbackTime}>{item.time}</Text>
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
            <Text style={styles.label}>💰 Investment</Text>
            <Text style={styles.value}>투자 분석</Text>
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
  buildInfoContainer: {
    backgroundColor: '#ecfdf5',
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 8,
    borderRadius: 8,
  },
  buildInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 4,
  },
  buildInfoTime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 8,
  },
  feedbackDesc: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
    lineHeight: 18,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 13,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#10b981',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 14,
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
    marginBottom: 10,
  },
  feedbackItem: {
    flexDirection: 'row',
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
  },
  deleteButtonText: {
    fontSize: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
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
