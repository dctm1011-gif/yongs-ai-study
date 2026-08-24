import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { getDatabase, onValue, ref } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { getFirebaseApp } from '../config/firebase';

function getKSTToday(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
}

interface CheckItem {
  key: string;
  label: string;
  emoji: string;
}

const GROUPS: { title: string; items: CheckItem[] }[] = [
  {
    title: '영어',
    items: [
      { key: 'english',              label: '단어장',       emoji: '📖' },
      { key: 'english_word_match',   label: '카드 매칭',    emoji: '🃏' },
      { key: 'english_crossword',    label: '낱말 퍼즐',    emoji: '📝' },
      { key: 'english_scramble',     label: '스크램블',     emoji: '🔀' },
      { key: 'english_sentence',     label: '예문 OX',      emoji: '🔍' },
      { key: 'english_review',       label: '문장복습',     emoji: '📋' },
      { key: 'english_news_reading',   label: '영어 리딩',  emoji: '📰' },
      { key: 'english_news_listening', label: '영어 리스닝', emoji: '🎙️' },
    ],
  },
  {
    title: '투자',
    items: [
      { key: 'investment', label: '투자 학습', emoji: '📈' },
    ],
  },
  {
    title: '한국어',
    items: [
      { key: 'reading',      label: '독서',      emoji: '📕' },
      { key: 'sajaseongeo',  label: '사자성어',  emoji: '🀄' },
      { key: 'sangshik',     label: '상식 퀴즈', emoji: '🧠' },
      { key: 'korean_ox',    label: '한국어 OX', emoji: '🇰🇷' },
    ],
  },
];

export default function ChecklistScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [today, setToday] = useState(getKSTToday());

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
        result[key] = val === true || (typeof val === 'number' && val > 0);
      }
      setDone(result);
    });
    return () => unsub();
  }, [uid, today]);

  const totalItems = GROUPS.reduce((n, g) => n + g.items.length, 0);
  const doneCount = GROUPS.reduce(
    (n, g) => n + g.items.filter(i => done[i.key]).length, 0
  );
  const pct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.header}>오늘의 학습</Text>
      <Text style={s.date}>{today}</Text>

      {/* 진행률 */}
      <View style={s.progressBox}>
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>{doneCount} / {totalItems} 완료</Text>
          <Text style={s.progressPct}>{pct}%</Text>
        </View>
        <View style={s.bar}>
          <View style={[s.fill, { width: `${pct}%` as any }]} />
        </View>
      </View>

      {GROUPS.map(group => (
        <View key={group.title} style={s.group}>
          <Text style={s.groupTitle}>{group.title}</Text>
          {group.items.map(item => {
            const isDone = !!done[item.key];
            return (
              <View key={item.key} style={[s.row, isDone && s.rowDone]}>
                <Text style={s.emoji}>{item.emoji}</Text>
                <Text style={[s.label, isDone && s.labelDone]}>{item.label}</Text>
                <Text style={[s.check, isDone && s.checkDone]}>
                  {isDone ? '✓' : '○'}
                </Text>
              </View>
            );
          })}
        </View>
      ))}

      {doneCount === totalItems && (
        <View style={s.allDone}>
          <Text style={s.allDoneEmoji}>🎉</Text>
          <Text style={s.allDoneText}>오늘 모든 학습 완료!</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  header: { fontSize: 24, fontWeight: '700', color: '#262626', marginBottom: 2 },
  date: { fontSize: 13, color: '#8e8e8e', marginBottom: 20 },

  progressBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '600', color: '#262626' },
  progressPct: { fontSize: 14, fontWeight: '700', color: '#0095f6' },
  bar: { height: 8, backgroundColor: '#dbdbdb', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#0095f6', borderRadius: 4 },

  group: { marginBottom: 20 },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8e8e8e',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#efefef',
  },
  rowDone: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  emoji: { fontSize: 20, marginRight: 12 },
  label: { flex: 1, fontSize: 15, color: '#262626', fontWeight: '500' },
  labelDone: { color: '#16a34a' },
  check: { fontSize: 18, color: '#dbdbdb', fontWeight: '600' },
  checkDone: { color: '#16a34a' },

  allDone: { alignItems: 'center', marginTop: 16, paddingVertical: 20 },
  allDoneEmoji: { fontSize: 48, marginBottom: 8 },
  allDoneText: { fontSize: 18, fontWeight: '700', color: '#16a34a' },
});
