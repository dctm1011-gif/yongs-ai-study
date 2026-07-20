import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, ToastAndroid } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheManager } from '../utils/CacheManager';
import { performanceMonitor } from '../utils/PerformanceMonitor';
import { getDatabase, ref, onValue, get } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';

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
  answered?: boolean;
  correct_answer?: boolean;
}

type ViewType = 'words' | 'quiz' | 'stats';

const ITEMS_PER_PAGE = 15; // Pagination size for FlatList

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

export default function EnglishScreen() {
  const [view, setView] = useState<ViewType>('words');
  const [words, setWords] = useState<Word[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [stats, setStats] = useState({ totalWords: 0, readWords: 0, quizzesCorrect: 0, quizzesTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [hideReadWords, setHideReadWords] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadStartTime] = useState(Date.now());
  const [isCached, setIsCached] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  const [cacheTimeLeft, setCacheTimeLeft] = useState<string>('캐시 정보 로딩 중...');

  // Performance monitoring
  useEffect(() => {
    performanceMonitor.startTiming('English');
  }, []);

  // Log performance timing
  useEffect(() => {
    if (!loading) {
      const loadTime = Date.now() - loadStartTime;
      performanceMonitor.recordMetric('English', isCached, isCached);
      console.log(`📊 English tab loaded in ${loadTime}ms (cached: ${isCached})`);
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
          console.warn('No English data found in Firebase for today');
          return;
        }

        const netlifyData = mapFirebaseWords(snapshot.val(), today);
        if (netlifyData.length === 0) return;

        console.log(`📚 Loaded ${netlifyData.length} daily English phrases from Firebase`);

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
        const mergedWords = netlifyData.map(w => ({
          ...w,
          isRead: savedReadStatus[w.id] || false,
        }));

        setWords(mergedWords);
        await AsyncStorage.setItem('english_words', JSON.stringify(mergedWords));
        await cacheManager.set('english_words', mergedWords, 24 * 60 * 60 * 1000);
        await saveUpdateTime();

        const generatedQuizzes = generateQuizzes(mergedWords);
        setQuizzes(generatedQuizzes);
        await AsyncStorage.setItem('english_quizzes', JSON.stringify(generatedQuizzes));
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

      if (Array.isArray(parsedWords)) {
        setWords(parsedWords);
        setIsCached(true);

        const savedQuizzes = await AsyncStorage.getItem('english_quizzes');
        const parsedQuizzes = savedQuizzes ? JSON.parse(savedQuizzes) : null;
        setQuizzes(Array.isArray(parsedQuizzes) ? parsedQuizzes : generateQuizzes(parsedWords));
      } else {
        // 캐시가 없거나 예전 형식(배열이 아님)으로 남아있으면 기본값으로 폴백
        const defaultWords = getDefaultWords();
        setWords(defaultWords);
        setQuizzes(generateQuizzes(defaultWords));
      }
    } catch (error) {
      console.error('Failed to load English data:', error);
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

    wordsData.slice(0, 5).forEach((word, idx) => {
      // Meaning quiz
      quizzes.push({
        id: `m${idx}`,
        wordId: word.id,
        type: 'meaning',
        question: `"${word.word}"의 의미는?`,
        options: shuffleArray([word.meaning, '정반대 의미', '비슷한 품사', '다른 언어']),
        correct: word.meaning,
      });

      // Blanks quiz - 더 어려운 선택지 생성
      if (word.example_en) {
        // 같은 품사의 비슷한 단어들을 선택지로 사용
        const distractors = ['absolutely', 'quite', 'somewhat', 'fairly', 'really', 'very', 'somewhat', 'kind of'];
        const filteredDisractors = distractors.filter((d, i) => i < 3).slice(0, 3);
        const blankOptions = shuffleArray([word.word, ...filteredDisractors]);
        quizzes.push({
          id: `b${idx}`,
          wordId: word.id,
          type: 'blanks',
          question: `${word.example_en.replace(word.word, '_______')}`,
          options: blankOptions,
          correct: word.word,
        });
      }
    });

    // 같은 단어의 문제가 연달아 나오지 않도록 섞기
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
  };

  const answerQuiz = (quizId: string, selectedOption: string) => {
    const updated = quizzes.map(q => {
      if (q.id === quizId) {
        const isCorrect = selectedOption === q.correct;
        return { ...q, answered: true, correct_answer: isCorrect };
      }
      return q;
    });
    saveQuizzes(updated);
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

      const generatedQuizzes = generateQuizzes(mergedWords);
      setQuizzes(generatedQuizzes);
      await AsyncStorage.setItem('english_quizzes', JSON.stringify(generatedQuizzes));

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
          <Text style={styles.headerTitle}>📚 영어 단어</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
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
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>📚 영어 단어</Text>
            <Text style={styles.headerSubtitle}>Netlify 실시간 동기화</Text>
          </View>
          <TouchableOpacity onPress={refreshFromNetlify} disabled={refreshing} style={styles.refreshButton}>
            <Text style={styles.refreshIcon}>{refreshing ? '⏳' : '🔄'}</Text>
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
          style={[styles.tabButton, view === 'quiz' && styles.tabButtonActive]}
          onPress={() => setView('quiz')}
        >
          <Text style={[styles.tabButtonText, view === 'quiz' && styles.tabButtonTextActive]}>퀴즈</Text>
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
          />
        </View>
      )}
      {view === 'quiz' && <QuizView quizzes={quizzes} words={words} onAnswer={answerQuiz} />}
      {view === 'stats' && <StatsView stats={stats} />}
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
const WordsView = React.memo(({ words, onToggleRead }: { words: Word[], onToggleRead: (id: string) => void }) => {
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
      renderItem={({ item }) => (
        <WordCard word={item} onToggleRead={onToggleRead} />
      )}
    />
  );
});

// Memoized word card component
const WordCard = React.memo(({ word, onToggleRead }: { word: Word, onToggleRead: (id: string) => void }) => (
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
      </View>
      <View style={styles.cardHeaderRight}>
        <Text style={styles.updateDate}>{formatDate(word.date)}</Text>
        <Text style={styles.readBadge}>{word.isRead ? '✓' : '○'}</Text>
      </View>
    </View>
    <Text style={styles.meaning}>{word.meaning}</Text>
    <Text style={styles.explanation}>{word.explanation}</Text>
    <Text style={styles.example}>예: {word.example_en}</Text>
  </TouchableOpacity>
));

// Memoized quiz view
const QuizView = React.memo(({ quizzes, words, onAnswer }: { quizzes: Quiz[], words: Word[], onAnswer: (id: string, selected: string) => void }) => {
  const getWordName = useCallback((wordId: string) => words.find(w => w.id === wordId)?.word || '', [words]);

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
    />
  );
});

// Memoized quiz card
const QuizCard = React.memo(({ quiz, wordName, onAnswer }: { quiz: Quiz, wordName: string, onAnswer: (id: string, selected: string) => void }) => (
  <View style={styles.quizCard}>
    {quiz.type !== 'blanks' && <Text style={styles.quizWord}>{wordName}</Text>}
    <Text style={styles.quizQuestion}>{quiz.question}</Text>
    <View style={styles.optionsContainer}>
      {quiz.options.map((option, idx) => (
        <TouchableOpacity
          key={idx}
          style={[
            styles.optionButton,
            quiz.answered && option === quiz.correct && styles.optionCorrect,
            quiz.answered && option !== quiz.correct && quiz.correct_answer === false && styles.optionIncorrect,
          ]}
          onPress={() => !quiz.answered && onAnswer(quiz.id, option)}
          disabled={quiz.answered}
        >
          <Text style={styles.optionText}>{option}</Text>
        </TouchableOpacity>
      ))}
    </View>
    {quiz.answered && (
      <Text style={[styles.answerFeedback, quiz.correct_answer ? styles.correct : styles.incorrect]}>
        {quiz.correct_answer ? '✓ 정답!' : '✗ 오답'}
      </Text>
    )}
  </View>
));

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
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#dbeafe',
  },
  headerInfo: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  headerInfoText: {
    fontSize: 10,
    color: '#e0e7ff',
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
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  filterButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterButtonTextActive: {
    color: '#2563eb',
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
    color: '#64748b',
    textAlign: 'center',
  },
  tabButtons: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  tabButtonActive: {
    backgroundColor: '#2563eb',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
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
    borderLeftWidth: 5,
    borderLeftColor: '#2563eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  cardRead: {
    opacity: 0.5,
    backgroundColor: '#f1f5f9',
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
    fontWeight: '700',
    color: '#1e293b',
  },
  pos: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateDate: {
    fontSize: 10,
    color: '#94a3b8',
  },
  readBadge: {
    fontSize: 16,
    color: '#2563eb',
  },
  meaning: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  explanation: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 6,
    lineHeight: 18,
  },
  example: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  quizCard: {
    backgroundColor: '#fff',
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#2563eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  quizWord: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
    marginBottom: 8,
  },
  quizQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    color: '#1e293b',
    fontWeight: '500',
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
  statsContent: {
    padding: 16,
    paddingBottom: 100,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2563eb',
  },
});
