import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, AsyncStorage, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';

interface UserProgress {
  exp: number;
  level: number;
  streak: number;
  badges: string[];
}

const DEFAULT_PROGRESS: UserProgress = {
  exp: 0,
  level: 1,
  streak: 0,
  badges: [],
};

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500];

function getExpForLevel(level: number): number {
  if (level < 1) return 0;
  if (level > LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  return LEVEL_THRESHOLDS[level - 1];
}

function getCurrentLevelExp(currentLevel: number, currentExp: number): { current: number; next: number } {
  const currentThreshold = getExpForLevel(currentLevel);
  const nextThreshold = getExpForLevel(currentLevel + 1);
  return {
    current: currentExp - currentThreshold,
    next: nextThreshold - currentThreshold,
  };
}

export default function HomeScreen() {
  const [progress, setProgress] = useState<UserProgress>(DEFAULT_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [updateStatus, setUpdateStatus] = useState('확인 중...');

  useEffect(() => {
    loadProgress();
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateStatus('✅ 업데이트 사용 가능');
        await Updates.fetchUpdateAsync();
        setUpdateStatus('✅ 업데이트 완료 (재시작 시 적용)');
      } else {
        setUpdateStatus('✅ 최신 버전 (업데이트 없음)');
      }
    } catch (error) {
      setUpdateStatus('⚠️ 업데이트 확인 실패');
    }
  };

  const loadProgress = async () => {
    try {
      const stored = await AsyncStorage.getItem('user_progress');
      if (stored) {
        setProgress(JSON.parse(stored));
      } else {
        setProgress(DEFAULT_PROGRESS);
      }
    } catch (error) {
      console.error('Failed to load progress:', error);
      setProgress(DEFAULT_PROGRESS);
    } finally {
      setLoading(false);
    }
  };

  const expProgress = getCurrentLevelExp(progress.level, progress.exp);
  const expPercentage = (expProgress.current / expProgress.next) * 100;

  const badgeIcons: Record<string, string> = {
    starter: '🌱',
    english_master: '📚',
    toefl_master: '🎓',
    learner_angel: '😇',
    week_champion: '🏅',
    month_warrior: '⚔️',
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>어서오세요! 🎉</Text>
          <Text style={styles.subheading}>오늘도 화이팅!</Text>
          <Text style={styles.updateStatus}>{updateStatus}</Text>
        </View>

        {/* Level Card */}
        <View style={styles.levelCard}>
          <View style={styles.levelTop}>
            <View>
              <Text style={styles.levelNumber}>LV. {progress.level}</Text>
              <Text style={styles.levelLabel}>현재 레벨</Text>
            </View>
            <Text style={styles.levelEmoji}>🎮</Text>
          </View>

          {/* Experience Bar */}
          <View style={styles.expContainer}>
            <View style={styles.expBarBg}>
              <Animated.View
                style={[
                  styles.expBarFill,
                  {
                    width: `${Math.min(expPercentage, 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.expText}>
              {expProgress.current} / {expProgress.next} EXP
            </Text>
          </View>

          <Text style={styles.totalExp}>총 경험치: {progress.exp}</Text>
        </View>

        {/* Streak Card */}
        <View style={styles.streakCard}>
          <View style={styles.streakContent}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <View>
              <Text style={styles.streakNumber}>{progress.streak}</Text>
              <Text style={styles.streakLabel}>일 연속</Text>
            </View>
          </View>
          <Text style={styles.streakDescription}>매일 열심히 공부하고 있어요!</Text>
        </View>

        {/* Badges Section */}
        <View style={styles.badgesSection}>
          <Text style={styles.badgesTitle}>🏆 받은 배지</Text>
          <View style={styles.badgesGrid}>
            {progress.badges.length > 0 ? (
              progress.badges.map((badge, idx) => (
                <View key={idx} style={styles.badgeItem}>
                  <Text style={styles.badgeIcon}>{badgeIcons[badge] || '⭐'}</Text>
                  <Text style={styles.badgeName}>{badge}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noBadges}>아직 배지가 없어요. 열심히 공부해보세요!</Text>
            )}
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>📚</Text>
            <Text style={styles.statLabel}>영어 공부</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>🎓</Text>
            <Text style={styles.statLabel}>TOEFL</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>📄</Text>
            <Text style={styles.statLabel}>논문</Text>
          </View>
        </View>

        {/* Daily Challenge (Coming Soon) */}
        <View style={styles.challengeCard}>
          <Text style={styles.challengeTitle}>⭐ 오늘의 도전</Text>
          <Text style={styles.challengeText}>영어 단어 5개 학습하기</Text>
          <View style={styles.challengeProgress}>
            <View style={[styles.progressBar, { width: '40%' }]} />
          </View>
          <Text style={styles.challengeReward}>완료 시 +50 EXP</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
    backgroundColor: '#0ea5e9',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 32,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
    color: '#fff',
  },
  subheading: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  updateStatus: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    fontWeight: '500',
  },
  levelCard: {
    backgroundColor: '#0ea5e9',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  levelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  levelNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  levelLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  levelEmoji: {
    fontSize: 40,
  },
  expContainer: {
    marginBottom: 12,
  },
  expBarBg: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  expBarFill: {
    height: '100%',
    backgroundColor: '#fbbf24',
    borderRadius: 6,
  },
  expText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  totalExp: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  streakCard: {
    backgroundColor: '#fff7ed',
    borderWidth: 2,
    borderColor: '#fed7aa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  streakContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  streakEmoji: {
    fontSize: 32,
  },
  streakNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f59e0b',
  },
  streakLabel: {
    fontSize: 12,
    color: '#92400e',
  },
  streakDescription: {
    fontSize: 13,
    color: '#92400e',
  },
  badgesSection: {
    marginBottom: 24,
  },
  badgesTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeItem: {
    alignItems: 'center',
    width: '30%',
  },
  badgeIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  badgeName: {
    fontSize: 11,
    color: '#37352f',
    textAlign: 'center',
  },
  noBadges: {
    fontSize: 13,
    color: '#9b9a97',
    width: '100%',
  },
  statsSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#37352f',
    textAlign: 'center',
  },
  challengeCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 12,
    padding: 16,
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  challengeText: {
    fontSize: 14,
    color: '#37352f',
    marginBottom: 12,
  },
  challengeProgress: {
    height: 8,
    backgroundColor: '#dcfce7',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#86efac',
  },
  challengeReward: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
});
