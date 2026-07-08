import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  useColorScheme,
  AsyncStorage,
} from 'react-native';
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

const COLORS = {
  primary: '#0ea5e9',
  primaryDark: '#0284c7',
  primaryLight: '#e0f2fe',
  accent: '#fbbf24',
  accentDark: '#f59e0b',
  success: '#22c55e',
  successLight: '#f0fdf4',
  orange: '#f97316',
  orangeLight: '#fff7ed',
  purple: '#8b5cf6',
  surface: '#fafaf9',
  border: '#e9e9e7',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9b9a97',
  white: '#ffffff',
  // dark mode
  darkBg: '#111827',
  darkSurface: '#1f2937',
  darkBorder: '#374151',
  darkTextPrimary: '#f9fafb',
  darkTextSecondary: '#d1d5db',
};

const BADGE_MAP: Record<string, { icon: string; label: string; color: string }> = {
  starter:        { icon: '🌱', label: '시작의 씨앗', color: '#22c55e' },
  english_master: { icon: '📚', label: '영어 마스터',  color: '#0ea5e9' },
  toefl_master:   { icon: '🎓', label: 'TOEFL 마스터', color: '#f59e0b' },
  learner_angel:  { icon: '😇', label: '학습 천사',    color: '#a78bfa' },
  week_champion:  { icon: '🏅', label: '주간 챔피언',  color: '#f97316' },
  month_warrior:  { icon: '⚔️', label: '월간 전사',   color: '#ef4444' },
};

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [progress, setProgress] = useState<UserProgress>(DEFAULT_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<{ text: string; ok: boolean }>({ text: '확인 중...', ok: true });

  // Animated values
  const expBarAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(30)).current;
  const streakScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadProgress();
    checkForUpdates();

    // fade-in entrance
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!loading) {
      const expProgress = getCurrentLevelExp(progress.level, progress.exp);
      const pct = expProgress.next > 0 ? expProgress.current / expProgress.next : 0;
      Animated.timing(expBarAnim, {
        toValue: Math.min(pct, 1),
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();

      // streak pulse
      if (progress.streak > 0) {
        Animated.sequence([
          Animated.timing(streakScale, { toValue: 1.15, duration: 200, useNativeDriver: true }),
          Animated.timing(streakScale, { toValue: 1,    duration: 200, useNativeDriver: true }),
        ]).start();
      }
    }
  }, [loading, progress]);

  const checkForUpdates = async () => {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateStatus({ text: '업데이트 다운로드 중...', ok: true });
        await Updates.fetchUpdateAsync();
        setUpdateStatus({ text: '업데이트 완료 — 재시작 시 적용', ok: true });
      } else {
        setUpdateStatus({ text: '최신 버전', ok: true });
      }
    } catch {
      setUpdateStatus({ text: '업데이트 확인 실패', ok: false });
    }
  };

  const loadProgress = async () => {
    try {
      const stored = await AsyncStorage.getItem('user_progress');
      setProgress(stored ? JSON.parse(stored) : DEFAULT_PROGRESS);
    } catch {
      setProgress(DEFAULT_PROGRESS);
    } finally {
      setLoading(false);
    }
  };

  const expProgress  = getCurrentLevelExp(progress.level, progress.exp);
  const expPct       = expProgress.next > 0 ? expProgress.current / expProgress.next : 0;
  const expBarWidth  = expBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const c = {
    bg:          isDark ? COLORS.darkBg      : '#f8fafc',
    surface:     isDark ? COLORS.darkSurface : COLORS.white,
    border:      isDark ? COLORS.darkBorder  : COLORS.border,
    textPrimary: isDark ? COLORS.darkTextPrimary   : COLORS.textPrimary,
    textSec:     isDark ? COLORS.darkTextSecondary : COLORS.textSecondary,
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO HEADER ── */}
        <Animated.View style={[styles.hero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.heroInner}>
            <View>
              <Text style={styles.heroGreeting}>어서오세요! 👋</Text>
              <Text style={styles.heroSub}>오늘도 꾸준히 성장해봐요</Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>LV.{progress.level}</Text>
            </View>
          </View>
          <View style={styles.updateRow}>
            <View style={[styles.updateDot, { backgroundColor: updateStatus.ok ? COLORS.success : '#ef4444' }]} />
            <Text style={styles.heroUpdate}>{updateStatus.text}</Text>
          </View>
        </Animated.View>

        {/* ── LEVEL CARD ── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={[styles.levelCard, { backgroundColor: COLORS.primary }]}>
            {/* decorative circle */}
            <View style={styles.lvDecorCircle} />
            <View style={styles.lvDecorCircle2} />

            <View style={styles.lvRow}>
              <View>
                <Text style={styles.lvLabel}>현재 레벨</Text>
                <Text style={styles.lvNumber}>LV. {progress.level}</Text>
              </View>
              <View style={styles.lvEmojiWrap}>
                <Text style={styles.lvEmoji}>🎮</Text>
              </View>
            </View>

            {/* EXP Bar */}
            <View style={styles.expBarBg}>
              <Animated.View style={[styles.expBarFill, { width: expBarWidth }]} />
              <View style={styles.expBarShine} />
            </View>
            <View style={styles.expRow}>
              <Text style={styles.expText}>{expProgress.current} EXP</Text>
              <Text style={styles.expText}>{expProgress.next} EXP</Text>
            </View>
            <Text style={styles.totalExp}>누적 경험치: {progress.exp} EXP</Text>
          </View>
        </Animated.View>

        {/* ── STREAK CARD ── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: streakScale }] }}>
          <View style={[styles.streakCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.streakLeft}>
              <Text style={styles.streakFire}>🔥</Text>
              <View>
                <Text style={[styles.streakNum, { color: c.textPrimary }]}>{progress.streak}일</Text>
                <Text style={[styles.streakLabel, { color: c.textSec }]}>연속 학습</Text>
              </View>
            </View>
            <View style={styles.streakRight}>
              <Text style={styles.streakMotivation}>
                {progress.streak === 0
                  ? '오늘부터 시작!'
                  : progress.streak < 7
                  ? '좋은 시작이에요!'
                  : progress.streak < 30
                  ? '대단한 집중력!'
                  : '진정한 학습자!'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── QUICK STATS ── */}
        <View style={styles.statsRow}>
          {[
            { emoji: '📚', label: '영어 공부', color: COLORS.primary,    light: COLORS.primaryLight },
            { emoji: '🎓', label: 'TOEFL',    color: COLORS.accentDark, light: '#fef3c7' },
            { emoji: '📄', label: '논문',      color: COLORS.purple,     light: '#f5f3ff' },
          ].map((item) => (
            <View key={item.label} style={[styles.statCard, { backgroundColor: item.light, borderColor: c.border }]}>
              <Text style={styles.statEmoji}>{item.emoji}</Text>
              <Text style={[styles.statLabel, { color: item.color }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* ── BADGES ── */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>🏆 획득한 배지</Text>
          {progress.badges.length > 0 ? (
            <View style={styles.badgeGrid}>
              {progress.badges.map((badge, idx) => {
                const info = BADGE_MAP[badge] ?? { icon: '⭐', label: badge, color: COLORS.primary };
                return (
                  <View key={idx} style={[styles.badgeItem, { borderColor: info.color + '40', backgroundColor: info.color + '15' }]}>
                    <Text style={styles.badgeIcon}>{info.icon}</Text>
                    <Text style={[styles.badgeName, { color: info.color }]}>{info.label}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyBadge}>
              <Text style={styles.emptyBadgeEmoji}>🌟</Text>
              <Text style={[styles.emptyBadgeText, { color: c.textSec }]}>
                열심히 공부하면{'\n'}배지를 획득할 수 있어요!
              </Text>
            </View>
          )}
        </View>

        {/* ── DAILY CHALLENGE ── */}
        <View style={styles.challengeCard}>
          <View style={styles.challengeHeader}>
            <Text style={styles.challengeTitle}>⭐ 오늘의 도전</Text>
            <Text style={styles.challengeReward}>+50 EXP</Text>
          </View>
          <Text style={styles.challengeDesc}>영어 단어 5개 학습하기</Text>
          <View style={styles.challengeBarBg}>
            <View style={[styles.challengeBarFill, { width: '40%' }]} />
          </View>
          <Text style={styles.challengeProgress}>2 / 5 완료</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content:  { padding: 16, paddingBottom: 120 },

  // Hero
  hero: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroInner:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heroGreeting: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  heroSub:      { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  heroBadge:    { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  heroBadgeText:{ fontSize: 15, fontWeight: '800', color: '#fff' },
  updateRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updateDot:    { width: 7, height: 7, borderRadius: 4 },
  heroUpdate:   { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },

  // Level Card
  levelCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  lvDecorCircle:  { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)', top: -30, right: -20 },
  lvDecorCircle2: { position: 'absolute', width: 80,  height: 80,  borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.06)', bottom: -10, right: 60 },
  lvRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  lvLabel:  { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 4, fontWeight: '600', letterSpacing: 0.5 },
  lvNumber: { fontSize: 36, fontWeight: '900', color: '#fff' },
  lvEmojiWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  lvEmoji:  { fontSize: 28 },

  expBarBg:   { height: 14, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 7, overflow: 'hidden', marginBottom: 8, position: 'relative' },
  expBarFill: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: COLORS.accent, borderRadius: 7 },
  expBarShine:{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3 },
  expRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  expText:    { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  totalExp:   { fontSize: 11, color: 'rgba(255,255,255,0.65)' },

  // Streak
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  streakLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakFire:  { fontSize: 36 },
  streakNum:   { fontSize: 26, fontWeight: '800' },
  streakLabel: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  streakRight: { flex: 1, alignItems: 'flex-end' },
  streakMotivation: { fontSize: 13, fontWeight: '600', color: COLORS.orange },

  // Quick Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard:  {
    flex: 1, borderRadius: 14, borderWidth: 1,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  statEmoji: { fontSize: 26, marginBottom: 6 },
  statLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  // Section (badges)
  section:      { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  badgeGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeItem:    { alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, minWidth: 90 },
  badgeIcon:    { fontSize: 28, marginBottom: 6 },
  badgeName:    { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  emptyBadge:   { alignItems: 'center', paddingVertical: 20 },
  emptyBadgeEmoji: { fontSize: 40, marginBottom: 10 },
  emptyBadgeText:  { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Daily Challenge
  challengeCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 16,
  },
  challengeHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  challengeTitle:   { fontSize: 15, fontWeight: '700', color: '#166534' },
  challengeReward:  { fontSize: 13, fontWeight: '700', color: '#16a34a', backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  challengeDesc:    { fontSize: 14, color: '#166534', marginBottom: 12 },
  challengeBarBg:   { height: 8, backgroundColor: '#dcfce7', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  challengeBarFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 4 },
  challengeProgress:{ fontSize: 12, color: '#16a34a', fontWeight: '600' },
});
