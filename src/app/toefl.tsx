import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, Modal, Dimensions, Linking, PanResponder, GestureResponderEvent, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScreenFade } from '../hooks/useScreenFade';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { performanceMonitor } from '../utils/PerformanceMonitor';
import { getDatabase, ref, onValue, set as dbSet, get } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { userRef } from '../utils/userDb';

// Firebase Functions run in UTC; KST (UTC+9) doesn't roll to the next
// calendar day until 09:00 UTC, so a plain UTC date lags KST by a day
// for 9 hours each morning (and the daily reset below would fire 9h late).
// Shift the clock forward before formatting, matching the helper used in
// netlify/functions/*-daily.mjs.
const SCREEN_W = Dimensions.get('window').width;

// 지문 내 단어 꾹 누르기 → 사전 API 조회 → 단어 바로 아래 팝업
const PassageWithLookup = React.memo(({ text, vocabulary, textStyle }: {
  text: string;
  vocabulary?: Array<{ word: string; meaning_ko: string }>;
  textStyle?: any;
}) => {
  const [tooltip, setTooltip] = useState<{
    word: string; x: number; y: number;
    loading: boolean; definition: string | null;
  } | null>(null);

  const vocabMap = useMemo(() => {
    const m: Record<string, string> = {};
    vocabulary?.forEach(v => { m[v.word.toLowerCase()] = v.meaning_ko; });
    return m;
  }, [vocabulary]);

  const tokens = useMemo(() => text.split(/(\s+)/), [text]);

  const dismiss = useCallback(() => setTooltip(null), []);

  const lookupWord = useCallback(async (raw: string, px: number, py: number) => {
    const word = raw.replace(/[^a-zA-Z]/g, '');
    if (!word || word.length < 2) return;

    setTooltip({ word, x: px, y: py, loading: true, definition: null });

    // 지문 vocabulary 먼저 확인
    const vocabDef = vocabMap[word.toLowerCase()];
    if (vocabDef) {
      setTooltip({ word, x: px, y: py, loading: false, definition: vocabDef });
      return;
    }

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      const entry = data[0];
      const meanings: string[] = [];
      (entry?.meanings ?? []).slice(0, 2).forEach((m: any) => {
        const pos = m.partOfSpeech ?? '';
        const def = m.definitions?.[0]?.definition ?? '';
        if (def) meanings.push(pos ? `[${pos}] ${def}` : def);
      });
      setTooltip({
        word, x: px, y: py, loading: false,
        definition: meanings.length > 0 ? meanings.join('\n') : null,
      });
    } catch {
      setTooltip({ word, x: px, y: py, loading: false, definition: null });
    }
  }, [vocabMap]);

  return (
    <>
      <TouchableOpacity activeOpacity={1} onPress={dismiss}>
        <Text style={textStyle}>
          {tokens.map((token, idx) => {
            if (/^\s+$/.test(token)) return token;
            const clean = token.replace(/[^a-zA-Z]/g, '').toLowerCase();
            const isVocab = !!vocabMap[clean];
            return (
              <Text
                key={idx}
                onLongPress={(e) => lookupWord(token, e.nativeEvent.pageX, e.nativeEvent.pageY)}
                style={isVocab ? styles.passageVocabHighlight : undefined}
              >
                {token}
              </Text>
            );
          })}
        </Text>
      </TouchableOpacity>

      {tooltip && (
        <Modal transparent animationType="none" onRequestClose={dismiss}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss}>
            <View style={[styles.wordTooltip, {
              top: tooltip.y + 14,
              left: Math.min(Math.max(tooltip.x - 60, 8), SCREEN_W - 220),
            }]}>
              <Text style={styles.wordTooltipWord}>{tooltip.word}</Text>
              {tooltip.loading
                ? <ActivityIndicator size="small" color="#94a3b8" style={{ marginTop: 4 }} />
                : tooltip.definition
                  ? <Text style={styles.wordTooltipMeaning}>{tooltip.definition}</Text>
                  : <Text style={styles.wordTooltipNone}>사전에 없음</Text>
              }
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(tooltip.word + ' 뜻')}&hl=ko&gl=KR&lr=lang_ko`)}
                style={styles.wordTooltipGoogleBtn}
              >
                <Text style={styles.wordTooltipGoogleText}>🔍 구글 검색</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
});

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

const PARAPHRASE_SENTENCES = [
  "The rapid advancement of technology has fundamentally transformed the way people communicate and share information across the globe.",
  "Despite significant progress in renewable energy, fossil fuels continue to dominate the global energy supply due to their reliability and low cost.",
  "Urban expansion has led to the destruction of natural habitats, threatening biodiversity and disrupting local ecosystems.",
  "Research suggests that regular physical exercise not only improves physical health but also enhances cognitive function and mental well-being.",
  "The increasing interconnectedness of global economies means that financial crises in one country can quickly spread to others.",
  "Access to quality education remains unequal across different socioeconomic groups, perpetuating cycles of poverty and limiting social mobility.",
  "Climate change poses one of the greatest existential threats to humanity, requiring immediate and coordinated international action.",
  "The rise of artificial intelligence is reshaping labor markets, automating routine tasks while creating new categories of skilled employment.",
  "Cultural exchange through travel and media has fostered greater cross-cultural understanding, though it has also raised concerns about cultural homogenization.",
  "The depletion of freshwater resources is becoming a critical global challenge, driven by population growth, agricultural demand, and climate change.",
  "Scientific innovation in the medical field has dramatically increased human life expectancy over the past century.",
  "Social media platforms have given ordinary citizens a powerful voice in public discourse, but also facilitated the spread of misinformation.",
  "Governments around the world are grappling with how to regulate powerful technology companies that control vast amounts of personal data.",
  "The overconsumption of natural resources by wealthy nations places a disproportionate burden on developing countries and future generations.",
  "Advances in genetic engineering offer promising solutions to hereditary diseases, while simultaneously raising profound ethical questions.",
  "Economic inequality within societies has been growing steadily, with wealth increasingly concentrated among a small proportion of the population.",
  "The shift toward remote work has blurred the boundaries between professional and personal life, with both positive and negative consequences.",
  "Deforestation in tropical regions contributes significantly to greenhouse gas emissions and accelerates the pace of global warming.",
  "Public investment in infrastructure is essential for sustaining economic growth and ensuring equal access to opportunities across regions.",
  "Language plays a central role in shaping cultural identity and preserving the heritage of communities over generations.",
  "The global food system is under increasing pressure to produce more food sustainably while reducing its environmental footprint.",
  "Migration driven by conflict, poverty, and climate change is testing the capacity of nations to integrate large numbers of newcomers.",
  "The privatization of public services has been both praised for increasing efficiency and criticized for exacerbating social inequality.",
  "Children who grow up in bilingual environments often demonstrate superior cognitive flexibility and problem-solving abilities.",
  "Space exploration has yielded technological innovations with widespread applications in medicine, communications, and materials science.",
  "The erosion of biodiversity in marine ecosystems is largely driven by overfishing, pollution, and ocean acidification.",
  "Mental health disorders affect a significant portion of the global population, yet access to effective treatment remains limited in many regions.",
  "The proliferation of nuclear weapons represents a persistent and serious threat to global security and international stability.",
];

function getDailySentence(): string {
  const dayOfYear = Math.floor((Date.now() + 9 * 3600000) / 86400000);
  return PARAPHRASE_SENTENCES[dayOfYear % PARAPHRASE_SENTENCES.length];
}

export default function TOEFLScreen() {
  const { user } = useAuth();
  const uid = user!.uid;
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

  const { opacity, translateY } = useScreenFade();
  const [view, setView] = useState<ViewType>('sections');
  const [sections, setSections] = useState<TOEFLSection[]>(defaultSections);
  const [stats, setStats] = useState({ total: 0, completed: 0, avgProgress: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState<TOEFLSection | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: string]: number }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const volumeRef = useRef(1.0);
  const trackWidthRef = useRef(100);
  const volumePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => applyVolume(e.nativeEvent.locationX),
      onPanResponderMove: (e: GestureResponderEvent) => applyVolume(e.nativeEvent.locationX),
    })
  ).current;
  const [speakingPlayingIdx, setSpeakingPlayingIdx] = useState<number | null>(null);
  const [writingInput, setWritingInput] = useState('');
  const [paraphraseFeedback, setParaphraseFeedback] = useState<{
    score: number;
    meaning: string;
    vocabulary: string;
    grammar: string;
    suggestion: string;
    rewrite: string;
  } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [loadStartTime] = useState(Date.now());
  const [toeflProblems, setToeflProblems] = useState<any>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [audioTurns, setAudioTurns] = useState<{ speaker: string; url: string }[]>([]);
  const isStoppedRef = useRef(false);
  const currentSoundRef = useRef<Audio.Sound | null>(null);

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
    const init = async () => {
      await checkAndResetDaily();
      await loadData();
    };
    init();
  }, []);

  useEffect(() => {
    updateStats();
  }, [sections]);

  useEffect(() => {
    if (selectedSection?.id === 'listening' && toeflProblems?.listening?.script) {
      setAudioTurns(buildAudioTurns(toeflProblems.listening.script));
    }
  }, [selectedSection, toeflProblems]);

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

  // 로컬 AsyncStorage + Firebase 완료 기록을 병합해 섹션 상태를 복원한다.
  // 재설치 후에도 Firebase에 남은 오늘 완료 기록이 반영된다.
  const loadData = async () => {
    try {
      const savedSections = await AsyncStorage.getItem('toefl_sections');
      let baseSections: typeof defaultSections = savedSections
        ? (JSON.parse(savedSections) as typeof defaultSections)
        : defaultSections;
      if (!Array.isArray(baseSections)) baseSections = defaultSections;

      const today = getKSTDateString();
      const db = getDatabase(getFirebaseApp());
      const keyMap: Record<string, string> = {
        reading: 'toefl_reading',
        listening: 'toefl_listening',
        writing: 'toefl_writing',
        speaking: 'toefl_speaking',
      };
      const snaps = await Promise.all(
        baseSections.map(s => get(userRef(uid, `completion/${keyMap[s.id]}/${today}`)).catch(() => null))
      );
      const merged = baseSections.map((s, i) => {
        const firebaseDone = snaps[i]?.val() === true;
        if (firebaseDone && !s.completed) return { ...s, completed: true, progress: 100 };
        return s;
      });
      setSections(merged);
      await AsyncStorage.setItem('toefl_sections', JSON.stringify(merged));
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
      const keyMap: Record<string, string> = {
        reading: 'toefl_reading',
        listening: 'toefl_listening',
        writing: 'toefl_writing',
        speaking: 'toefl_speaking',
      };
      const fbKey = keyMap[sectionId];
      if (fbKey) {
        const today = getKSTDateString();
        const db = getDatabase(getFirebaseApp());
        dbSet(userRef(uid, `completion/${fbKey}/${today}`), true).catch(() => {});
      }
    }
  };

  const selectAnswer = (questionId: string, optionIndex: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const VOICE_MAP: Record<string, string> = {
    'Narrator':  'nova',
    'Professor': 'shimmer',
    'Student A': 'fable',
    'Student B': 'echo',
    'Man':       'fable',
    'Woman':     'nova',
  };

  function parseScriptToTurns(script: string): { speaker: string; text: string }[] {
    const speakerNames = Object.keys(VOICE_MAP).join('|');
    const pattern = new RegExp(`(?=(?:${speakerNames})\\s*:)`, 'g');
    return script
      .split(pattern)
      .filter(s => s.trim())
      .map(segment => {
        const match = segment.match(/^([^:]+?)\s*:\s*([\s\S]*)/);
        return match ? { speaker: match[1].trim(), text: match[2].trim() } : null;
      })
      .filter((t): t is { speaker: string; text: string } => t !== null && VOICE_MAP[t.speaker] !== undefined);
  }

  const buildAudioTurns = (script: string) => {
    const turns = parseScriptToTurns(script);
    return turns.map(({ speaker, text }) => ({
      speaker,
      url: `${NETLIFY_BASE_URL}/api/toefl-tts?speaker=${encodeURIComponent(speaker)}&text=${encodeURIComponent(text)}`,
    }));
  };

  const applyVolume = (locationX: number) => {
    const v = Math.max(0, Math.min(1, locationX / trackWidthRef.current));
    volumeRef.current = v;
    setVolume(v);
    currentSoundRef.current?.setVolumeAsync(v).catch(() => {});
  };

  const playListeningAudio = async (turns: { speaker: string; url: string }[]) => {
    isStoppedRef.current = false;
    setIsPlaying(true);
    setCurrentSpeaker(null);

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    } catch {}

    for (const { speaker, url } of turns) {
      if (isStoppedRef.current) break;
      setCurrentSpeaker(speaker);
      try {
        const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true, volume: volumeRef.current });
        currentSoundRef.current = sound;
        await new Promise<void>(resolve => {
          sound.setOnPlaybackStatusUpdate(status => {
            if (status.isLoaded && (status.didJustFinish || isStoppedRef.current)) {
              sound.unloadAsync().catch(() => {});
              resolve();
            }
          });
        });
      } catch (err) {
        console.error('Audio play error:', err);
      }
    }

    currentSoundRef.current = null;
    setIsPlaying(false);
    setCurrentSpeaker(null);
  };

  // Fallback to expo-speech when audioTurns not available
  const playAudio = async (text: string) => {
    try {
      setIsPlaying(true);
      await Speech.speak(text, { language: 'en', rate: 0.9, pitch: 1 });
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
    isStoppedRef.current = true;
    if (currentSoundRef.current) {
      await currentSoundRef.current.stopAsync().catch(() => {});
      await currentSoundRef.current.unloadAsync().catch(() => {});
      currentSoundRef.current = null;
    }
    await Speech.stop().catch(() => {});
    setIsPlaying(false);
    setCurrentSpeaker(null);
    setSpeakingPlayingIdx(null);
  };

  const requestParaphraseFeedback = async (original: string) => {
    const answer = writingInput.trim();
    if (!answer) {
      Alert.alert('알림', '패러프레이즈를 입력해주세요.');
      return;
    }
    setFeedbackLoading(true);
    setParaphraseFeedback(null);
    try {
      const res = await fetch(`${NETLIFY_BASE_URL}/api/paraphrase-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original, userAnswer: answer }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 100)}`);
      }
      const data = await res.json();
      setParaphraseFeedback(data);
    } catch (error: any) {
      Alert.alert('오류', `AI 피드백 실패\n${error?.message ?? String(error)}`);
    } finally {
      setFeedbackLoading(false);
    }
  };

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
          {currentSpeaker && (
            <Text style={styles.currentSpeakerText}>🗣️ {currentSpeaker}</Text>
          )}
          <View style={styles.volumeRow}>
            <Text style={styles.volumeIcon}>🔈</Text>
            <View
              style={styles.volumeTrack}
              onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
              {...volumePan.panHandlers}
            >
              <View style={[styles.volumeFill, { width: `${volume * 100}%` as any }]} />
              <View style={[styles.volumeThumb, { left: `${volume * 100}%` as any }]} />
            </View>
            <Text style={styles.volumeIcon}>🔊</Text>
          </View>

          <View style={styles.audioControls}>
            <TouchableOpacity
              style={[styles.audioButton, isPlaying && styles.audioButtonActive]}
              onPress={() => audioTurns.length > 0 ? playListeningAudio(audioTurns) : playAudio(scriptText)}
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
              onPress={async () => {
                await stopAudio();
                setTimeout(() => audioTurns.length > 0 ? playListeningAudio(audioTurns) : playAudio(scriptText), 200);
              }}
            >
              <Text style={styles.audioButtonText}>🔄 처음부터</Text>
            </TouchableOpacity>
          </View>
          {isPlaying && !currentSpeaker && <Text style={styles.playingIndicator}>🔊 재생 중...</Text>}
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
    const sentence = getDailySentence();
    const scoreColor = paraphraseFeedback
      ? paraphraseFeedback.score >= 8 ? '#10b981'
        : paraphraseFeedback.score >= 5 ? '#f59e0b'
        : '#ef4444'
      : '#0095f6';

    return (
      <ScrollView style={styles.contentScroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.contentTitle}>✍️ Paraphrasing</Text>

        {/* 오늘의 문장 */}
        <View style={styles.writingPromptBox}>
          <Text style={styles.writingPromptLabel}>📌 오늘의 문장</Text>
          <Text style={styles.writingModelSentence}>{sentence}</Text>
        </View>

        <Text style={styles.writingLabel}>
          같은 의미를 다른 단어와 문장 구조로 표현해보세요.
        </Text>

        {/* 입력 */}
        <TextInput
          style={styles.writingLineInput}
          placeholder="여기에 패러프레이즈를 입력하세요..."
          placeholderTextColor="#94a3b8"
          value={writingInput}
          onChangeText={text => {
            setWritingInput(text);
            if (paraphraseFeedback) setParaphraseFeedback(null);
          }}
          multiline
          textAlignVertical="top"
        />

        {/* 피드백 버튼 */}
        <TouchableOpacity
          style={[styles.feedbackBtn, feedbackLoading && { opacity: 0.6 }]}
          onPress={() => requestParaphraseFeedback(sentence)}
          disabled={feedbackLoading}
        >
          {feedbackLoading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.feedbackBtnText}>🤖 AI 피드백 받기</Text>
          }
        </TouchableOpacity>

        {/* 피드백 결과 */}
        {paraphraseFeedback && (
          <View style={styles.feedbackPanel}>
            {/* 점수 */}
            <View style={[styles.scoreRow, { borderLeftColor: scoreColor }]}>
              <Text style={[styles.scoreNum, { color: scoreColor }]}>
                {paraphraseFeedback.score}
                <Text style={styles.scoreDenom}>/10</Text>
              </Text>
              <Text style={styles.scoreLabel}>종합 점수</Text>
            </View>

            <FeedbackItem label="💬 의미 보존" text={paraphraseFeedback.meaning} />
            <FeedbackItem label="📖 어휘 다양성" text={paraphraseFeedback.vocabulary} />
            <FeedbackItem label="✏️ 문법" text={paraphraseFeedback.grammar} />
            <FeedbackItem label="💡 개선 방향" text={paraphraseFeedback.suggestion} highlight />

            {/* 개선된 예시 */}
            <View style={styles.rewriteBox}>
              <Text style={styles.rewriteLabel}>✨ 개선 예시</Text>
              <Text style={styles.rewriteText}>{paraphraseFeedback.rewrite}</Text>
            </View>

            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                setWritingInput('');
                setParaphraseFeedback(null);
              }}
            >
              <Text style={styles.retryBtnText}>다시 써보기</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
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
          <PassageWithLookup
            text={reading.passage}
            vocabulary={reading.vocabulary}
            textStyle={styles.passageText}
          />
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
          <ActivityIndicator size="large" color="#0095f6" />
          <Text style={styles.loadingText}>TOEFL 데이터를 로드하는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // selectedSection은 목록에서 탭한 시점의 스냅샷이므로, sections 최신 상태에서 파생
  const liveSection = selectedSection
    ? (sections.find(s => s.id === selectedSection.id) ?? selectedSection)
    : null;

  return (
    <SafeAreaView style={styles.screen}>
      <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.headerTitle}>🎓 TOEFL iBT</Text>
            <Text style={styles.headerSubtitle}>4가지 영역 연습</Text>
          </View>
          {!selectedSection && (
            <TouchableOpacity
              onPress={() => setView(v => v === 'stats' ? 'sections' : 'stats')}
              style={{ padding: 8, borderRadius: 8, backgroundColor: view === 'stats' ? '#3b82f6' : '#f0f0f0' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: view === 'stats' ? '#fff' : '#555' }}>
                {view === 'stats' ? '← 목록' : '📊 통계'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {liveSection ? (
        <ScrollView style={styles.detailView}>
          <TouchableOpacity onPress={() => { setSelectedSection(null); setSelectedAnswers({}); }} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 뒤로</Text>
          </TouchableOpacity>

          <View style={styles.detailHeader}>
            <Text style={styles.detailEmoji}>{liveSection.emoji}</Text>
            <Text style={styles.detailTitle}>{liveSection.name}</Text>
          </View>

          <Text style={styles.detailDesc}>{liveSection.description}</Text>

          {liveSection.id === 'reading' && renderReadingContent()}
          {liveSection.id === 'listening' && renderListeningContent()}
          {liveSection.id === 'writing' && renderWritingContent()}
          {liveSection.id === 'speaking' && renderSpeakingContent()}

          <View style={styles.progressSection}>
            <Text style={styles.progressLabel}>진행 상황</Text>
            <View style={[styles.progressBar, { borderColor: liveSection.color }]}>
              <View style={[styles.progressFill, { width: `${liveSection.progress}%`, backgroundColor: liveSection.color }]} />
            </View>
            <Text style={styles.progressPercent}>{liveSection.progress}%</Text>

            <TouchableOpacity
              style={[styles.completeBtn, { borderColor: liveSection.color }]}
              onPress={() => toggleCompletion(liveSection.id)}
            >
              <Text style={[styles.completeBtnText, { color: liveSection.color }]}>
                {liveSection.completed ? '✓ 완료됨' : '완료 표시'}
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
      </Animated.View>
    </SafeAreaView>
  );
}

function FeedbackItem({ label, text, highlight = false }: { label: string; text: string; highlight?: boolean }) {
  return (
    <View style={highlight ? styles.feedbackItemHighlight : styles.feedbackItem}>
      <Text style={styles.feedbackItemLabel}>{label}</Text>
      <Text style={styles.feedbackItemText}>{text}</Text>
    </View>
  );
}

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
  passageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
  },
  explanationText: {
    fontSize: 13,
    color: '#8e8e8e',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#dbdbdb',
    fontStyle: 'italic',
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
    paddingVertical: 10,
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
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 5,
    elevation: 0,
  },
  cardCompleted: {
    opacity: 0.5,
    backgroundColor: '#fafafa',
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
    fontWeight: '600',
    color: '#262626',
    marginBottom: 2,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  completeBadge: {
    fontSize: 20,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
  },
  progressText: {
    fontSize: 12,
    color: '#8e8e8e',
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
    color: '#0095f6',
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
    fontWeight: '600',
    color: '#262626',
  },
  detailDesc: {
    fontSize: 14,
    color: '#8e8e8e',
    marginBottom: 24,
    lineHeight: 20,
  },
  contentScroll: {
    marginBottom: 24,
  },
  contentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 16,
  },
  passageBox: {
    backgroundColor: '#fafafa',
    padding: 18,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  passageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 12,
  },
  passageText: {
    fontSize: 17,
    color: '#262626',
    lineHeight: 36,
    fontWeight: '400',
  },
  passageVocabHighlight: {
    color: '#0095f6',
    textDecorationLine: 'underline',
  },
  wordTooltip: {
    position: 'absolute',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 120,
    maxWidth: 210,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  wordTooltipWord: {
    color: '#f0f9ff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  wordTooltipMeaning: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '500',
  },
  wordTooltipNone: {
    color: '#94a3b8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  wordTooltipGoogleBtn: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: 7,
    alignItems: 'center',
  },
  wordTooltipGoogleText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
  },
  vocabBox: {
    backgroundColor: '#fafafa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  vocabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 10,
  },
  vocabItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  vocabWord: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  vocabMeaning: {
    fontSize: 13,
    color: '#8e8e8e',
  },
  questionsBox: {
    marginTop: 8,
  },
  questionsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
  },
  questionBox: {
    backgroundColor: '#fafafa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 3,
    borderLeftColor: '#0095f6',
  },
  questionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
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
    borderColor: '#dbdbdb',
  },
  optionButtonSelected: {
    borderColor: '#0095f6',
    backgroundColor: '#e7f5ff',
  },
  optionButtonCorrect: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  optionText: {
    fontSize: 13,
    color: '#262626',
    fontWeight: '400',
  },
  optionTextSelected: {
    fontWeight: '600',
    color: '#262626',
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
    borderTopColor: '#dbdbdb',
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 8,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
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
    fontWeight: '600',
  },
  audioBox: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  audioLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  volumeIcon: {
    fontSize: 14,
  },
  volumeTrack: {
    flex: 1,
    height: 20,
    backgroundColor: '#efefef',
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  volumeFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#0095f6',
    borderRadius: 10,
  },
  volumeThumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#0095f6',
    top: 2,
    marginLeft: -8,
  },
  audioControls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  audioButton: {
    flex: 1,
    backgroundColor: '#0095f6',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioButtonActive: {
    backgroundColor: '#0077c2',
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
  currentSpeakerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 8,
    textAlign: 'center',
  },
  playingIndicator: {
    marginTop: 10,
    fontSize: 12,
    color: '#0095f6',
    fontWeight: '600',
    textAlign: 'center',
  },
  writingPromptBox: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 4,
    borderLeftColor: '#0095f6',
  },
  writingPromptLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 8,
  },
  writingPrompt: {
    fontSize: 14,
    lineHeight: 22,
    color: '#262626',
  },
  writingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
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
    color: '#262626',
    lineHeight: 20,
    marginBottom: 6,
  },
  writingLineInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#262626',
    minHeight: 120,
    marginHorizontal: 16,
    marginTop: 4,
    lineHeight: 22,
  },
  feedbackBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#0095f6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  feedbackBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  feedbackPanel: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    padding: 16,
    gap: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0095f6',
    marginBottom: 4,
  },
  scoreNum: {
    fontSize: 36,
    fontWeight: '600',
    color: '#0095f6',
  },
  scoreDenom: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  scoreLabel: {
    fontSize: 14,
    color: '#8e8e8e',
    fontWeight: '600',
  },
  feedbackItem: {
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  feedbackItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
    marginBottom: 4,
  },
  feedbackItemText: {
    fontSize: 14,
    color: '#262626',
    lineHeight: 20,
  },
  feedbackItemHighlight: {
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 3,
    borderLeftColor: '#0095f6',
  },
  rewriteBox: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 3,
    borderLeftColor: '#0095f6',
  },
  rewriteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 6,
  },
  rewriteText: {
    fontSize: 14,
    color: '#262626',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  retryBtn: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  retryBtnText: {
    fontSize: 13,
    color: '#8e8e8e',
    fontWeight: '600',
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
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 18,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  scriptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  scriptText: {
    fontSize: 17,
    lineHeight: 36,
    color: '#262626',
    fontFamily: 'System',
  },
  speakingPromptBox: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 4,
    borderLeftColor: '#0095f6',
  },
  speakingPromptLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 8,
  },
  speakingPrompt: {
    fontSize: 14,
    lineHeight: 22,
    color: '#262626',
  },
  speakingLinesBox: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 4,
    borderLeftColor: '#0095f6',
  },
  speakingLinesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0095f6',
    marginBottom: 10,
  },
  speakingLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  speakingLineText: {
    flex: 1,
    fontSize: 13,
    color: '#262626',
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
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 4,
    borderLeftColor: '#8e8e8e',
  },
  speakingTipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 10,
  },
  speakingTipText: {
    fontSize: 13,
    color: '#8e8e8e',
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
