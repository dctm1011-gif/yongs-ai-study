import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, Text, ActivityIndicator, TouchableOpacity, AsyncStorage, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CACHE_KEY = 'english_data_cache';
const CACHE_TIMESTAMP_KEY = 'english_data_timestamp';
const CACHE_DURATION = 60 * 60 * 1000; // 1시간

export default function EnglishScreen() {
  const [words, setWords] = useState([]);
  const [quiz, setQuiz] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'words' | 'quiz'>('words');

  useEffect(() => {
    loadEnglishData();
    // 백그라운드에서 새 데이터 확인
    checkForUpdates();
  }, []);

  const loadEnglishData = async () => {
    try {
      setLoading(true);

      // 1. localStorage에서 캐시 확인
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      const timestamp = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);
      const now = Date.now();

      if (cached && timestamp) {
        const cachedTime = parseInt(timestamp, 10);
        const isCacheValid = now - cachedTime < CACHE_DURATION;

        if (isCacheValid) {
          // 캐시가 유효 → 즉시 사용 (< 100ms)
          const data = JSON.parse(cached);
          setWords(data.words);
          setQuiz(data.quiz);
          setLoading(false);
          return;
        }
      }

      // 2. 캐시 없거나 만료됨 → Netlify에서 가져오기
      await fetchAndCacheData();
    } catch (error) {
      console.error('Failed to load english data:', error);
      setLoading(false);
    }
  };

  const fetchAndCacheData = async () => {
    try {
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/english/index.html');
      const html = await response.text();

      const wordsMatch = html.match(/const WORDS = (\[[\s\S]*?\]);/);
      const quizMatch = html.match(/const QUIZ = (\[[\s\S]*?\]);/);

      if (wordsMatch && quizMatch) {
        const wordsData = JSON.parse(wordsMatch[1]);
        const quizData = JSON.parse(quizMatch[1]);

        const data = { words: wordsData, quiz: quizData };

        // localStorage에 저장
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

        setWords(wordsData);
        setQuiz(quizData);
      }
    } catch (error) {
      console.error('Failed to fetch english data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkForUpdates = async () => {
    // 백그라운드에서 새 데이터 확인 (사용자 경험 방해 없음)
    try {
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/english/index.html');
      const html = await response.text();
      const wordsMatch = html.match(/const WORDS = (\[[\s\S]*?\]);/);
      const quizMatch = html.match(/const QUIZ = (\[[\s\S]*?\]);/);

      if (wordsMatch && quizMatch) {
        const wordsData = JSON.parse(wordsMatch[1]);
        const quizData = JSON.parse(quizMatch[1]);
        const data = { words: wordsData, quiz: quizData };

        // 캐시 업데이트
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      }
    } catch (error) {
      // 백그라운드 오류는 무시
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📚 영어공부</Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, currentTab === 'words' && styles.tabBtnActive]}
          onPress={() => setCurrentTab('words')}
        >
          <Text style={[styles.tabText, currentTab === 'words' && styles.tabTextActive]}>
            단어 ({words.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, currentTab === 'quiz' && styles.tabBtnActive]}
          onPress={() => setCurrentTab('quiz')}
        >
          <Text style={[styles.tabText, currentTab === 'quiz' && styles.tabTextActive]}>
            퀴즈 ({quiz.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {currentTab === 'words' ? (
          <WordsList words={words} />
        ) : (
          <QuizList quiz={quiz} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WordsList({ words }: { words: any[] }) {
  return (
    <View>
      {words.map((word, idx) => (
        <View key={idx} style={styles.card}>
          <View style={styles.wordHeader}>
            <Text style={styles.wordText}>{word.word}</Text>
            <Text style={styles.pos}>{word.part_of_speech}</Text>
          </View>
          <Text style={styles.meaning}>{word.meaning_ko}</Text>
          <Text style={styles.explanation}>{word.explanation}</Text>
          <View style={styles.exampleBox}>
            <Text style={styles.exampleEn}>{word.example_from_convo}</Text>
            <Text style={styles.exampleKo}>{word.example_ko}</Text>
          </View>
          <Text style={styles.tip}>💡 {word.tip}</Text>
        </View>
      ))}
    </View>
  );
}

function QuizList({ quiz }: { quiz: any[] }) {
  const [answered, setAnswered] = useState(new Set<number>());
  const [score, setScore] = useState(0);

  const handleAnswer = (qIdx: number, optIdx: number, correct: number) => {
    if (answered.has(qIdx)) return;

    const newAnswered = new Set(answered);
    newAnswered.add(qIdx);
    setAnswered(newAnswered);

    if (optIdx === correct) {
      setScore(score + 1);
    }
  };

  return (
    <View>
      <View style={styles.scoreBox}>
        <Text style={styles.scoreText}>맞춘 개수: {score} / {quiz.length}</Text>
      </View>

      {quiz.map((q, qIdx) => (
        <View key={qIdx} style={styles.quizCard}>
          <Text style={styles.quizQuestion}>{q.question}</Text>
          {q.options?.map((opt: string, optIdx: number) => (
            <TouchableOpacity
              key={optIdx}
              style={[
                styles.optBtn,
                answered.has(qIdx) &&
                  optIdx === q.answer &&
                  styles.optBtnCorrect,
                answered.has(qIdx) &&
                  optIdx !== q.answer &&
                  styles.optBtnWrong,
              ]}
              onPress={() => handleAnswer(qIdx, optIdx, q.answer)}
              disabled={answered.has(qIdx)}
            >
              <Text style={styles.optText}>{opt}</Text>
            </TouchableOpacity>
          ))}
          {answered.has(qIdx) && (
            <Text style={styles.explanation}>{q.explanation}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 16,
    backgroundColor: '#0ea5e9',
    paddingVertical: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#e9e9e7',
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingVertical: 12,
    marginRight: 20,
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#0ea5e9',
    marginBottom: -2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9b9a97',
  },
  tabTextActive: {
    color: '#37352f',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  wordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  wordText: {
    fontSize: 22,
    fontWeight: '700',
  },
  pos: {
    fontSize: 11,
    backgroundColor: '#f1f0ef',
    color: '#9b9a97',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  meaning: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0ea5e9',
    marginBottom: 8,
  },
  explanation: {
    fontSize: 14,
    color: '#37352f',
    marginBottom: 12,
    lineHeight: 20,
  },
  exampleBox: {
    backgroundColor: '#f7f6f3',
    borderLeftWidth: 3,
    borderLeftColor: '#0ea5e9',
    padding: 12,
    marginBottom: 12,
    borderRadius: 4,
  },
  exampleEn: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  exampleKo: {
    fontSize: 12,
    color: '#9b9a97',
  },
  tip: {
    fontSize: 13,
    color: '#92400e',
  },
  scoreBox: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  quizCard: {
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  quizQuestion: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  optBtn: {
    backgroundColor: '#f7f6f3',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  optBtnCorrect: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  optBtnWrong: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  optText: {
    fontSize: 14,
    color: '#37352f',
  },
});
