import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

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
  const [view, setView] = useState<ViewType>('sections');
  const [sections, setSections] = useState<TOEFLSection[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, avgProgress: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState<TOEFLSection | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: string]: number }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [writingAnswers, setWritingAnswers] = useState<{ [key: string]: string }>({});
  const [writingView, setWritingView] = useState<'write' | 'saved'>('write');
  const [savedEssays, setSavedEssays] = useState<{ id: string; content: string; date: string }[]>([]);

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
      const netlifyData = await fetchTOEFLFromNetlify();

      if (netlifyData && netlifyData.sections && netlifyData.sections.length > 0) {
        const savedSections = await AsyncStorage.getItem('toefl_sections');
        const savedProgress = savedSections
          ? JSON.parse(savedSections).reduce((acc: any, s: TOEFLSection) =>
              ({ ...acc, [s.id]: { progress: s.progress, completed: s.completed } }), {})
          : {};

        const mergedSections = netlifyData.sections.map((s: TOEFLSection) => ({
          ...s,
          progress: savedProgress[s.id]?.progress || 0,
          completed: savedProgress[s.id]?.completed || false,
        }));

        setSections(mergedSections);
        await AsyncStorage.setItem('toefl_sections', JSON.stringify(mergedSections));
      } else {
        const savedSections = await AsyncStorage.getItem('toefl_sections');
        if (savedSections) {
          setSections(JSON.parse(savedSections));
        } else {
          setSections(getDefaultSections());
        }
      }
    } catch (error) {
      console.error('Failed to load TOEFL data:', error);
      setSections(getDefaultSections());
    } finally {
      setLoading(false);
    }
  };

  const fetchTOEFLFromNetlify = async (): Promise<any | null> => {
    try {
      const response = await fetch(`${NETLIFY_BASE_URL}/.netlify/functions/toefl_prefs`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Netlify fetch failed:', error);
      return null;
    }
  };

  const refreshFromNetlify = async () => {
    const netlifyData = await fetchTOEFLFromNetlify();
    if (netlifyData && netlifyData.sections) {
      const mergedSections = netlifyData.sections.map((s: TOEFLSection) => ({
        ...s,
        progress: sections.find(sec => sec.id === s.id)?.progress || 0,
        completed: sections.find(sec => sec.id === s.id)?.completed || false,
      }));
      setSections(mergedSections);
      await AsyncStorage.setItem('toefl_sections', JSON.stringify(mergedSections));
    }
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

  const renderListeningContent = () => (
    <ScrollView style={styles.contentScroll}>
      <Text style={styles.contentTitle}>🎧 Listening Comprehension</Text>

      <View style={styles.audioBox}>
        <Text style={styles.audioLabel}>🎧 강의 스크립트</Text>
        <View style={styles.audioControls}>
          <TouchableOpacity
            style={[styles.audioButton, isPlaying && styles.audioButtonActive]}
            onPress={() => playAudio(
              "Today we'll discuss the impact of renewable energy on modern society. Solar panels have become increasingly affordable and efficient, making them accessible to more people worldwide. Many countries now generate over 30 percent of their electricity from renewable sources like solar, wind, and hydroelectric power. This transition helps reduce carbon emissions and creates new job opportunities in the clean energy sector. However, significant challenges remain in energy storage technology and grid stability. Batteries are still expensive and limited in capacity, and the intermittent nature of renewable sources requires better infrastructure. Despite these obstacles, governments and private companies continue to invest heavily in sustainable energy solutions. The transition to renewable energy is not just an environmental necessity but also an economic opportunity for the next generation."
            )}
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
              setTimeout(() => playAudio(
                "Today we'll discuss the impact of renewable energy on modern society. Solar panels have become increasingly affordable and efficient, making them accessible to more people worldwide. Many countries now generate over 30 percent of their electricity from renewable sources like solar, wind, and hydroelectric power. This transition helps reduce carbon emissions and creates new job opportunities in the clean energy sector. However, significant challenges remain in energy storage technology and grid stability. Batteries are still expensive and limited in capacity, and the intermittent nature of renewable sources requires better infrastructure. Despite these obstacles, governments and private companies continue to invest heavily in sustainable energy solutions. The transition to renewable energy is not just an environmental necessity but also an economic opportunity for the next generation."
              ), 200);
            }}
          >
            <Text style={styles.audioButtonText}>🔄 처음부터</Text>
          </TouchableOpacity>
        </View>
        {isPlaying && <Text style={styles.playingIndicator}>🔊 재생 중...</Text>}
      </View>

      <View style={styles.keywordsBox}>
        <Text style={styles.keywordsLabel}>어려운 단어</Text>
        <View style={styles.vocabularyList}>
          {[
            { word: 'Renewable Energy', meaning: '♻️ 태양광, 풍력 같은 자연에서 계속 얻을 수 있는 에너지예요. 석탄처럼 없어지지 않아서 환경 친화적이랍니다!' },
            { word: 'Solar Panels', meaning: '☀️ 햇빛을 전기로 바꿔주는 판자예요. 지붕이나 들판에 설치해서 깨끗한 전기를 만든답니다.' },
            { word: 'Intermittent', meaning: '⚡ 계속 일어나는 게 아니라 때때로, 간헐적으로 일어난다는 뜻이에요. 풍력은 바람이 불 때만 작동하는 것처럼요!' },
            { word: 'Grid Stability', meaning: '🔌 전력망이 안정적으로 전기를 공급하는 상태예요. 정전 없이 항상 전기가 흘러야 한다는 의미입니다.' },
            { word: 'Infrastructure', meaning: '🏗️ 어떤 체계가 돌아가기 위해 필요한 기초 설비들이에요. 전력망의 경우 송전선, 변전소 같은 것들을 뜻해요.' },
          ].map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.vocabularyItem}
              onPress={() => saveVocabularyToNetlify(item.word, item.meaning, '🎧', 'listening')}
            >
              <Text style={styles.vocabularyWord}>{item.word}</Text>
              <Text style={styles.vocabularyMeaning}>{item.meaning}</Text>
              <Text style={styles.saveHint}>💾 터치하면 저장</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.questionsBox}>
        <Text style={styles.questionsLabel}>문제</Text>

        <View style={styles.questionBox}>
          <Text style={styles.questionText}>Q1. What is the main topic of the lecture?</Text>
          <View style={styles.optionsContainer}>
            {['A) Solar panel prices', 'B) Impact of renewable energy', 'C) Electricity grids'].map((option, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.optionButton,
                  selectedAnswers['l_q1'] === idx && styles.optionButtonSelected,
                  selectedAnswers['l_q1'] === idx && idx === 1 && styles.optionButtonCorrect,
                ]}
                onPress={() => selectAnswer('l_q1', idx)}
              >
                <Text style={[
                  styles.optionText,
                  selectedAnswers['l_q1'] === idx && styles.optionTextSelected,
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedAnswers['l_q1'] !== undefined && (
            <Text style={selectedAnswers['l_q1'] === 1 ? styles.correctText : styles.incorrectText}>
              {selectedAnswers['l_q1'] === 1 ? '✓ 정답!' : '✗ 틀렸습니다. 정답은 B입니다.'}
            </Text>
          )}
        </View>

        <View style={styles.questionBox}>
          <Text style={styles.questionText}>Q2. What does the speaker identify as a significant challenge to renewable energy adoption?</Text>
          <View style={styles.optionsContainer}>
            {['A) Solar panels are too affordable', 'B) Energy storage and grid stability issues', 'C) Lack of government investment'].map((option, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.optionButton,
                  selectedAnswers['l_q2'] === idx && styles.optionButtonSelected,
                  selectedAnswers['l_q2'] === idx && idx === 1 && styles.optionButtonCorrect,
                ]}
                onPress={() => selectAnswer('l_q2', idx)}
              >
                <Text style={[
                  styles.optionText,
                  selectedAnswers['l_q2'] === idx && styles.optionTextSelected,
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedAnswers['l_q2'] !== undefined && (
            <Text style={selectedAnswers['l_q2'] === 1 ? styles.correctText : styles.incorrectText}>
              {selectedAnswers['l_q2'] === 1 ? '✓ 정답!' : '✗ 틀렸습니다. 정답은 B입니다.'}
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );

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
              "Describe the most significant challenge you faced in your academic life and explain how you overcame it. Provide specific examples and reflect on what you learned from the experience."
            </Text>
          </View>

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

          <TouchableOpacity style={styles.saveButton} onPress={saveEssay}>
            <Text style={styles.saveButtonText}>💾 임시저장</Text>
          </TouchableOpacity>

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

  const renderReadingContent = () => (
    <ScrollView style={styles.contentScroll}>
      <Text style={styles.contentTitle}>📖 Reading Comprehension</Text>

      <View style={styles.passageBox}>
        <Text style={styles.passageLabel}>지문</Text>
        <Text style={styles.passageText}>
          The industrial revolution, which began in the late 18th century, fundamentally transformed human society. It marked the transition from agrarian economies to industrial and machine-based manufacturing. In Britain, the invention of the steam engine by James Watt revolutionized textile production and transportation. This technological advancement spread rapidly across Europe and North America, reshaping social structures, labor practices, and urban development.

          The revolution introduced factories, where workers congregated to operate machinery. While productivity increased dramatically, working conditions were often harsh and dangerous. Children and women labored long hours in dimly lit factories for minimal wages. Environmental pollution became a significant problem as industrial cities grew rapidly without proper planning.

          Despite these challenges, the industrial revolution elevated living standards for many people in the long term. It created the modern working class and sparked labor movements that eventually led to improved working conditions and workers' rights. The technological innovations from this period laid the foundation for modern industrial society and continue to influence our world today.
        </Text>
      </View>

      <View style={styles.keywordsBox}>
        <Text style={styles.keywordsLabel}>어려운 단어</Text>
        <View style={styles.vocabularyList}>
          {[
            { word: 'Agrarian', meaning: '🌾 농업에 관련된, 농촌의라는 뜻이에요. 농사나 목축 중심의 사회를 말할 때 써요.' },
            { word: 'Industrialization', meaning: '🏭 수공업에서 기계 생산으로 바뀌는 과정이에요. 산업화라고도 하지요.' },
            { word: 'Congregated', meaning: '👥 모여들다, 집결하다는 뜻이에요. 많은 사람들이 한곳에 모일 때 쓰입니다.' },
            { word: 'Textile', meaning: '🧵 직물, 천이라는 뜻이에요. 면, 비단, 울 같은 옷감 만드는 산업을 말해요.' },
            { word: 'Labor Movement', meaning: '✊ 노동자들이 권리를 위해 함께 운동하는 것을 말해요. 더 나은 일자리를 만들기 위한 활동입니다.' },
          ].map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.vocabularyItem}
              onPress={() => saveVocabularyToNetlify(item.word, item.meaning, '📖', 'reading')}
            >
              <Text style={styles.vocabularyWord}>{item.word}</Text>
              <Text style={styles.vocabularyMeaning}>{item.meaning}</Text>
              <Text style={styles.saveHint}>💾 터치하면 저장</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.questionsBox}>
        <Text style={styles.questionsLabel}>문제</Text>

        <View style={styles.questionBox}>
          <Text style={styles.questionText}>Q1. According to the passage, what was James Watt's main contribution?</Text>
          <View style={styles.optionsContainer}>
            {['A) He invented the factory system', 'B) He invented the steam engine', 'C) He improved textile production'].map((option, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.optionButton,
                  selectedAnswers['q1'] === idx && styles.optionButtonSelected,
                  selectedAnswers['q1'] === idx && idx === 1 && styles.optionButtonCorrect,
                ]}
                onPress={() => selectAnswer('q1', idx)}
              >
                <Text style={[
                  styles.optionText,
                  selectedAnswers['q1'] === idx && styles.optionTextSelected,
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedAnswers['q1'] !== undefined && (
            <Text style={selectedAnswers['q1'] === 1 ? styles.correctText : styles.incorrectText}>
              {selectedAnswers['q1'] === 1 ? '✓ 정답!' : '✗ 틀렸습니다. 정답은 B입니다.'}
            </Text>
          )}
        </View>

        <View style={styles.questionBox}>
          <Text style={styles.questionText}>Q2. What problem is mentioned about working conditions during the industrial revolution?</Text>
          <View style={styles.optionsContainer}>
            {['A) Workers were paid too much', 'B) Working conditions were harsh and dangerous', 'C) There were no factories'].map((option, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.optionButton,
                  selectedAnswers['q2'] === idx && styles.optionButtonSelected,
                  selectedAnswers['q2'] === idx && idx === 1 && styles.optionButtonCorrect,
                ]}
                onPress={() => selectAnswer('q2', idx)}
              >
                <Text style={[
                  styles.optionText,
                  selectedAnswers['q2'] === idx && styles.optionTextSelected,
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedAnswers['q2'] !== undefined && (
            <Text style={selectedAnswers['q2'] === 1 ? styles.correctText : styles.incorrectText}>
              {selectedAnswers['q2'] === 1 ? '✓ 정답!' : '✗ 틀렸습니다. 정답은 B입니다.'}
            </Text>
          )}
        </View>

        <View style={styles.questionBox}>
          <Text style={styles.questionText}>Q3. What is the main idea of the passage?</Text>
          <View style={styles.optionsContainer}>
            {['A) The industrial revolution had negative effects only', 'B) The industrial revolution transformed society with both positive and negative impacts', 'C) Factory workers had good working conditions'].map((option, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.optionButton,
                  selectedAnswers['q3'] === idx && styles.optionButtonSelected,
                  selectedAnswers['q3'] === idx && idx === 1 && styles.optionButtonCorrect,
                ]}
                onPress={() => selectAnswer('q3', idx)}
              >
                <Text style={[
                  styles.optionText,
                  selectedAnswers['q3'] === idx && styles.optionTextSelected,
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedAnswers['q3'] !== undefined && (
            <Text style={selectedAnswers['q3'] === 1 ? styles.correctText : styles.incorrectText}>
              {selectedAnswers['q3'] === 1 ? '✓ 정답!' : '✗ 틀렸습니다. 정답은 B입니다.'}
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );

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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
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
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: '#10b981',
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
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
