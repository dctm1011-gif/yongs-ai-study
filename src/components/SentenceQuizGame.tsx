import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, update, increment, set as dbSet } from 'firebase/database';
import { getDatabase } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { userRef } from '../utils/userDb';
import { getFirebaseApp } from '../config/firebase';

const NETLIFY_BASE = 'https://illustrious-cuchufli-7c4e58.netlify.app';
const CACHE_PREFIX = 'sentence_quiz_v1_';
const ROUND_SIZE = 8;
const GRADUATE_AT = 10;

interface ReviewWord {
  id: string;
  word: string;
  meaning: string;
  pos?: string;
  count: number;
}

interface QuizPair {
  oSentence: string;
  xSentence: string;
  explanation: string;
}

interface QuizItem {
  id: string;
  word: string;
  meaning: string;
  sentence: string;
  isO: boolean;
  explanation: string;
}

type GameState = 'loading' | 'empty' | 'playing' | 'complete';
type AnswerState = 'waiting' | 'correct' | 'wrong';

async function fetchOrCachePair(word: string, meaning: string, pos?: string): Promise<QuizPair | null> {
  const key = CACHE_PREFIX + word.toLowerCase().replace(/\s+/g, '_');
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch {}

  try {
    const res = await fetch(`${NETLIFY_BASE}/api/sentence-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, meaning, pos }),
    });
    if (!res.ok) return null;
    const pair: QuizPair = await res.json();
    if (!pair.oSentence || !pair.xSentence) return null;
    await AsyncStorage.setItem(key, JSON.stringify(pair));
    return pair;
  } catch {
    return null;
  }
}

function highlightWord(sentence: string, word: string): React.ReactNode[] {
  const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*)`, 'gi');
  const parts = sentence.split(regex);
  return parts.map((p, i) =>
    regex.test(p)
      ? <Text key={i} style={s.wordHighlight}>{p}</Text>
      : <Text key={i}>{p}</Text>
  );
}

interface Props {
  onComplete?: () => void;
}

export default function SentenceQuizGame({ onComplete }: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';

  const [gameState, setGameState] = useState<GameState>('loading');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadTotal, setLoadTotal] = useState(0);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('waiting');
  const [score, setScore] = useState(0);
  const [userPicked, setUserPicked] = useState<boolean | null>(null); // true=O, false=X

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const fadeToNext = useCallback((cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  const loadGame = useCallback(async () => {
    setGameState('loading');
    setLoadProgress(0);
    setScore(0);
    setCurrent(0);
    setAnswerState('waiting');

    try {
      const db = getDatabase(getFirebaseApp());
      const snap = await get(userRef(uid, 'english/reviewPool'));
      if (!snap.exists()) { setGameState('empty'); return; }

      const pool: ReviewWord[] = Object.entries(snap.val())
        .map(([id, v]: [string, any]) => ({ ...v, id } as ReviewWord))
        .filter(w => w.word && w.meaning && (w.count ?? 0) < GRADUATE_AT);

      if (pool.length === 0) { setGameState('empty'); return; }

      // 최근 복습 횟수 적은 것 우선, 랜덤 섞기
      const sorted = [...pool].sort((a, b) => (a.count ?? 0) - (b.count ?? 0));
      const candidates = sorted.slice(0, Math.min(ROUND_SIZE * 2, sorted.length));
      const selected = candidates.sort(() => Math.random() - 0.5).slice(0, ROUND_SIZE);

      setLoadTotal(selected.length);

      // 병렬 fetch (Promise.allSettled로 일부 실패해도 진행)
      let done = 0;
      const results = await Promise.allSettled(
        selected.map(async (w) => {
          const pair = await fetchOrCachePair(w.word, w.meaning, w.pos);
          done++;
          setLoadProgress(done);
          return { w, pair };
        })
      );

      const quizItems: QuizItem[] = results
        .filter((r): r is PromiseFulfilledResult<{ w: ReviewWord; pair: QuizPair | null }> =>
          r.status === 'fulfilled' && r.value.pair !== null
        )
        .map(({ value: { w, pair } }) => {
          const showO = Math.random() < 0.5;
          return {
            id: w.id,
            word: w.word,
            meaning: w.meaning,
            sentence: showO ? pair!.oSentence : pair!.xSentence,
            isO: showO,
            explanation: pair!.explanation,
          };
        });

      if (quizItems.length === 0) { setGameState('empty'); return; }

      setItems(quizItems);
      setGameState('playing');
    } catch {
      setGameState('empty');
    }
  }, [uid]);

  useEffect(() => { loadGame(); }, [loadGame]);

  const handleAnswer = useCallback((pickedO: boolean) => {
    if (answerState !== 'waiting') return;
    const item = items[current];
    const correct = pickedO === item.isO;
    setUserPicked(pickedO);
    setAnswerState(correct ? 'correct' : 'wrong');
    if (correct) setScore(s => s + 1);
    const db = getDatabase(getFirebaseApp());
    update(userRef(uid, `english/reviewPool/${item.id}`), { count: increment(1) }).catch(() => {});
  }, [answerState, items, current, uid]);

  const handleNext = useCallback(() => {
    if (current + 1 >= items.length) {
      setGameState('complete');
      return;
    }
    fadeToNext(() => {
      setCurrent(c => c + 1);
      setAnswerState('waiting');
      setUserPicked(null);
    });
  }, [current, items.length, fadeToNext]);

  // ── 로딩 ──
  if (gameState === 'loading') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0095f6" />
        <Text style={s.loadingTitle}>예문 생성 중...</Text>
        {loadTotal > 0 && (
          <>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${(loadProgress / loadTotal) * 100}%` as any }]} />
            </View>
            <Text style={s.loadingCount}>{loadProgress} / {loadTotal} 단어</Text>
          </>
        )}
      </View>
    );
  }

  // ── 단어 없음 ──
  if (gameState === 'empty') {
    return (
      <View style={s.center}>
        <Text style={s.emptyEmoji}>📚</Text>
        <Text style={s.emptyTitle}>복습 단어가 없습니다</Text>
        <Text style={s.emptyDesc}>단어를 읽으면 리뷰 풀에 추가됩니다</Text>
      </View>
    );
  }

  // ── 완료 ──
  if (gameState === 'complete') {
    const pct = Math.round((score / items.length) * 100);
    const emoji = pct >= 80 ? '🎯' : pct >= 60 ? '💪' : '📖';
    const handleComplete = () => {
      if (uid) {
        const today = new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
        dbSet(userRef(uid, `completion/english_sentence/${today}`), true).catch(() => {});
      }
      (onComplete ?? loadGame)();
    };
    return (
      <View style={s.center}>
        <Text style={[s.completeEmoji]}>{emoji}</Text>
        <Text style={s.completeScore}>{score} / {items.length}</Text>
        <Text style={s.completePct}>{pct}% 정답</Text>
        <Text style={s.completeMsg}>
          {pct >= 80 ? '뉘앙스 감각이 훌륭해요!' : pct >= 60 ? '조금만 더 연습해볼까요?' : '예문을 자세히 살펴보세요'}
        </Text>
        <TouchableOpacity style={s.retryBtn} onPress={handleComplete}>
          <Text style={s.retryBtnText}>완료</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 게임 중 ──
  const item = items[current];
  const answered = answerState !== 'waiting';
  const isCorrect = answerState === 'correct';

  return (
    <ScrollView contentContainerStyle={s.gameContainer} showsVerticalScrollIndicator={false}>
      {/* 진행도 */}
      <View style={s.progressRow}>
        <View style={s.progressBarThin}>
          <View style={[s.progressFillThin, { width: `${((current + 1) / items.length) * 100}%` as any }]} />
        </View>
        <Text style={s.progressText}>{current + 1} / {items.length}</Text>
      </View>

      <Animated.View style={{ opacity: fadeAnim }}>
        {/* 단어 카드 */}
        <View style={s.wordCard}>
          <Text style={s.wordText}>{item.word}</Text>
          <Text style={s.meaningText}>{item.meaning}</Text>
        </View>

        {/* 안내 */}
        <Text style={s.instruction}>이 예문이 자연스러운가요?</Text>

        {/* 예문 */}
        <View style={[s.sentenceCard, answered && (isCorrect ? s.sentenceCorrect : s.sentenceWrong)]}>
          <Text style={s.sentenceText}>
            "{highlightWord(item.sentence, item.word)}"
          </Text>
          {answered && (
            <Text style={s.sentenceLabel}>
              {item.isO ? '✓ O 문장 (자연스러운 표현)' : '✗ X 문장 (어색한 표현)'}
            </Text>
          )}
        </View>

        {/* O / X 버튼 */}
        {!answered ? (
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.answerBtn, s.btnO]} onPress={() => handleAnswer(true)} activeOpacity={0.85}>
              <Text style={s.answerBtnLabel}>O</Text>
              <Text style={s.answerBtnSub}>자연스럽다</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.answerBtn, s.btnX]} onPress={() => handleAnswer(false)} activeOpacity={0.85}>
              <Text style={s.answerBtnLabel}>X</Text>
              <Text style={s.answerBtnSub}>어색하다</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.feedbackArea}>
            {/* 정오 표시 */}
            <View style={[s.resultBadge, isCorrect ? s.resultBadgeCorrect : s.resultBadgeWrong]}>
              <Text style={s.resultBadgeText}>{isCorrect ? '✓ 정답!' : '✗ 오답'}</Text>
              {!isCorrect && (
                <Text style={s.resultBadgeSub}>
                  {userPicked ? 'O를 선택했지만 X 문장이었어요' : 'X를 선택했지만 O 문장이었어요'}
                </Text>
              )}
            </View>

            {/* X일 때만 설명 표시 */}
            {!item.isO && (
              <View style={s.explanationCard}>
                <Text style={s.explanationTitle}>💡 왜 어색할까?</Text>
                <Text style={s.explanationText}>{item.explanation}</Text>
              </View>
            )}

            <TouchableOpacity style={s.nextBtn} onPress={handleNext}>
              <Text style={s.nextBtnText}>
                {current + 1 < items.length ? '다음 →' : '결과 보기'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 점수 */}
        <Text style={s.scoreText}>현재 점수 {score} / {current + (answered ? 1 : 0)}</Text>
      </Animated.View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  loadingTitle: { marginTop: 16, fontSize: 15, fontWeight: '600', color: '#262626' },
  loadingCount: { marginTop: 6, fontSize: 13, color: '#8e8e8e' },
  progressBar: { width: 200, height: 6, borderRadius: 3, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb', marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#0095f6' },

  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#262626', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: '#8e8e8e', textAlign: 'center' },

  completeEmoji: { fontSize: 56, marginBottom: 8 },
  completeScore: { fontSize: 40, fontWeight: '600', color: '#0095f6', marginBottom: 4 },
  completePct: { fontSize: 15, color: '#8e8e8e', marginBottom: 8 },
  completeMsg: { fontSize: 14, color: '#8e8e8e', marginBottom: 28, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12, backgroundColor: '#0095f6' },
  retryBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  gameContainer: { padding: 20, paddingBottom: 40, backgroundColor: '#fff' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  progressBarThin: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb', overflow: 'hidden' },
  progressFillThin: { height: '100%', borderRadius: 2, backgroundColor: '#0095f6' },
  progressText: { fontSize: 12, color: '#8e8e8e', fontWeight: '600' },

  wordCard: {
    backgroundColor: '#fff',
    borderRadius: 16, padding: 20, marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#dbdbdb',
  },
  wordText: { fontSize: 26, fontWeight: '600', color: '#262626', marginBottom: 6 },
  meaningText: { fontSize: 14, color: '#8e8e8e', fontWeight: '400' },

  instruction: { fontSize: 13, color: '#8e8e8e', textAlign: 'center', marginBottom: 14 },

  sentenceCard: {
    backgroundColor: '#fafafa', borderRadius: 14, padding: 20, marginBottom: 20,
    borderWidth: 1, borderColor: '#dbdbdb',
  },
  sentenceCorrect: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  sentenceWrong: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  sentenceText: { fontSize: 16, color: '#262626', lineHeight: 26, textAlign: 'center' },
  sentenceLabel: { marginTop: 10, fontSize: 12, color: '#8e8e8e', textAlign: 'center', fontStyle: 'italic' },
  wordHighlight: { fontWeight: '600', color: '#0095f6' },

  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  answerBtn: {
    flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center',
  },
  btnO: { backgroundColor: '#16a34a' },
  btnX: { backgroundColor: '#dc2626' },
  answerBtnLabel: { fontSize: 28, fontWeight: '600', color: '#fff' },
  answerBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2, fontWeight: '600' },

  feedbackArea: { marginBottom: 20 },
  resultBadge: { borderRadius: 12, padding: 14, marginBottom: 14, alignItems: 'center' },
  resultBadgeCorrect: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  resultBadgeWrong: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' },
  resultBadgeText: { fontSize: 16, fontWeight: '600', color: '#262626' },
  resultBadgeSub: { fontSize: 12, color: '#8e8e8e', marginTop: 4 },

  explanationCard: {
    backgroundColor: '#fafafa', borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#dbdbdb', borderLeftWidth: 3, borderLeftColor: '#0095f6',
  },
  explanationTitle: { fontSize: 13, fontWeight: '600', color: '#0095f6', marginBottom: 6 },
  explanationText: { fontSize: 13, color: '#262626', lineHeight: 20 },

  nextBtn: {
    backgroundColor: '#0095f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  nextBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  scoreText: { textAlign: 'center', fontSize: 12, color: '#8e8e8e', marginTop: 8 },
});
