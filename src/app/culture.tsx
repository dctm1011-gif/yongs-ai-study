import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
  Animated,
  ToastAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStaggerFade } from '../hooks/useScreenFade';
import { MaterialIcons } from '@expo/vector-icons';
import * as IntentLauncher from 'expo-intent-launcher';
import { getDatabase, ref, set as dbSet, get } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { userRef } from '../utils/userDb';
import { useAuth } from '../context/AuthContext';
import { BookSection } from '../components/BookDiary';
import KoreanWordPuzzle from '../components/KoreanWordPuzzle';
import {
  getDayIndex,
  SAJASEONGEO_LIST,
  SANGSHIK_LIST,
  PUZZLE_SETS,
} from '../data/koreanContent';
import AsyncStorage from '@react-native-async-storage/async-storage';

function getKSTDateString(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

const READING_GOAL_PAGES = 20;

async function openMillie() {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        packageName: 'kr.co.millie.millieshelf',
        className: 'kr.co.millie.millieshelf.kotlin.ui.intro.IntroActivity',
        flags: 0x10000000,
      });
      return;
    } catch {}
    Linking.openURL('market://details?id=kr.co.millie.millieshelf').catch(() =>
      Alert.alert('오류', '밀리의서재를 열 수 없습니다.')
    );
    return;
  }
  try {
    await Linking.openURL('millie://');
  } catch {
    Linking.openURL('https://apps.apple.com/kr/app/id1086202135').catch(() =>
      Alert.alert('오류', '밀리의서재를 열 수 없습니다.')
    );
  }
}

export default function CultureScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const cards = useStaggerFade(4, 70);
  const today = getKSTDateString();

  // ── 독서 ─────────────────────────────────────────────────────────
  const [readingDone, setReadingDone] = useState(false);
  const [synced, setSynced] = useState(false);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── 사자성어 ─────────────────────────────────────────────────────
  const sajaseongeo = SAJASEONGEO_LIST[getDayIndex(SAJASEONGEO_LIST.length)];
  const [sajaExpanded, setSajaExpanded] = useState(false);
  const [sajaDone, setSajaDone] = useState(false);

  // ── 오늘의 상식 ──────────────────────────────────────────────────
  const sangshik = SANGSHIK_LIST[getDayIndex(SANGSHIK_LIST.length)];
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [sangshikDone, setSangshikDone] = useState(false);

  // ── 낱말퍼즐 ─────────────────────────────────────────────────────
  const puzzleWords = PUZZLE_SETS[getDayIndex(PUZZLE_SETS.length)];

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const db = getDatabase(getFirebaseApp());

    const loadData = async () => {
      try {
        // 독서 완료 여부
        const snap = await get(ref(db, `users/${uid}/completion/reading/${today}`));
        const done = snap.val() === true;
        setReadingDone(done);
        setSynced(done);

        // 스트릭
        const allSnap = await get(ref(db, `users/${uid}/completion/reading`));
        if (allSnap.exists()) {
          const data: Record<string, boolean> = allSnap.val();
          let count = 0;
          let d = new Date(Date.now() + 9 * 3600000);
          while (true) {
            const key = d.toISOString().slice(0, 10);
            if (data[key]) { count++; d.setDate(d.getDate() - 1); } else break;
          }
          setStreak(count);
        }

        // 사자성어 완료
        const sajaSnap = await get(ref(db, `users/${uid}/completion/sajaseongeo/${today}`));
        if (sajaSnap.val() === true) setSajaDone(true);

        // 상식 완료
        const sangSnap = await get(ref(db, `users/${uid}/completion/sangshik/${today}`));
        if (sangSnap.val() === true) setSangshikDone(true);
      } catch (e) {
        console.warn('데이터 로드 실패:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // 사자성어 선택지 복원
    AsyncStorage.getItem(`sangshik_selected_${today}`).then(v => {
      if (v !== null) setSelectedOption(parseInt(v, 10));
    });
  }, [uid, today]);

  const handleReadingComplete = useCallback(async () => {
    if (synced || saving) return;
    setSaving(true);
    try {
      await dbSet(userRef(uid, `completion/reading/${today}`), true);
      setReadingDone(true);
      setSynced(true);
      setStreak(prev => prev + 1);
    } catch {
      Alert.alert('오류', '완료 기록에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }, [synced, saving, uid, today]);

  const handleSajaComplete = useCallback(async () => {
    if (sajaDone) return;
    setSajaDone(true);
    if (uid) {
      dbSet(userRef(uid, `completion/sajaseongeo/${today}`), true).catch(() => {});
    }
    ToastAndroid.show('✅ 사자성어 학습 완료!', ToastAndroid.SHORT);
  }, [sajaDone, uid, today]);

  const handleOptionSelect = useCallback(async (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    await AsyncStorage.setItem(`sangshik_selected_${today}`, String(idx));
  }, [selectedOption, today]);

  const handleSangshikComplete = useCallback(async () => {
    if (sangshikDone) return;
    setSangshikDone(true);
    if (uid) {
      dbSet(userRef(uid, `completion/sangshik/${today}`), true).catch(() => {});
    }
    ToastAndroid.show('✅ 오늘의 상식 완료!', ToastAndroid.SHORT);
  }, [sangshikDone, uid, today]);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#0095f6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safeArea} edges={['top']}>
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.screenTitle}>Korean</Text>

      {/* ── 독서 카드 ─────────────────────────────────────────── */}
      <Animated.View style={[s.card, { opacity: cards[0].opacity, transform: [{ translateY: cards[0].translateY }] }]}>
        <View style={s.cardHeader}>
          <MaterialIcons name="menu-book" size={24} color="#0095f6" />
          <Text style={s.cardTitle}>오늘의 독서</Text>
          {streak > 0 && (
            <View style={s.streakBadge}>
              <Text style={s.streakText}>🔥 {streak}일</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={s.millieBtn} onPress={openMillie} activeOpacity={0.85}>
          <View style={s.millieDeco1} /><View style={s.millieDeco2} /><View style={s.millieDeco3} />
          <View style={s.millieInner}>
            <View style={s.millieIconBox}>
              <MaterialIcons name="menu-book" size={52} color="#fff" />
            </View>
            <Text style={s.millieBtnTitle}>밀리의서재</Text>
            <Text style={s.millieBtnSub}>지금 바로 독서 시작하기</Text>
          </View>
          <View style={s.millieArrow}>
            <MaterialIcons name="arrow-forward" size={20} color="rgba(255,255,255,0.7)" />
          </View>
        </TouchableOpacity>

        <View style={s.goalRow}>
          <MaterialIcons name="flag" size={16} color="#6b7280" />
          <Text style={s.goalText}>일일 목표: {READING_GOAL_PAGES}페이지</Text>
        </View>

        {readingDone ? (
          <View style={s.doneBox}>
            <MaterialIcons name="check-circle" size={28} color="#16a34a" />
            <Text style={s.doneText}>오늘 독서 완료!</Text>
            <Text style={s.doneSub}>✓ Google Tasks 기록됨</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.completeBtn, saving && s.btnDisabled]}
            onPress={handleReadingComplete}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <><MaterialIcons name="check" size={20} color="#fff" /><Text style={s.completeBtnText}>오늘 독서 완료</Text></>
            )}
          </TouchableOpacity>
        )}

        <View style={s.divider} />
        <BookSection uid={uid} />
      </Animated.View>

      {/* ── 사자성어 카드 ─────────────────────────────────────── */}
      <Animated.View style={[s.card, { opacity: cards[1].opacity, transform: [{ translateY: cards[1].translateY }] }]}>
        <View style={s.cardHeader}>
          <MaterialIcons name="translate" size={24} color="#7c3aed" />
          <Text style={s.cardTitle}>오늘의 사자성어</Text>
          {sajaDone && (
            <View style={[s.streakBadge, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
              <Text style={[s.streakText, { color: '#16a34a' }]}>✅ 완료</Text>
            </View>
          )}
        </View>

        <View style={s.sajaMain}>
          <Text style={s.sajaIdiom}>{sajaseongeo.idiom}</Text>
          <Text style={s.sajaHanja}>{sajaseongeo.hanja}</Text>
        </View>
        <Text style={s.sajaMeaning}>{sajaseongeo.meaning}</Text>

        <TouchableOpacity
          style={s.sajaExpandBtn}
          onPress={() => setSajaExpanded(v => !v)}
          activeOpacity={0.7}
        >
          <Text style={s.sajaExpandText}>예문 {sajaExpanded ? '접기' : '보기'}</Text>
          <MaterialIcons name={sajaExpanded ? 'expand-less' : 'expand-more'} size={18} color="#7c3aed" />
        </TouchableOpacity>

        {sajaExpanded && (
          <View style={s.exampleBox}>
            <Text style={s.exampleText}>"{sajaseongeo.example}"</Text>
          </View>
        )}

        {!sajaDone && (
          <TouchableOpacity style={[s.completeBtn, { backgroundColor: '#7c3aed', marginTop: 14 }]} onPress={handleSajaComplete} activeOpacity={0.85}>
            <MaterialIcons name="check" size={18} color="#fff" />
            <Text style={s.completeBtnText}>학습 완료</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* ── 오늘의 상식 카드 ──────────────────────────────────── */}
      <Animated.View style={[s.card, { opacity: cards[2].opacity, transform: [{ translateY: cards[2].translateY }] }]}>
        <View style={s.cardHeader}>
          <MaterialIcons name="lightbulb" size={24} color="#d97706" />
          <Text style={s.cardTitle}>오늘의 상식</Text>
          <View style={s.categoryBadge}>
            <Text style={s.categoryText}>{sangshik.category}</Text>
          </View>
          {sangshikDone && (
            <View style={[s.streakBadge, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
              <Text style={[s.streakText, { color: '#16a34a' }]}>✅ 완료</Text>
            </View>
          )}
        </View>

        <Text style={s.quizQuestion}>{sangshik.question}</Text>

        <View style={s.optionList}>
          {sangshik.options.map((opt, i) => {
            const isSelected = selectedOption === i;
            const isCorrect = i === sangshik.answer;
            const revealed = selectedOption !== null;
            let bg = '#fafafa';
            let border = '#dbdbdb';
            let textColor = '#262626';
            if (revealed) {
              if (isCorrect) { bg = '#f0fdf4'; border = '#86efac'; textColor = '#16a34a'; }
              else if (isSelected && !isCorrect) { bg = '#fef2f2'; border = '#fca5a5'; textColor = '#dc2626'; }
            }
            return (
              <TouchableOpacity
                key={i}
                style={[s.optionBtn, { backgroundColor: bg, borderColor: border }]}
                onPress={() => handleOptionSelect(i)}
                disabled={revealed}
                activeOpacity={0.75}
              >
                <Text style={[s.optionLabel, { color: textColor }]}>
                  {['①', '②', '③', '④'][i]} {opt}
                </Text>
                {revealed && isCorrect && <MaterialIcons name="check-circle" size={16} color="#16a34a" />}
                {revealed && isSelected && !isCorrect && <MaterialIcons name="cancel" size={16} color="#dc2626" />}
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedOption !== null && (
          <View style={s.explanationBox}>
            <MaterialIcons name="info-outline" size={14} color="#0095f6" />
            <Text style={s.explanationText}>{sangshik.explanation}</Text>
          </View>
        )}

        {selectedOption !== null && !sangshikDone && (
          <TouchableOpacity style={[s.completeBtn, { backgroundColor: '#d97706', marginTop: 10 }]} onPress={handleSangshikComplete} activeOpacity={0.85}>
            <MaterialIcons name="check" size={18} color="#fff" />
            <Text style={s.completeBtnText}>완료</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* ── 한국어 낱말퍼즐 카드 ─────────────────────────────── */}
      <Animated.View style={[s.card, { opacity: cards[3].opacity, transform: [{ translateY: cards[3].translateY }] }]}>
        <View style={s.cardHeader}>
          <MaterialIcons name="grid-on" size={24} color="#0891b2" />
          <Text style={s.cardTitle}>한국어 낱말퍼즐</Text>
        </View>
        <KoreanWordPuzzle words={puzzleWords} uid={uid} />
      </Animated.View>

    </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingTop: 16, paddingBottom: 32 },
  screenTitle: { fontSize: 26, fontWeight: '600', color: '#262626', marginBottom: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: '#dbdbdb',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#262626', flex: 1 },
  streakBadge: {
    backgroundColor: '#fff7ed', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  streakText: { fontSize: 13, fontWeight: '600', color: '#ea580c' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  goalText: { fontSize: 14, color: '#8e8e8e' },
  doneBox: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  doneText: { fontSize: 17, fontWeight: '700', color: '#16a34a' },
  doneSub: { fontSize: 13, color: '#8e8e8e' },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0095f6', borderRadius: 12, paddingVertical: 14,
    gap: 8, marginBottom: 10,
  },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  divider: { height: 1, backgroundColor: '#dbdbdb', marginVertical: 16 },
  // 밀리의서재 버튼
  millieBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#5b21b6', borderRadius: 20,
    paddingVertical: 36, paddingHorizontal: 16,
    marginBottom: 14, overflow: 'hidden', height: 220,
  },
  millieDeco1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', right: -50, top: -60 },
  millieDeco2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', left: -30, bottom: -40 },
  millieDeco3: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.06)', right: 40, bottom: 10 },
  millieInner: { alignItems: 'center', gap: 10 },
  millieIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  millieArrow: { position: 'absolute', bottom: 16, right: 18 },
  millieBtnTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  millieBtnSub: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '500' },
  // 사자성어
  sajaMain: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 },
  sajaIdiom: { fontSize: 28, fontWeight: '800', color: '#7c3aed', letterSpacing: 1 },
  sajaHanja: { fontSize: 14, color: '#a78bfa' },
  sajaMeaning: { fontSize: 14, color: '#374151', lineHeight: 22, marginBottom: 10 },
  sajaExpandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  sajaExpandText: { fontSize: 13, color: '#7c3aed', fontWeight: '600' },
  exampleBox: { backgroundColor: '#f5f3ff', borderRadius: 8, padding: 12, marginTop: 10 },
  exampleText: { fontSize: 13, color: '#5b21b6', lineHeight: 20, fontStyle: 'italic' },
  // 상식 퀴즈
  categoryBadge: { backgroundColor: '#fef3c7', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#fde68a' },
  categoryText: { fontSize: 11, color: '#92400e', fontWeight: '600' },
  quizQuestion: { fontSize: 16, fontWeight: '600', color: '#1f2937', lineHeight: 24, marginBottom: 14 },
  optionList: { gap: 8 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14,
  },
  optionLabel: { fontSize: 14, flex: 1, lineHeight: 20 },
  explanationBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 8, padding: 12, marginTop: 12,
  },
  explanationText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 20 },
});
