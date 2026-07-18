import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { AnnouncementModal } from '../components/AnnouncementModal';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { useErrorLog, type ErrorLog } from '../hooks/useErrorLog';
import { useErrorLogger } from '../hooks/useErrorLogger';
import type { HealthCheckReport } from '../hooks/useHealthCheck';
import { LAST_BUILD_TIME } from '../constants/buildInfo';
import { useDataSyncMonitor } from '../hooks/useDataSyncMonitor';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

interface FeedbackItem {
  id: string;
  date: string;
  time: string;
  content: string;
  status?: 'pending' | 'completed';
}

export default function SettingsScreen() {
  const [feedback, setFeedback] = useState('');
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const { announcements, unreadCount, markAsRead } = useAnnouncements();
  const { report, isChecking, runHealthCheck, progress } = useHealthCheck();
  const [showHealthReport, setShowHealthReport] = useState(false);
  const { getLogs: getErrorLogs, clearLogs: clearErrorLogs } = useErrorLog();
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [showErrorLogs, setShowErrorLogs] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<any[]>([]);
  const [showRuntimeErrors, setShowRuntimeErrors] = useState(false);
  const [buildTime, setBuildTime] = useState<string>('');
  const { report: syncReport, isMonitoring: isSyncMonitoring, runSyncCheck } = useDataSyncMonitor();
  const { queueStatus, syncQueue } = useOfflineQueue();
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const { setDebugMode, getDebugMode } = useErrorLogger();
  const [debugMode, setDebugMode_State] = useState(false);

  useEffect(() => {
    loadFeedback();
    loadReminderStatus();
    loadBuildTime();
    loadDebugMode();
    syncWithNetlify(); // 앱 시작 시 Netlify에서 최신 상태 동기화

    // 에러 로그 로드
    const loadErrors = async () => {
      const logs = await getErrorLogs();
      setErrorLogs(logs);
    };
    loadErrors();
  }, [getErrorLogs]);

  const loadBuildTime = async () => {
    try {
      // buildInfo.ts에서 가져온 빌드 시간 사용
      if (LAST_BUILD_TIME) {
        setBuildTime(LAST_BUILD_TIME);
        // AsyncStorage에 저장 (향후 참조용)
        await AsyncStorage.setItem('last_build_time', LAST_BUILD_TIME);
      }
    } catch (error) {
      console.error('빌드 시간 로드 실패:', error);
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
      status: 'pending',
    };

    // 즉시 UI 업데이트 (가장 빠름)
    const newList = [feedbackEntry, ...feedbackList];
    setFeedbackList(newList);
    setFeedback('');

    // 로컬 저장 (백그라운드)
    setTimeout(() => {
      AsyncStorage.setItem('app_feedback', JSON.stringify(newList)).catch(() => {
        console.warn('로컬 저장 실패');
      });
    }, 0);

    // 서버 저장 (백그라운드)
    setTimeout(() => {
      fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/app-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackEntry),
      }).catch(() => {
        console.log('서버 저장 생략');
      });
    }, 0);
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

  const loadDebugMode = async () => {
    try {
      const mode = await AsyncStorage.getItem('debug_mode');
      setDebugMode_State(mode === 'true');
    } catch (error) {
      console.error('디버그 모드 로드 실패:', error);
    }
  };

  const toggleDebugMode = async () => {
    try {
      const newMode = !debugMode;
      setDebugMode_State(newMode);
      setDebugMode(newMode);
      await AsyncStorage.setItem('debug_mode', newMode ? 'true' : 'false');
      Alert.alert(
        '✅ 설정됨',
        newMode
          ? '디버그 모드가 활성화되었습니다. 콘솔에 로그가 표시됩니다.'
          : '디버그 모드가 비활성화되었습니다. 백그라운드로만 로깅됩니다.'
      );
    } catch (error) {
      Alert.alert('❌ 오류', '디버그 모드 설정 실패');
      console.error('디버그 모드 토글 실패:', error);
    }
  };

  const loadRuntimeErrors = async () => {
    try {
      // 로컬 에러로그에서 runtime errors 필터링
      const allLogs = await getErrorLogs();
      const runtimeErrs = allLogs.filter(
        log => log.severity === 'error' || log.severity === 'warning'
      );
      setRuntimeErrors(runtimeErrs);
      console.log('✅ 런타임 에러 로드:', runtimeErrs.length);

      // 동시에 서버에도 저장 시도
      try {
        for (const err of runtimeErrs) {
          await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/runtime-errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(err),
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('서버 동기화 실패:', e);
      }
    } catch (error) {
      console.error('런타임 에러 로드 실패:', error);
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
            trigger: { type: 'daily', hour, minute: 0 } as any,
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
        {/* 빌드 정보 */}
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
          <View style={styles.announcementHeader}>
            <Text style={styles.sectionTitle}>📢 공지사항</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.feedbackDesc}>
            {announcements.length === 0
              ? '공지사항이 없습니다.'
              : `${announcements.length}개의 공지사항이 있습니다.`}
          </Text>
          <TouchableOpacity
            style={styles.testButton}
            onPress={() => setShowAnnouncements(true)}
          >
            <Text style={styles.testButtonText}>
              📖 공지사항 보기
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 헬스 체크</Text>
          <Text style={styles.feedbackDesc}>
            앱의 모든 기능이 정상적으로 작동하는지 확인합니다.
          </Text>

          <TouchableOpacity
            style={[styles.testButton, isChecking && styles.testButtonDisabled]}
            onPress={async () => {
              await runHealthCheck();
              await loadRuntimeErrors();
              setShowHealthReport(true);
            }}
            disabled={isChecking}
          >
            <Text style={styles.testButtonText}>
              {isChecking ? `⏳ 검사 중... (${progress.current}/${progress.total})` : '🏥 헬스 체크 실행'}
            </Text>
          </TouchableOpacity>

          {isChecking && progress.current > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(progress.current / progress.total) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                현재 검사: {progress.tab} ({progress.current}/{progress.total})
              </Text>
            </View>
          )}

          {report && !showHealthReport && (
            <View style={styles.healthSummary}>
              <Text style={styles.healthSummaryTitle}>최근 검사 결과</Text>
              <View style={styles.healthSummaryRow}>
                <Text style={styles.healthLabel}>정상:</Text>
                <Text style={[styles.healthValue, styles.healthHealthy]}>
                  {report.summary.healthy}/{report.summary.total}
                </Text>
              </View>
              {report.summary.warnings > 0 && (
                <View style={styles.healthSummaryRow}>
                  <Text style={styles.healthLabel}>경고:</Text>
                  <Text style={[styles.healthValue, styles.healthWarning]}>
                    {report.summary.warnings}개
                  </Text>
                </View>
              )}
              {report.summary.errors > 0 && (
                <View style={styles.healthSummaryRow}>
                  <Text style={styles.healthLabel}>오류:</Text>
                  <Text style={[styles.healthValue, styles.healthError]}>
                    {report.summary.errors}개
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📡 동기화 상태</Text>
          <Text style={styles.feedbackDesc}>
            모든 데이터 소스의 동기화 상태를 확인합니다.
          </Text>

          {queueStatus.totalItems > 0 && (
            <View style={[styles.healthItem, styles.healthItemWarning]}>
              <Text style={styles.healthItemTitle}>⏳ 오프라인 대기열</Text>
              <Text style={styles.healthItemMessage}>
                {queueStatus.totalItems}개 항목이 동기화를 기다리고 있습니다.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.testButton, isSyncMonitoring && styles.testButtonDisabled]}
            onPress={async () => {
              await runSyncCheck();
              setShowSyncDetails(true);
            }}
            disabled={isSyncMonitoring}
          >
            <Text style={styles.testButtonText}>
              {isSyncMonitoring ? '⏳ 동기화 중...' : '🔄 동기화 확인'}
            </Text>
          </TouchableOpacity>

          {syncReport && !showSyncDetails && (
            <View style={styles.healthSummary}>
              <Text style={styles.healthSummaryTitle}>최근 동기화 결과</Text>
              <View style={styles.healthSummaryRow}>
                <Text style={styles.healthLabel}>성공:</Text>
                <Text style={[styles.healthValue, styles.healthHealthy]}>
                  {syncReport.successCount}/{syncReport.successCount + syncReport.failureCount}
                </Text>
              </View>
              {syncReport.queueSize > 0 && (
                <View style={styles.healthSummaryRow}>
                  <Text style={styles.healthLabel}>대기열:</Text>
                  <Text style={[styles.healthValue, styles.healthWarning]}>
                    {syncReport.queueSize}개 항목
                  </Text>
                </View>
              )}
              <View style={styles.healthSummaryRow}>
                <Text style={styles.healthLabel}>평균 시간:</Text>
                <Text style={[styles.healthValue, styles.healthValue]}>
                  {syncReport.averageSyncTime}ms
                </Text>
              </View>
            </View>
          )}

          {showSyncDetails && syncReport && (
            <View>
              <TouchableOpacity onPress={() => setShowSyncDetails(false)}>
                <Text style={styles.sectionTitle}>📊 상세 동기화 상태</Text>
              </TouchableOpacity>

              {Object.entries(syncReport.sources).map(([key, source]) => (
                <View
                  key={key}
                  style={[
                    styles.healthItem,
                    source.status === 'synced' && styles.healthItemHealthy,
                    source.status === 'failed' && styles.healthItemError,
                    source.status === 'syncing' && styles.healthItemWarning,
                  ]}
                >
                  <Text style={styles.healthItemTitle}>
                    {source.status === 'synced' && '🟢'}
                    {source.status === 'syncing' && '🟡'}
                    {source.status === 'failed' && '🔴'}
                    {' '}
                    {source.name}
                  </Text>
                  {source.lastSyncTime && (
                    <Text style={styles.healthItemMessage}>
                      마지막 동기화: {new Date(source.lastSyncTime).toLocaleString('ko-KR')}
                    </Text>
                  )}
                  {source.errorMessage && (
                    <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                      오류: {source.errorMessage}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    항목: {source.itemCount}개
                  </Text>
                </View>
              ))}

              {queueStatus.totalItems > 0 && (
                <TouchableOpacity
                  style={[styles.testButton, { backgroundColor: '#3b82f6', marginTop: 12 }]}
                  onPress={() => syncQueue()}
                >
                  <Text style={styles.testButtonText}>⬆️ 지금 동기화</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🐛 디버그 모드</Text>
          <Text style={styles.feedbackDesc}>
            {debugMode
              ? '콘솔에 모든 에러 로그가 표시됩니다.'
              : '에러는 백그라운드에서만 기록됩니다.'}
          </Text>
          <TouchableOpacity
            style={[styles.testButton, debugMode && styles.testButtonActive]}
            onPress={toggleDebugMode}
          >
            <Text style={styles.testButtonText}>
              {debugMode ? '🟢 디버그 모드 ON' : '⚪ 디버그 모드 OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {errorLogs.length > 0 && !showErrorLogs && (
          <View style={styles.section}>
            <View style={styles.announcementHeader}>
              <Text style={styles.sectionTitle}>🔴 에러 로그</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{errorLogs.length}</Text>
              </View>
            </View>
            <Text style={styles.feedbackDesc}>
              앱에서 발생한 에러들이 기록되었습니다.
            </Text>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => setShowErrorLogs(true)}
            >
              <Text style={styles.testButtonText}>
                🔍 에러 로그 확인
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {showErrorLogs && errorLogs.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity onPress={() => setShowErrorLogs(false)}>
              <Text style={styles.sectionTitle}>🔴 에러 로그 상세</Text>
            </TouchableOpacity>

            {errorLogs.map((log, idx) => (
              <View
                key={idx}
                style={[
                  styles.healthItem,
                  log.severity === 'fatal' && styles.healthItemError,
                  log.severity === 'error' && styles.healthItemError,
                  log.severity === 'warning' && styles.healthItemWarning,
                ]}
              >
                <Text style={styles.healthItemTitle}>
                  {log.tab} - {log.severity.toUpperCase()}
                </Text>
                <Text style={styles.healthItemMessage}>{log.error}</Text>
                <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                  {new Date(log.timestamp).toLocaleString('ko-KR')}
                </Text>
                {log.stack && (
                  <Text style={{ fontSize: 9, color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>
                    {log.stack.split('\n')[0]}
                  </Text>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.testButton, { backgroundColor: '#ef4444', marginTop: 12 }]}
              onPress={async () => {
                await clearErrorLogs();
                setErrorLogs([]);
                setShowErrorLogs(false);
              }}
            >
              <Text style={styles.testButtonText}>🗑️ 에러 로그 삭제</Text>
            </TouchableOpacity>
          </View>
        )}

        {report && showHealthReport && (
          <View style={styles.section}>
            <TouchableOpacity onPress={() => setShowHealthReport(false)}>
              <Text style={styles.sectionTitle}>📊 상세 결과</Text>
            </TouchableOpacity>

            {report.results.map((result, idx) => (
              <View
                key={idx}
                style={[
                  styles.healthItem,
                  result.status === 'healthy' && styles.healthItemHealthy,
                  result.status === 'warning' && styles.healthItemWarning,
                  result.status === 'error' && styles.healthItemError,
                ]}
              >
                <Text style={styles.healthItemTitle}>{result.tab}</Text>
                <Text style={styles.healthItemMessage}>{result.message}</Text>
                {result.errors.length > 0 && (
                  <View style={styles.healthItemErrors}>
                    {result.errors.map((err, errIdx) => (
                      <Text key={errIdx} style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                        • {err}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {runtimeErrors.length > 0 && !showRuntimeErrors && (
          <View style={styles.section}>
            <View style={styles.announcementHeader}>
              <Text style={styles.sectionTitle}>⚡ 런타임 에러</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{runtimeErrors.length}</Text>
              </View>
            </View>
            <Text style={styles.feedbackDesc}>
              헬스 체크 중 발생한 런타임 에러들입니다.
            </Text>
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => setShowRuntimeErrors(true)}
            >
              <Text style={styles.testButtonText}>
                📋 런타임 에러 상세 ({runtimeErrors.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {showRuntimeErrors && runtimeErrors.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity onPress={() => setShowRuntimeErrors(false)}>
              <Text style={styles.sectionTitle}>⚡ 런타임 에러 상세</Text>
            </TouchableOpacity>

            {runtimeErrors.map((err, idx) => (
              <View
                key={idx}
                style={[
                  styles.healthItem,
                  err.severity === 'error' && styles.healthItemError,
                  err.severity === 'warning' && styles.healthItemWarning,
                ]}
              >
                <Text style={styles.healthItemTitle}>
                  {err.tab} - {err.severity.toUpperCase()}
                </Text>
                <Text style={styles.healthItemMessage}>{err.error}</Text>
                <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                  {new Date(err.timestamp).toLocaleString('ko-KR')}
                </Text>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.testButton, { backgroundColor: '#8b5cf6', marginTop: 12 }]}
              onPress={async () => {
                try {
                  await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/runtime-errors', {
                    method: 'DELETE',
                  });
                  setRuntimeErrors([]);
                  setShowRuntimeErrors(false);
                  Alert.alert('삭제됨', '런타임 에러가 삭제되었습니다.');
                } catch (error) {
                  Alert.alert('삭제 실패', String(error));
                }
              }}
            >
              <Text style={styles.testButtonText}>🗑️ 런타임 에러 삭제</Text>
            </TouchableOpacity>
          </View>
        )}

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
            <Text style={styles.submitButtonText}>
              ✉️ 피드백 제출
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

      <AnnouncementModal
        visible={showAnnouncements}
        announcements={announcements}
        onClose={() => setShowAnnouncements(false)}
        onMarkAsRead={markAsRead}
      />
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
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  healthSummary: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  healthSummaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 8,
  },
  healthSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  healthLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  healthValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  healthHealthy: {
    color: '#16a34a',
  },
  healthWarning: {
    color: '#ea580c',
  },
  healthError: {
    color: '#dc2626',
  },
  healthItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 0,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
  },
  healthItemHealthy: {
    borderLeftColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  healthItemWarning: {
    borderLeftColor: '#ea580c',
    backgroundColor: '#fffbeb',
  },
  healthItemError: {
    borderLeftColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  healthItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  healthItemMessage: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
  },
  healthItemErrors: {
    marginTop: 6,
  },
  progressContainer: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    marginHorizontal: 0,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e0e7ff',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  progressText: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600',
  },
});
