import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { getDatabase, get, update, set as dbSet } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { userRef } from '../utils/userDb';
import { getFirebaseApp } from '../config/firebase';

const DAILY_PLAY_KEY = 'wordmatch_last_played';
const DAILY_STATS_KEY = 'wordmatch_last_stats';

// Netlify Functions run in UTC; KST (UTC+9) doesn't roll to the next
// calendar day until 09:00 UTC, so a plain UTC date lags KST by a day
// for 9 hours each morning. Shift the clock forward before formatting,
// matching the same helper used elsewhere in the app.
function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

const ROUND_SIZE = 10; // 최대 10쌍(20장) 출제
const GRADUATE_AT = 10; // 리뷰 10회 완료 시 게임 출제 대상에서 제외
const MISMATCH_DELAY_MS = 600;

interface ReviewWord {
  wordId: string;
  word: string;
  meaning: string;
  count: number;
  lastReviewedDate: string | null;
}

interface Card {
  cardId: string;
  wordId: string;
  type: 'word' | 'meaning';
  text: string;
  matched: boolean;
}

type GameState = 'loading' | 'empty' | 'playing' | 'complete';

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function WordMatchGame() {
  const { user } = useAuth();
  const uid = user!.uid;
  const [gameState, setGameState] = useState<GameState>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); // 두 장 비교 중일 때 추가 입력 막기
  const [mistakes, setMistakes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [synced, setSynced] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRound = useCallback(async () => {
    stopTimer();
    setGameState('loading');
    setMistakes(0);
    setElapsedSeconds(0);
    setFlippedIds([]);
    setBusy(false);

    // 오늘 이미 플레이한 경우 완료 상태 복원
    try {
      const today = getKSTDateString();
      const lastPlayed = await AsyncStorage.getItem(DAILY_PLAY_KEY);
      if (lastPlayed === today) {
        const saved = await AsyncStorage.getItem(DAILY_STATS_KEY);
        if (saved) {
          const { cards: savedCards, elapsed, mistakes: mis, synced: syn } = JSON.parse(saved);
          setCards(savedCards);
          setElapsedSeconds(elapsed);
          setMistakes(mis);
          setSynced(syn ?? false);
          setGameState('complete');
          return;
        }
      }
    } catch {}

    try {
      const db = getDatabase(getFirebaseApp());
      const snapshot = await get(userRef(uid, 'english/reviewPool'));
      if (!snapshot.exists()) {
        setGameState('empty');
        return;
      }

      const pool = snapshot.val() as Record<string, any>;
      const candidates: ReviewWord[] = Object.entries(pool)
        .map(([wordId, v]: [string, any]) => ({
          wordId,
          word: v.word,
          meaning: v.meaning,
          count: v.count ?? 0,
          lastReviewedDate: v.lastReviewedDate ?? null,
        }))
        .filter(w => w.count < GRADUATE_AT);

      if (candidates.length === 0) {
        setGameState('empty');
        return;
      }

      // 리뷰 횟수 오름차순 우선 + 같은 횟수끼리는 무작위
      const sorted = shuffle(candidates).sort((a, b) => a.count - b.count);
      const selected = sorted.slice(0, Math.min(ROUND_SIZE, sorted.length));

      // "오늘 처음 출제"인 단어만 카운트 반영 (등장 자체가 리뷰, 하루 1회 캡)
      const today = getKSTDateString();
      for (const w of selected) {
        if (w.lastReviewedDate !== today) {
          update(userRef(uid, `english/reviewPool/${w.wordId}`), {
            count: w.count + 1,
            lastReviewedDate: today,
          }).catch(error => console.warn('리뷰 카운트 반영 실패:', error));
        }
      }

      const newCards: Card[] = shuffle(
        selected.flatMap(w => [
          { cardId: `${w.wordId}-word`, wordId: w.wordId, type: 'word' as const, text: w.word, matched: false },
          { cardId: `${w.wordId}-meaning`, wordId: w.wordId, type: 'meaning' as const, text: w.meaning, matched: false },
        ])
      );

      setCards(newCards);
      setGameState('playing');
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    } catch (error) {
      console.warn('복습 게임 로드 실패:', error);
      setGameState('empty');
    }
  }, [stopTimer]);

  useEffect(() => {
    startRound();
    return () => stopTimer();
  }, [startRound, stopTimer]);

  const onCardPress = (card: Card) => {
    if (busy || card.matched || flippedIds.includes(card.cardId)) return;

    if (card.type === 'word') {
      Speech.speak(card.text, { language: 'en', rate: 0.85, pitch: 1 });
    }

    const nextFlipped = [...flippedIds, card.cardId];
    setFlippedIds(nextFlipped);

    if (nextFlipped.length < 2) return;

    setBusy(true);
    const [firstId, secondId] = nextFlipped;
    const first = cards.find(c => c.cardId === firstId)!;
    const second = cards.find(c => c.cardId === secondId)!;

    if (first.wordId === second.wordId && first.type !== second.type) {
      // 매칭 성공
      const updatedCards = cards.map(c =>
        c.wordId === first.wordId ? { ...c, matched: true } : c
      );
      setCards(updatedCards);
      setFlippedIds([]);
      setBusy(false);
      if (updatedCards.every(c => c.matched)) {
        stopTimer();
        setGameState('complete');
        // 오늘 날짜 + 결과 저장 (하루 1회 제한)
        const today = getKSTDateString();
        AsyncStorage.setItem(DAILY_PLAY_KEY, today).catch(() => {});
        AsyncStorage.setItem(DAILY_STATS_KEY, JSON.stringify({
          cards: updatedCards,
          elapsed: elapsedSeconds,
          mistakes,
          synced: false,
        })).catch(() => {});
      }
    } else {
      setMistakes(m => m + 1);
      setTimeout(() => {
        setFlippedIds([]);
        setBusy(false);
      }, MISMATCH_DELAY_MS);
    }
  };

  const handleComplete = useCallback(async () => {
    if (synced) return;
    try {
      const today = getKSTDateString();
      const db = getDatabase(getFirebaseApp());
      await dbSet(userRef(uid, `completion/english_word_match/${today}`), true);
      setSynced(true);
      const saved = await AsyncStorage.getItem(DAILY_STATS_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        data.synced = true;
        await AsyncStorage.setItem(DAILY_STATS_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.warn('완료 기록 실패:', e);
    }
  }, [synced]);

  if (gameState === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0095f6" />
      </View>
    );
  }

  if (gameState === 'empty') {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>🎮</Text>
        <Text style={styles.emptyText}>복습할 단어가 없어요</Text>
        <Text style={styles.emptySubtext}>단어장에서 단어를 읽음 처리하면{'\n'}복습 게임에 등장합니다</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>⏱ {elapsedSeconds}초</Text>
        <Text style={styles.statusText}>✗ {mistakes}번</Text>
      </View>
      <View style={styles.gridWrapper}>
        <View style={styles.grid}>
          {cards.map(card => {
            const isFlipped = flippedIds.includes(card.cardId) || card.matched;
            return (
              <TouchableOpacity
                key={card.cardId}
                style={[
                  styles.card,
                  isFlipped && styles.cardFlipped,
                  card.matched && styles.cardMatched,
                ]}
                onPress={() => onCardPress(card)}
                disabled={gameState === 'complete' || isFlipped}
              >
                <Text
                  style={[
                    isFlipped ? styles.cardText : styles.cardBackText,
                    isFlipped && card.type === 'word' && styles.cardWordText,
                  ]}
                  numberOfLines={3}
                >
                  {isFlipped ? card.text : '?'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {gameState === 'complete' && (
          <View style={styles.completeOverlay}>
            <Text style={styles.completeEmoji}>🎉</Text>
            <Text style={styles.completeTitle}>완료!</Text>
            <Text style={styles.completeSub}>{elapsedSeconds}초 · 틀린 시도 {mistakes}번</Text>
            <TouchableOpacity
              style={[styles.completeBtn, synced && styles.completeBtnDone]}
              onPress={handleComplete}
              disabled={synced}
            >
              <Text style={styles.completeBtnText}>
                {synced ? '✓ Google Tasks 기록됨' : '완료'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.completeDailyNote}>내일 다시 도전하세요</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#fff',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#8e8e8e',
    textAlign: 'center',
    lineHeight: 20,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  gridWrapper: {
    flex: 1,
    position: 'relative',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  completeOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeEmoji: { fontSize: 52, marginBottom: 10 },
  completeTitle: { fontSize: 26, fontWeight: '600', color: '#262626', marginBottom: 6 },
  completeSub: { fontSize: 14, color: '#8e8e8e', marginBottom: 14 },
  completeBtn: {
    backgroundColor: '#0095f6',
    paddingVertical: 12, paddingHorizontal: 36,
    borderRadius: 12, marginBottom: 12,
  },
  completeBtnDone: { backgroundColor: '#10b981' },
  completeBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  completeDailyNote: {
    fontSize: 12, color: '#8e8e8e',
    backgroundColor: '#fafafa',
    borderWidth: 1, borderColor: '#dbdbdb',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
  },
  card: {
    width: '23%',
    aspectRatio: 0.85,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#0095f6',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
  },
  cardFlipped: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  cardMatched: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  cardText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#262626',
    textAlign: 'center',
  },
  cardBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dbeafe',
    textAlign: 'center',
  },
  cardWordText: {
    color: '#0095f6',
    fontSize: 11,
    fontWeight: '600',
  },
});
