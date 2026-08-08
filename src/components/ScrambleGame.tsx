import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, get, set as dbSet } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { userRef } from '../utils/userDb';
import { getFirebaseApp } from '../config/firebase';

const DAILY_PLAY_KEY = 'scramble_last_played';
const DAILY_STATS_KEY = 'scramble_last_stats';
const ROUND_SIZE = 8;
const GRADUATE_AT = 10;

function getKSTDateString(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

interface ReviewWord {
  wordId: string;
  word: string;   // lowercase
  meaning: string;
  count: number;
}

interface LetterTile {
  id: string;     // index-based unique id
  letter: string; // uppercase
}

type GameState = 'loading' | 'empty' | 'playing' | 'complete';
type FeedbackState = 'none' | 'correct' | 'wrong' | 'revealed';

function scramble(word: string): LetterTile[] {
  const tiles: LetterTile[] = word.toUpperCase().split('').map((l, i) => ({ id: String(i), letter: l }));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  if (tiles.map(t => t.letter).join('') === word.toUpperCase() && word.length > 1) {
    return scramble(word);
  }
  return tiles;
}

export default function ScrambleGame() {
  const { user } = useAuth();
  const uid = user!.uid;

  const [gameState, setGameState] = useState<GameState>('loading');
  const [words, setWords] = useState<ReviewWord[]>([]);
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrambledTiles, setScrambledTiles] = useState<LetterTile[]>([]);
  const [selectedTiles, setSelectedTiles] = useState<LetterTile[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>('none');
  const [solvedWordIds, setSolvedWordIds] = useState<string[]>([]);
  const [wrongWordIds, setWrongWordIds] = useState<Set<string>>(new Set());
  const [revealedWordIds, setRevealedWordIds] = useState<Set<string>>(new Set());
  const [synced, setSynced] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const currentWord = words[currentIndex] ?? null;

  const setupWord = useCallback((word: ReviewWord) => {
    setScrambledTiles(scramble(word.word));
    setSelectedTiles([]);
    setFeedback('none');
  }, []);

  const loadGame = useCallback(async () => {
    setGameState('loading');
    try {
      const today = getKSTDateString();
      const lastPlayed = await AsyncStorage.getItem(DAILY_PLAY_KEY);
      if (lastPlayed === today) {
        const saved = await AsyncStorage.getItem(DAILY_STATS_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.completed) {
            setWords(data.words ?? []);
            setSolvedWordIds(data.solvedWordIds ?? []);
            setRevealedWordIds(new Set(data.revealedWordIds ?? []));
            setSynced(data.synced ?? false);
            setCurrentIndex(data.words?.length ?? 0);
            setGameState('complete');
            return;
          }
        }
      }

      const snap = await get(userRef(uid, 'english/reviewPool'));
      if (!snap.exists()) { setGameState('empty'); return; }

      const pool = snap.val() as Record<string, any>;
      const countMap: Record<string, number> = {};
      const candidates: ReviewWord[] = Object.entries(pool)
        .map(([wordId, v]: [string, any]) => {
          countMap[wordId] = v.count ?? 0;
          return { wordId, word: (v.word ?? '').toLowerCase(), meaning: v.meaning ?? '', count: v.count ?? 0 };
        })
        .filter(w => /^[a-z]{3,}$/.test(w.word) && w.count < GRADUATE_AT);

      if (candidates.length === 0) { setGameState('empty'); return; }

      setWordCounts(countMap);
      const selected = [...candidates].sort((a, b) => a.count - b.count).slice(0, ROUND_SIZE);
      setWords(selected);
      setCurrentIndex(0);
      setSolvedWordIds([]);
      setWrongWordIds(new Set());
      setRevealedWordIds(new Set());
      setSynced(false);
      setupWord(selected[0]);
      setGameState('playing');
    } catch (e) {
      console.warn('ScrambleGame load error:', e);
      setGameState('empty');
    }
  }, [uid, setupWord]);

  useEffect(() => { loadGame(); }, [loadGame]);

  const doShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  const goNext = useCallback((newSolved: string[], newRevealed: Set<string>) => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= words.length) {
      const today = getKSTDateString();
      AsyncStorage.setItem(DAILY_PLAY_KEY, today).catch(() => {});
      AsyncStorage.setItem(DAILY_STATS_KEY, JSON.stringify({
        words,
        solvedWordIds: newSolved,
        revealedWordIds: Array.from(newRevealed),
        completed: true,
        synced: false,
      })).catch(() => {});
      setSolvedWordIds(newSolved);
      setGameState('complete');
    } else {
      setCurrentIndex(nextIdx);
      setupWord(words[nextIdx]);
    }
  }, [currentIndex, words, setupWord]);

  const handleTilePress = useCallback((tile: LetterTile) => {
    if (feedback !== 'none' || !currentWord) return;
    const newSelected = [...selectedTiles, tile];
    setSelectedTiles(newSelected);
    setScrambledTiles(prev => prev.filter(t => t.id !== tile.id));

    if (newSelected.length === currentWord.word.length) {
      const answer = newSelected.map(t => t.letter).join('').toLowerCase();
      if (answer === currentWord.word) {
        setFeedback('correct');
        const newSolved = [...solvedWordIds, currentWord.wordId];
        setSolvedWordIds(newSolved);
        setTimeout(() => goNext(newSolved, revealedWordIds), 700);
      } else {
        setFeedback('wrong');
        setWrongWordIds(prev => new Set([...prev, currentWord.wordId]));
        doShake();
        setTimeout(() => {
          setScrambledTiles(scramble(currentWord.word));
          setSelectedTiles([]);
          setFeedback('none');
        }, 750);
      }
    }
  }, [feedback, currentWord, selectedTiles, solvedWordIds, revealedWordIds, goNext]);

  const handleBackspace = useCallback(() => {
    if (selectedTiles.length === 0 || feedback !== 'none') return;
    const last = selectedTiles[selectedTiles.length - 1];
    setSelectedTiles(prev => prev.slice(0, -1));
    setScrambledTiles(prev => [...prev, last]);
  }, [selectedTiles, feedback]);

  const handleReveal = useCallback(async () => {
    if (!currentWord || feedback !== 'none') return;
    const correctTiles = currentWord.word.toUpperCase().split('').map((l, i) => ({ id: `rev-${i}`, letter: l }));
    setSelectedTiles(correctTiles);
    setScrambledTiles([]);
    setFeedback('revealed');
    const newRevealed = new Set([...revealedWordIds, currentWord.wordId]);
    setRevealedWordIds(newRevealed);
    try {
      await dbSet(userRef(uid, `english/reviewPool/${currentWord.wordId}/count`), 0);
    } catch (e) {
      console.warn('리뷰 카운트 초기화 실패:', e);
    }
    setTimeout(() => goNext(solvedWordIds, newRevealed), 900);
  }, [currentWord, feedback, revealedWordIds, solvedWordIds, uid, goNext]);

  const handleComplete = useCallback(async () => {
    if (synced) return;
    try {
      const db = getDatabase(getFirebaseApp());
      // 오답·정답보기 단어: count 0, 자력으로 맞춘 단어만 count +1
      const penaltyIds = new Set([...Array.from(wrongWordIds), ...Array.from(revealedWordIds)]);
      const cleanSolvedIds = solvedWordIds.filter(id => !penaltyIds.has(id));
      await Promise.all([
        ...Array.from(penaltyIds).map(wordId =>
          dbSet(userRef(uid, `english/reviewPool/${wordId}/count`), 0)
        ),
        ...cleanSolvedIds.map(wordId => {
          const next = Math.min((wordCounts[wordId] ?? 0) + 1, GRADUATE_AT);
          return dbSet(userRef(uid, `english/reviewPool/${wordId}/count`), next);
        }),
      ]);
      const today = getKSTDateString();
      await dbSet(userRef(uid, `completion/english_scramble/${today}`), true);
      setSynced(true);
      const saved = await AsyncStorage.getItem(DAILY_STATS_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        await AsyncStorage.setItem(DAILY_STATS_KEY, JSON.stringify({ ...data, synced: true }));
      }
    } catch (e) {
      console.warn('스크램블 완료 기록 실패:', e);
    }
  }, [synced, solvedWordIds, wrongWordIds, revealedWordIds, wordCounts, uid]);

  // ── 로딩 ─────────────────────────────────────────────────────────────────
  if (gameState === 'loading') {
    return <View style={s.centered}><ActivityIndicator size="large" color="#0095f6" /></View>;
  }

  if (gameState === 'empty') {
    return (
      <View style={s.centered}>
        <Text style={s.bigEmoji}>📝</Text>
        <Text style={s.emptyTitle}>복습할 단어가 없어요</Text>
        <Text style={s.emptySub}>단어장에서 단어를 읽음 처리하면{'\n'}스크램블에 등장합니다</Text>
      </View>
    );
  }

  // ── 완료 ─────────────────────────────────────────────────────────────────
  if (gameState === 'complete') {
    const revealedWords = words.filter(w => revealedWordIds.has(w.wordId));
    return (
      <ScrollView contentContainerStyle={s.completePage}>
        <Text style={s.bigEmoji}>{solvedWordIds.length === words.length ? '🏆' : '✅'}</Text>
        <Text style={s.completeTitle}>완료!</Text>
        <Text style={s.completeScore}>{solvedWordIds.length} / {words.length} 정답</Text>
        {!synced ? (
          <TouchableOpacity style={s.completeBtn} onPress={handleComplete} activeOpacity={0.85}>
            <Text style={s.completeBtnText}>완료 기록하기</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.syncedBadge}>
            <Text style={s.syncedText}>✓ 오늘 기록 완료</Text>
          </View>
        )}
        {revealedWords.length > 0 && (
          <View style={s.reviewSection}>
            <Text style={s.reviewTitle}>📖 복습할 단어</Text>
            {revealedWords.map(w => (
              <View key={w.wordId} style={s.reviewItem}>
                <Text style={s.reviewWord}>{w.word}</Text>
                <Text style={s.reviewMeaning}>{w.meaning}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  if (!currentWord) return null;

  // ── 게임 플레이 ───────────────────────────────────────────────────────────
  const wordLen = currentWord.word.length;
  const tileSize = wordLen <= 5 ? 50 : wordLen <= 8 ? 44 : 37;
  const tileFontSize = wordLen <= 5 ? 22 : wordLen <= 8 ? 18 : 15;

  const answerBorderColor =
    feedback === 'correct'  ? '#16a34a' :
    feedback === 'wrong'    ? '#ef4444' :
    feedback === 'revealed' ? '#f59e0b' : '#dbdbdb';

  const answerBg =
    feedback === 'correct'  ? '#dcfce7' :
    feedback === 'wrong'    ? '#fee2e2' :
    feedback === 'revealed' ? '#fef3c7' : '#fafafa';

  const slotFilledStyle = feedback === 'revealed' ? s.answerSlotRevealed : s.answerSlotFilled;

  return (
    <View style={s.container}>
      {/* 진행도 */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${(currentIndex / words.length) * 100}%` }]} />
      </View>
      <Text style={s.progressLabel}>{currentIndex + 1} / {words.length}</Text>

      {/* 뜻 */}
      <View style={s.meaningBox}>
        <Text style={s.meaningHint}>이 단어의 뜻은?</Text>
        <Text style={s.meaningText}>{currentWord.meaning}</Text>
      </View>

      {/* 답 슬롯 */}
      <Animated.View style={[
        s.answerArea,
        { backgroundColor: answerBg, borderColor: answerBorderColor },
        { transform: [{ translateX: shakeAnim }] },
      ]}>
        {Array.from({ length: wordLen }).map((_, i) => {
          const tile = selectedTiles[i];
          return (
            <View
              key={i}
              style={[
                s.answerSlot,
                { width: tileSize, height: tileSize },
                tile ? slotFilledStyle : s.answerSlotEmpty,
              ]}
            >
              <Text style={[
                s.answerLetter,
                { fontSize: tileFontSize },
                feedback === 'revealed' && s.answerLetterRevealed,
              ]}>
                {tile?.letter ?? ''}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      {/* 섞인 글자 타일 + 버튼 행 */}
      <View style={s.tilesArea}>
        <View style={s.tilesRow}>
          {scrambledTiles.map(tile => (
            <TouchableOpacity
              key={tile.id}
              style={[s.tile, { width: tileSize, height: tileSize }]}
              onPress={() => handleTilePress(tile)}
              activeOpacity={0.65}
            >
              <Text style={[s.tileLetter, { fontSize: tileFontSize }]}>{tile.letter}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.btnRow}>
          {selectedTiles.length > 0 && feedback === 'none' && (
            <TouchableOpacity style={s.backspaceBtn} onPress={handleBackspace} activeOpacity={0.7}>
              <Text style={s.backspaceText}>⌫ 지우기</Text>
            </TouchableOpacity>
          )}
          {feedback === 'none' && (
            <TouchableOpacity style={s.answerBtn} onPress={handleReveal} activeOpacity={0.7}>
              <Text style={s.answerBtnText}>정답보기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#fff' },
  bigEmoji: { fontSize: 58, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#262626', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#8e8e8e', textAlign: 'center', lineHeight: 22 },

  completePage: { alignItems: 'center', padding: 28, paddingBottom: 48, backgroundColor: '#fff' },
  completeTitle: { fontSize: 30, fontWeight: '600', color: '#262626', marginBottom: 8 },
  completeScore: { fontSize: 20, color: '#0095f6', fontWeight: '600', marginBottom: 28 },
  completeBtn: {
    backgroundColor: '#0095f6', borderRadius: 14,
    paddingHorizontal: 36, paddingVertical: 15, marginBottom: 24,
  },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  syncedBadge: {
    backgroundColor: '#dcfce7', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginBottom: 24,
  },
  syncedText: { color: '#16a34a', fontWeight: '600', fontSize: 16 },

  reviewSection: { width: '100%', marginTop: 8 },
  reviewTitle: { fontSize: 15, fontWeight: '600', color: '#262626', marginBottom: 10 },
  reviewItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 10, marginBottom: 6,
  },
  reviewWord: { fontSize: 15, fontWeight: '600', color: '#262626' },
  reviewMeaning: { fontSize: 13, color: '#8e8e8e', flex: 1, textAlign: 'right', marginLeft: 8 },

  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 20 },
  progressBar: { height: 5, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 3, marginTop: 14, marginBottom: 4 },
  progressFill: { height: 5, backgroundColor: '#0095f6', borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#8e8e8e', textAlign: 'right', marginBottom: 20, fontWeight: '600' },

  meaningBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  meaningHint: { fontSize: 13, color: '#8e8e8e', fontWeight: '600', marginBottom: 10, letterSpacing: 0.5 },
  meaningText: { fontSize: 24, fontWeight: '600', color: '#262626', textAlign: 'center', lineHeight: 34 },

  answerArea: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    justifyContent: 'center', alignItems: 'center',
    padding: 14, borderRadius: 18, marginBottom: 28,
    borderWidth: 1, minHeight: 70,
  },
  answerSlotEmpty: {
    borderWidth: 1, borderColor: '#dbdbdb', borderStyle: 'dashed',
    borderRadius: 10, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center',
  },
  answerSlotFilled: {
    borderRadius: 10, backgroundColor: '#0095f6',
    borderWidth: 1, borderColor: '#0095f6',
    alignItems: 'center', justifyContent: 'center',
  },
  answerSlotRevealed: {
    borderRadius: 10, backgroundColor: '#f59e0b',
    borderWidth: 1, borderColor: '#f59e0b',
    alignItems: 'center', justifyContent: 'center',
  },
  answerSlot: {},
  answerLetter: { fontWeight: '600', color: '#fff' },
  answerLetterRevealed: { color: '#fff' },

  tilesArea: { paddingBottom: 8, alignItems: 'center', gap: 16 },
  tilesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  tile: {
    borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#0095f6',
    alignItems: 'center', justifyContent: 'center',
  },
  tileLetter: { fontWeight: '600', color: '#0095f6' },

  btnRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  backspaceBtn: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 22, paddingVertical: 11,
    borderWidth: 1, borderColor: '#dbdbdb',
  },
  backspaceText: { fontSize: 16, color: '#8e8e8e', fontWeight: '600' },
  answerBtn: {
    paddingVertical: 11, paddingHorizontal: 16,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbdbdb',
    borderRadius: 12,
  },
  answerBtnText: { fontSize: 14, fontWeight: '600', color: '#0095f6' },
});
