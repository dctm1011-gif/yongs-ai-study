import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, ToastAndroid, Linking, Modal, Animated, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreenFade } from '../hooks/useScreenFade';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { cacheManager } from '../utils/CacheManager';
import { performanceMonitor } from '../utils/PerformanceMonitor';
import { getDatabase, ref, onValue, get, set as dbSet, update, remove, increment } from 'firebase/database';
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
  isSkipped?: boolean;
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
  examples?: { en: string; ko: string }[];
}

interface ReviewStory {
  sentences: { en: string; ko: string }[];
  wordNuances: { word: string; meaning: string; nuance: string }[];
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

async function fetchQuizStatusFromFirebase(
  uid: string, today: string
): Promise<Record<string, { answered: boolean; correct_answer: boolean; selectedOption: string }>> {
  try {
    const snapshot = await get(userRef(uid, `english/quizStatus/${today}`));
    return snapshot.exists() ? snapshot.val() : {};
  } catch (error) {
    console.warn('퀴즈 상태 Firebase 조회 실패:', error);
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
  const allWords: string[] = Array.isArray(data.words)
    ? data.words.map((w: any) => w.word).filter(Boolean)
    : [];
  return rawQuizzes.map((q: any, idx: number) => {
    const wordId = (q.word || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const type: Quiz['type'] = q.type === 'fill_blank' ? 'blanks' : (q.type === 'situation' ? 'situation' : 'meaning');
    let rawOptions: string[] = Array.isArray(q.options) ? q.options : [];
    // fill_blank quizzes in daily.json omit options — generate from today's word list
    if (type === 'blanks' && rawOptions.length === 0) {
      const correctWord: string = typeof q.answer === 'string' ? q.answer : (q.word ?? '');
      const wrongs = shuffleArrayStatic(allWords.filter(w => w !== correctWord)).slice(0, 3);
      rawOptions = [correctWord, ...wrongs];
    }
    const correct = typeof q.answer === 'number' ? (rawOptions[q.answer] ?? '') : (q.answer ?? '');
    const rawExplanations: (string | null)[] = Array.isArray(q.option_explanations)
      ? q.option_explanations
      : rawOptions.map(() => null);
    // Shuffle options and explanations together so their indices stay in sync
    const combined = rawOptions.map((opt, i) => ({ opt, expl: rawExplanations[i] ?? null }));
    const shuffled = shuffleArrayStatic(combined);
    const options = shuffled.map(c => c.opt);
    const shuffledExplanations = shuffled.map(c => c.expl);
    const hasExplanations = shuffledExplanations.some(e => e !== null);
    return {
      id: `fb_${idx}_${wordId}`,
      wordId,
      type,
      question: q.question || q.sentence || '',
      options,
      correct,
      explanation: q.explanation || undefined,
      option_explanations: hasExplanations ? shuffledExplanations : undefined,
      correctMeaning: type === 'blanks' ? (q.meaning || q.meaning_ko || undefined) : (q.word || undefined),
    };
  });
}

// 읽음 처리된 단어를 reviewPool에 동기화. toggleWordRead를 거치지 않고
// readStatus가 복원된 단어(재설치·타기기·레이스컨디션)도 pool에 등록되도록 보장한다.
async function syncReadWordsToPool(uid: string, readWords: Word[]): Promise<void> {
  if (!uid || readWords.length === 0) return;
  const db = getDatabase(getFirebaseApp());
  // skipList 먼저 확인해서 skip된 단어는 reviewPool 등록 제외
  const skipSnap = await get(ref(db, `users/${uid}/english/skipList`)).catch(() => null);
  const skipKeys = new Set(skipSnap?.exists() ? Object.keys(skipSnap.val()) : []);
  for (const w of readWords) {
    if (!w.id || skipKeys.has(w.id)) continue;
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
  const [view, setView] = useState<ViewType>('game');
  const [words, setWords] = useState<Word[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [reviewStory, setReviewStory] = useState<ReviewStory | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewWordIds, setReviewWordIds] = useState<string[]>([]);
  const [stats, setStats] = useState({ totalWords: 0, readWords: 0, quizzesCorrect: 0, quizzesTotal: 0 });
  const [completionToday, setCompletionToday] = useState<Record<string, boolean>>({});
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
  const [skipSet, setSkipSet] = useState<Set<string>>(new Set());
  const [wordRatings, setWordRatings] = useState<Record<string, number>>({});
  const [playAllWordId, setPlayAllWordId] = useState<string | null>(null);
  // ref mirror of playAllWordId — the toggle check must read the *current*
  // value, not the value captured when the useCallback was created, otherwise a
  // fast double-tap runs the stale (null) branch twice and re-starts playback.
  const playAllWordIdRef = React.useRef<string | null>(null);
  React.useEffect(() => { playAllWordIdRef.current = playAllWordId; }, [playAllWordId]);
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

  // skipList 로드 (마운트 1회)
  useEffect(() => {
    if (!uid) return;
    const db = getDatabase(getFirebaseApp());
    get(ref(db, `users/${uid}/english/skipList`)).then(snap => {
      if (snap.exists()) setSkipSet(new Set(Object.keys(snap.val())));
    }).catch(() => {});
  }, [uid]);

  // 난이도 평가 로드 (마운트 1회)
  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    get(ref(db, 'english/userRatings')).then(snap => {
      if (!snap.exists()) return;
      const data = snap.val();
      const ratings: Record<string, number> = {};
      Object.entries(data).forEach(([key, val]: [string, any]) => {
        if (typeof val?.rating === 'number') ratings[key] = val.rating;
      });
      setWordRatings(ratings);
    }).catch(() => {});
  }, []);

  // Listen to today's game completion for tab unlocking
  useEffect(() => {
    if (!uid) return;
    const today = getKSTDateString();
    const db = getDatabase(getFirebaseApp());
    const unsub = onValue(ref(db, `users/${uid}/completion`), snap => {
      const data = snap.val() ?? {};
      const result: Record<string, boolean> = {};
      for (const key of Object.keys(data)) {
        const val = data[key]?.[today];
        result[key] = val === true || (typeof val === 'number' && val > 0);
      }
      setCompletionToday(result);
    });
    return () => unsub();
  }, [uid]);

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

  // 화면을 완전히 벗어날 때 진행 중인 playAllWords 루프 취소 + 사운드 해제.
  // 다음 _wcPlayId !== myId 체크에서 루프가 멈춘다.
  useEffect(() => {
    return () => {
      ++_wcPlayId;
      if (_wcSound) {
        _wcSound.stopAsync().catch(() => {});
        _wcSound.unloadAsync().catch(() => {});
        _wcSound = null;
      }
      Speech.stop();
    };
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
          // Words are up-to-date, but check if quizzes have stale fill_blank entries (no options).
          // This happens when the cached quiz data was generated before the options fix.
          const savedQuizzes = await AsyncStorage.getItem('english_quizzes');
          let cachedQuizzes: any = null;
          try { cachedQuizzes = savedQuizzes ? JSON.parse(savedQuizzes) : null; } catch {}
          const hasStaleQuizzes = Array.isArray(cachedQuizzes) && cachedQuizzes.some(
            (q: any) => q.type === 'blanks' && (!q.options || q.options.length === 0)
          );
          if (!hasStaleQuizzes) return; // already up to date
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
        const baseQuizzes = fbQuizzes.length > 0 ? fbQuizzes : generateQuizzes(mergedWords);
        const remoteQuizStatus = await fetchQuizStatusFromFirebase(uid, today);
        const newQuizzes = baseQuizzes.map(q => {
          const saved = remoteQuizStatus[q.id];
          if (saved?.answered) {
            return { ...q, answered: true, correct_answer: saved.correct_answer, selectedOption: saved.selectedOption };
          }
          return q;
        });
        setQuizzes(newQuizzes);
        await AsyncStorage.setItem('english_quizzes', JSON.stringify(newQuizzes));

        // Daily sentences are not saved to reviewSentences — review tab loads from reviewPool directly
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

        // review story is generated on demand, not cached
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

      // skip된 단어는 reviewPool 등록 안 함
      if (toggled.isRead && !skipSet.has(wordId)) {
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

  const rateWord = useCallback((wordId: string, rating: number) => {
    setWordRatings(prev => ({ ...prev, [wordId]: rating }));
    const db = getDatabase(getFirebaseApp());
    dbSet(ref(db, `english/userRatings/${wordId}`), {
      rating,
      ratedAt: new Date().toISOString(),
    }).catch(() => {});
  }, []);

  const skipWord = (wordId: string) => {
    const word = words.find(w => w.id === wordId);
    if (!word || skipSet.has(wordId)) return;

    // 읽음 처리
    const updated = words.map(w => w.id === wordId ? { ...w, isRead: true } : w);
    saveWords(updated);

    const db = getDatabase(getFirebaseApp());
    const today = getKSTDateString();
    const skippedAt = new Date().toISOString();

    // readStatus 기록
    dbSet(userRef(uid, `english/readStatus/${today}/${wordId}`), true).catch(() => {});
    // 유저별 skipList
    dbSet(userRef(uid, `english/skipList/${wordId}`), { word: word.word, skippedAt }).catch(() => {});
    // 단어 생성 스크립트가 읽는 글로벌 skipList
    dbSet(ref(db, `english/globalSkipList/${wordId}`), { word: word.word, skippedAt }).catch(() => {});
    // reviewPool에서 즉시 삭제 (통계에서도 사라짐, 복습 안 함)
    remove(userRef(uid, `english/reviewPool/${wordId}`)).catch(() => {});

    setSkipSet(prev => new Set([...prev, wordId]));
  };

  const playAllWords = useCallback(async () => {
    if (playAllWordIdRef.current !== null) {
      ++_wcPlayId;
      playAllWordIdRef.current = null;
      if (_wcSound) { await _wcSound.stopAsync().catch(() => {}); await _wcSound.unloadAsync().catch(() => {}); _wcSound = null; }
      Speech.stop();
      setPlayAllWordId(null);
      return;
    }
    // Mark active synchronously so a second tap in the same tick hits the
    // stop branch above instead of starting a duplicate loop.
    playAllWordIdRef.current = '__starting__';
    const myId = ++_wcPlayId;
    const wordsToPlay = hideReadWords ? words.filter(w => !w.isRead) : words;
    try { await Audio.setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true }); } catch {}
    const ttsUrl = (text: string, speed?: number) =>
      `${NETLIFY_BASE_URL}/api/toefl-tts?speaker=Professor&text=${encodeURIComponent(text)}${speed != null ? `&speed=${speed}` : ''}`;
    const loadSnd = (text: string, speed?: number) => {
      const p = Audio.Sound.createAsync({ uri: ttsUrl(text, speed) }, { shouldPlay: false }).catch(() => null);
      return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), 15000))])
        .then(r => { if (!r) p.then(s => s?.sound.unloadAsync().catch(() => {})); return r; });
    };
    const playSnd = async (result: { sound: Audio.Sound } | null): Promise<void> => {
      if (!result) return;
      if (_wcPlayId !== myId) { result.sound.unloadAsync().catch(() => {}); return; }
      _wcSound = result.sound;
      const played = await result.sound.playAsync().then(() => true).catch(() => false);
      if (!played || _wcPlayId !== myId) {
        await result.sound.unloadAsync().catch(() => {});
        if (_wcSound === result.sound) _wcSound = null;
        return;
      }
      let natural = false;
      await Promise.race([
        new Promise<void>(resolve => {
          result.sound.setOnPlaybackStatusUpdate(status => {
            if (status.isLoaded && status.didJustFinish) { natural = true; result.sound.setOnPlaybackStatusUpdate(null); resolve(); }
            else if (!status.isLoaded) { result.sound.setOnPlaybackStatusUpdate(null); resolve(); }
            else if (_wcPlayId !== myId) { result.sound.setOnPlaybackStatusUpdate(null); resolve(); }
          });
        }),
        new Promise<void>(r => setTimeout(r, 300000)),
      ]);
      if (natural) await new Promise(r => setTimeout(r, 800));
      await result.sound.unloadAsync().catch(() => {});
      if (_wcSound === result.sound) _wcSound = null;
    };
    for (const word of wordsToPlay) {
      if (_wcPlayId !== myId) break;
      setPlayAllWordId(word.id);
      let sd: ReviewSentence | null = null;
      try {
        const db = getDatabase(getFirebaseApp());
        const key = word.word.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
        const snap = await get(ref(db, `english/sentences/${key}`));
        if (snap.exists()) sd = { word: word.word, ...snap.val() };
      } catch {}
      if (_wcPlayId !== myId) break;
      // EN TTS: word × 1 + example_en + ex.en
      const enSegs = [
        `${word.word}.`,
        word.example_en,
        ...(sd?.examples?.map(ex => ex.en).filter(Boolean) ?? []),
      ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      await playSnd(await loadSnd(enSegs.join(' ')));
      // KO TTS: sentence_ko + nuance + context + everyday_usage + ex.ko
      if (_wcPlayId !== myId) break;
      if (sd) {
        const koSegs = [
          sd.sentence_ko, sd.nuance, sd.context, sd.everyday_usage,
          ...(sd.examples?.map(ex => ex.ko).filter(Boolean) ?? []),
        ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
        if (koSegs.length > 0) await playSnd(await loadSnd(koSegs.join(' ')));
      }
      if (_wcPlayId === myId) await new Promise(res => setTimeout(res, 800));
    }
    playAllWordIdRef.current = null;
    setPlayAllWordId(null);
  }, [words, hideReadWords]);

  const answerQuiz = (quizId: string, selectedOption: string) => {
    const updated = quizzes.map(q => {
      if (q.id === quizId) {
        const isCorrect = selectedOption === q.correct;
        if (uid) {
          const today = getKSTDateString();
          dbSet(userRef(uid, `english/quizStatus/${today}/${quizId}`), {
            answered: true,
            correct_answer: isCorrect,
            selectedOption,
          }).catch(() => {});
        }
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
    const activeQuizzes = updated.filter(q => !skipSet.has(q.wordId));
    if (activeQuizzes.length > 0 && activeQuizzes.every(q => q.answered)) {
      const correct = activeQuizzes.filter(q => q.correct_answer).length;
      const today = getKSTDateString();
      dbSet(userRef(uid, `completion/english/${today}`), {
        done: true, correct, total: activeQuizzes.length, ts: Date.now(),
      }).catch(() => {});

      // 일간 리포트용 공개 요약 (인증 없이 Netlify 함수가 읽을 수 있는 경로)
      const db = getDatabase(getFirebaseApp());
      get(ref(db, `users/${uid}/english/reviewPool`)).then(snap => {
        const pool = snap.exists() ? Object.values(snap.val() as Record<string, any>) : [];
        const active = pool.filter((e: any) => (e.count ?? 0) < 10).length;
        const graduated = pool.filter((e: any) => (e.count ?? 0) >= 10).length;
        return dbSet(ref(db, `english/dailySummary/${today}`), {
          correct,
          total: activeQuizzes.length,
          quizDetails: activeQuizzes.map(q => ({
            word: q.word,
            wordId: q.wordId,
            correct_answer: q.correct_answer ?? false,
            selectedOption: q.selectedOption ?? '',
          })),
          pool: { active, graduated },
          ts: Date.now(),
        });
      }).catch(() => {});
    }
  };

  const loadReviewStory = async () => {
    if (reviewLoading) return;
    setReviewLoading(true);
    const db = getDatabase(getFirebaseApp());
    const today = getKSTDateString();

    try {
      // 오늘치 스토리가 이미 Firebase에 있으면 바로 표시
      const cached = await get(userRef(uid, `english/reviewStory/${today}`));
      if (cached.exists()) {
        setReviewStory(cached.val());
        setReviewLoading(false);
        return;
      }

      // 복습 풀 후보 선정
      const poolSnap = await get(userRef(uid, 'english/reviewPool'));
      let candidates: any[] = [];
      if (poolSnap.exists()) {
        const pool: Record<string, any> = poolSnap.val();
        candidates = Object.entries(pool)
          .filter(([_, v]: [string, any]) => (v.count ?? 0) < 10)
          .sort(([_, a]: [string, any], [__, b]: [string, any]) => (a.count ?? 0) - (b.count ?? 0))
          .slice(0, 10);
      }

      if (candidates.length === 0) {
        setReviewWordIds([]);
        setReviewLoading(false);
        return;
      }

      setReviewWordIds((candidates as [string, any][]).map(([id]) => id));
      const words = (candidates as [string, any][]).map(([_, entry]) => ({
        word: entry.word,
        meaning: entry.meaning ?? '',
        pos: entry.pos ?? '',
      }));

      // 사용자 auth 토큰 획득 → 백그라운드 함수가 Firebase에 직접 기록하기 위해 필요
      const { getAuth } = await import('firebase/auth');
      const token = await getAuth(getFirebaseApp()).currentUser?.getIdToken() ?? '';

      // Firebase 구독 먼저 걸어두기 (백그라운드 함수가 쓰면 즉시 감지)
      const storyRef = ref(db, `users/${uid}/english/reviewStory/${today}`);
      let unsub: (() => void) | null = null;
      const timeout = setTimeout(() => {
        unsub?.();
        setReviewLoading(false);
      }, 90000);

      unsub = onValue(storyRef, snap => {
        if (snap.exists()) {
          clearTimeout(timeout);
          unsub?.();
          setReviewStory(snap.val());
          setReviewLoading(false);
        }
      });

      // 백그라운드 함수 호출 (즉시 202 반환 — 실제 생성은 서버에서 비동기)
      fetch(`${NETLIFY_BASE_URL}/api/review-story-bg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words, uid, token }),
      }).catch(() => {});

    } catch (e) {
      console.warn('review story 로드 실패:', e);
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
      },
      trigger: { type: SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false, channelId: 'study-reminder' },
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

      // Daily sentences are not saved to reviewSentences — review tab loads from reviewPool directly

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
      {(() => {
        const GAME_KEYS = ['english_word_match', 'english_crossword', 'english_scramble', 'english_sentence'];
        const gamesAllDone = GAME_KEYS.every(k => completionToday[k]);
        const allWordsRead = !loading && words.length > 0 && words.every(w => w.isRead);
        const activeQuizzes = quizzes.filter(q => !skipSet.has(q.wordId));
        const quizAllDone = activeQuizzes.length > 0 && activeQuizzes.every(q => q.answered);

        const tabDefs: { key: ViewType; label: string; unlocked: boolean; hint: string; onPress: () => void }[] = [
          { key: 'game',   label: '게임',    unlocked: true,          hint: '',                          onPress: () => setView('game') },
          { key: 'words',  label: '단어장',  unlocked: gamesAllDone,  hint: '게임을 모두 완료하세요',      onPress: () => setView('words') },
          { key: 'quiz',   label: '퀴즈',    unlocked: allWordsRead,  hint: '단어장을 모두 읽으세요',      onPress: () => setView('quiz') },
          { key: 'review', label: '문장복습', unlocked: quizAllDone,   hint: '퀴즈를 먼저 완료하세요',     onPress: () => { setView('review'); loadReviewStory(); } },
          { key: 'stats',  label: '통계',    unlocked: true,          hint: '',                          onPress: () => setView('stats') },
        ];

        return (
          <View style={styles.tabButtons}>
            {tabDefs.map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, view === tab.key && styles.tabButtonActive, !tab.unlocked && styles.tabButtonLocked]}
                onPress={() => {
                  if (!tab.unlocked) { ToastAndroid.show(tab.hint, ToastAndroid.SHORT); return; }
                  tab.onPress();
                }}
                activeOpacity={tab.unlocked ? 0.7 : 1}
              >
                <Text style={[styles.tabButtonText, view === tab.key && styles.tabButtonTextActive, !tab.unlocked && styles.tabButtonTextLocked]}>
                  {tab.unlocked ? tab.label : `🔒 ${tab.label}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })()}

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
            <TouchableOpacity
              style={[styles.filterButton, playAllWordId !== null && styles.filterButtonActive]}
              onPress={playAllWords}
            >
              <Text style={[styles.filterButtonText, playAllWordId !== null && styles.filterButtonTextActive]}>
                {playAllWordId !== null ? '⏹ 정지' : '▶ 모두 재생'}
              </Text>
            </TouchableOpacity>
          </View>
          <WordsView
            words={hideReadWords ? words.filter(w => !w.isRead) : words}
            onToggleRead={toggleWordRead}
            onSkip={skipWord}
            skipSet={skipSet}
            onRefresh={refreshFromNetlify}
            refreshing={refreshing}
            playAllWordId={playAllWordId}
            allWordsRead={!loading && words.length > 0 && words.every(w => w.isRead)}
            onComplete={() => setView('quiz')}
            wordRatings={wordRatings}
            onRate={rateWord}
          />
        </View>
      )}
      {view === 'review' && <StoryReviewView story={reviewStory} loading={reviewLoading} uid={uid} onReload={loadReviewStory} onComplete={() => {
        if (reviewWordIds.length > 0) {
          const db = getDatabase(getFirebaseApp());
          const today = getKSTDateString();
          reviewWordIds.forEach(wordId => {
            update(userRef(uid, `english/reviewPool/${wordId}`), {
              count: increment(1),
              lastReviewedDate: today,
            }).catch(() => {});
          });
        }
        ToastAndroid.show('문장복습 완료! 📖 +1', ToastAndroid.SHORT);
      }} />}
      {view === 'stats' && <ReviewPoolView uid={uid} />}
      {view === 'quiz' && <QuizView quizzes={quizzes.filter(q => !skipSet.has(q.wordId))} words={words} onAnswer={answerQuiz} onComplete={() => {
        const active = quizzes.filter(q => !skipSet.has(q.wordId));
        const correct = active.filter(q => q.correct_answer).length;
        ToastAndroid.show(`완료! ${correct}/${active.length} 정답 저장됨`, ToastAndroid.SHORT);
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

// Shared audio coordination across all WordCard instances
let _wcPlayId = 0;
let _wcSound: Audio.Sound | null = null;

// Memoized component to prevent unnecessary re-renders
const WordsView = React.memo(({ words, onToggleRead, onSkip, skipSet, onRefresh, refreshing, playAllWordId, allWordsRead, onComplete, wordRatings, onRate }: {
  words: Word[],
  onToggleRead: (id: string) => void,
  onSkip: (id: string) => void,
  skipSet: Set<string>,
  onRefresh: () => void,
  refreshing: boolean,
  playAllWordId: string | null,
  allWordsRead: boolean,
  onComplete: () => void,
  wordRatings: Record<string, number>,
  onRate: (id: string, rating: number) => void,
}) => {
  const footer = (
    <TouchableOpacity
      style={[styles.completeButton, !allWordsRead && styles.completeButtonDim]}
      onPress={onComplete}
    >
      <Text style={styles.completeButtonText}>
        {allWordsRead ? '✅ 완료 — 퀴즈로 이동' : '완료'}
      </Text>
    </TouchableOpacity>
  );

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
          onSkip={onSkip}
          isSkipped={skipSet.has(item.id)}
          isPlayingAll={playAllWordId === item.id}
          currentRating={wordRatings[item.id]}
          onRate={onRate}
        />
      )}
      ListFooterComponent={footer}
    />
  );
});

// Memoized word card component with expand + OpenAI TTS
const WordCard = React.memo(({ word, onToggleRead, onSkip, isSkipped, isPlayingAll, currentRating, onRate }: {
  word: Word,
  onToggleRead: (id: string) => void,
  onSkip: (id: string) => void,
  isSkipped: boolean,
  isPlayingAll?: boolean,
  currentRating?: number,
  onRate: (id: string, rating: number) => void,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [sentenceData, setSentenceData] = useState<ReviewSentence | null>(null);
  const [sentenceLoading, setSentenceLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const sentenceDataRef = React.useRef<ReviewSentence | null>(null);
  const sentenceLoadingRef = React.useRef(false);
  const isPlayingRef = React.useRef(false);
  React.useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  React.useEffect(() => {
    return () => {
      if (isPlayingRef.current) { ++_wcPlayId; }
    };
  }, []);

  const loadSentenceData = useCallback(async () => {
    if (sentenceDataRef.current || sentenceLoadingRef.current) return;
    sentenceLoadingRef.current = true;
    setSentenceLoading(true);
    try {
      const db = getDatabase(getFirebaseApp());
      const key = word.word.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
      const snap = await get(ref(db, `english/sentences/${key}`));
      if (snap.exists()) {
        const data: ReviewSentence = { word: word.word, ...snap.val() };
        sentenceDataRef.current = data;
        setSentenceData(data);
        return;
      }
      // 데이터 없으면 Netlify로 자동 생성
      sentenceLoadingRef.current = false;
      setSentenceLoading(false);
      setGenerating(true);
      try {
        const res = await fetch(`${NETLIFY_BASE_URL}/api/generate-word-sentence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: word.word,
            meaning: word.meaning,
            example_en: word.example_en,
            explanation: word.explanation,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            const generated: ReviewSentence = { word: word.word, ...json.data };
            sentenceDataRef.current = generated;
            setSentenceData(generated);
          }
        }
      } catch {}
      setGenerating(false);
      return;
    } catch {} finally {
      sentenceLoadingRef.current = false;
      setSentenceLoading(false);
    }
  }, [word.word, word.meaning, word.example_en, word.explanation]);

  // 마운트 시 즉시 로드
  React.useEffect(() => { loadSentenceData(); }, [loadSentenceData]);

  const playWordTts = useCallback(async () => {
    const prevId = ++_wcPlayId;
    if (_wcSound) {
      await _wcSound.stopAsync().catch(() => {});
      await _wcSound.unloadAsync().catch(() => {});
      _wcSound = null;
    }
    Speech.stop();
    if (isPlayingRef.current) { isPlayingRef.current = false; setIsPlaying(false); return; }
    isPlayingRef.current = true;
    setIsPlaying(true);
    loadSentenceData();

    try { await Audio.setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true }); } catch {}

    // sentenceData 최대 3초 대기
    if (!sentenceDataRef.current && sentenceLoadingRef.current) {
      let waited = 0;
      while (sentenceLoadingRef.current && waited < 3000) {
        if (_wcPlayId !== prevId) { isPlayingRef.current = false; setIsPlaying(false); return; }
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
      }
    }
    if (_wcPlayId !== prevId) { isPlayingRef.current = false; setIsPlaying(false); return; }

    const makeTtsUrl = (text: string) =>
      `${NETLIFY_BASE_URL}/api/toefl-tts?speaker=Professor&text=${encodeURIComponent(text)}`;
    const loadSnd = (text: string) => {
      const p = Audio.Sound.createAsync({ uri: makeTtsUrl(text) }, { shouldPlay: false }).catch(() => null);
      return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), 15000))])
        .then(r => { if (!r) p.then(s => s?.sound.unloadAsync().catch(() => {})); return r; });
    };
    const playSnd = async (result: { sound: Audio.Sound } | null): Promise<void> => {
      if (!result) return;
      if (_wcPlayId !== prevId) { result.sound.unloadAsync().catch(() => {}); return; }
      _wcSound = result.sound;
      const played = await result.sound.playAsync().then(() => true).catch(() => false);
      if (!played || _wcPlayId !== prevId) {
        await result.sound.unloadAsync().catch(() => {});
        if (_wcSound === result.sound) _wcSound = null;
        return;
      }
      let natural = false;
      await Promise.race([
        new Promise<void>(resolve => {
          result.sound.setOnPlaybackStatusUpdate(status => {
            if (status.isLoaded && status.didJustFinish) { natural = true; result.sound.setOnPlaybackStatusUpdate(null); resolve(); }
            else if (!status.isLoaded) { result.sound.setOnPlaybackStatusUpdate(null); resolve(); }
            else if (_wcPlayId !== prevId) { result.sound.setOnPlaybackStatusUpdate(null); resolve(); }
          });
        }),
        new Promise<void>(r => setTimeout(r, 300000)),
      ]);
      if (natural) await new Promise(r => setTimeout(r, 500));
      await result.sound.unloadAsync().catch(() => {});
      if (_wcSound === result.sound) _wcSound = null;
    };

    const sd = sentenceDataRef.current;

    // EN TTS: word × 1 + example_en + ex.en (영어만 모아서 1번 호출)
    const enParts = [
      `${word.word}.`,
      word.example_en,
      ...(sd?.examples?.map(ex => ex.en).filter(Boolean) ?? []),
    ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    await playSnd(await loadSnd(enParts.join(' ')));

    // KO TTS: 상세 데이터 있으면 사용, 없으면 기본 meaning/explanation 읽기
    if (_wcPlayId !== prevId) { isPlayingRef.current = false; setIsPlaying(false); return; }
    if (sd) {
      const koParts = [
        sd.sentence_ko, sd.nuance, sd.context, sd.everyday_usage,
        ...(sd.examples?.map(ex => ex.ko).filter(Boolean) ?? []),
      ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (koParts.length > 0) await playSnd(await loadSnd(koParts.join(' ')));
    } else {
      const fallbackParts = [word.meaning, word.explanation]
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (fallbackParts.length > 0) await playSnd(await loadSnd(fallbackParts.join('. ')));
    }

    if (_wcPlayId === prevId) { isPlayingRef.current = false; setIsPlaying(false); }
  }, [word.word, word.meaning, word.explanation, word.example_en, loadSentenceData]);

  return (
    <TouchableOpacity
      style={[styles.card, word.isRead && styles.cardRead]}
      onPress={() => onToggleRead(word.id)}
      activeOpacity={0.85}
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
            onPress={playWordTts}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.speakerIcon}>{(isPlaying || isPlayingAll) ? '🔊' : '🔈'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.cardHeaderRight}>
          <Text style={styles.updateDate}>{formatDate(word.date)}</Text>
          {isSkipped
            ? <Text style={[styles.readBadge, { color: '#aaa' }]}>skip</Text>
            : <Text style={styles.readBadge}>{word.isRead ? '✓' : '○'}</Text>
          }
        </View>
      </View>
      <View style={styles.ratingRow}>
        <Text style={styles.ratingLabel}>난이도</Text>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity
            key={n}
            style={[styles.ratingBtn, currentRating === n && styles.ratingBtnActive]}
            onPress={(e) => { e.stopPropagation(); onRate(word.id, n); }}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.ratingBtnText, currentRating === n && styles.ratingBtnTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
        {!currentRating && <Text style={styles.ratingHint}>← 이 단어 난이도를 선택해주세요</Text>}
      </View>
      <Text style={styles.meaning}>{word.meaning}</Text>
      <Text style={styles.explanation}>{word.explanation}</Text>
      <Text style={styles.example}>예: {word.example_en}</Text>
      <View style={styles.reviewDetails}>
        {(sentenceLoading || generating) && !sentenceData && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 }}>
            <ActivityIndicator size="small" color="#0095f6" />
            <Text style={{ fontSize: 12, color: '#8e8e8e' }}>{generating ? '설명 생성 중...' : '불러오는 중...'}</Text>
          </View>
        )}
        {sentenceData && (
          <>
            <View style={styles.reviewDetailRow}>
              <Text style={styles.reviewDetailLabel}>💬 뉘앙스</Text>
              <Text style={styles.reviewDetailText}>{sentenceData.nuance}</Text>
            </View>
            <View style={styles.reviewDetailRow}>
              <Text style={styles.reviewDetailLabel}>📍 상황</Text>
              <Text style={styles.reviewDetailText}>{sentenceData.context}</Text>
            </View>
            <View style={styles.reviewDetailRow}>
              <Text style={styles.reviewDetailLabel}>🗣 일상표현</Text>
              <Text style={styles.reviewDetailText}>{sentenceData.everyday_usage}</Text>
            </View>
            {sentenceData.examples && (
              <View style={styles.reviewDetailRow}>
                <Text style={styles.reviewDetailLabel}>📝 추가 예문</Text>
                {sentenceData.examples.map((ex, i) => (
                  <View key={i} style={{ marginTop: 8 }}>
                    <Text style={styles.reviewSentence}>{`${i + 1}. ${ex.en}`}</Text>
                    <Text style={styles.reviewSentenceKo}>{ex.ko}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <TouchableOpacity
          style={[styles.googleSearchBtn, { flex: 1 }]}
          onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(word.word + ' 뜻')}&hl=ko&gl=KR&lr=lang_ko`)}
        >
          <Text style={styles.googleSearchBtnText}>🔍 구글 검색</Text>
        </TouchableOpacity>
        {!isSkipped && !word.isRead && (
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={(e) => { e.stopPropagation(); onSkip(word.id); }}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

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

const StoryReviewView = React.memo(({ story, loading, uid, onReload, onComplete }: { story: ReviewStory | null, loading: boolean, uid: string, onReload: () => void, onComplete: () => void }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = React.useRef(false);
  React.useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  React.useEffect(() => {
    return () => {
      if (isPlayingRef.current) { ++_wcPlayId; Speech.stop(); }
      if (_wcSound) { _wcSound.stopAsync().catch(() => {}); _wcSound.unloadAsync().catch(() => {}); _wcSound = null; }
    };
  }, []);

  const playParagraph = useCallback(async () => {
    if (!story?.sentences?.length) return;
    if (isPlayingRef.current) {
      ++_wcPlayId; Speech.stop();
      if (_wcSound) { await _wcSound.stopAsync().catch(() => {}); await _wcSound.unloadAsync().catch(() => {}); _wcSound = null; }
      isPlayingRef.current = false; setIsPlaying(false); return;
    }
    const myId = ++_wcPlayId;
    isPlayingRef.current = true; setIsPlaying(true);
    try {
      await Audio.setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true });
      const plain = story.sentences.map(s => s.en.replace(/\*\*(.+?)\*\*/g, '$1')).join(' ');
      const url = `${NETLIFY_BASE_URL}/api/toefl-tts?speaker=Professor&text=${encodeURIComponent(plain)}`;
      const result = await Promise.race([
        Audio.Sound.createAsync({ uri: url }, { shouldPlay: false }).catch(() => null),
        new Promise<null>(r => setTimeout(() => r(null), 15000)),
      ]);
      if (!result || _wcPlayId !== myId) return;
      _wcSound = (result as any).sound;
      await (result as any).sound.playAsync().catch(() => {});
      await new Promise<void>(resolve => {
        (result as any).sound.setOnPlaybackStatusUpdate((s: any) => {
          if ((s.isLoaded && s.didJustFinish) || !s.isLoaded || _wcPlayId !== myId) {
            (result as any).sound.setOnPlaybackStatusUpdate(null); resolve();
          }
        });
      });
      await (result as any).sound.unloadAsync().catch(() => {});
      if (_wcSound === (result as any).sound) _wcSound = null;
    } finally {
      if (_wcPlayId === myId) { isPlayingRef.current = false; setIsPlaying(false); }
    }
  }, [story?.sentences]);

  if (loading) {
    return (
      <View style={styles.reviewEmpty}>
        <ActivityIndicator size="large" color="#0095f6" />
        <Text style={[styles.reviewEmptyText, { marginTop: 12 }]}>스토리 생성 중... (20~40초)</Text>
      </View>
    );
  }

  if (!story) {
    return (
      <View style={styles.reviewEmpty}>
        <Text style={styles.reviewEmptyText}>복습할 단어가 없어요.{'\n'}단어장에서 단어를 읽음 처리하면 여기에 나타나요.</Text>
        <TouchableOpacity style={[styles.filterButton, { marginTop: 16 }]} onPress={onReload}>
          <Text style={styles.filterButtonText}>↺ 다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderParagraph = (text: string) => {
    const parts = text.split(/\*\*(.+?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <Text key={i} style={styles.reviewWordHighlight}>{part}</Text>
        : <Text key={i}>{part}</Text>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterButton, isPlaying && styles.filterButtonActive]}
          onPress={playParagraph}
        >
          <Text style={[styles.filterButtonText, isPlaying && styles.filterButtonTextActive]}>
            {isPlaying ? '⏹ 정지' : '▶ 스토리 듣기'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton} onPress={onReload}>
          <Text style={styles.filterButtonText}>↺ 새 스토리</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}>
        {/* 문장별 영어 + 해석 */}
        {story.sentences.map((s, i) => (
          <View key={i} style={styles.storyCard}>
            <Text style={styles.storyParagraph}>{renderParagraph(s.en)}</Text>
            <View style={styles.storySentenceDivider} />
            <Text style={styles.storyKo}>{s.ko}</Text>
          </View>
        ))}

        {/* 단어 뉘앙스 */}
        <Text style={styles.storyNuanceHeader}>💡 단어 뉘앙스</Text>
        {story.wordNuances.map((n, i) => (
          <View key={i} style={styles.nuanceCard}>
            <View style={styles.nuanceWordRow}>
              <Text style={styles.nuanceWord}>{n.word}</Text>
              <Text style={styles.nuanceMeaning}>{n.meaning}</Text>
            </View>
            <Text style={styles.nuanceText}>{n.nuance}</Text>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity
        style={styles.completeButton}
        onPress={() => {
          const today = getKSTDateString();
          const db = getDatabase(getFirebaseApp());
          dbSet(userRef(uid, `completion/english_review/${today}`), {
            done: true, count: story.wordNuances.length, ts: Date.now(),
          }).catch(() => {});
          onComplete();
        }}
      >
        <Text style={styles.completeButtonText}>✅ 문장복습 완료</Text>
      </TouchableOpacity>
    </View>
  );
});

interface PoolWord { id: string; word: string; meaning: string; count: number; }

const POOL_SNAPSHOT_KEY = 'reviewPool_snapshot';
const POOL_SNAPSHOT_DATE_KEY = 'reviewPool_snapshot_date';

function getKSTDateStr(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

const ReviewPoolView = React.memo(({ uid }: { uid: string }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [poolWords, setPoolWords] = useState<PoolWord[]>([]);
  const [search, setSearch] = useState('');
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  const poolWordsRef = React.useRef<PoolWord[]>([]);
  const lastSeenRef = React.useRef<Record<string, number>>({});

  useEffect(() => {
    if (!uid) return;
    let unsub: (() => void) | null = null;

    AsyncStorage.multiGet([`${POOL_SNAPSHOT_KEY}_${uid}`, `${POOL_SNAPSHOT_DATE_KEY}_${uid}`]).then(results => {
      const raw = results[0][1];
      const savedDate = results[1][1];
      const today = getKSTDateStr();
      // 날짜가 오늘과 같을 때만 스냅샷 사용 — 다르면 첫 Firebase 로드 시 현재 count를 기준으로 설정
      const isNewDay = !raw || savedDate !== today;
      if (!isNewDay) {
        lastSeenRef.current = JSON.parse(raw!);
      }

      const db = getDatabase(getFirebaseApp());
      let firstLoad = isNewDay;
      unsub = onValue(ref(db, `users/${uid}/english/reviewPool`), snap => {
        if (!snap.exists()) { setLoading(false); setRefreshing(false); return; }
        const vals: PoolWord[] = Object.entries(snap.val()).map(([id, v]: [string, any]) => ({
          id,
          word: v.word ?? '',
          meaning: v.meaning ?? '',
          count: v.count ?? 0,
        }));
        vals.sort((a, b) => a.count - b.count);

        if (firstLoad) {
          // 새 날 첫 로드: 현재 count를 기준점으로 저장 → delta = 0 (아직 복습 안 함)
          firstLoad = false;
          const snapshot: Record<string, number> = {};
          vals.forEach(w => { snapshot[w.id] = w.count; });
          lastSeenRef.current = snapshot;
          AsyncStorage.multiSet([
            [`${POOL_SNAPSHOT_KEY}_${uid}`, JSON.stringify(snapshot)],
            [`${POOL_SNAPSHOT_DATE_KEY}_${uid}`, today],
          ]);
          setDeltas({});
        } else {
          const newDeltas: Record<string, number> = {};
          vals.forEach(w => {
            const prev = lastSeenRef.current[w.id] ?? 0;
            if (w.count > prev) newDeltas[w.id] = w.count - prev;
          });
          setDeltas(newDeltas);
        }

        poolWordsRef.current = vals;
        setPoolWords(vals);
        setLoading(false);
        setRefreshing(false);
      });
    });

    return () => {
      if (unsub) unsub();
      const snapshot: Record<string, number> = {};
      poolWordsRef.current.forEach(w => { snapshot[w.id] = w.count; });
      if (Object.keys(snapshot).length > 0) {
        const today = getKSTDateStr();
        AsyncStorage.multiSet([
          [`${POOL_SNAPSHOT_KEY}_${uid}`, JSON.stringify(snapshot)],
          [`${POOL_SNAPSHOT_DATE_KEY}_${uid}`, today],
        ]);
      }
    };
  }, [uid]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const snapshot: Record<string, number> = {};
    poolWordsRef.current.forEach(w => { snapshot[w.id] = w.count; });
    lastSeenRef.current = snapshot;
    const today = getKSTDateStr();
    AsyncStorage.multiSet([
      [`${POOL_SNAPSHOT_KEY}_${uid}`, JSON.stringify(snapshot)],
      [`${POOL_SNAPSHOT_DATE_KEY}_${uid}`, today],
    ]);
    setDeltas({});
    setTimeout(() => setRefreshing(false), 400);
  }, [uid]);

  const filteredWords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return poolWords;
    return poolWords.filter(w =>
      w.word.toLowerCase().includes(q) || w.meaning.includes(search.trim())
    );
  }, [poolWords, search]);

  if (loading) {
    return (
      <View style={styles.statsContent}>
        <ActivityIndicator size="large" color="#0095f6" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (poolWords.length === 0) {
    return (
      <View style={[styles.statsContent, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
        <Text style={{ fontSize: 14, color: '#8e8e8e' }}>reviewPool에 단어가 없습니다</Text>
      </View>
    );
  }

  const active = poolWords.filter(w => w.count < 10);
  const graduated = poolWords.filter(w => w.count >= 10);
  const totalDelta = Object.values(deltas).reduce((a, b) => a + b, 0);

  const renderWord = ({ item }: { item: PoolWord }) => {
    const pct = Math.min(item.count / 10, 1);
    const isGraduated = item.count >= 10;
    const delta = deltas[item.id] ?? 0;
    return (
      <View style={styles.poolRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.poolWord}>{item.word || '(단어 없음)'}</Text>
          <Text style={styles.poolMeaning}>{item.meaning}</Text>
        </View>
        <View style={styles.poolCountCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
            <Text style={[styles.poolCount, isGraduated && styles.poolCountGraduated]}>
              {item.count}/10
            </Text>
            {delta > 0 && <Text style={styles.poolDelta}>+{delta}</Text>}
          </View>
          <View style={styles.poolBar}>
            <View style={[styles.poolBarFill, { width: `${pct * 100}%` as any }, isGraduated && styles.poolBarGraduated]} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={filteredWords}
      keyExtractor={item => item.id}
      renderItem={renderWord}
      contentContainerStyle={{ paddingVertical: 8, paddingBottom: 80 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#0095f6']}
        />
      }
      ListHeaderComponent={
        <View>
          <TextInput
            style={styles.poolSearchInput}
            placeholder="단어 검색..."
            placeholderTextColor="#aaa"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
          <Text style={styles.poolHeader}>
            복습 중 {active.length}개 · 졸업 {graduated.length}개
            {search.trim() ? ` · 검색결과 ${filteredWords.length}개` : ''}
            {totalDelta > 0 ? `  🟢 오늘 +${totalDelta}` : ''}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <Text style={{ fontSize: 14, color: '#8e8e8e' }}>'{search}' 검색 결과 없음</Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 16 }} />}
    />
  );
});

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
  tabButtonLocked: {
    opacity: 0.4,
  },
  tabButtonTextLocked: {
    color: '#aaa',
    fontSize: 10,
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
  skipBtn: {
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
    alignSelf: 'flex-start',
  },
  skipBtnText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  storyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  storyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  storyParagraph: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 24,
  },
  storySentenceDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  storyKo: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 22,
  },
  storyNuanceHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
    marginTop: 4,
  },
  nuanceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nuanceWordRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
  },
  nuanceWord: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0095f6',
  },
  nuanceMeaning: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  nuanceText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  ratingLabel: {
    fontSize: 11,
    color: '#8e8e8e',
    marginRight: 2,
  },
  ratingBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  ratingBtnActive: {
    borderColor: '#0095f6',
    backgroundColor: '#0095f6',
  },
  ratingBtnText: {
    fontSize: 11,
    color: '#8e8e8e',
  },
  ratingBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  ratingHint: {
    fontSize: 10,
    color: '#c0c0c0',
    marginLeft: 2,
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
  poolSearchInput: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    fontSize: 14,
    color: '#262626',
  },
  poolHeader: {
    fontSize: 12,
    color: '#8e8e8e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontWeight: '600',
  },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  poolWord: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 2,
  },
  poolMeaning: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  poolCountCol: {
    alignItems: 'flex-end',
    minWidth: 56,
  },
  poolCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 4,
  },
  poolCountGraduated: {
    color: '#16a34a',
  },
  poolDelta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  poolBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e5e5',
    overflow: 'hidden',
  },
  poolBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#0095f6',
  },
  poolBarGraduated: {
    backgroundColor: '#16a34a',
  },
});
