import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  useColorScheme,
  AsyncStorage,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CACHE_KEY           = 'english_data_cache';
const CACHE_TIMESTAMP_KEY = 'english_data_timestamp';
const CACHE_DURATION      = 60 * 60 * 1000;

// ─── colour tokens ────────────────────────────────────────────────────────────
const C = {
  primary:     '#0ea5e9',
  primaryDark: '#0284c7',
  primaryLight:'#e0f2fe',
  accent:      '#fbbf24',
  success:     '#22c55e',
  successLight:'#f0fdf4',
  error:       '#ef4444',
  errorLight:  '#fef2f2',
  surface:     '#fafaf9',
  border:      '#e9e9e7',
  text:        '#111827',
  textSec:     '#6b7280',
  textMuted:   '#9b9a97',
  white:       '#ffffff',
  // dark
  darkBg:      '#111827',
  darkSurface: '#1f2937',
  darkBorder:  '#374151',
  darkText:    '#f9fafb',
  darkTextSec: '#d1d5db',
};

// ─── skeleton loader ──────────────────────────────────────────────────────────
function SkeletonBlock({ width = '100%', height = 16, radius = 8, style = {} }: any) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: '#d1d5db', opacity },
        style,
      ]}
    />
  );
}

function SkeletonCard() {
  return (
    <View style={sk.card}>
      <View style={sk.row}>
        <SkeletonBlock width="40%" height={22} />
        <SkeletonBlock width="10%" height={18} radius={4} />
      </View>
      <SkeletonBlock width="55%" height={18} style={{ marginBottom: 8 }} />
      <SkeletonBlock width="100%" height={14} style={{ marginBottom: 4 }} />
      <SkeletonBlock width="80%"  height={14} style={{ marginBottom: 12 }} />
      <SkeletonBlock width="100%" height={52} radius={6} style={{ marginBottom: 12 }} />
      <SkeletonBlock width="70%"  height={13} />
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 14, padding: 16, marginBottom: 16,
    gap: 8,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 4 },
});

// ─── word card ────────────────────────────────────────────────────────────────
function WordCard({ word, index }: { word: any; index: number }) {
  const isDark = useColorScheme() === 'dark';
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const delay = Math.min(index * 80, 600);
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slideIn, { toValue: 0, duration: 400, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideIn }] }}>
      <View style={[wStyles.card, isDark && { backgroundColor: C.darkSurface, borderColor: C.darkBorder }]}>
        <View style={wStyles.header}>
          <Text style={[wStyles.word, isDark && { color: C.darkText }]}>{word.word}</Text>
          {word.part_of_speech ? (
            <View style={wStyles.posBadge}>
              <Text style={wStyles.posText}>{word.part_of_speech}</Text>
            </View>
          ) : null}
        </View>
        <Text style={wStyles.meaning}>{word.meaning_ko}</Text>
        {word.explanation ? (
          <Text style={[wStyles.explanation, isDark && { color: C.darkTextSec }]}>{word.explanation}</Text>
        ) : null}
        {word.example_from_convo ? (
          <View style={wStyles.exampleBox}>
            <Text style={wStyles.exampleLabel}>예문</Text>
            <Text style={wStyles.exampleEn}>{word.example_from_convo}</Text>
            {word.example_ko ? (
              <Text style={wStyles.exampleKo}>{word.example_ko}</Text>
            ) : null}
          </View>
        ) : null}
        {word.tip ? (
          <View style={wStyles.tipBox}>
            <Text style={wStyles.tipText}>💡 {word.tip}</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const wStyles = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 14, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  word:        { fontSize: 24, fontWeight: '800', color: C.text },
  posBadge:    { backgroundColor: C.primaryLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  posText:     { fontSize: 11, fontWeight: '700', color: C.primary },
  meaning:     { fontSize: 18, fontWeight: '700', color: C.primary, marginBottom: 6 },
  explanation: { fontSize: 14, color: C.textSec, lineHeight: 21, marginBottom: 10 },
  exampleBox:  { backgroundColor: '#f0f9ff', borderLeftWidth: 3, borderLeftColor: C.primary, borderRadius: 6, padding: 12, marginBottom: 10 },
  exampleLabel:{ fontSize: 10, fontWeight: '700', color: C.primary, letterSpacing: 0.8, marginBottom: 4 },
  exampleEn:   { fontSize: 14, fontStyle: 'italic', color: C.text, lineHeight: 20, marginBottom: 4 },
  exampleKo:   { fontSize: 12, color: C.textSec },
  tipBox:      { backgroundColor: '#fffbeb', borderRadius: 8, padding: 10 },
  tipText:     { fontSize: 13, color: '#92400e', lineHeight: 18 },
});

// ─── quiz ─────────────────────────────────────────────────────────────────────
function QuizList({ quiz }: { quiz: any[] }) {
  const isDark = useColorScheme() === 'dark';
  const [answered, setAnswered] = useState<Record<number, number>>({});
  const score = Object.entries(answered).filter(([qi, ai]) => quiz[Number(qi)]?.answer === ai).length;
  const allDone = Object.keys(answered).length === quiz.length && quiz.length > 0;

  const handleAnswer = (qIdx: number, optIdx: number) => {
    if (answered[qIdx] !== undefined) return;
    setAnswered((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  if (quiz.length === 0) {
    return (
      <View style={qStyles.empty}>
        <Text style={qStyles.emptyEmoji}>📝</Text>
        <Text style={[qStyles.emptyText, isDark && { color: C.darkTextSec }]}>아직 퀴즈가 없어요</Text>
      </View>
    );
  }

  return (
    <View>
      {/* score banner */}
      <View style={[qStyles.scoreBanner, allDone && qStyles.scoreBannerDone]}>
        <Text style={qStyles.scoreLabel}>점수</Text>
        <Text style={qStyles.scoreNum}>{score} <Text style={qStyles.scoreOf}>/ {quiz.length}</Text></Text>
        {allDone && <Text style={qStyles.scoreDone}>완료! 🎉</Text>}
      </View>

      {quiz.map((q, qIdx) => {
        const userAns = answered[qIdx];
        const done    = userAns !== undefined;
        return (
          <View key={qIdx} style={[qStyles.card, isDark && { backgroundColor: C.darkSurface, borderColor: C.darkBorder }]}>
            <Text style={qStyles.qNum}>Q{qIdx + 1}</Text>
            <Text style={[qStyles.question, isDark && { color: C.darkText }]}>{q.question}</Text>
            <View style={qStyles.options}>
              {q.options?.map((opt: string, optIdx: number) => {
                const isCorrect = optIdx === q.answer;
                const isChosen  = optIdx === userAns;
                let optStyle: any[] = [qStyles.optBtn];
                let textStyle: any[] = [qStyles.optText];
                if (done && isCorrect) {
                  optStyle.push(qStyles.optCorrect);
                  textStyle.push(qStyles.optTextCorrect);
                } else if (done && isChosen && !isCorrect) {
                  optStyle.push(qStyles.optWrong);
                  textStyle.push(qStyles.optTextWrong);
                }
                return (
                  <TouchableOpacity
                    key={optIdx}
                    style={optStyle}
                    onPress={() => handleAnswer(qIdx, optIdx)}
                    disabled={done}
                    activeOpacity={0.7}
                  >
                    <View style={qStyles.optInner}>
                      <View style={[qStyles.optCircle, done && isCorrect && qStyles.optCircleCorrect, done && isChosen && !isCorrect && qStyles.optCircleWrong]}>
                        <Text style={qStyles.optCircleText}>{String.fromCharCode(65 + optIdx)}</Text>
                      </View>
                      <Text style={textStyle}>{opt}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {done && q.explanation ? (
              <View style={qStyles.explanBox}>
                <Text style={qStyles.explanText}>{q.explanation}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const qStyles = StyleSheet.create({
  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: C.textSec },

  scoreBanner:     { backgroundColor: C.primaryLight, borderRadius: 14, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreBannerDone: { backgroundColor: '#f0fdf4' },
  scoreLabel: { fontSize: 12, fontWeight: '700', color: C.primary, flex: 1 },
  scoreNum:   { fontSize: 22, fontWeight: '800', color: C.primary },
  scoreOf:    { fontSize: 14, fontWeight: '500', color: C.textSec },
  scoreDone:  { fontSize: 13, fontWeight: '700', color: C.success },

  card:     { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, marginBottom: 14 },
  qNum:     { fontSize: 11, fontWeight: '700', color: C.primary, letterSpacing: 0.8, marginBottom: 6 },
  question: { fontSize: 15, fontWeight: '700', color: C.text, lineHeight: 22, marginBottom: 14 },
  options:  { gap: 8 },
  optBtn:   { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, padding: 12 },
  optCorrect:{ backgroundColor: '#f0fdf4', borderColor: C.success },
  optWrong:  { backgroundColor: C.errorLight, borderColor: C.error },
  optInner:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  optCircleCorrect: { backgroundColor: C.success },
  optCircleWrong:   { backgroundColor: C.error },
  optCircleText:    { fontSize: 12, fontWeight: '700', color: '#fff' },
  optText:          { fontSize: 14, color: C.text, flex: 1, lineHeight: 20 },
  optTextCorrect:   { color: '#166534', fontWeight: '600' },
  optTextWrong:     { color: '#991b1b' },
  explanBox:{ marginTop: 12, backgroundColor: '#fffbeb', borderRadius: 8, padding: 10 },
  explanText:{ fontSize: 13, color: '#92400e', lineHeight: 18 },
});

// ─── main screen ──────────────────────────────────────────────────────────────
export default function EnglishScreen() {
  const isDark = useColorScheme() === 'dark';
  const [words, setWords]         = useState<any[]>([]);
  const [quiz, setQuiz]           = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [currentTab, setCurrentTab] = useState<'words' | 'quiz'>('words');

  useEffect(() => {
    loadEnglishData();
    checkForUpdates();
  }, []);

  const loadEnglishData = async () => {
    try {
      setLoading(true);
      setError(false);
      const cached    = await AsyncStorage.getItem(CACHE_KEY);
      const timestamp = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);
      const now       = Date.now();

      if (cached && timestamp) {
        const cachedTime  = parseInt(timestamp, 10);
        const isCacheValid = now - cachedTime < CACHE_DURATION;
        if (isCacheValid) {
          const data = JSON.parse(cached);
          setWords(data.words ?? []);
          setQuiz(data.quiz ?? []);
          setLoading(false);
          return;
        }
      }
      await fetchAndCacheData();
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  const fetchAndCacheData = async () => {
    try {
      const url = 'https://illustrious-cuchufli-7c4e58.netlify.app/english/index.html';
      console.log('[FETCH] Starting:', url);

      const response = await fetch(url, { timeout: 10000 });
      console.log('[FETCH] Response status:', response.status);

      const html = await response.text();
      console.log('[FETCH] HTML length:', html.length);

      const wordsMatch = html.match(/const WORDS = (\[[\s\S]*?\]);/);
      const quizMatch  = html.match(/const QUIZ = (\[[\s\S]*?\]);/);

      console.log('[PARSE] Words match:', !!wordsMatch, 'Quiz match:', !!quizMatch);

      if (wordsMatch && quizMatch) {
        const wordsData = JSON.parse(wordsMatch[1]);
        const quizData  = JSON.parse(quizMatch[1]);
        const data      = { words: wordsData, quiz: quizData };
        await AsyncStorage.setItem(CACHE_KEY,           JSON.stringify(data));
        await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        setWords(wordsData);
        setQuiz(quizData);
        console.log('[SUCCESS] Data loaded:', wordsData.length, 'words,', quizData.length, 'quizzes');
      } else {
        throw new Error('HTML parsing failed - regex match returned null');
      }
    } catch (err) {
      console.error('[ERROR]', err?.message || err);
      // fallback test data
      const testData = {
        words: [{
          word: 'serendipity', part_of_speech: 'n.',
          meaning_ko: '행운, 우연한 행복',
          explanation: 'The occurrence of events by chance in a happy or beneficial way.',
          example_from_convo: 'It was pure serendipity that we met at the coffee shop.',
          example_ko: '우리가 커피숍에서 만난 것은 순전한 행운이었다.',
          tip: 'SEREN + DIPITY — a happy accident or lucky discovery',
        }],
        quiz: [{
          question: 'What does "serendipity" mean?',
          options: ['Bad luck', 'Happy accident', 'Hard work', 'Waiting'],
          answer: 1,
          explanation: 'Serendipity means a fortunate discovery made by accident.',
        }],
      };
      setWords(testData.words);
      setQuiz(testData.quiz);
    } finally {
      setLoading(false);
    }
  };

  const checkForUpdates = async () => {
    try {
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/english/index.html');
      const html     = await response.text();
      const wordsMatch = html.match(/const WORDS = (\[[\s\S]*?\]);/);
      const quizMatch  = html.match(/const QUIZ = (\[[\s\S]*?\]);/);
      if (wordsMatch && quizMatch) {
        const data = { words: JSON.parse(wordsMatch[1]), quiz: JSON.parse(quizMatch[1]) };
        await AsyncStorage.setItem(CACHE_KEY,           JSON.stringify(data));
        await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      }
    } catch { /* 무시 */ }
  };

  const bg      = isDark ? C.darkBg      : '#f8fafc';
  const surface = isDark ? C.darkSurface : C.white;
  const border  = isDark ? C.darkBorder  : C.border;
  const text    = isDark ? C.darkText    : C.text;
  const textSec = isDark ? C.darkTextSec : C.textSec;

  // ── skeleton loading ──
  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
        <View style={s.header}>
          <Text style={s.headerTitle}>📚 영어 공부</Text>
          <Text style={s.headerSub}>오늘의 단어를 학습해요</Text>
        </View>
        <View style={s.tabBar}>
          {['단어', '퀴즈'].map((t) => (
            <View key={t} style={[s.tabBtn, t === '단어' && s.tabBtnActive]}>
              <Text style={[s.tabText, t === '단어' && s.tabTextActive]}>{t}</Text>
            </View>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── error state ──
  if (error) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
        <View style={s.header}><Text style={s.headerTitle}>📚 영어 공부</Text></View>
        <View style={s.centerState}>
          <Text style={s.stateEmoji}>😅</Text>
          <Text style={[s.stateTitle, { color: text }]}>데이터를 불러오지 못했어요</Text>
          <Text style={[s.stateSub, { color: textSec }]}>네트워크 연결을 확인해 주세요</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadEnglishData}>
            <Text style={s.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      {/* header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>📚 영어 공부</Text>
        <Text style={s.headerSub}>오늘의 단어를 학습해요</Text>
      </View>

      {/* tab bar */}
      <View style={[s.tabBar, { backgroundColor: surface, borderBottomColor: border }]}>
        <TouchableOpacity
          style={[s.tabBtn, currentTab === 'words' && s.tabBtnActive]}
          onPress={() => setCurrentTab('words')}
        >
          <Text style={[s.tabText, currentTab === 'words' && s.tabTextActive]}>단어 ({words.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, currentTab === 'quiz' && s.tabBtnActive]}
          onPress={() => setCurrentTab('quiz')}
        >
          <Text style={[s.tabText, currentTab === 'quiz' && s.tabTextActive]}>퀴즈 ({quiz.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {currentTab === 'words' ? (
          words.length === 0 ? (
            <View style={s.centerState}>
              <Text style={s.stateEmoji}>📖</Text>
              <Text style={[s.stateTitle, { color: text }]}>단어가 아직 없어요</Text>
            </View>
          ) : (
            words.map((word, idx) => <WordCard key={idx} word={word} index={idx} />)
          )
        ) : (
          <QuizList quiz={quiz} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingVertical: 13,
    marginRight: 24,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabBtnActive:  { borderBottomColor: C.primary },
  tabText:       { fontSize: 14, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: C.text },

  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  stateEmoji:  { fontSize: 52, marginBottom: 14 },
  stateTitle:  { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  stateSub:    { fontSize: 13, marginBottom: 24, textAlign: 'center' },
  retryBtn:    { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});
