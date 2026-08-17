import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, ToastAndroid, Linking, Modal, Animated, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreenFade } from '../hooks/useScreenFade';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { cacheManager } from '../utils/CacheManager';
import { performanceMonitor } from '../utils/PerformanceMonitor';
import { getDatabase, ref, onValue, get, set as dbSet } from 'firebase/database';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { NOTIF_LOG_KEY } from './_layout';
import { getFirebaseApp } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { userRef } from '../utils/userDb';
import GameHub from '../components/GameHub';

const NETLIFY_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';

// Firebase Functions run in UTC; KST (UTC+9) doesn't roll to the next
// calendar day until 09:00 UTC, so a plain UTC date lags KST by a day
// for 9 hours each morning. Shift the clock forward before formatting,
// matching the same helper used in the netlify/functions/*-daily.mjs writers.
function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

interface NetlifyWord {
  id: string;
  word: string;
  pos: string;
  date: string;
  meaning: string;
  example_ko: string;
  example_en: string;
  explanation: string;
  emoji: string;
}

interface Word extends NetlifyWord {
  isRead: boolean;
}

interface Quiz {
  id: string;
  wordId: string;
  type: 'meaning' | 'blanks' | 'situation';
  question: string;
  options: string[];
  correct: string;
  correctMeaning?: string; // 정답 후 옵션 옆에 표시할 뜻
  explanation?: string;
  option_explanations?: (string | null)[];
  answered?: boolean;
  correct_answer?: boolean;
  selectedOption?: string; // FlatList 재마운트 후에도 선택값 복원을 위해 부모 상태에 저장
}

type ViewType = 'words' | 'review' | 'quiz' | 'game' | 'stats';

interface ReviewSentence {
  word: string;
  meaning?: string;
  sentence: string;
  sentence_ko: string;
  nuance: string;
  context: string;
  everyday_usage: string;
}

const ITEMS_PER_PAGE = 15; // Pagination size for FlatList

async function fetchReadStatusFromFirebase(uid: string, today: string): Promise<Record<string, boolean>> {
  try {
    const snapshot = await get(userRef(uid, `english/readStatus/${today}`));
    return snapshot.exists() ? snapshot.val() : {};
  } catch (error) {
    console.warn('읽음 상태 Firebase 조회 실패:', error);
    return {};
  }
}

function mapFirebaseWords(data: any, today: string): NetlifyWord[] {
  const rawWords = Array.isArray(data.words) ? data.words : [data];
  return rawWords.map((w: any) => ({
    id: w.id || w.word,
    word: w.word,
    pos: w.part_of_speech || w.pos,
    date: data.date || today,
    meaning: w.meaning_ko || w.meaning,
    example_ko: w.example_ko,
    example_en: w.example_en || w.example_from_convo,
    explanation: w.explanation,
    emoji: w.emoji,
  }));
}

function shuffleArrayStatic<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mapFirebaseSentences(data: any): ReviewSentence[] {
  const raw = Array.isArray(data.sentences) ? data.sentences : [];
  return raw.filter((s: any) => s.word && s.sentence);
}

function mapFirebaseQuizzes(data: any): Quiz[] {
  const rawQuizzes = Array.isArray(data.quiz) ? data.quiz : [];
  if (rawQuizzes.length === 0) return [];
  return rawQuizzes.map((q: any, idx: number) => {
    const wordId = (q.word || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const type: Quiz['type'] = q.type === 'fill_blank' ? 'blanks' : (q.type === 'situation' ? 'situation' : 'meaning');
    const rawOptions: string[] = Array.isArray(q.options) ? q.options : [];
    const correct = typeof q.answer === 'number' ? (rawOptions[q.answer] ?? '') : (q.answer ?? '');
    const options = shuffleArrayStatic(rawOptions);
    return {
      id: `fb_${idx}_${wordId}`,
      wordId,
      type,
      question: q.question || q.sentence || '',
      options,
      correct,
      explanation: q.explanation || undefined,
      option_explanations: Array.isArray(q.option_explanations) ? q.option_explanations : undefined,
      correctMeaning: type === 'blanks' ? (q.meaning || q.meaning_ko || undefined) : (q.word || undefined),
    };
  });
}

// 읽음 처리된 단어를 reviewPool에 동기화. toggleWordRead를 거치지 않고
// readStatus가 복원된 단어(재설치·타기기·레이스컨디션)도 pool에 등록되도록 보장한다.
async function syncReadWordsToPool(uid: string, readWords: Word[]): Promise<void> {
  if (!uid || readWords.length === 0) return;
  const db = getDatabase(getFirebaseApp());
  for (const w of readWords) {
    if (!w.id) continue;
    const poolRef = userRef(uid, `english/reviewPool/${w.id}`);
    get(poolRef).then(snap => {
      if (!snap.exists()) {
        dbSet(poolRef, {
          word: w.word,
          meaning: w.meaning,
          pos: w.pos,
          emoji: w.emoji,
          count: 0,
          lastReviewedDate: null,
        }).catch(() => {});
      }
    }).catch(() => {});
  }
}

export default function VocaScreen() {
  const { user } = useAuth();
  const uid = user!.uid;
  const [view, setView] = useState<ViewType>('words');
  const [words, setWords] = useState<Word[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [reviewSentences, setReviewSentences] = useState<ReviewSentence[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [stats, setStats] = useState({ totalWords: 0, readWords: 0, quizzesCorrect: 0, quizzesTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [hideReadWords, setHideReadWords] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadStartTime] = useState(Date.now());
  const [isCached, setIsCached] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugScheduled, setDebugScheduled] = useState<any[]>([]);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [debugRemindersEnabled, setDebugRemindersEnabled] = useState<string | null>(null);
  const [debugPoolStats, setDebugPoolStats] = useState<{ total: number; graduated: number; playDays: number } | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  const [cacheTimeLeft, setCacheTimeLeft] = useState<string>('캐시 정보 로딩 중...');
  const [speakingWordId, setSpeakingWordId] = useState<string | null>(null);
  const { opacity, translateY } = useScreenFade();

  // Performance monitoring
  useEffect(() => {
    performanceMonitor.startTiming('Voca');
  }, []);

  // Log performance timing
  useEffect(() => {
    if (!loading) {
      const loadTime = Date.now() - loadStartTime;
      performanceMonitor.recordMetric('Voca', isCached, isCached);
      console.log(`📚 Voca tab loaded in ${loadTime}ms (cached: ${isCached})`);
    }
  }, [loading, isCached, loadStartTime]);

  // Update cache time display
  useEffect(() => {
    const updateCacheDisplay = async () => {
      const lastUpdate = await AsyncStorage.getItem('english_data_updated_at');
      if (lastUpdate) {
        setLastUpdateTime(lastUpdate);
        const updatedTime = parseInt(lastUpdate);
        const now = Date.now();
        const ageMs = now - updatedTime;
        const cacheExpireMs = 24 * 60 * 60 * 1000; // 24 hours
        const timeLeftMs = cacheExpireMs - ageMs;

        if (timeLeftMs > 0) {
          const hours = Math.floor(timeLeftMs / (60 * 60 * 1000));
          const minutes = Math.floor((timeLeftMs % (60 * 60 * 1000)) / (60 * 1000));
          setCacheTimeLeft(`${hours}시간 ${minutes}분 남음`);
        } else {
          setCacheTimeLeft('캐시 만료됨');
        }
      }
    };

    updateCacheDisplay();
    const interval = setInterval(updateCacheDisplay, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  // Live Firebase subscription — stays connected for as long as the screen is
  // mounted, so today's word list updates immediately when the daily
  // scheduled function writes new data, without needing to reopen the tab.
  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    const today = getKSTDateString();
    const wordsRef = ref(db, `english/words/${today}`);

    const unsubscribe = onValue(
      wordsRef,
      async snapshot => {
        if (!snapshot.exists()) {
          console.warn('No Voca data found in Firebase for today');
          return;
        }

        const netlifyData = mapFirebaseWords(snapshot.val(), today);
        if (netlifyData.length === 0) return;

        console.log(`📚 Loaded ${netlifyData.length} daily Voca phrases from Firebase`);

        const savedWords = await AsyncStorage.getItem('english_words');
        let parsedSavedWords: unknown = null;
        try {
          parsedSavedWords = savedWords ? JSON.parse(savedWords) : null;
        } catch {
          parsedSavedWords = null;
        }
        const localWords: Word[] = Array.isArray(parsedSavedWords) ? parsedSavedWords : [];
        const newWordIds = netlifyData.map(w => w.id).sort().join(',');
        const oldWordIds = localWords.map(w => w.id).sort().join(',');

        if (newWordIds === oldWordIds && localWords.length > 0) {
          return; // already up to date
        }

        const savedReadStatus = localWords.reduce(
          (acc: any, w) => ({ ...acc, [w.id]: w.isRead }),
          {}
        );
        const remoteReadStatus = await fetchReadStatusFromFirebase(uid, today);
        const mergedWords = netlifyData.map(w => ({
          ...w,
          isRead: remoteReadStatus[w.id] ?? savedReadStatus[w.id] ?? false,
        }));

        setWords(mergedWords);
        await AsyncStorage.setItem('english_words', JSON.stringify(mergedWords));
        await cacheManager.set('english_words', mergedWords, 24 * 60 * 60 * 1000);
        await saveUpdateTime();
        syncReadWordsToPool(uid, mergedWords.filter(w => w.isRead));

        const fbQuizzes = mapFirebaseQuizzes(snapshot.val());
        const newQuizzes = fbQuizzes.length > 0 ? fbQuizzes : generateQuizzes(mergedWords);
        setQuizzes(newQuizzes);
        await AsyncStorage.setItem('english_quizzes', JSON.stringify(newQuizzes));

        const fbSentences = mapFirebaseSentences(snapshot.val());
        setReviewSentences(fbSentences);
        await AsyncStorage.setItem('english_sentences', JSON.stringify(fbSentences));
      },
      error => {
        console.error('Firebase subscription error:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    updateStats();
  }, [words]);

  const saveUpdateTime = async () => {
    const timestamp = Date.now().toString();
    await AsyncStorage.setItem('english_data_updated_at', timestamp);
    setLastUpdateTime(timestamp);
    // Reset cache time left
    setCacheTimeLeft('24시간 남음');
  };

  // Shows local cache (or defaults) immediately; the live Firebase
  // subscription above takes over from there whenever data changes.
  const loadData = async () => {
    try {
      setLoading(true);

      const savedWords = await AsyncStorage.getItem('english_words');
      const parsedWords = savedWords ? JSON.parse(savedWords) : null;

      let loadedWords: Word[];
      if (Array.isArray(parsedWords)) {
        loadedWords = parsedWords;
        setWords(parsedWords);
        setIsCached(true);

        const savedQuizzes = await AsyncStorage.getItem('english_quizzes');
        let parsedQuizzes: any = null;
        try { parsedQuizzes = savedQuizzes ? JSON.parse(savedQuizzes) : null; } catch { parsedQuizzes = null; }
        // If cached quizzes lack the new explanation fields, fall back to local generation
        // (Firebase subscription will overwrite with proper data shortly)
        const hasNewFormat = Array.isArray(parsedQuizzes) && parsedQuizzes[0]?.id?.startsWith('fb_');
        setQuizzes(hasNewFormat ? parsedQuizzes : generateQuizzes(parsedWords));

        const savedSentences = await AsyncStorage.getItem('english_sentences');
        let parsedSentences: any = null;
        try { parsedSentences = savedSentences ? JSON.parse(savedSentences) : null; } catch { parsedSentences = null; }
        if (Array.isArray(parsedSentences)) setReviewSentences(parsedSentences);
      } else {
        // 캐시가 없거나 예전 형식(배열이 아님)으로 남아있으면 기본값으로 폴백
        loadedWords = getDefaultWords();
        setWords(loadedWords);
        setQuizzes(generateQuizzes(loadedWords));
      }

      // 다른 기기/재설치 등으로 로컬 캐시가 없어도 읽음 상태는 Firebase에서 복원.
      // fetchReadStatusFromFirebase 비동기 구간에 Firebase 구독이 AsyncStorage를
      // 오늘 단어로 갱신했을 수 있으므로, 완료 후 AsyncStorage를 재조회해
      // 최신 단어 목록에 readStatus를 적용한다 (레이스 컨디션 방지).
      const remoteReadStatus = await fetchReadStatusFromFirebase(uid, getKSTDateString());
      if (Object.keys(remoteReadStatus).length > 0) {
        const freshSaved = await AsyncStorage.getItem('english_words');
        let freshWords: Word[];
        try {
          const parsed = freshSaved ? JSON.parse(freshSaved) : null;
          freshWords = Array.isArray(parsed) ? parsed : loadedWords;
        } catch {
          freshWords = loadedWords;
        }
        const merged = freshWords.map(w => ({
          ...w,
          isRead: remoteReadStatus[w.id] ?? w.isRead,
        }));
        setWords(merged);
        await AsyncStorage.setItem('english_words', JSON.stringify(merged));
        syncReadWordsToPool(uid, merged.filter(w => w.isRead));
      }
    } catch (error) {
      console.error('Failed to load Voca data:', error);
      const defaultWords = getDefaultWords();
      setWords(defaultWords);
      setQuizzes(generateQuizzes(defaultWords));
    } finally {
      setLoading(false);
    }
  };

  const getDefaultWords = (): Word[] => [
    {
      id: 'w1',
      word: 'serendipity',
      pos: 'noun',
      date: '2026-07-14',
      meaning: '행운의 우연',
      example_ko: '좋은 책을 우연히 발견한 것은 진정한 세렌디피티였다.',
      example_en: 'Finding this amazing book was pure serendipity.',
      explanation: '뜻밖에 운이 좋게 되는 일, 예상치 못한 행운',
      emoji: '🍀',
      isRead: false,
    },
    {
      id: 'w2',
      word: 'ephemeral',
      pos: 'adjective',
      date: '2026-07-14',
      meaning: '덧없는, 일시적인',
      example_ko: '봄의 벚꽃은 너무나 ephemeral하다.',
      example_en: 'The beauty of cherry blossoms is ephemeral.',
      explanation: '아주 짧은 시간 동안만 존재하는',
      emoji: '🌸',
      isRead: false,
    },
    {
      id: 'w3',
      word: 'mellifluous',
      pos: 'adjective',
      date: '2026-07-14',
      meaning: '달콤하고 부드러운 (소리)',
      example_ko: '그의 목소리는 매우 mellifluous했다.',
      example_en: 'His mellifluous voice captivated the audience.',
      explanation: '꿀처럼 달콤하고 부드러운 음성이나 소리',
      emoji: '🎵',
      isRead: false,
    },
    {
      id: 'w4',
      word: 'pragmatic',
      pos: 'adjective',
      date: '2026-07-14',
      meaning: '현실적인, 실용적인',
      example_ko: '우리는 pragmatic한 접근이 필요하다.',
      example_en: 'We need a pragmatic approach to this problem.',
      explanation: '이론보다는 실제 결과에 중점을 두는',
      emoji: '⚙️',
      isRead: false,
    },
    {
      id: 'w5',
      word: 'vivacious',
      pos: 'adjective',
      date: '2026-07-14',
      meaning: '생기 넘치는, 활발한',
      example_ko: '그녀의 vivacious한 성격은 모두를 매료시켰다.',
      example_en: 'Her vivacious personality lights up any room.',
      explanation: '활기차고 생기 있는 모습',
      emoji: '✨',
      isRead: false,
    },
  ];

  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const generateQuizzes = (wordsData: Word[]): Quiz[] => {
    const quizzes: Quiz[] = [];
    const allMeanings = wordsData.map(w => w.meaning);
    const allWords = wordsData.map(w => w.word);

    wordsData.slice(0, 5).forEach((word, idx) => {
      // 의미 퀴즈 — 오답: 다른 단어들의 실제 의미 3개
      const wrongMeanings = shuffleArray(allMeanings.filter(m => m !== word.meaning)).slice(0, 3);
      quizzes.push({
        id: `m${idx}`,
        wordId: word.id,
        type: 'meaning',
        question: `"${word.word}"의 의미는?`,
        options: shuffleArray([word.meaning, ...wrongMeanings]),
        correct: word.meaning,
        correctMeaning: word.word,
      });

      // 빈칸 퀴즈 — 오답: 다른 단어들의 실제 단어 3개
      if (word.example_en) {
        const wrongWords = shuffleArray(allWords.filter(w => w !== word.word)).slice(0, 3);
        quizzes.push({
          id: `b${idx}`,
          wordId: word.id,
          type: 'blanks',
          question: word.example_en.replace(word.word, '_______'),
          options: shuffleArray([word.word, ...wrongWords]),
          correct: word.word,
          correctMeaning: word.meaning,
        });
      }
    });

    return shuffleArray(quizzes);
  };

  const saveWords = async (updatedWords: Word[]) => {
    setWords(updatedWords);
    await AsyncStorage.setItem('english_words', JSON.stringify(updatedWords));
    updateStats();
  };

  const saveQuizzes = async (updatedQuizzes: Quiz[]) => {
    setQuizzes(updatedQuizzes);
    await AsyncStorage.setItem('english_quizzes', JSON.stringify(updatedQuizzes));
    updateStats();
  };

  const updateStats = () => {
    // words/quizzes should always be arrays, but guard against stale
    // AsyncStorage data from an older app version being loaded as-is.
    if (!Array.isArray(words) || !Array.isArray(quizzes)) return;
    const readCount = words.filter(w => w.isRead).length;
    const correctCount = quizzes.filter(q => q.correct_answer === true).length;
    setStats({
      totalWords: words.length,
      readWords: readCount,
      quizzesCorrect: correctCount,
      quizzesTotal: quizzes.length,
    });
  };

  const toggleWordRead = (wordId: string) => {
    const updated = words.map(w =>
      w.id === wordId ? { ...w, isRead: !w.isRead } : w
    );
    saveWords(updated);

    const toggled = updated.find(w => w.id === wordId);
    if (toggled) {
      const db = getDatabase(getFirebaseApp());
      const today = getKSTDateString();
      dbSet(userRef(uid, `english/readStatus/${today}/${wordId}`), toggled.isRead).catch(error =>
        console.warn('읽음 상태 Firebase 저장 실패:', error)
      );

      // 처음 읽음 처리되는 단어만 복습 게임 대상 목록(reviewPool)에 등록.
      // 이미 등록돼 있으면 손대지 않음 - 카운트는 오직 게임 등장으로만 증가한다.
      if (toggled.isRead) {
        const poolRef = userRef(uid, `english/reviewPool/${wordId}`);
        get(poolRef).then(snapshot => {
          if (!snapshot.exists()) {
            dbSet(poolRef, {
              word: toggled.word,
              meaning: toggled.meaning,
              pos: toggled.pos,
              emoji: toggled.emoji,
              count: 0,
              lastReviewedDate: null,
            }).catch(error => console.warn('복습 목록 등록 실패:', error));
          }
        }).catch(error => console.warn('복습 목록 조회 실패:', error));
      }
    }
  };

  const playWordAudio = useCallback((wordId: string, text: string) => {
    setSpeakingWordId(wordId);
    Speech.speak(text, {
      language: 'en',
      rate: 0.85,
      pitch: 1,
      onDone: () => setSpeakingWordId(null),
      onStopped: () => setSpeakingWordId(null),
      onError: () => setSpeakingWordId(null),
    });
  }, []);

  const answerQuiz = (quizId: string, selectedOption: string) => {
    const updated = quizzes.map(q => {
      if (q.id === quizId) {
        const isCorrect = selectedOption === q.correct;
        if (!isCorrect && uid) {
          // 오답 단어를 reviewPool에서 count=0으로 리셋 → 알림/게임 최우선 복습
          const word = words.find(w => w.id === q.wordId);
          if (word) {
            const poolRef = userRef(uid, `english/reviewPool/${q.wordId}`);
            get(poolRef).then(snap => {
              const entry = snap.exists() ? snap.val() : {};
              dbSet(poolRef, {
                word: word.word,
                meaning: word.meaning,
                pos: word.pos,
                emoji: word.emoji,
                ...entry,
                count: 0,
                lastReviewedDate: null,
              }).catch(() => {});
            }).catch(() => {});
          }
        }
        return { ...q, answered: true, correct_answer: isCorrect, selectedOption };
      }
      return q;
    });
    saveQuizzes(updated);
    if (updated.every(q => q.answered)) {
      const correct = updated.filter(q => q.correct_answer).length;
      const today = getKSTDateString();
      dbSet(userRef(uid, `completion/english/${today}`), {
        done: true, correct, total: updated.length, ts: Date.now(),
      }).catch(() => {});
    }
  };

  const loadReviewPoolSentences = async () => {
    if (reviewLoading) return;
    setReviewLoading(true);
    try {
      const db = getDatabase(getFirebaseApp());
      const poolSnap = await get(userRef(uid, 'english/reviewPool'));
      if (!poolSnap.exists()) { setReviewSentences([]); return; }

      const pool: Record<string, any> = poolSnap.val();
      const sorted = Object.values(pool)
        .filter((v: any) => (v.count ?? 0) < 10)
        .sort((a: any, b: any) => (a.count ?? 0) - (b.count ?? 0))
        .slice(0, 15);

      const sentences: ReviewSentence[] = [];
      for (const entry of sorted) {
        const key = (entry.word || '').toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
        if (!key) continue;
        const snap = await get(ref(db, `english/sentences/${key}`));
        if (snap.exists()) {
          sentences.push({ word: entry.word, meaning: entry.meaning, ...snap.val() });
        }
      }
      setReviewSentences(sentences);
      await AsyncStorage.setItem('english_sentences', JSON.stringify(sentences));
    } catch (e) {
      console.warn('reviewPool 문장 로드 실패:', e);
    } finally {
      setReviewLoading(false);
    }
  };

  const openDebug = async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const raw = await AsyncStorage.getItem(NOTIF_LOG_KEY);
    const log: string[] = raw ? JSON.parse(raw) : [];
    const enabled = await AsyncStorage.getItem('reminders_enabled');
    setDebugScheduled(scheduled);
    setDebugLog(log);
    setDebugRemindersEnabled(enabled);

    // reviewPool 통계 + 플레이 일수 조회
    try {
      const db = getDatabase(getFirebaseApp());
      const [poolSnap, playSnap] = await Promise.all([
        get(userRef(uid, 'english/reviewPool')),
        get(userRef(uid, 'completion/english_word_match')),
      ]);
      const poolVals: any[] = poolSnap.exists() ? Object.values(poolSnap.val()) : [];
      const total = poolVals.length;
      const graduated = poolVals.filter(w => (w.count ?? 0) >= 10).length;
      const playDays = playSnap.exists() ? Object.keys(playSnap.val()).length : 0;
      setDebugPoolStats({ total, graduated, playDays });

      // 정리 스크립트용 임시 내보내기 (english/_tmp_pool_export)
      const wordKeys = poolVals
        .map((w: any) => (w.word || '').toLowerCase().replace(/[\s-]+/g, '_'))
        .filter((k: string) => k.length > 0);
      await dbSet(ref(db, 'english/_tmp_pool_export'), { words: wordKeys, count: wordKeys.length, ts: Date.now() });
    } catch {
      setDebugPoolStats(null);
    }

    setShowDebug(true);
  };

  const sendTestNotification = async () => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🧪 테스트 알림',
        body: '이 알림이 보이면 백그라운드 알림이 정상 동작합니다!',
        sound: 'default',
        channelId: 'study-reminder',
      },
      trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false },
    });
    Alert.alert('✅ 테스트 알림 예약', '5초 후 알림이 옵니다. 앱을 홈으로 내리고 기다려보세요.');
  };

  const clearDebugLog = async () => {
    await AsyncStorage.removeItem(NOTIF_LOG_KEY);
    setDebugLog([]);
  };

  const refreshFromNetlify = async () => {
    setRefreshing(true);
    try {
      const db = getDatabase(getFirebaseApp());
      const today = getKSTDateString();
      const snapshot = await get(ref(db, `english/words/${today}`));

      if (!snapshot.exists()) {
        ToastAndroid.show('❌ 오늘자 데이터가 아직 없습니다', ToastAndroid.SHORT);
        return;
      }

      const netlifyData = mapFirebaseWords(snapshot.val(), today);
      const savedWords = await AsyncStorage.getItem('english_words');
      const parsedSavedWords = savedWords ? JSON.parse(savedWords) : null;
      const localWords: Word[] = Array.isArray(parsedSavedWords) ? parsedSavedWords : [];
      const oldWordIds = localWords.map(w => w.id).sort().join(',');
      const newWordIds = netlifyData.map(w => w.id).sort().join(',');
      const isUpdated = oldWordIds !== newWordIds;

      const savedReadStatus = localWords.reduce((acc: any, w: Word) => ({ ...acc, [w.id]: w.isRead }), {});

      const mergedWords = netlifyData.map(w => ({
        ...w,
        isRead: savedReadStatus[w.id] || false,
      }));

      setWords(mergedWords);
      await AsyncStorage.setItem('english_words', JSON.stringify(mergedWords));
      await saveUpdateTime();

      const fbQuizzes = mapFirebaseQuizzes(snapshot.val());
      const refreshedQuizzes = fbQuizzes.length > 0 ? fbQuizzes : generateQuizzes(mergedWords);
      setQuizzes(refreshedQuizzes);
      await AsyncStorage.setItem('english_quizzes', JSON.stringify(refreshedQuizzes));

      const refreshedSentences = mapFirebaseSentences(snapshot.val());
      setReviewSentences(refreshedSentences);
      await AsyncStorage.setItem('english_sentences', JSON.stringify(refreshedSentences));

      ToastAndroid.show(
        isUpdated ? '✅ 새로운 단어가 추가되었습니다!' : '✓ 이미 최신 상태입니다',
        ToastAndroid.SHORT
      );
    } catch (error) {
      console.error('Refresh failed:', error);
      ToastAndroid.show('❌ 새로고침 실패', ToastAndroid.SHORT);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📚 Voca</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0095f6" />
          <Text style={styles.loadingText}>Netlify에서 데이터를 가져오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatLastUpdateTime = (timestamp: string | null): string => {
    if (!timestamp) return '업데이트 정보 없음';
    try {
      const date = new Date(parseInt(timestamp));
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}/${day} ${hours}:${minutes}`;
    } catch {
      return '업데이트 정보 없음';
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>📚 Voca</Text>
            <Text style={styles.headerSubtitle}>Netlify 실시간 동기화</Text>
          </View>
          <TouchableOpacity onPress={openDebug} style={styles.refreshButton}>
              <Text style={styles.refreshIcon}>🔔</Text>
            </TouchableOpacity>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerInfoText}>⏰ 마지막 업데이트: {formatLastUpdateTime(lastUpdateTime)}</Text>
          <Text style={styles.headerInfoText}>💾 {cacheTimeLeft}</Text>
        </View>
      </View>

      {/* Tab buttons */}
      <View style={styles.tabButtons}>
        <TouchableOpacity
          style={[styles.tabButton, view === 'words' && styles.tabButtonActive]}
          onPress={() => setView('words')}
        >
          <Text style={[styles.tabButtonText, view === 'words' && styles.tabButtonTextActive]}>단어장</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, view === 'review' && styles.tabButtonActive]}
          onPress={() => { setView('review'); if (reviewSentences.length === 0) loadReviewPoolSentences(); }}
        >
          <Text style={[styles.tabButtonText, view === 'review' && styles.tabButtonTextActive]}>문장복습</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, view === 'quiz' && styles.tabButtonActive]}
          onPress={() => setView('quiz')}
        >
          <Text style={[styles.tabButtonText, view === 'quiz' && styles.tabButtonTextActive]}>퀴즈</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, view === 'game' && styles.tabButtonActive]}
          onPress={() => setView('game')}
        >
          <Text style={[styles.tabButtonText, view === 'game' && styles.tabButtonTextActive]}>게임</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, view === 'stats' && styles.tabButtonActive]}
          onPress={() => setView('stats')}
        >
          <Text style={[styles.tabButtonText, view === 'stats' && styles.tabButtonTextActive]}>통계</Text>
        </TouchableOpacity>

      </View>

      {/* Content */}
      {view === 'words' && (
        <View style={{ flex: 1 }}>
          <View style={styles.filterBar}>
            <TouchableOpacity
              style={[styles.filterButton, hideReadWords && styles.filterButtonActive]}
              onPress={() => setHideReadWords(!hideReadWords)}
            >
              <Text style={[styles.filterButtonText, hideReadWords && styles.filterButtonTextActive]}>
                {hideReadWords ? '✓ 미읽음만' : '○ 모두 보기'}
              </Text>
            </TouchableOpacity>
          </View>
          <WordsView
            words={hideReadWords ? words.filter(w => !w.isRead) : words}
            onToggleRead={toggleWordRead}
            onPlayAudio={playWordAudio}
            speakingWordId={speakingWordId}
            onRefresh={refreshFromNetlify}
            refreshing={refreshing}
          />
        </View>
      )}
      {view === 'review' && <SentenceReviewView sentences={reviewSentences} loading={reviewLoading} />}
      {view === 'stats' && <StatsView stats={stats} />}
      {view === 'quiz' && <QuizView quizzes={quizzes} words={words} onAnswer={answerQuiz} onComplete={() => {
        const correct = quizzes.filter(q => q.correct_answer).length;
        ToastAndroid.show(`완료! ${correct}/${quizzes.length} 정답 저장됨`, ToastAndroid.SHORT);
      }} />}
      {view === 'game' && <GameHub />}

      {/* 알림 디버그 모달 */}
      <Modal visible={showDebug} transparent animationType="slide" onRequestClose={() => setShowDebug(false)}>
        <View style={styles.debugOverlay}>
          <View style={styles.debugModal}>
            <View style={styles.debugHeader}>
              <Text style={styles.debugTitle}>🔔 알림 디버그</Text>
              <TouchableOpacity onPress={() => setShowDebug(false)}>
                <Text style={styles.debugClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.debugScroll}>
              {/* 리뷰풀 통계 */}
              <Text style={styles.debugSection}>📊 리뷰풀 통계</Text>
              {debugPoolStats === null
                ? <Text style={styles.debugEmpty}>조회 중...</Text>
                : <>
                    <Text style={styles.debugRow}>전체 단어: <Text style={styles.debugVal}>{debugPoolStats.total}개</Text></Text>
                    <Text style={styles.debugRow}>졸업(count≥10): <Text style={styles.debugVal}>{debugPoolStats.graduated}개</Text></Text>
                    <Text style={styles.debugRow}>활성 단어: <Text style={styles.debugVal}>{debugPoolStats.total - debugPoolStats.graduated}개</Text></Text>
                    <Text style={styles.debugRow}>게임 플레이일수: <Text style={styles.debugVal}>{debugPoolStats.playDays}일</Text></Text>
                  </>
              }

              {/* 상태 */}
              <Text style={styles.debugSection}>📌 상태</Text>
              <Text style={styles.debugRow}>reminders_enabled: <Text style={styles.debugVal}>{debugRemindersEnabled ?? 'null'}</Text></Text>
              <Text style={styles.debugRow}>예약된 알림 수: <Text style={styles.debugVal}>{debugScheduled.length}개</Text></Text>

              {/* 예약 목록 */}
              <Text style={styles.debugSection}>📅 예약된 알림</Text>
              {debugScheduled.length === 0
                ? <Text style={styles.debugEmpty}>없음</Text>
                : debugScheduled.map((n, i) => {
                    const trigger = n.trigger as any;
                    const hour = trigger?.dateComponents?.hour ?? trigger?.hour ?? '?';
                    const title = n.content?.title ?? '';
                    return <Text key={i} style={styles.debugRow}>{`${String(hour).padStart(2,'0')}:00 — ${title}`}</Text>;
                  })
              }

              {/* 수신 로그 */}
              <Text style={styles.debugSection}>📬 수신 기록</Text>
              {debugLog.length === 0
                ? <Text style={styles.debugEmpty}>아직 수신 없음</Text>
                : debugLog.map((entry, i) => <Text key={i} style={styles.debugRow}>{entry}</Text>)
              }
            </ScrollView>

            {/* 버튼 */}
            <TouchableOpacity style={styles.debugTestBtn} onPress={sendTestNotification}>
              <Text style={styles.debugTestBtnText}>🧪 5초 후 테스트 알림 발송</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.debugClearBtn} onPress={clearDebugLog}>
              <Text style={styles.debugClearBtnText}>🗑 수신 기록 초기화</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </Animated.View>
    </SafeAreaView>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  } catch {
    return dateStr;
  }
}

// Memoized component to prevent unnecessary re-renders
const WordsView = React.memo(({ words, onToggleRead, onPlayAudio, speakingWordId, onRefresh, refreshing }: {
  words: Word[],
  onToggleRead: (id: string) => void,
  onPlayAudio: (id: string, text: string) => void,
  speakingWordId: string | null,
  onRefresh: () => void,
  refreshing: boolean,
}) => {
  return (
    <FlatList
      data={words}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      initialNumToRender={ITEMS_PER_PAGE}
      maxToRenderPerBatch={Math.ceil(ITEMS_PER_PAGE / 2)}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={true}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0095f6']} />}
      renderItem={({ item }) => (
        <WordCard
          word={item}
          onToggleRead={onToggleRead}
          onPlayAudio={onPlayAudio}
          isSpeaking={speakingWordId === item.id}
        />
      )}
    />
  );
});

// Memoized word card component
const WordCard = React.memo(({ word, onToggleRead, onPlayAudio, isSpeaking }: {
  word: Word,
  onToggleRead: (id: string) => void,
  onPlayAudio: (id: string, text: string) => void,
  isSpeaking: boolean,
}) => (
  <TouchableOpacity
    style={[styles.card, word.isRead && styles.cardRead]}
    onPress={() => onToggleRead(word.id)}
  >
    <View style={styles.cardHeader}>
      <View style={styles.wordInfo}>
        <Text style={styles.emoji}>{word.emoji}</Text>
        <View style={styles.wordDetails}>
          <Text style={styles.word}>{word.word}</Text>
          <Text style={styles.pos}>{word.pos}</Text>
        </View>
        <TouchableOpacity
          style={styles.speakerButton}
          onPress={() => onPlayAudio(word.id, word.word)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.speakerIcon}>{isSpeaking ? '🔊' : '🔈'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardHeaderRight}>
        <Text style={styles.updateDate}>{formatDate(word.date)}</Text>
        <Text style={styles.readBadge}>{word.isRead ? '✓' : '○'}</Text>
      </View>
    </View>
    <Text style={styles.meaning}>{word.meaning}</Text>
    <Text style={styles.explanation}>{word.explanation}</Text>
    <Text style={styles.example}>예: {word.example_en}</Text>
    <TouchableOpacity
      style={styles.googleSearchBtn}
      onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(word.word + ' 뜻')}&hl=ko&gl=KR&lr=lang_ko`)}
    >
      <Text style={styles.googleSearchBtnText}>🔍 구글 검색</Text>
    </TouchableOpacity>
  </TouchableOpacity>
));

// Memoized quiz view
const QuizView = React.memo(({ quizzes, words, onAnswer, onComplete }: {
  quizzes: Quiz[];
  words: Word[];
  onAnswer: (id: string, selected: string) => void;
  onComplete: () => void;
}) => {
  const getWordName = useCallback((wordId: string) => words.find(w => w.id === wordId)?.word || '', [words]);
  const allAnswered = quizzes.length > 0 && quizzes.every(q => q.answered);
  const correctCount = quizzes.filter(q => q.correct_answer).length;

  const footer = (
    <TouchableOpacity
      style={[styles.completeButton, !allAnswered && styles.completeButtonDim]}
      onPress={onComplete}
    >
      <Text style={styles.completeButtonText}>
        {allAnswered ? `✅ 완료 (${correctCount}/${quizzes.length} 정답)` : '완료'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <FlatList
      data={quizzes}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      initialNumToRender={ITEMS_PER_PAGE}
      maxToRenderPerBatch={Math.ceil(ITEMS_PER_PAGE / 2)}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={true}
      scrollEventThrottle={16}
      renderItem={({ item }) => (
        <QuizCard quiz={item} wordName={getWordName(item.wordId)} onAnswer={onAnswer} />
      )}
      ListFooterComponent={footer}
    />
  );
});

// Memoized quiz card
const QuizCard = React.memo(({ quiz, wordName, onAnswer }: { quiz: Quiz, wordName: string, onAnswer: (id: string, selected: string) => void }) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(quiz.selectedOption ?? null);

  const handlePress = (option: string) => {
    if (quiz.answered) return;
    setSelectedOption(option);
    onAnswer(quiz.id, option);
  };

  const wasWrong = quiz.answered && quiz.correct_answer === false;

  return (
    <View style={styles.quizCard}>
      {quiz.type !== 'blanks' && <Text style={styles.quizWord}>{wordName}</Text>}
      <Text style={styles.quizQuestion}>{quiz.question}</Text>
      <View style={styles.optionsContainer}>
        {quiz.options.map((option, idx) => {
          const isCorrectOpt = option === quiz.correct;
          const isSelectedWrong = quiz.answered && !isCorrectOpt && (selectedOption === option || (wasWrong && option === selectedOption));
          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.optionButton,
                quiz.answered && isCorrectOpt && styles.optionCorrect,
                quiz.answered && !isCorrectOpt && selectedOption === option && styles.optionIncorrect,
              ]}
              onPress={() => handlePress(option)}
              disabled={quiz.answered}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={[
                  styles.optionText,
                  quiz.answered && isCorrectOpt && styles.optionTextCorrect,
                  quiz.answered && !isCorrectOpt && selectedOption === option && styles.optionTextIncorrect,
                ]}>{option}</Text>
                {quiz.answered && isCorrectOpt && quiz.correct_answer && quiz.correctMeaning && quiz.correctMeaning !== option && (
                  <Text style={styles.optionMeaning}> — {quiz.correctMeaning}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {quiz.answered && (
        <>
          <Text style={[styles.answerFeedback, quiz.correct_answer ? styles.correct : styles.incorrect]}>
            {quiz.correct_answer ? '✓ 정답!' : '✗ 오답 — 정답: ' + quiz.correct}
          </Text>
          {quiz.explanation && (
            <View style={styles.explanationBox}>
              <Text style={styles.explanationLabel}>💬 해설</Text>
              <Text style={styles.explanationText}>{quiz.explanation}</Text>
            </View>
          )}
          {quiz.option_explanations && quiz.option_explanations.some(e => e !== null) && (
            <View style={styles.wrongExplBox}>
              <Text style={styles.wrongExplTitle}>📖 오답 해설</Text>
              {quiz.options.map((option, idx) => {
                const expl = quiz.option_explanations?.[idx];
                if (!expl) return null;
                return (
                  <View key={idx} style={styles.wrongExplItem}>
                    <Text style={styles.wrongExplOption}>• {String.fromCharCode(65 + idx)}. {option}</Text>
                    <Text style={styles.wrongExplText}>{expl}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
});

const SentenceReviewView = React.memo(({ sentences, loading }: { sentences: ReviewSentence[], loading: boolean }) => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [cardExamples, setCardExamples] = useState<Record<number, { en: string; ko: string }[]>>({});
  const currentSoundRef = React.useRef<Audio.Sound | null>(null);
  const playIdRef = React.useRef(0);

  const playReview = useCallback(async (idx: number, item: ReviewSentence) => {
    const prevId = ++playIdRef.current;
    Speech.stop();
    if (currentSoundRef.current) {
      await currentSoundRef.current.stopAsync().catch(() => {});
      await currentSoundRef.current.unloadAsync().catch(() => {});
      currentSoundRef.current = null;
    }
    if (speakingIdx === idx) { setSpeakingIdx(null); return; }

    setSpeakingIdx(idx);
    setExpanded(prev => ({ ...prev, [idx]: true }));
    try { await Audio.setAudioModeAsync({ playsInSilentModeIOS: true }); } catch {}

    const ttsUrl = (text: string, speed?: number) =>
      `${NETLIFY_BASE_URL}/api/toefl-tts?speaker=Professor&text=${encodeURIComponent(text)}${speed != null ? `&speed=${speed}` : ''}`;
    const loadSnd = (text: string, speed?: number) =>
      Audio.Sound.createAsync({ uri: ttsUrl(text, speed) }, { shouldPlay: false }).catch(() => null);
    const playSnd = async (result: { sound: Audio.Sound } | null) => {
      if (!result || playIdRef.current !== prevId) return;
      const { sound } = result;
      currentSoundRef.current = sound;
      await sound.playAsync().catch(() => {});
      await new Promise<void>(resolve => {
        sound.setOnPlaybackStatusUpdate(status => {
          if (status.isLoaded && (status.didJustFinish || playIdRef.current !== prevId)) {
            sound.unloadAsync().catch(() => {});
            currentSoundRef.current = null;
            resolve();
          }
        });
      });
    };

    // 추가 예문 백그라운드 fetch (캐시 우선)
    const examplesPromise: Promise<{ en: string; ko: string }[]> = cardExamples[idx]
      ? Promise.resolve(cardExamples[idx])
      : fetch(`${NETLIFY_BASE_URL}/api/review-examples`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: item.word, meaning: item.meaning, sentence: item.sentence }),
        }).then(r => r.json()).then((d: any) => (d.examples ?? []) as { en: string; ko: string }[]).catch(() => []);

    // 단어: 30% → 1초 → 60% → 1초 → 90% → 1초
    const wordSpeeds = [0.3, 0.6, 0.9];
    let wordNext: Promise<{ sound: Audio.Sound } | null> | null = loadSnd(item.word, wordSpeeds[0]);
    for (let wi = 0; wi < wordSpeeds.length; wi++) {
      if (playIdRef.current !== prevId) return;
      const result = await wordNext;
      wordNext = wi + 1 < wordSpeeds.length ? loadSnd(item.word, wordSpeeds[wi + 1]) : null;
      await playSnd(result);
      if (playIdRef.current !== prevId) return;
      await new Promise(r => setTimeout(r, 1000));
    }

    // 예문+번역+설명: 룩어헤드 프리로드로 공백 최소화
    const mainParts = [item.sentence, item.sentence_ko, item.nuance, item.context, item.everyday_usage];
    let nextP: Promise<{ sound: Audio.Sound } | null> | null = loadSnd(mainParts[0]);
    for (let i = 0; i < mainParts.length; i++) {
      if (playIdRef.current !== prevId) return;
      const result = await nextP;
      nextP = i + 1 < mainParts.length ? loadSnd(mainParts[i + 1]) : null;
      await playSnd(result);
    }

    // 추가 예문 대기 → UI 표시 → TTS 읽기
    if (playIdRef.current !== prevId) return;
    const examples = await examplesPromise;
    if (examples.length && playIdRef.current === prevId) {
      setCardExamples(prev => ({ ...prev, [idx]: examples }));
      const exParts = examples.flatMap(ex => [ex.en, ex.ko]);
      let exNext: Promise<{ sound: Audio.Sound } | null> | null = exParts.length ? loadSnd(exParts[0]) : null;
      for (let i = 0; i < exParts.length; i++) {
        if (playIdRef.current !== prevId) return;
        const result = await exNext;
        exNext = i + 1 < exParts.length ? loadSnd(exParts[i + 1]) : null;
        await playSnd(result);
      }
    }

    if (playIdRef.current === prevId) setSpeakingIdx(null);
  }, [speakingIdx, cardExamples]);

  if (loading) {
    return (
      <View style={styles.reviewEmpty}>
        <ActivityIndicator size="large" color="#0095f6" />
        <Text style={[styles.reviewEmptyText, { marginTop: 12 }]}>복습 단어 불러오는 중...</Text>
      </View>
    );
  }

  if (sentences.length === 0) {
    return (
      <View style={styles.reviewEmpty}>
        <Text style={styles.reviewEmptyText}>복습할 단어가 없어요.{'\n'}단어장에서 단어를 읽음 처리하면 여기에 나타나요.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      {sentences.map((item, idx) => {
        const isOpen = expanded[idx] ?? false;
        const highlighted = item.sentence.replace(
          new RegExp(`\\b${item.word}(\\w*)`, 'gi'),
          (m) => `【${m}】`
        );
        return (
          <TouchableOpacity
            key={idx}
            style={styles.reviewCard}
            onPress={() => setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }))}
            activeOpacity={0.85}
          >
            <View style={styles.reviewCardTop}>
              <Text style={styles.reviewWord}>{item.word}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => playReview(idx, item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.reviewTtsBtn, speakingIdx === idx && styles.reviewTtsBtnActive]}>
                    {speakingIdx === idx ? '⏹' : '🔊'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.reviewToggle}>{isOpen ? '▲' : '▼'}</Text>
              </View>
            </View>
            <Text style={styles.reviewSentence}>
              {highlighted.split(/【|】/).map((part, i) =>
                i % 2 === 1
                  ? <Text key={i} style={styles.reviewWordHighlight}>{part}</Text>
                  : <Text key={i}>{part}</Text>
              )}
            </Text>
            <Text style={styles.reviewSentenceKo}>{item.sentence_ko}</Text>
            {isOpen && (
              <View style={styles.reviewDetails}>
                <View style={styles.reviewDetailRow}>
                  <Text style={styles.reviewDetailLabel}>💬 뉘앙스</Text>
                  <Text style={styles.reviewDetailText}>{item.nuance}</Text>
                </View>
                <View style={styles.reviewDetailRow}>
                  <Text style={styles.reviewDetailLabel}>📍 상황</Text>
                  <Text style={styles.reviewDetailText}>{item.context}</Text>
                </View>
                <View style={styles.reviewDetailRow}>
                  <Text style={styles.reviewDetailLabel}>🗣 일상표현</Text>
                  <Text style={styles.reviewDetailText}>{item.everyday_usage}</Text>
                </View>
                {cardExamples[idx] && (
                  <View style={styles.reviewDetailRow}>
                    <Text style={styles.reviewDetailLabel}>📝 추가 예문</Text>
                    {cardExamples[idx].map((ex, i) => (
                      <View key={i} style={{ marginTop: 8 }}>
                        <Text style={styles.reviewSentence}>{`${i + 1}. ${ex.en}`}</Text>
                        <Text style={styles.reviewSentenceKo}>{ex.ko}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});

// Memoized stats view
const StatsView = React.memo(({ stats }: { stats: any }) => (
  <ScrollView contentContainerStyle={styles.statsContent}>
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>총 단어 수</Text>
      <Text style={styles.statValue}>{stats.totalWords}</Text>
    </View>
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>읽은 단어</Text>
      <Text style={styles.statValue}>{stats.readWords} / {stats.totalWords}</Text>
    </View>
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>퀴즈 정답</Text>
      <Text style={styles.statValue}>{stats.quizzesCorrect} / {stats.quizzesTotal}</Text>
    </View>
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>정답률</Text>
      <Text style={styles.statValue}>
        {stats.quizzesTotal > 0 ? ((stats.quizzesCorrect / stats.quizzesTotal) * 100).toFixed(1) : 0}%
      </Text>
    </View>
  </ScrollView>
));

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#8e8e8e',
  },
  headerInfo: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#dbdbdb',
  },
  headerInfoText: {
    fontSize: 10,
    color: '#8e8e8e',
    marginVertical: 2,
  },
  refreshButton: {
    padding: 8,
  },
  refreshIcon: {
    fontSize: 20,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
    gap: 8,
  },
  filterButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  filterButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#0095f6',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  filterButtonTextActive: {
    color: '#0095f6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#8e8e8e',
    textAlign: 'center',
  },
  tabButtons: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  tabButtonActive: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#fff',
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    elevation: 0,
  },
  cardRead: {
    opacity: 0.5,
    backgroundColor: '#fafafa',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  wordInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  emoji: {
    fontSize: 24,
  },
  wordDetails: {
    flex: 1,
  },
  word: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
  },
  pos: {
    fontSize: 11,
    color: '#8e8e8e',
    marginTop: 2,
  },
  speakerButton: {
    padding: 4,
  },
  speakerIcon: {
    fontSize: 20,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateDate: {
    fontSize: 10,
    color: '#8e8e8e',
  },
  readBadge: {
    fontSize: 16,
    color: '#0095f6',
  },
  meaning: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 6,
  },
  explanation: {
    fontSize: 12,
    color: '#8e8e8e',
    marginBottom: 6,
    lineHeight: 18,
  },
  example: {
    fontSize: 12,
    color: '#8e8e8e',
    fontStyle: 'italic',
  },
  googleSearchBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    backgroundColor: '#fff',
  },
  googleSearchBtnText: {
    fontSize: 12,
    color: '#0095f6',
    fontWeight: '600',
  },
  debugOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  debugModal: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '85%',
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  debugClose: {
    fontSize: 18,
    color: '#94a3b8',
    padding: 4,
  },
  debugScroll: {
    maxHeight: 400,
  },
  debugSection: {
    fontSize: 13,
    fontWeight: '700',
    color: '#60a5fa',
    marginTop: 12,
    marginBottom: 4,
  },
  debugRow: {
    fontSize: 12,
    color: '#cbd5e1',
    paddingVertical: 2,
    fontFamily: 'monospace',
  },
  debugVal: {
    color: '#4ade80',
    fontWeight: '700',
  },
  debugEmpty: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  debugTestBtn: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  debugTestBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  debugClearBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  debugClearBtnText: {
    color: '#ef4444',
    fontSize: 13,
  },
  quizCard: {
    backgroundColor: '#fff',
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    elevation: 0,
  },
  quizWord: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 8,
  },
  quizQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  optionCorrect: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  optionIncorrect: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  optionText: {
    fontSize: 13,
    color: '#262626',
    fontWeight: '500',
  },
  optionTextCorrect: {
    color: '#065f46',
    fontWeight: '700',
  },
  optionTextIncorrect: {
    color: '#991b1b',
  },
  optionMeaning: {
    fontSize: 12,
    color: '#065f46',
    fontWeight: '500',
    opacity: 0.85,
  },
  completeButton: {
    margin: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0095f6',
    alignItems: 'center',
  },
  completeButtonDim: {
    backgroundColor: '#b2dffc',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  answerFeedback: {
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
  },
  correct: {
    color: '#10b981',
  },
  incorrect: {
    color: '#ef4444',
  },
  explanationBox: {
    marginTop: 10,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#0095f6',
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0095f6',
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 13,
    color: '#262626',
    lineHeight: 20,
  },
  wrongExplBox: {
    marginTop: 8,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  wrongExplTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8e8e8e',
    marginBottom: 8,
  },
  wrongExplItem: {
    marginBottom: 8,
  },
  wrongExplOption: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  wrongExplText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    paddingLeft: 10,
  },
  reviewEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  reviewEmptyText: {
    fontSize: 14,
    color: '#8e8e8e',
    textAlign: 'center',
    lineHeight: 22,
  },
  reviewCard: {
    backgroundColor: '#fff',
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  reviewCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewWord: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0095f6',
  },
  reviewToggle: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  reviewTtsBtn: {
    fontSize: 16,
  },
  reviewTtsBtnActive: {
    opacity: 0.4,
  },
  reviewSentence: {
    fontSize: 15,
    color: '#262626',
    lineHeight: 24,
    marginBottom: 4,
  },
  reviewWordHighlight: {
    fontWeight: '700',
    color: '#0095f6',
    textDecorationLine: 'underline',
  },
  reviewSentenceKo: {
    fontSize: 13,
    color: '#8e8e8e',
    lineHeight: 20,
    marginTop: 2,
  },
  reviewDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 10,
  },
  reviewDetailRow: {
    gap: 3,
  },
  reviewDetailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0095f6',
  },
  reviewDetailText: {
    fontSize: 13,
    color: '#262626',
    lineHeight: 20,
  },
  statsContent: {
    padding: 16,
    paddingBottom: 100,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    elevation: 0,
  },
  statLabel: {
    fontSize: 13,
    color: '#8e8e8e',
    fontWeight: '600',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '600',
    color: '#0095f6',
  },
});
