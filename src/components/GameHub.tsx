import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import WordMatchGame from './WordMatchGame';
import CrosswordGame from './CrosswordGame';
import ScrambleGame from './ScrambleGame';
import SentenceQuizGame from './SentenceQuizGame';

export type GameMode = 'match' | 'crossword' | 'scramble' | 'sentence';
type Mode = 'select' | GameMode;

/**
 * Today 탭에서 특정 게임을 눌러 들어온 경우 그 게임을 바로 연다.
 * seed는 이동할 때마다 바뀌는 값이라, 같은 게임을 다시 선택해도 다시 열린다.
 */
export default function GameHub({ initialGame, seed, completion, onModeChange }: {
  initialGame?: GameMode;
  seed?: number;
  /** 오늘 완료한 게임 표시용 — completion[completionKey] */
  completion?: Record<string, boolean>;
  /** 게임에 들어가면 부모가 헤더를 접을 수 있도록 알린다 */
  onModeChange?: (inGame: boolean) => void;
} = {}) {
  const [mode, setMode] = useState<Mode>(initialGame ?? 'select');

  useEffect(() => {
    if (initialGame) setMode(initialGame);
  }, [seed, initialGame]);

  useEffect(() => {
    onModeChange?.(mode !== 'select');
  }, [mode]);

  const GAMES: { mode: GameMode; key: string; emoji: string; name: string; desc: string }[] = [
    { mode: 'match',     key: 'english_word_match', emoji: '🃏', name: '카드 매칭', desc: '단어와 뜻을 짝지어보세요' },
    { mode: 'crossword', key: 'english_crossword',  emoji: '📝', name: '낱말 퍼즐', desc: '가로세로 크로스워드' },
    { mode: 'scramble',  key: 'english_scramble',   emoji: '🔀', name: '스크램블',  desc: '섞인 글자를 순서대로 탭하세요' },
    { mode: 'sentence',  key: 'english_sentence',   emoji: '🔍', name: '예문 O/X',  desc: '예문이 자연스러운지 판단하세요' },
  ];
  const doneCount = GAMES.filter(g => completion?.[g.key]).length;

  if (mode === 'match') {
    return (
      <View style={s.flex}>
        <TouchableOpacity style={s.backBar} onPress={() => setMode('select')}>
          <Text style={s.backText}>← 게임 선택</Text>
        </TouchableOpacity>
        <WordMatchGame />
      </View>
    );
  }

  if (mode === 'crossword') {
    return (
      <View style={s.flex}>
        <TouchableOpacity style={s.backBar} onPress={() => setMode('select')}>
          <Text style={s.backText}>← 게임 선택</Text>
        </TouchableOpacity>
        <CrosswordGame />
      </View>
    );
  }

  if (mode === 'scramble') {
    return (
      <View style={s.flex}>
        <TouchableOpacity style={s.backBar} onPress={() => setMode('select')}>
          <Text style={s.backText}>← 게임 선택</Text>
        </TouchableOpacity>
        <ScrambleGame />
      </View>
    );
  }

  if (mode === 'sentence') {
    return (
      <View style={s.flex}>
        <TouchableOpacity style={s.backBar} onPress={() => setMode('select')}>
          <Text style={s.backText}>← 게임 선택</Text>
        </TouchableOpacity>
        <SentenceQuizGame onComplete={() => setMode('select')} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.progressNote}>
        <Text style={s.progressNoteText}>
          {doneCount >= GAMES.length
            ? '게임 4개 완료 — 단어장이 열렸어요'
            : `게임 4개를 끝내면 단어장이 열려요 · ${doneCount}/${GAMES.length} 완료`}
        </Text>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${(doneCount / GAMES.length) * 100}%` }]} />
        </View>
      </View>

      {GAMES.map(g => {
        const isDone = !!completion?.[g.key];
        return (
          <TouchableOpacity
            key={g.mode}
            style={[s.card, isDone && s.cardDone]}
            onPress={() => setMode(g.mode)}
            activeOpacity={0.8}
          >
            <Text style={s.cardEmoji}>{g.emoji}</Text>
            <View style={s.cardBody}>
              <Text style={[s.cardName, isDone && s.cardNameDone]}>{g.name}</Text>
              <Text style={s.cardDesc}>{isDone ? '오늘 완료 · 다시 하면 기록에는 반영 안 돼요' : g.desc}</Text>
            </View>
            <Text style={isDone ? s.check : s.arrow}>{isDone ? '✓' : '›'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  backBar: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  backText: { fontSize: 14, fontWeight: '600', color: '#0095f6' },

  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  progressNote: {
    backgroundColor: '#f2f7ff',
    borderWidth: 1,
    borderColor: '#cfe0ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  progressNoteText: { fontSize: 12, fontWeight: '600', color: '#31558f' },
  progressTrack: { height: 4, backgroundColor: '#dce8fb', borderRadius: 99, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#0095f6', borderRadius: 99 },
  cardDone: { backgroundColor: '#f4fbf6', borderColor: '#cfe9d8' },
  cardNameDone: { color: '#16a34a' },
  check: { fontSize: 18, color: '#16a34a', fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    elevation: 0,
    gap: 16,
  },
  cardEmoji: { fontSize: 36 },
  cardBody: { flex: 1 },
  cardNew: { borderWidth: 1.5, borderColor: '#0095f6' },
  cardName: { fontSize: 17, fontWeight: '600', color: '#262626', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#8e8e8e' },
  arrow: { fontSize: 26, color: '#8e8e8e', fontWeight: '300' },
});
