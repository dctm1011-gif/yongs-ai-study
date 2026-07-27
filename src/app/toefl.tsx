import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { performanceMonitor } from '../utils/PerformanceMonitor';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { writeCompletion } from '../utils/writeCompletion';

// Firebase Functions run in UTC; KST (UTC+9) doesn't roll to the next
// calendar day until 09:00 UTC, so a plain UTC date lags KST by a day
// for 9 hours each morning (and the daily reset below would fire 9h late).
// Shift the clock forward before formatting, matching the helper used in
// netlify/functions/*-daily.mjs.
function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

interface TOEFLSection {
  id: 'reading' | 'listening' | 'writing' | 'speaking';
  name: string;
  description: string;
  emoji: string;
  color: string;
  progress: number;
  completed: boolean;
}

type ViewType = 'sections' | 'stats';

const NETLIFY_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';

export default function TOEFLScreen() {
  const defaultSections = [
    {
      id: 'reading' as const,
      name: 'READING',
      description: '지문 읽기 및 이해',
      emoji: '📖',
      color: '#3b82f6',
      progress: 0,
      completed: false,
    },
    {
      id: 'listening' as const,
      name: 'LISTENING',
      description: '강의 및 대화 청취',
      emoji: '🎧',
      color: '#8b5cf6',
      progress: 0,
      completed: false,
    },
    {
      id: 'writing' as const,
      name: 'WRITING',
      description: '에세이 작성',
      emoji: '✍️',
      color: '#ec4899',
      progress: 0,
      completed: false,
    },
    {
      id: 'speaking' as const,
      name: 'SPEAKING',
      description: '말하기 연습',
      emoji: '🎤',
      color: '#f59e0b',
      progress: 0,
      completed: false,
    },
  ];

  const [view, setView] = useState<ViewType>('sections');
  const [sections, setSections] = useState<TOEFLSection[]>(defaultSections);
  const [stats, setStats] = useState({ total: 0, completed: 0, avgProgress: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState<TOEFLSection | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: string]: number }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [speakingPlayingIdx, setSpeakingPlayingIdx] = useState<number | null>(null);
  const [writingAnswers, setWritingAnswers] = useState<{ [key: string]: string }>({});
  const [writingLines, setWritingLines] = useState<string[]>([]);
  const [writingView, setWritingView] = useState<'write' | 'saved'>('write');
  const [savedEssays, setSavedEssays] = useState<{ id: string; content: string; date: string }[]>([]);
  const [revealedParaphrases, setRevealedParaphrases] = useState<boolean[]>([]);
  const [isCached, setIsCached] = useState(false);
  const [loadStartTime] = useState(Date.now());
  const [toeflProblems, setToeflProblems] = useState<any>(null);

  // Performance monitoring
  useEffect(() => {
    performanceMonitor.startTiming('TOEFL');

    // Subscribe to Firebase TOEFL problems
    const db = getDatabase(getFirebaseApp());
    const today = getKSTDateString();
    const problemsRef = ref(db, `toefl/problems/${today}`);

    const unsubscribe = onValue(
      problemsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setToeflProblems(snapshot.val());
          console.log('✅ TOEFL problems loaded from Firebase');
        }
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load TOEFL problems from Firebase:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Log performance timing
  useEffect(() => {
    if (!loading) {
      performanceMonitor.recordMetric('TOEFL', isCached, isCached);
    }
  }, [loading, isCached]);

  useEffect(() => {
    loadData();
    checkAndResetDaily();
  }, []);

  useEffect(() => {
    updateStats();
  }, [sections]);

  const checkAndResetDaily = async () => {
    const lastReset = await AsyncStorage.getItem('toefl_last_reset');
    const today = getKSTDateString();

    if (!lastReset || !lastReset.startsWith(today)) {
      const resetSections = sections.map(s => ({
        ...s,
        progress: 0,
        completed: false,
      }));
      setSections(resetSections);
      await AsyncStorage.setItem('toefl_sections', JSON.stringify(resetSections));
      await AsyncStorage.setItem('toefl_last_reset', `${today}T00:00:00`);
    }
  };

  // TOEFL 문제 자체는 위쪽의 라이브 Firebase 구독이 채워준다.
  // 여기서는 로컬 섹션 진행도(읽음/완료 표시)만 불러온다.
  const loadData = async () => {
    try {
      const savedSections = await AsyncStorage.getItem('toefl_sections');
      if (savedSections) {
        const parsed = JSON.parse(savedSections);
        setSections(Array.isArray(parsed) ? parsed : defaultSections);
      } else {
        setSections(defaultSections);
      }
    } catch (error) {
      console.error('Failed to load TOEFL section progress:', error);
      setSections(defaultSections);
    }
  };

  const refreshFromNetlify = async () => {
    // 기본 섹션으로 새로고침 (진행도는 유지)
    const defaultSections = getDefaultSections();
    const mergedSections = defaultSections.map((s: TOEFLSection) => ({
      ...s,
      progress: sections.find(sec => sec.id === s.id)?.progress || 0,
      completed: sections.find(sec => sec.id === s.id)?.completed || false,
    }));
    setSections(mergedSections);
    await AsyncStorage.setItem('toefl_sections', JSON.stringify(mergedSections));
  };

  const getDefaultSections = (): TOEFLSection[] => [
    {
      id: 'reading',
      name: 'READING',
      description: '지문 읽기 및 이해',
      emoji: '📖',
      color: '#3b82f6',
      progress: 0,
      completed: false,
    },
    {
      id: 'listening',
      name: 'LISTENING',
      description: '강의 및 대화 청취',
      emoji: '🎧',
      color: '#8b5cf6',
      progress: 0,
      completed: false,
    },
    {
      id: 'writing',
      name: 'WRITING',
      description: '에세이 작성',
      emoji: '✍️',
      color: '#ec4899',
      progress: 0,
      completed: false,
    },
    {
      id: 'speaking',
      name: 'SPEAKING',
      description: '말하기 연습',
      emoji: '🎤',
      color: '#f59e0b',
      progress: 0,
      completed: false,
    },
  ];

  const saveSections = async (updatedSections: TOEFLSection[]) => {
    setSections(updatedSections);
    await AsyncStorage.setItem('toefl_sections', JSON.stringify(updatedSections));
  };

  const updateStats = () => {
    const completed = sections.filter(s => s.completed).length;
    const avgProgress = sections.length > 0
      ? Math.round(sections.reduce((sum, s) => sum + s.progress, 0) / sections.length)
      : 0;
    setStats({
      total: sections.length,
      completed,
      avgProgress,
    });
  };

  const toggleCompletion = (sectionId: string) => {
    const current = sections.find(s => s.id === sectionId);
    const nowCompleting = current && !current.completed;
    const updated = sections.map(s =>
      s.id === sectionId
        ? { ...s, completed: !s.completed, progress: !s.completed ? 100 : 0 }
        : s
    );
    saveSections(updated);
    if (nowCompleting) {
      const typeMap: Record<string, Parameters<typeof writeCompletion>[0]> = {
        reading: 'toefl_reading',
        listening: 'toefl_listening',
        writing: 'toefl_writing',
        speaking: 'toefl_speaking',
      };
      const type = typeMap[sectionId];
      if (type) writeCompletion(type);
    }
  };

  const selectAnswer = (questionId: string, optionIndex: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const playAudio = async (text: string) => {
    try {
      setIsPlaying(true);
      await Speech.speak(text, {
        language: 'en',
        rate: 0.9,
        pitch: 1,
      });
    } catch (error) {
      console.error('TTS Error:', error);
    } finally {
      setIsPlaying(false);
    }
  };

  const playSpeakingSentence = async (idx: number, text: string) => {
    try {
      setSpeakingPlayingIdx(idx);
      await Speech.speak(text, { language: 'en', rate: 0.9, pitch: 1 });
    } catch (error) {
      console.error('TTS Error:', error);
    } finally {
      setSpeakingPlayingIdx(null);
    }
  };

  const stopAudio = async () => {
    try {
      await Speech.stop();
      setIsPlaying(false);
      setSpeakingPlayingIdx(null);
    } catch (error) {
      console.error('Stop Error:', error);
    }
  };

  const updateWritingLine = (idx: number, text: string) => {
    const updated = [...writingLines];
    updated[idx] = text;
    setWritingLines(updated);
    setWritingAnswers({ ...writingAnswers, essay1: updated.join('\n') });
  };

  const saveEssay = async () => {
    const content = writingAnswers['essay1']?.trim();
    if (!content) {
      Alert.alert('알림', '따라 쓴 문장을 입력해주세요.');
      return;
    }

    try {
      const essay = {
        id: Date.now().toString(),
        content,
        date: new Date().toLocaleDateString('ko-KR'),
      };

      const updated = [essay, ...savedEssays];
      setSavedEssays(updated);
      await AsyncStorage.setItem('writing_saved', JSON.stringify(updated));
      Alert.alert('✅ 저장됨', '에세이가 임시저장되었습니다.');
      setWritingAnswers({ essay1: '' });
      setWritingLines([]);
    } catch (error) {
      Alert.alert('오류', '저장 실패');
    }
  };

  const loadEssay = (essay: { id: string; content: string; date: string }) => {
    setWritingAnswers({ essay1: essay.content });
    setWritingLines(essay.content.split('\n'));
    setWritingView('write');
  };

  const deleteEssay = async (id: string) => {
    const updated = savedEssays.filter(e => e.id !== id);
    setSavedEssays(updated);
    await AsyncStorage.setItem('writing_saved', JSON.stringify(updated));
  };

  const submitEssay = async () => {
    const content = writingAnswers['essay1']?.trim();
    if (!content) {
      Alert.alert('알림', '에세이를 입력해주세요.');
      return;
    }

    if (content.split(/\s+/).length < 150) {
      Alert.alert('알림', '최소 150단어 이상 작성해주세요.');
      return;
    }

    try {
      const submission = {
        id: Date.now().toString(),
        content,
        submitDate: new Date().toLocaleString('ko-KR'),
        wordCount: content.split(/\s+/).length,
      };

      const existingSubmissions = await AsyncStorage.getItem('writing_submitted');
      const submissions = existingSubmissions ? JSON.parse(existingSubmissions) : [];
      submissions.push(submission);

      await AsyncStorage.setItem('writing_submitted', JSON.stringify(submissions));
      await reflectToEnglishLearning(content);

      Alert.alert('✅ 제출 완료', `제출되었습니다! (${submission.wordCount}단어)`);
      setWritingAnswers({ essay1: '' });
    } catch (error) {
      Alert.alert('오류', '제출 실패');
    }
  };

  const reflectToEnglishLearning = async (essayContent: string) => {
    try {
      const words = essayContent
        .split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z]/g, '').toLowerCase())
        .filter(w => w.length >= 3);

      const wordFreq: { [key: string]: number } = {};
      words.forEach(w => {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      });

      const frequentWords = Object.entries(wordFreq)
        .filter(([_, freq]) => freq >= 2)
        .map(([word]) => word)
        .slice(0, 10);

      if (frequentWords.length > 0) {
        const englishData = await AsyncStorage.getItem('english_words');
        const words_list = englishData ? JSON.parse(englishData) : [];

        const newWords = frequentWords.map(word => ({
          id: `writing_${Date.now()}_${word}`,
          word,
          from: 'TOEFL Writing',
          learned: false,
          priority: 'high',
        }));

        const updated = [...newWords, ...words_list];
        await AsyncStorage.setItem('english_words', JSON.stringify(updated));
        console.log('Writing 단어들이 English 학습에 추가됨:', frequentWords);
      }
    } catch (error) {
      console.warn('English 반영 실패:', error);
    }
  };

  useEffect(() => {
    const loadSavedEssays = async () => {
      try {
        const saved = await AsyncStorage.getItem('writing_saved');
        if (saved) setSavedEssays(JSON.parse(saved));
      } catch (error) {
        console.error('임시저장 로드 실패:', error);
      }
    };
    loadSavedEssays();
  }, []);

  const saveVocabularyToNetlify = async (word: string, meaning: string, emoji: string, section: string) => {
    try {
      const response = await fetch(`${NETLIFY_BASE_URL}/api/toefl-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word,
          meaning_ko: meaning,
          explanation: meaning,
          emoji,
          section,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      console.log(`✅ Saved: ${word} (Total: ${data.total})`);
    } catch (error) {
      console.error('Failed to save vocabulary:', error);
    }
  };

  const renderListeningContent = () => {
    if (!toeflProblems?.listening) {
      return (
        <ScrollView style={styles.contentScroll}>
          <Text style={styles.contentTitle}>🎧 Listening Comprehension</Text>
          <Text style={styles.loadingText}>Loading listening problems...</Text>
        </ScrollView>
      );
    }

    const listening = toeflProblems.listening;
    const scriptText = listening.script || '';

    return (
      <ScrollView style={styles.contentScroll}>
        <Text style={styles.contentTitle}>🎧 Listening Comprehension</Text>

        <View style={styles.audioBox}>
          <Text style={styles.audioLabel}>🎧 대화 스크립트</Text>
          <View style={styles.audioControls}>
            <TouchableOpacity
              style={[styles.audioButton, isPlaying && styles.audioButtonActive]}
              onPress={() => playAudio(scriptText)}
              disabled={isPlaying}
            >
              <Text style={styles.audioButtonText}>▶️ 재생</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.audioButton}
              onPress={stopAudio}
            >
              <Text style={styles.audioButtonText}>⏹️ 정지</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.audioButton}
              onPress={() => {
                stopAudio();
                setTimeout(() => playAudio(scriptText), 200);
              }}
            >
              <Text style={styles.audioButtonText}>🔄 처음부터</Text>
            </TouchableOpacity>
          </View>
          {isPlaying && <Text style={styles.playingIndicator}>🔊 재생 중...</Text>}
        </View>

        {listening.vocabulary && listening.vocabulary.length > 0 && (
          <View style={styles.vocabBox}>
            <Text style={styles.vocabLabel}>👂 들을 때 주의할 단어</Text>
            {listening.vocabulary.map((v: any, idx: number) => (
              <View key={idx} style={styles.vocabItem}>
                <Text style={styles.vocabWord}>{v.word}</Text>
                <Text style={styles.vocabMeaning}>{v.meaning_ko}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.questionsBox}>
          <Text style={styles.questionsLabel}>문제</Text>

          {listening.questions && listening.questions.map((q: any, qIdx: number) => (
            <View key={`l_q${qIdx}`} style={styles.questionBox}>
              <Text style={styles.questionText}>{q.q || `Q${qIdx + 1}`}</Text>
              <View style={styles.optionsContainer}>
                {q.options && q.options.map((option: string, optIdx: number) => (
                  <TouchableOpacity
                    key={optIdx}
                    style={[
                      styles.optionButton,
                      selectedAnswers[`list_q${qIdx}`] === optIdx && styles.optionButtonSelected,
                      selectedAnswers[`list_q${qIdx}`] === optIdx && optIdx === q.answer && styles.optionButtonCorrect,
                    ]}
                    onPress={() => selectAnswer(`list_q${qIdx}`, optIdx)}
                  >
                    <Text style={[
                      styles.optionText,
                      selectedAnswers[`list_q${qIdx}`] === optIdx && styles.optionTextSelected,
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {selectedAnswers[`list_q${qIdx}`] !== undefined && (
                <Text style={selectedAnswers[`list_q${qIdx}`] === q.answer ? styles.correctText : styles.incorrectText}>
                  {selectedAnswers[`list_q${qIdx}`] === q.answer
                    ? '✓ 정답!'
                    : `✗ 틀렸습니다. 정답은 ${String.fromCharCode(65 + q.answer)}입니다.`}
                </Text>
              )}
              {selectedAnswers[`list_q${qIdx}`] !== undefined && q.explanation && (
                <Text style={styles.explanationText}>{q.explanation}</Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderWritingContent = () => {
    const sentences: { original: string; paraphrase: string; tip: string }[] =
      toeflProblems?.writing?.sentences || [];

    const toggleReveal = (idx: number) => {
      setRevealedParaphrases(prev => {
        const next = [...prev];
        next[idx] = !next[idx];
        return next;
      });
    };

    return (
      <ScrollView style={styles.contentScroll}>
        <Text style={styles.contentTitle}>✍️ Paraphrasing</Text>
        <Text style={styles.writingLabel}>
          리딩 지문의 핵심 문장을 같은 의미로 다르게 표현해보세요.
        </Text>

        {sentences.length === 0 ? (
          <Text style={styles.loadingText}>Loading writing problems...</Text>
        ) : (
          sentences.map((item, idx) => (
            <View key={idx} style={styles.writingLineBlock}>
              <Text style={styles.writingPromptLabel}>원문 {idx + 1}</Text>
              <Text style={styles.writingModelSentence}>{item.original}</Text>

              <TextInput
                style={styles.writingLineInput}
                placeholder="패러프레이즈를 입력해보세요..."
                placeholderTextColor="#94a3b8"
                value={writingLines[idx] || ''}
                onChangeText={(text) => updateWritingLine(idx, text)}
                multiline
              />

              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => toggleReveal(idx)}
              >
                <Text style={styles.saveButtonText}>
                  {revealedParaphrases[idx] ? '🙈 정답 숨기기' : '💡 정답 보기'}
                </Text>
              </TouchableOpacity>

              {revealedParaphrases[idx] && (
                <View style={styles.writingPromptBox}>
                  <Text style={styles.writingPromptLabel}>모범 패러프레이즈</Text>
                  <Text style={styles.writingPrompt}>{item.paraphrase}</Text>
                  {item.tip ? (
                    <>
                      <Text style={[styles.writingPromptLabel, { marginTop: 8 }]}>💡 기법</Text>
                      <Text style={styles.writingPrompt}>{item.tip}</Text>
                    </>
                  ) : null}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  const renderSpeakingContent = () => {
    if (!toeflProblems?.speaking) {
      return (
        <ScrollView style={styles.contentScroll}>
          <Text style={styles.contentTitle}>🎤 Speaking</Text>
          <Text style={styles.loadingText}>Loading speaking problems...</Text>
        </ScrollView>
      );
    }

    const speaking = toeflProblems.speaking;
    return (
      <ScrollView style={styles.contentScroll}>
        <Text style={styles.contentTitle}>🎤 Speaking</Text>

        <View style={styles.speakingPromptBox}>
          <Text style={styles.speakingPromptLabel}>📢 스피킹 주제</Text>
          <Text style={styles.speakingPrompt}>{speaking.prompt || 'Loading prompt...'}</Text>
        </View>

        {speaking.model_sentences && speaking.model_sentences.length > 0 && (
          <View style={styles.speakingLinesBox}>
            <Text style={styles.speakingLinesLabel}>🗣️ 한 문장씩 따라 말해보세요</Text>
            {speaking.model_sentences.map((sentence: string, idx: number) => (
              <View key={idx} style={styles.speakingLineRow}>
                <Text style={styles.speakingLineText}>{idx + 1}. {sentence}</Text>
                <TouchableOpacity
                  style={styles.speakingLineButton}
                  onPress={() => playSpeakingSentence(idx, sentence)}
                  disabled={speakingPlayingIdx !== null}
                >
                  <Text style={styles.speakingLineButtonText}>
                    {speakingPlayingIdx === idx ? '🔊' : '▶️'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.speakingTipBox}>
          <Text style={styles.speakingTipLabel}>팁 💡</Text>
          <Text style={styles.speakingTipText}>1. 충분히 생각할 시간을 가지세요 (약 30초)</Text>
          <Text style={styles.speakingTipText}>2. 명확하고 천천히 말씀하세요</Text>
          <Text style={styles.speakingTipText}>3. 구체적인 예시를 포함하세요</Text>
          <Text style={styles.speakingTipText}>4. 문법과 발음에 신경 쓰세요</Text>
        </View>
      </ScrollView>
    );
  };

  const renderReadingContent = () => {
    if (!toeflProblems?.reading) {
      return (
        <ScrollView style={styles.contentScroll}>
          <Text style={styles.contentTitle}>📖 Reading Comprehension</Text>
          <Text style={styles.loadingText}>Loading reading problems...</Text>
        </ScrollView>
      );
    }

    const reading = toeflProblems.reading;
    return (
      <ScrollView style={styles.contentScroll}>
        <Text style={styles.contentTitle}>📖 Reading Comprehension</Text>

        <View style={styles.passageBox}>
          <Text style={styles.passageLabel}>지문</Text>
          {reading.title && <Text style={styles.passageTitle}>{reading.title}</Text>}
          <Text style={styles.passageText}>{reading.passage}</Text>
        </View>

        {reading.vocabulary && reading.vocabulary.length > 0 && (
          <View style={styles.vocabBox}>
            <Text style={styles.vocabLabel}>📚 난이도 단어</Text>
            {reading.vocabulary.map((v: any, idx: number) => (
              <View key={idx} style={styles.vocabItem}>
                <Text style={styles.vocabWord}>{v.word}</Text>
                <Text style={styles.vocabMeaning}>{v.meaning_ko}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.questionsBox}>
          <Text style={styles.questionsLabel}>문제</Text>

          {reading.questions && reading.questions.map((q: any, qIdx: number) => (
            <View key={`q_${qIdx}`} style={styles.questionBox}>
              <Text style={styles.questionText}>{q.q || `Q${qIdx + 1}`}</Text>
              <View style={styles.optionsContainer}>
                {q.options && q.options.map((option: string, optIdx: number) => (
                  <TouchableOpacity
                    key={optIdx}
                    style={[
                      styles.optionButton,
                      selectedAnswers[`read_q${qIdx}`] === optIdx && styles.optionButtonSelected,
                      selectedAnswers[`read_q${qIdx}`] === optIdx && optIdx === q.answer && styles.optionButtonCorrect,
                    ]}
                    onPress={() => selectAnswer(`read_q${qIdx}`, optIdx)}
                  >
                    <Text style={[
                      styles.optionText,
                      selectedAnswers[`read_q${qIdx}`] === optIdx && styles.optionTextSelected,
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {selectedAnswers[`read_q${qIdx}`] !== undefined && (
                <Text style={selectedAnswers[`read_q${qIdx}`] === q.answer ? styles.correctText : styles.incorrectText}>
                  {selectedAnswers[`read_q${qIdx}`] === q.answer
                    ? '✓ 정답!'
                    : `✗ 틀렸습니다. 정답은 ${String.fromCharCode(65 + q.answer)}입니다.`}
                </Text>
              )}
              {selectedAnswers[`read_q${qIdx}`] !== undefined && q.explanation && (
                <Text style={styles.explanationText}>{q.explanation}</Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🎓 TOEFL iBT</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>TOEFL 데이터를 로드하는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎓 TOEFL iBT</Text>
        <Text style={styles.headerSubtitle}>4가지 영역 연습</Text>
      </View>

      {/* No tab buttons needed - only showing sections */}

      {selectedSection ? (
        <ScrollView style={styles.detailView}>
          <TouchableOpacity onPress={() => { setSelectedSection(null); setSelectedAnswers({}); }} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 뒤로</Text>
          </TouchableOpacity>

          <View style={styles.detailHeader}>
            <Text style={styles.detailEmoji}>{selectedSection.emoji}</Text>
            <Text style={styles.detailTitle}>{selectedSection.name}</Text>
          </View>

          <Text style={styles.detailDesc}>{selectedSection.description}</Text>

          {selectedSection.id === 'reading' && renderReadingContent()}
          {selectedSection.id === 'listening' && renderListeningContent()}
          {selectedSection.id === 'writing' && renderWritingContent()}
          {selectedSection.id === 'speaking' && renderSpeakingContent()}

          <View style={styles.progressSection}>
            <Text style={styles.progressLabel}>진행 상황</Text>
            <View style={[styles.progressBar, { borderColor: selectedSection.color }]}>
              <View style={[styles.progressFill, { width: `${selectedSection.progress}%`, backgroundColor: selectedSection.color }]} />
            </View>
            <Text style={styles.progressPercent}>{selectedSection.progress}%</Text>

            <TouchableOpacity
              style={[styles.completeBtn, { borderColor: selectedSection.color }]}
              onPress={() => {
                toggleCompletion(selectedSection.id);
                setSelectedSection(null);
              }}
            >
              <Text style={[styles.completeBtnText, { color: selectedSection.color }]}>
                {selectedSection.completed ? '✓ 완료됨' : '완료 표시'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : view === 'sections' ? (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, item.completed && styles.cardCompleted, { borderLeftColor: item.color }]}
              onPress={() => setSelectedSection(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.emoji}>{item.emoji}</Text>
                <View style={styles.cardTitle}>
                  <Text style={styles.sectionName}>{item.name}</Text>
                  <Text style={styles.sectionDesc}>{item.description}</Text>
                </View>
                <Text style={[styles.completeBadge, { color: item.color }]}>
                  {item.completed ? '✓' : '○'}
                </Text>
              </View>

              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${item.progress}%`, backgroundColor: item.color }]} />
              </View>
              <Text style={styles.progressText}>{item.progress}% 완료</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.statsContent}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>전체 영역</Text>
            <Text style={styles.statValue}>{stats.total}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>완료된 영역</Text>
            <Text style={styles.statValue}>{stats.completed}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>평균 진도</Text>
            <Text style={styles.statValue}>{stats.avgProgress}%</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#fef3c7',
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
  passageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  explanationText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    fontStyle: 'italic',
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
    backgroundColor: '#f59e0b',
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
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  cardCompleted: {
    opacity: 0.6,
    backgroundColor: '#f1f5f9',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  emoji: {
    fontSize: 28,
    marginRight: 12,
  },
  cardTitle: {
    flex: 1,
  },
  sectionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748b',
  },
  completeBadge: {
    fontSize: 20,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
  },
  progressText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'right',
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
    color: '#f59e0b',
  },
  detailView: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f59e0b',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailEmoji: {
    fontSize: 40,
    marginRight: 12,
  },
  detailTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  detailDesc: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
    lineHeight: 20,
  },
  contentScroll: {
    marginBottom: 24,
  },
  contentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  passageBox: {
    backgroundColor: '#fafbfc',
    padding: 18,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  passageLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 12,
  },
  passageText: {
    fontSize: 17,
    color: '#334155',
    lineHeight: 36,
    fontWeight: '400',
  },
  vocabBox: {
    backgroundColor: '#fffbeb',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  vocabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    marginBottom: 10,
  },
  vocabItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#fef3c7',
  },
  vocabWord: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
  },
  vocabMeaning: {
    fontSize: 13,
    color: '#78716c',
  },
  questionsBox: {
    marginTop: 8,
  },
  questionsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  questionBox: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  questionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 10,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  optionButtonSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#dbeafe',
  },
  optionButtonCorrect: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  optionText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500',
  },
  optionTextSelected: {
    fontWeight: '600',
    color: '#1e293b',
  },
  correctText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 8,
  },
  incorrectText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
    marginTop: 8,
  },
  progressSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 16,
  },
  completeBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    marginBottom: 24,
  },
  completeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  audioBox: {
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  audioLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  audioControls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  audioButton: {
    flex: 1,
    backgroundColor: '#6366f1',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioButtonActive: {
    backgroundColor: '#4f46e5',
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  replayButton: {
    backgroundColor: '#10b981',
  },
  audioButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  playingIndicator: {
    marginTop: 10,
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
    textAlign: 'center',
  },
  writingPromptBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ec4899',
  },
  writingPromptLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ec4899',
    marginBottom: 8,
  },
  writingPrompt: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1e293b',
  },
  writingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  writingLineBlock: {
    marginHorizontal: 16,
    marginBottom: 14,
  },
  writingModelSentence: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
    marginBottom: 6,
  },
  writingLineInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1e293b',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  writingTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
  },
  writingTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
  },
  writingTabActive: {
    backgroundColor: '#ec4899',
  },
  writingTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  writingTabTextActive: {
    color: '#fff',
    fontWeight: '800',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  savedEssaysContainer: {
    padding: 16,
  },
  noSavedText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 20,
  },
  savedEssayItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 12,
  },
  essayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  essayDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  essayButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  loadBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  deleteBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  btnText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  essayPreview: {
    fontSize: 12,
    color: '#1e293b',
    lineHeight: 18,
  },
  playButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonActive: {
    backgroundColor: '#4f46e5',
    opacity: 0.8,
  },
  playButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  scriptBox: {
    backgroundColor: '#fafbfc',
    borderRadius: 12,
    padding: 18,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  scriptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  scriptText: {
    fontSize: 17,
    lineHeight: 36,
    color: '#334155',
    fontFamily: 'System',
  },
  speakingPromptBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  speakingPromptLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10b981',
    marginBottom: 8,
  },
  speakingPrompt: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1e293b',
  },
  speakingLinesBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
  },
  speakingLinesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
    marginBottom: 10,
  },
  speakingLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dcfce7',
  },
  speakingLineText: {
    flex: 1,
    fontSize: 13,
    color: '#14532d',
    lineHeight: 20,
    marginRight: 10,
  },
  speakingLineButton: {
    padding: 6,
  },
  speakingLineButtonText: {
    fontSize: 18,
  },
  speakingTipBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  speakingTipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 10,
  },
  speakingTipText: {
    fontSize: 13,
    color: '#7f1d1d',
    lineHeight: 20,
    marginBottom: 6,
  },
  keywordsBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  keywordsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  vocabularyList: {
    gap: 10,
  },
  vocabularyItem: {
    backgroundColor: '#fef08a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  vocabularyWord: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78350f',
    marginBottom: 4,
  },
  vocabularyMeaning: {
    fontSize: 12,
    color: '#92400e',
    lineHeight: 18,
  },
  saveHint: {
    fontSize: 11,
    color: '#b45309',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
