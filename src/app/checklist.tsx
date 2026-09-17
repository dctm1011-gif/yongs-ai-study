import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Animated, Easing,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { getDatabase, onValue, ref } from 'firebase/database';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getFirebaseApp } from '../config/firebase';
import { MaterialIcons } from '@expo/vector-icons';
import { ProgressCalendar } from '../components/ProgressCalendar';
import { colors, categoryColors, space, radius, fontSize, duration } from '../theme';

import { getKSTDateString as getKSTToday } from '../utils/dateUtils';

interface CheckItem {
  key: string;
  label: string;
  emoji: string;
  /** 탭하면 이동할 탭 이름 (_layout.tsx의 Tab.Screen name) */
  target: string;
  /** Voca 탭 안에서 바로 열 게임 / 화면 */
  game?: 'match' | 'crossword' | 'scramble' | 'sentence';
  view?: 'words' | 'review';
}

const STUDY_HUB_URL = 'https://claude.ai/artifact/Cw11iAcshpwDw1PyLq8cdu';

const GROUPS: { title: string; color: string; items: CheckItem[] }[] = [
  {
    // Voca 탭은 게임 4종 → 단어장 → 퀴즈 → 문장복습 순으로 잠금이 풀리므로
    // 체크리스트도 그 순서를 따른다. (안 그러면 "다음 학습"이 아직 못 하는 걸 가리킨다)
    title: '영어',
    color: categoryColors.english,
    items: [
      { key: 'english_word_match',     label: '카드 매칭',   emoji: '🃏', target: 'Voca', game: 'match' },
      { key: 'english_crossword',      label: '낱말 퍼즐',   emoji: '📝', target: 'Voca', game: 'crossword' },
      { key: 'english_scramble',       label: '스크램블',    emoji: '🔀', target: 'Voca', game: 'scramble' },
      { key: 'english_sentence',       label: '예문 OX',     emoji: '🔍', target: 'Voca', game: 'sentence' },
      { key: 'english',                label: '단어장·퀴즈', emoji: '📖', target: 'Voca', view: 'words' },
      { key: 'english_review',         label: '문장복습',    emoji: '📋', target: 'Voca', view: 'review' },
      { key: 'english_news_reading',   label: '영어 리딩',   emoji: '📰', target: 'BBC' },
      { key: 'english_news_listening', label: '영어 리스닝', emoji: '🎙️', target: 'BBC' },
      { key: 'english_speaking',       label: '스피킹',      emoji: '💬', target: 'Speaking' },
    ],
  },
  {
    title: '투자',
    color: categoryColors.investment,
    items: [
      { key: 'investment', label: '투자 학습', emoji: '📈', target: 'Investment' },
    ],
  },
  {
    title: '한국어',
    color: categoryColors.korean,
    items: [
      { key: 'reading',      label: '독서',      emoji: '📕', target: 'Culture' },
      { key: 'korean_diary', label: '어휘 일기', emoji: '✏️', target: 'Culture' },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap(g => g.items.map(i => ({ ...i, groupColor: g.color })));

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatKoreanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 ${weekday}요일`;
}

// ── 진행률 바 + 퍼센트 카운트업 ──────────────────────────────────────────────
function AnimatedProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const widthAnim = useRef(new Animated.Value(0)).current;
  const [shownPct, setShownPct] = useState(0);

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: duration.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width는 네이티브 드라이버 미지원
    }).start();
    const id = widthAnim.addListener(({ value }) => setShownPct(Math.round(value)));
    return () => widthAnim.removeListener(id);
  }, [pct]);

  const isAllDone = done === total && total > 0;

  return (
    <View style={s.progressBox}>
      <View style={s.progressRow}>
        <Text style={s.progressLabel}>{done} / {total} 완료</Text>
        <Text style={[s.progressPct, isAllDone && { color: colors.success }]}>{shownPct}%</Text>
      </View>
      <View style={s.bar}>
        <Animated.View
          style={[
            s.fill,
            {
              width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              backgroundColor: isAllDone ? colors.success : colors.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

// ── 체크리스트 한 줄 ────────────────────────────────────────────────────────
function ChecklistRow({
  item, isDone, isNext, index, onPress,
}: {
  item: CheckItem & { groupColor: string };
  isDone: boolean;
  isNext: boolean;
  index: number;
  onPress: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;   // 첫 진입 시 페이드+슬라이드
  const press = useRef(new Animated.Value(1)).current;   // 누를 때 살짝 축소
  const pop = useRef(new Animated.Value(isDone ? 1 : 0)).current; // 완료 체크 팝
  const glow = useRef(new Animated.Value(0)).current;    // "지금 이거" 맥동
  const wasDone = useRef(isDone);

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: duration.base,
      delay: Math.min(index * 45, 400),
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  // 방금 완료된 항목만 체크 표시를 튕겨준다 (이미 완료 상태로 들어온 건 그대로)
  useEffect(() => {
    if (isDone && !wasDone.current) {
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    } else if (!isDone) {
      pop.setValue(0);
    }
    wasDone.current = isDone;
  }, [isDone]);

  useEffect(() => {
    if (!isNext) { glow.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isNext]);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: press },
        ],
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => Animated.timing(press, { toValue: 0.975, duration: duration.fast, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, friction: 5, useNativeDriver: true }).start()}
        style={[
          s.row,
          isDone && s.rowDone,
          isNext && { borderColor: item.groupColor, backgroundColor: colors.surface },
        ]}
      >
        {/* 왼쪽 분류 색 스트라이프 — 완료되면 초록으로 */}
        <View style={[s.stripe, { backgroundColor: isDone ? colors.success : item.groupColor }]} />

        <Text style={s.emoji}>{item.emoji}</Text>

        <View style={s.rowBody}>
          <Text style={[s.label, isDone && s.labelDone]}>{item.label}</Text>
          {isNext && (
            <Animated.Text style={[s.nextHint, { color: item.groupColor, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]}>
              지금 이거 · 탭하면 바로 이동
            </Animated.Text>
          )}
        </View>

        {isDone ? (
          <Animated.Text style={[s.check, s.checkDone, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
            ✓
          </Animated.Text>
        ) : (
          <Text style={s.chevron}>›</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ChecklistScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const uid = user?.uid ?? '';
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [today, setToday] = useState(getKSTToday());
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const celebrate = useRef(new Animated.Value(0)).current;

  const toggleGroup = (title: string, currentlyCollapsed: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedGroups(prev => ({ ...prev, [title]: !currentlyCollapsed }));
  };

  useEffect(() => {
    setToday(getKSTToday());
  }, []);

  useEffect(() => {
    if (!uid) return;
    const db = getDatabase(getFirebaseApp());
    const completionRef = ref(db, `users/${uid}/completion`);
    const unsub = onValue(completionRef, snap => {
      const data = snap.val() ?? {};
      const result: Record<string, boolean> = {};
      for (const key of Object.keys(data)) {
        const val = data[key]?.[today];
        result[key] = val === true || (typeof val === 'number' && val > 0) || (typeof val === 'object' && val !== null && val?.done === true);
      }
      setDone(result);
    });
    return () => unsub();
  }, [uid, today]);

  const totalItems = ALL_ITEMS.length;
  const doneCount = ALL_ITEMS.filter(i => done[i.key]).length;
  const allDone = doneCount === totalItems;
  const nextItem = ALL_ITEMS.find(i => !done[i.key]);

  useEffect(() => {
    if (!allDone) { celebrate.setValue(0); return; }
    Animated.spring(celebrate, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [allDone]);

  const go = (item: CheckItem) => {
    try {
      // ts를 같이 넘겨야 같은 항목을 다시 눌러도 대상 화면이 반응한다
      const params = item.game || item.view
        ? { game: item.game, view: item.view, ts: Date.now() }
        : undefined;
      navigation.navigate(item.target, params);
    } catch {
      // 변형 빌드에서 없는 탭(Investment 등)일 수 있음 — 무시
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.header}>오늘의 학습</Text>
      <Text style={s.date}>{formatKoreanDate(today)}</Text>

      <AnimatedProgress done={doneCount} total={totalItems} />

      {/* 다음 할 것 바로가기 */}
      {nextItem && (
        <TouchableOpacity style={s.nextCta} onPress={() => go(nextItem)} activeOpacity={0.85}>
          <Text style={s.nextCtaEmoji}>{nextItem.emoji}</Text>
          <View style={s.nextCtaBody}>
            <Text style={s.nextCtaLabel}>다음 학습</Text>
            <Text style={s.nextCtaTitle}>{nextItem.label} 시작하기</Text>
          </View>
          <Text style={s.nextCtaArrow}>→</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.hubCard} onPress={() => Linking.openURL(STUDY_HUB_URL)} activeOpacity={0.8}>
        <Text style={s.hubEmoji}>📚</Text>
        <View style={s.hubBody}>
          <Text style={s.hubTitle}>보충학습 허브</Text>
          <Text style={s.hubDesc}>단어 복습 · 리스닝 카드 · 스피킹 저널</Text>
        </View>
        <Text style={s.hubArrow}>›</Text>
      </TouchableOpacity>

      {GROUPS.map(group => {
        const groupDone = group.items.filter(i => done[i.key]).length;
        const groupAllDone = groupDone === group.items.length;
        // 다 끝낸 분류는 접어서 남은 할 일이 눈에 먼저 들어오게 한다 (탭하면 다시 펼침)
        const collapsed = collapsedGroups[group.title] ?? groupAllDone;
        return (
          <View key={group.title} style={s.group}>
            <TouchableOpacity style={s.groupHeader} onPress={() => toggleGroup(group.title, collapsed)} activeOpacity={0.6}>
              <Text style={[s.groupTitle, { color: group.color }]}>{group.title}</Text>
              <Text style={[s.groupCount, groupAllDone && { color: colors.success }]}>
                {groupDone}/{group.items.length}
              </Text>
              <MaterialIcons name={collapsed ? 'expand-more' : 'expand-less'} size={20} color={colors.inkMuted} style={{ marginLeft: space.sm }} />
            </TouchableOpacity>
            {!collapsed && group.items.map((item, i) => (
              <ChecklistRow
                key={item.key}
                item={{ ...item, groupColor: group.color }}
                isDone={!!done[item.key]}
                isNext={nextItem?.key === item.key}
                index={i}
                onPress={() => go(item)}
              />
            ))}
          </View>
        );
      })}

      <ProgressCalendar />

      {allDone && (
        <Animated.View
          style={[s.allDone, {
            opacity: celebrate,
            transform: [{ scale: celebrate.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }]}
        >
          <Text style={s.allDoneEmoji}>🎉</Text>
          <Text style={s.allDoneText}>오늘 모든 학습 완료!</Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: space.xl, paddingTop: 60, paddingBottom: 40 },
  header: { fontSize: fontSize.display, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  date: { fontSize: fontSize.label, color: colors.inkMuted, marginBottom: space.xl },

  progressBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.lg,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm },
  progressLabel: { fontSize: fontSize.body, fontWeight: '600', color: colors.ink },
  progressPct: { fontSize: fontSize.body, fontWeight: '700', color: colors.accent },
  bar: { height: 8, backgroundColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },

  nextCta: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg, padding: space.lg, marginBottom: space.md,
    borderWidth: 1, borderColor: colors.accent,
  },
  nextCtaEmoji: { fontSize: 24 },
  nextCtaBody: { flex: 1 },
  nextCtaLabel: { fontSize: fontSize.caption, fontWeight: '700', color: colors.accent, letterSpacing: 0.5 },
  nextCtaTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.ink, marginTop: 2 },
  nextCtaArrow: { fontSize: fontSize.title, color: colors.accent, fontWeight: '700' },

  hubCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.lg,
    backgroundColor: '#f5f3ff', borderRadius: radius.lg, padding: space.lg,
    marginBottom: space.xl, borderWidth: 1, borderColor: '#ddd6fe',
  },
  hubEmoji: { fontSize: 28 },
  hubBody: { flex: 1 },
  hubTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  hubDesc: { fontSize: fontSize.caption, color: colors.inkMuted },
  hubArrow: { fontSize: 22, color: '#a78bfa', fontWeight: '300' },

  group: { marginBottom: space.xl },
  groupHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  groupTitle: {
    fontSize: fontSize.label, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  groupCount: { fontSize: fontSize.caption, fontWeight: '600', color: colors.inkMuted, marginLeft: 'auto' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingRight: space.lg,
    paddingLeft: space.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#efefef',
    overflow: 'hidden',
  },
  rowDone: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  stripe: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
  },
  emoji: { fontSize: 20, marginRight: space.md },
  rowBody: { flex: 1 },
  label: { fontSize: fontSize.body, color: colors.ink, fontWeight: '500' },
  labelDone: { color: colors.success },
  nextHint: { fontSize: fontSize.caption, fontWeight: '600', marginTop: 2 },
  check: { fontSize: fontSize.title, color: colors.border, fontWeight: '600' },
  checkDone: { color: colors.success },
  chevron: { fontSize: 20, color: colors.border, fontWeight: '300' },

  allDone: { alignItems: 'center', marginTop: space.lg, paddingVertical: space.xl },
  allDoneEmoji: { fontSize: 48, marginBottom: space.sm },
  allDoneText: { fontSize: fontSize.title, fontWeight: '700', color: colors.success },
});
