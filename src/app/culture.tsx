import React, { useState, useEffect, useCallback, useRef } from 'react';
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

import { getKSTDateString } from '../utils/dateUtils';

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
  const cards = useStaggerFade(1, 70);
  const today = getKSTDateString();
  const scrollViewRef = useRef<ScrollView>(null);
  const [readingDone, setReadingDone] = useState(false);
  const [synced, setSynced] = useState(false);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const db = getDatabase(getFirebaseApp());

    const loadData = async () => {
      try {
        // 독서 완료 여부
        const snap = await get(userRef(uid, `completion/reading/${today}`));
        const done = snap.val() === true;
        setReadingDone(done);
        setSynced(done);

        // 스트릭
        const allSnap = await get(userRef(uid, 'completion/reading'));
        if (allSnap.exists()) {
          const data: Record<string, boolean> = allSnap.val();
          let count = 0;
          let d = new Date(Date.now() + 6 * 3600000);
          while (true) {
            const key = d.toISOString().slice(0, 10);
            if (data[key]) { count++; d.setDate(d.getDate() - 1); } else break;
          }
          setStreak(count);
        }

      } catch (e) {
        console.warn('데이터 로드 실패:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();

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

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#0095f6" />
      </View>
    );
  }

  const usedCount = vocabWords.filter(v => diaryText.includes(v.word)).length;

  return (
    <SafeAreaView style={s.safeArea} edges={['top']}>
    <ScrollView ref={scrollViewRef} style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.screenTitle}>Korean</Text>

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
        <BookSection uid={uid} />
        <View style={s.divider} />

        <TouchableOpacity style={s.millieBtn} onPress={openMillie} activeOpacity={0.85}>
          <View style={s.millieDeco1} /><View style={s.millieDeco2} /><View style={s.millieDeco3} />
          <View style={s.millieInner}>
            <View style={s.millieIconBox}>
              <MaterialIcons name="menu-book" size={24} color="#fff" />
            </View>
            <View>
              <Text style={s.millieBtnTitle}>밀리의서재</Text>
              <Text style={s.millieBtnSub}>지금 바로 독서 시작하기</Text>
            </View>
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
            <Text style={s.doneSub}>✓ 오늘 학습에 기록됨</Text>
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

      </Animated.View>

    </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingTop: 16, paddingBottom: 350 },
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
    paddingVertical: 16, paddingHorizontal: 16,
    marginBottom: 14, overflow: 'hidden', height: 92,
  },
  millieDeco1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', right: -50, top: -60 },
  millieDeco2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', left: -30, bottom: -40 },
  millieDeco3: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.06)', right: 40, bottom: 10 },
  millieInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  millieIconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  millieArrow: { position: 'absolute', bottom: 16, right: 18 },
  millieBtnTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  millieBtnSub: { color: 'rgba(255,255,255,0.72)', fontSize: 11.5, fontWeight: '500' },
  // 어휘 일기
  diaryGuide: { fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 19 },
  pastDiaryBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 8, marginBottom: 12, gap: 2 },
  pastDiaryRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 3 },
  pastDiaryDate: { fontSize: 10.5, fontWeight: '700', color: '#94a3b8', width: 34 },
  pastDiaryText: { flex: 1, fontSize: 11.5, color: '#475569' },
  diaryGuideRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  diaryUsedCount: { fontSize: 12, fontWeight: '700', color: '#8e8e8e' },
  diaryUsedCountDone: { color: '#059669' },
  vocabList: { gap: 8, marginBottom: 14 },
  vocabChip: {
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#dbdbdb', backgroundColor: '#fafafa',
  },
  vocabChipUsed: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  vocabChipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  vocabWord: { fontSize: 15, fontWeight: '700', color: '#1f2937', flex: 1 },
  vocabWordUsed: { color: '#059669' },
  vocabMeaning: { fontSize: 12, color: '#6b7280', lineHeight: 17 },
  diaryInput: {
    borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#262626', lineHeight: 22,
    minHeight: 130, backgroundColor: '#fafafa',
  },
  diaryCharCount: { fontSize: 12, color: '#adb5bd', textAlign: 'right', marginTop: 4, marginBottom: 10 },
  diaryReadBox: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#86efac' },
  diaryReadText: { fontSize: 14, color: '#1f2937', lineHeight: 22 },
});
