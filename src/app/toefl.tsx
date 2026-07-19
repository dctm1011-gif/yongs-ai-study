import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { performanceMonitor } from '../utils/PerformanceMonitor';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';

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
  const [writingAnswers, setWritingAnswers] = useState<{ [key: string]: string }>({});
  const [writingView, setWritingView] = useState<'write' | 'saved'>('write');
  const [savedEssays, setSavedEssays] = useState<{ id: string; content: string; date: string }[]>([]);
  const [isCached, setIsCached] = useState(false);
  const [loadStartTime] = useState(Date.now());
  const [toeflProblems, setToeflProblems] = useState<any>(null);

  // Performance monitoring
  useEffect(() => {
    performanceMonitor.startTiming('TOEFL');

    // Subscribe to Firebase TOEFL problems
    const db = getDatabase(getFirebaseApp());
    const today = new Date().toISOString().split('T')[0];
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
    const now = new Date();
    const today = now.toISOString().split('T')[0];

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

  const loadData = async () => {
    try {
      setLoading(true);

      // Try to load cached problems first
      const cachedProblems = await AsyncStorage.getItem('toefl_problems');
      const today = new Date().toISOString().split('T')[0];

      if (cachedProblems) {
        try {
          const parsed = JSON.parse(cachedProblems);
          if (parsed.date === today) {
            setToeflProblems(parsed);
            setIsCached(true);
            setLoading(false);
            // Still try to fetch fresh data in background
            fetchTOEFLFromNetlify()
              .then(async freshData => {
                if (freshData && freshData.date === today) {
                  setToeflProblems(freshData);
                  await AsyncStorage.setItem('toefl_problems', JSON.stringify(freshData));
                }
              })
              .catch(err => console.log('Background refresh failed (non-fatal):', err));
            return;
          }
        } catch (e) {
          console.log('Cache parse failed, fetching fresh data');
        }
      }

      // Fetch fresh data with timeout (5 seconds)
      console.log('📥 TOEFL: Fetching from Netlify...');
      const timeoutPromise = new Promise<any>(resolve =>
        setTimeout(() => {
          console.warn('⏱️  TOEFL: Fetch timeout (5s)');
          resolve(null);
        }, 5000)
      );
      const fetchPromise = fetchTOEFLFromNetlify();
      const netlifyData = await Promise.race([fetchPromise, timeoutPromise]);

      if (netlifyData && netlifyData.reading && netlifyData.writing && netlifyData.speaking && netlifyData.listening) {
        console.log('✅ TOEFL: Data loaded from Netlify');
        setToeflProblems(netlifyData);
        await AsyncStorage.setItem('toefl_problems', JSON.stringify(netlifyData));
        setIsCached(false);
      } else {
        console.warn('❌ TOEFL: Invalid or missing data structure', { has_reading: !!netlifyData?.reading, has_writing: !!netlifyData?.writing });
      }

      // Always load section progress
      const savedSections = await AsyncStorage.getItem('toefl_sections');
      if (savedSections) {
        setSections(JSON.parse(savedSections));
      } else {
        setSections(defaultSections);
      }
    } catch (error) {
      console.error('Failed to load TOEFL data:', error);
      setSections(defaultSections);
    } finally {
      setLoading(false);
    }
  };

  const getMockTOEFLData = () => ({
    date: '2026-07-19',
    reading: {
      title: 'The Impact of Urban Green Spaces',
      passage:
        'Urban green spaces such as parks and gardens play a crucial role in improving city residents\' quality of life. These areas provide essential benefits including air quality improvement, temperature regulation, and mental health support. Studies have shown that people living near parks experience lower stress levels and better overall well-being. Furthermore, green spaces encourage physical activity and social interaction among community members. As cities continue to expand, protecting and developing these natural areas becomes increasingly important for sustainable urban development.',
      questions: [
        {
          q: 'According to the passage, what are green spaces primarily beneficial for?',
          options: ['A) Reducing traffic congestion', 'B) Improving air quality and mental health', 'C) Increasing property taxes', 'D) Creating employment opportunities'],
          answer: 1,
          explanation: '본문에서 green spaces는 공기 질 개선, 온도 조절, 정신 건강 지원을 제공한다고 명시되어 있습니다.',
        },
        {
          q: 'What does the passage imply about people living near parks?',
          options: ['A) They pay higher rent', 'B) They exercise less frequently', 'C) They have better well-being', 'D) They avoid social interaction'],
          answer: 2,
          explanation: '본문에서 \'공원 근처에 사는 사람들은 더 낮은 스트레스 수준과 더 나은 전반적인 웰빙을 경험한다\'고 명시되어 있습니다.',
        },
      ],
    },
    writing: {
      prompt: 'Do you agree or disagree with the statement that cities should prioritize developing green spaces over building new infrastructure like roads and buildings?',
      structure: {
        intro: '자신의 입장을 명확히 제시하세요.',
        body1: '첫 번째 이유: 녹지의 환경적/건강상 이점을 구체적인 예시와 함께 제시하세요',
        body2: '두 번째 이유: 기반 시설의 필요성도 인정하면서, 균형 있는 접근 방식을 제안하세요',
        conclusion: '전체 논의를 요약하고 입장을 재확인하세요',
      },
      useful_phrases: ['In my opinion,', 'I strongly believe that', 'Furthermore,', 'For instance,', 'In conclusion,', 'It is essential that'],
    },
    speaking: {
      prompt: 'Some people prefer spending leisure time in outdoor natural environments like parks and forests. Others prefer indoor activities. Which do you prefer and why?',
      useful_expressions: ['In my opinion, I prefer...', 'One reason is that...', 'Additionally, nature provides...', 'For example,', 'I believe that...'],
      sample_points: ['자연환경에서의 신체활동은 건강을 증진시키고 스트레스를 감소시킵니다.', '실내활동은 날씨에 관계없이 즐길 수 있고, 문화 활동을 통해 지식을 얻을 수 있습니다.'],
    },
    listening: {
      title: 'Student-Professor Conversation About Research Projects',
      type: 'conversation',
      script:
        'Student: Professor Johnson, I wanted to discuss my research project on renewable energy. Professor: That\'s a great question. Both solar and wind are important, but they have different applications. Student: Which one would have bigger impact? Professor: That depends on location. In coastal areas, wind farms can generate massive electricity. In deserts, solar is efficient. Student: Maybe I should research how they work together in a hybrid system. Professor: Excellent idea!',
      questions: [
        {
          q: 'What is the main purpose of the conversation?',
          options: ['A) Grading research project', 'B) Seeking advice on research focus', 'C) Explaining renewable energy', 'D) Complaining about difficulty'],
          answer: 1,
          explanation: '학생이 교수님께 신재생 에너지 연구 주제 선택에 대해 조언을 구하는 것입니다.',
        },
      ],
    },
  });

  const fetchTOEFLFromNetlify = async (): Promise<any | null> => {
    try {
      const url = `${NETLIFY_BASE_URL}/.netlify/functions/toefl-daily`;
      console.log(`🔗 TOEFL: Calling ${url}`);

      const response = await fetch(url, { timeout: 5000 });
      console.log(`📬 TOEFL: Response status ${response.status}`);

      if (!response.ok) {
        console.error(`❌ TOEFL: HTTP error ${response.status} - ${response.statusText}`);
        console.log('⚠️  TOEFL: Using mock data');
        return getMockTOEFLData();
      }

      const data = await response.json();
      console.log(`📦 TOEFL: Received data with sections:`, {
        reading: !!data?.reading,
        writing: !!data?.writing,
        speaking: !!data?.speaking,
        listening: !!data?.listening,
      });

      if (data && data.reading && data.writing && data.speaking && data.listening) {
        console.log('✅ TOEFL: Data valid, returning');
        return data;
      }
      console.warn('⚠️  TOEFL: Missing sections in response, using mock data');
      return getMockTOEFLData();
    } catch (error) {
      console.error(`❌ TOEFL: Network error - ${error instanceof Error ? error.message : String(error)}`);
      console.log('⚠️  TOEFL: Using mock data as fallback');
      return getMockTOEFLData();
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
    const updated = sections.map(s =>
      s.id === sectionId
        ? { ...s, completed: !s.completed, progress: !s.completed ? 100 : 0 }
        : s
    );
    saveSections(updated);
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

  const stopAudio = async () => {
    try {
      await Speech.stop();
      setIsPlaying(false);
    } catch (error) {
      console.error('Stop Error:', error);
    }
  };

  const saveEssay = async () => {
    const content = writingAnswers['essay1']?.trim();
    if (!content) {
      Alert.alert('알림', '에세이를 입력해주세요.');
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
    } catch (error) {
      Alert.alert('오류', '저장 실패');
    }
  };

  const loadEssay = (essay: { id: string; content: string; date: string }) => {
    setWritingAnswers({ essay1: essay.content });
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

  const renderWritingContent = () => (
    <ScrollView style={styles.contentScroll}>
      <Text style={styles.contentTitle}>✍️ Essay Writing</Text>

      <View style={styles.writingTabs}>
        <TouchableOpacity
          style={[styles.writingTab, writingView === 'write' && styles.writingTabActive]}
          onPress={() => setWritingView('write')}
        >
          <Text style={[styles.writingTabText, writingView === 'write' && styles.writingTabTextActive]}>✏️ 작성</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.writingTab, writingView === 'saved' && styles.writingTabActive]}
          onPress={() => setWritingView('saved')}
        >
          <Text style={[styles.writingTabText, writingView === 'saved' && styles.writingTabTextActive]}>💾 임시저장 ({savedEssays.length})</Text>
        </TouchableOpacity>
      </View>

      {writingView === 'write' ? (
        <>
          <View style={styles.writingPromptBox}>
            <Text style={styles.writingPromptLabel}>📝 에세이 주제</Text>
            <Text style={styles.writingPrompt}>
              {toeflProblems?.writing?.prompt || "Loading writing prompt..."}
            </Text>
          </View>

          {toeflProblems?.writing?.structure && (
            <View style={styles.writingStructureBox}>
              <Text style={styles.writingStructureLabel}>💡 에세이 구조 가이드</Text>
              {Object.entries(toeflProblems.writing.structure).map(([key, value], idx) => (
                <View key={idx} style={styles.structureItem}>
                  <Text style={styles.structureKey}>{key.toUpperCase()}</Text>
                  <Text style={styles.structureValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}

          {toeflProblems?.writing?.useful_phrases && (
            <View style={styles.phrasesBox}>
              <Text style={styles.phrasesLabel}>📌 유용한 표현들</Text>
              <View style={styles.phrasesList}>
                {toeflProblems.writing.useful_phrases.map((phrase: string, idx: number) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.phraseChip}
                    onPress={() => {
                      const current = writingAnswers['essay1'] || '';
                      setWritingAnswers({...writingAnswers, 'essay1': current + (current ? ' ' : '') + phrase});
                    }}
                  >
                    <Text style={styles.phraseText}>{phrase}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.writingLabel}>✏️ 당신의 답변 (최소 150단어)</Text>
          <TextInput
            style={styles.writingInput}
            placeholder="여기에 에세이를 작성하세요..."
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={12}
            value={writingAnswers['essay1'] || ''}
            onChangeText={(text) => setWritingAnswers({...writingAnswers, 'essay1': text})}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.saveButton} onPress={saveEssay}>
              <Text style={styles.saveButtonText}>💾 임시저장</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitButton} onPress={submitEssay}>
              <Text style={styles.submitButtonText}>📤 제출</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.writingHints}>
            <Text style={styles.writingHintTitle}>💡 작성 팁:</Text>
            <Text style={styles.writingHintText}>• 명확한 주제 문장으로 시작하세요</Text>
            <Text style={styles.writingHintText}>• 구체적인 예시와 세부사항을 포함하세요</Text>
            <Text style={styles.writingHintText}>• 문법과 철자를 확인하세요</Text>
            <Text style={styles.writingHintText}>• 적어도 150단어 이상 작성하세요</Text>
          </View>
        </>
      ) : (
        <View style={styles.savedEssaysContainer}>
          {savedEssays.length === 0 ? (
            <Text style={styles.noSavedText}>임시저장된 에세이가 없습니다.</Text>
          ) : (
            savedEssays.map((essay) => (
              <View key={essay.id} style={styles.savedEssayItem}>
                <View style={styles.essayHeader}>
                  <Text style={styles.essayDate}>{essay.date}</Text>
                  <View style={styles.essayButtons}>
                    <TouchableOpacity style={styles.loadBtn} onPress={() => loadEssay(essay)}>
                      <Text style={styles.btnText}>📖 불러오기</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteEssay(essay.id)}>
                      <Text style={styles.btnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.essayPreview} numberOfLines={3}>{essay.content}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );

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

        {speaking.useful_expressions && speaking.useful_expressions.length > 0 && (
          <View style={styles.expressionsBox}>
            <Text style={styles.expressionsLabel}>💬 유용한 표현들</Text>
            {speaking.useful_expressions.map((expr: string, idx: number) => (
              <Text key={idx} style={styles.expressionItem}>• {expr}</Text>
            ))}
          </View>
        )}

        {speaking.sample_points && speaking.sample_points.length > 0 && (
          <View style={styles.samplePointsBox}>
            <Text style={styles.samplePointsLabel}>💡 답변 포인트</Text>
            {speaking.sample_points.map((point: string, idx: number) => (
              <Text key={idx} style={styles.samplePointItem}>• {point}</Text>
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
  writingInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginHorizontal: 16,
    minHeight: 200,
    fontSize: 14,
    color: '#1e293b',
    textAlignVertical: 'top',
  },
  writingHints: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0ea5e9',
  },
  writingHintTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
    marginBottom: 8,
  },
  writingHintText: {
    fontSize: 12,
    color: '#0c4a6e',
    marginBottom: 4,
    lineHeight: 18,
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
  writingStructureBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
  },
  writingStructureLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
    marginBottom: 12,
  },
  structureItem: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0f2fe',
  },
  structureKey: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0c4a6e',
    marginBottom: 4,
  },
  structureValue: {
    fontSize: 12,
    color: '#0c4a6e',
    lineHeight: 18,
  },
  phrasesBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  phrasesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    marginBottom: 12,
  },
  phrasesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  phraseChip: {
    backgroundColor: '#fef08a',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  phraseText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#78350f',
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
  expressionsBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  expressionsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    marginBottom: 10,
  },
  expressionItem: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 20,
    marginBottom: 6,
  },
  samplePointsBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
  },
  samplePointsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
    marginBottom: 10,
  },
  samplePointItem: {
    fontSize: 13,
    color: '#0c4a6e',
    lineHeight: 20,
    marginBottom: 6,
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
