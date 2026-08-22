import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { getDatabase, get, ref } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { MaterialIcons } from '@expo/vector-icons';

const NETLIFY_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';

function getKSTDateString(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

// ─── Firebase data types ───────────────────────────────────────────────────
interface VocabItem {
  word: string;
  definition_en: string;
  meaning_ko: string;
}
interface QuestionItem {
  question: string;
  answer: string;
}
interface KeyPhrase {
  phrase: string;
  meaning_ko: string;
  example: string;
}
interface ReadingData {
  title: string;
  category: string;
  url: string;
  summary_ko: string;
  paragraphs: string[];
  vocabulary: VocabItem[];
  comprehension_questions: QuestionItem[];
}
interface PodcastData {
  title: string;
  intro_ko: string;
  script: string[];
  key_phrases: KeyPhrase[];
}
interface BBCDailyData {
  date: string;
  source_url: string;
  reading: ReadingData;
  podcast: PodcastData;
}

type ViewMode = 'home' | 'reading' | 'podcast';

// ─── TTS helper ───────────────────────────────────────────────────────────
async function fetchAudioForText(text: string): Promise<string> {
  const encoded = encodeURIComponent(text);
  return `${NETLIFY_BASE_URL}/api/toefl-tts?speaker=Narrator&speed=0.95&text=${encoded}`;
}

// ─── Reading view ─────────────────────────────────────────────────────────
function ReadingView({
  data, onBack,
}: { data: ReadingData; onBack: () => void }) {
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  return (
    <ScrollView style={styles.detailContainer} contentContainerStyle={styles.detailContent}>
      <TouchableOpacity onPress={onBack} style={styles.backRow}>
        <MaterialIcons name="arrow-back" size={20} color="#262626" />
        <Text style={styles.backText}>BBC</Text>
      </TouchableOpacity>

      <View style={styles.categoryBadge}>
        <Text style={styles.categoryText}>{data.category}</Text>
      </View>
      <Text style={styles.articleTitle}>{data.title}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(data.url)}>
        <Text style={styles.sourceLink}>원문 보기 →</Text>
      </TouchableOpacity>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>한국어 요약</Text>
        <Text style={styles.summaryText}>{data.summary_ko}</Text>
      </View>

      <Text style={styles.sectionTitle}>Article</Text>
      {data.paragraphs.map((p, i) => (
        <Text key={i} style={styles.paragraph}>{p}</Text>
      ))}

      <Text style={styles.sectionTitle}>Vocabulary</Text>
      {data.vocabulary.map((v, i) => (
        <View key={i} style={styles.vocabCard}>
          <Text style={styles.vocabWord}>{v.word}</Text>
          <Text style={styles.vocabDef}>{v.definition_en}</Text>
          <Text style={styles.vocabKo}>{v.meaning_ko}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Comprehension Check</Text>
      {data.comprehension_questions.map((q, i) => (
        <TouchableOpacity
          key={i}
          style={styles.questionCard}
          onPress={() => setExpandedQ(expandedQ === i ? null : i)}
          activeOpacity={0.8}
        >
          <View style={styles.questionRow}>
            <Text style={styles.questionText}>Q{i + 1}. {q.question}</Text>
            <MaterialIcons
              name={expandedQ === i ? 'expand-less' : 'expand-more'}
              size={20} color="#666"
            />
          </View>
          {expandedQ === i && (
            <Text style={styles.answerText}>{q.answer}</Text>
          )}
        </TouchableOpacity>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Podcast view ─────────────────────────────────────────────────────────
function PodcastView({
  data, onBack,
}: { data: PodcastData; onBack: () => void }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentPara, setCurrentPara] = useState(0);
  const [loading, setLoading] = useState(false);
  const stoppedRef = useRef(false);

  // cleanup on unmount
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    return () => {
      stoppedRef.current = true;
      soundRef.current?.unloadAsync();
    };
  }, []);

  const stopPlayback = useCallback(async () => {
    stoppedRef.current = true;
    setPlaying(false);
    setLoading(false);
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  }, []);

  const playFrom = useCallback(async (startIdx: number) => {
    stoppedRef.current = false;
    setPlaying(true);

    for (let i = startIdx; i < data.script.length; i++) {
      if (stoppedRef.current) break;
      setCurrentPara(i);
      setLoading(true);

      try {
        const uri = await fetchAudioForText(data.script[i]);
        if (stoppedRef.current) break;

        if (soundRef.current) {
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        setLoading(false);

        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) resolve();
          });
        });

        if (stoppedRef.current) break;
      } catch (e) {
        setLoading(false);
        if (!stoppedRef.current) {
          Alert.alert('오디오 오류', '재생에 실패했습니다.');
        }
        break;
      }
    }

    if (!stoppedRef.current) {
      setPlaying(false);
      setCurrentPara(0);
    }
  }, [data.script]);

  const handlePlayPause = async () => {
    if (playing) {
      await stopPlayback();
    } else {
      await playFrom(currentPara);
    }
  };

  const handleParaTap = async (idx: number) => {
    await stopPlayback();
    await new Promise(r => setTimeout(r, 100));
    await playFrom(idx);
  };

  return (
    <ScrollView style={styles.detailContainer} contentContainerStyle={styles.detailContent}>
      <TouchableOpacity onPress={() => { stopPlayback(); onBack(); }} style={styles.backRow}>
        <MaterialIcons name="arrow-back" size={20} color="#262626" />
        <Text style={styles.backText}>BBC</Text>
      </TouchableOpacity>

      <View style={styles.podcastHeader}>
        <MaterialIcons name="podcasts" size={32} color="#b91c1c" />
        <Text style={styles.podcastTitle}>{data.title}</Text>
      </View>

      <View style={styles.introBox}>
        <Text style={styles.introText}>{data.intro_ko}</Text>
      </View>

      {/* Player bar */}
      <View style={styles.playerBar}>
        <TouchableOpacity
          style={[styles.playBtn, loading && styles.playBtnLoading]}
          onPress={handlePlayPause}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={32} color="#fff" />
          )}
        </TouchableOpacity>
        <View style={styles.playerInfo}>
          <Text style={styles.playerStatus}>
            {playing
              ? `재생 중 — ${currentPara + 1} / ${data.script.length}`
              : '문단을 탭하거나 재생 버튼을 누르세요'}
          </Text>
        </View>
        {playing && (
          <TouchableOpacity onPress={stopPlayback} style={styles.stopBtn}>
            <MaterialIcons name="stop" size={22} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionTitle}>Script</Text>
      {data.script.map((para, i) => (
        <TouchableOpacity
          key={i}
          style={[styles.scriptPara, currentPara === i && playing && styles.scriptParaActive]}
          onPress={() => handleParaTap(i)}
          activeOpacity={0.75}
        >
          <Text style={styles.scriptParaNum}>{i + 1}</Text>
          <Text style={styles.scriptText}>{para}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>Key Phrases</Text>
      {data.key_phrases.map((kp, i) => (
        <View key={i} style={styles.phraseCard}>
          <Text style={styles.phrase}>{kp.phrase}</Text>
          <Text style={styles.phraseMeaning}>{kp.meaning_ko}</Text>
          <Text style={styles.phraseExample}>"{kp.example}"</Text>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Home cards ───────────────────────────────────────────────────────────
function HomeView({
  data, date, onSelectReading, onSelectPodcast,
}: {
  data: BBCDailyData | null;
  date: string;
  loading: boolean;
  error: string | null;
  onSelectReading: () => void;
  onSelectPodcast: () => void;
}) {
  if (!data) return null;

  return (
    <ScrollView style={styles.homeContainer} contentContainerStyle={styles.homeContent}>
      <Text style={styles.dateLabel}>{date}</Text>
      <Text style={styles.todayTitle} numberOfLines={3}>{data.reading.title}</Text>

      <TouchableOpacity style={[styles.card, styles.readingCard]} onPress={onSelectReading} activeOpacity={0.85}>
        <View style={styles.cardIcon}>
          <MaterialIcons name="article" size={32} color="#1d4ed8" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>News Reading</Text>
          <Text style={styles.cardSub}>
            기사 읽기 + 어휘 {data.reading.vocabulary?.length ?? 0}개 + 이해 확인
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, styles.podcastCard]} onPress={onSelectPodcast} activeOpacity={0.85}>
        <View style={styles.cardIcon}>
          <MaterialIcons name="podcasts" size={32} color="#b91c1c" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>Podcast</Text>
          <Text style={styles.cardSub}>
            리스닝 스크립트 {data.podcast.script?.length ?? 0}단락 + 주요 표현
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
      </TouchableOpacity>

      <View style={styles.summaryPreview}>
        <Text style={styles.summaryPreviewLabel}>오늘 기사 요약</Text>
        <Text style={styles.summaryPreviewText}>{data.reading.summary_ko}</Text>
      </View>
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────
export default function BBCScreen() {
  const [view, setView] = useState<ViewMode>('home');
  const [data, setData] = useState<BBCDailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = getKSTDateString();

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const db = getDatabase(getFirebaseApp());
        const snap = await get(ref(db, `english/bbc/${today}`));
        if (snap.exists()) {
          setData(snap.val() as BBCDailyData);
        } else {
          setError(`${today} 데이터가 아직 없습니다.\nGitHub Actions가 매일 16:00 KST에 생성합니다.`);
        }
      } catch (e: any) {
        setError('데이터 로드 실패: ' + (e?.message ?? '알 수 없는 오류'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [today]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#b91c1c" />
        <Text style={styles.loadingText}>BBC 뉴스 불러오는 중...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="rss-feed" size={48} color="#d1d5db" />
        <Text style={styles.errorText}>{error ?? '데이터 없음'}</Text>
      </View>
    );
  }

  if (view === 'reading') {
    return <ReadingView data={data.reading} onBack={() => setView('home')} />;
  }
  if (view === 'podcast') {
    return <PodcastView data={data.podcast} onBack={() => setView('home')} />;
  }

  return (
    <HomeView
      data={data}
      date={today}
      loading={loading}
      error={error}
      onSelectReading={() => setView('reading')}
      onSelectPodcast={() => setView('podcast')}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  errorText: { marginTop: 16, color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // Home
  homeContainer: { flex: 1, backgroundColor: '#fff' },
  homeContent: { padding: 20, paddingTop: 56 },
  dateLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '500', marginBottom: 8, letterSpacing: 1 },
  todayTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 24, lineHeight: 26 },

  card: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderRadius: 14, marginBottom: 14, backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  readingCard: { borderLeftWidth: 4, borderLeftColor: '#1d4ed8' },
  podcastCard: { borderLeftWidth: 4, borderLeftColor: '#b91c1c' },
  cardIcon: { marginRight: 14 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardSub: { fontSize: 12, color: '#6b7280' },

  summaryPreview: {
    marginTop: 8, padding: 16, backgroundColor: '#fef9ee',
    borderRadius: 12, borderWidth: 1, borderColor: '#fde68a',
  },
  summaryPreviewLabel: { fontSize: 11, fontWeight: '600', color: '#92400e', marginBottom: 8, letterSpacing: 0.5 },
  summaryPreviewText: { fontSize: 14, color: '#451a03', lineHeight: 21 },

  // Detail common
  detailContainer: { flex: 1, backgroundColor: '#fff' },
  detailContent: { padding: 20, paddingTop: 56 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 6 },
  backText: { fontSize: 15, color: '#262626', fontWeight: '500' },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#262626', marginTop: 28, marginBottom: 12, letterSpacing: 0.3 },

  // Reading
  categoryBadge: {
    alignSelf: 'flex-start', backgroundColor: '#dbeafe', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 6, marginBottom: 10,
  },
  categoryText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8', letterSpacing: 0.5 },
  articleTitle: { fontSize: 20, fontWeight: '800', color: '#111827', lineHeight: 28, marginBottom: 10 },
  sourceLink: { fontSize: 12, color: '#1d4ed8', marginBottom: 20 },

  summaryBox: { backgroundColor: '#eff6ff', padding: 14, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#3b82f6', marginBottom: 4 },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: '#1e40af', marginBottom: 6, letterSpacing: 0.5 },
  summaryText: { fontSize: 14, color: '#1e3a5f', lineHeight: 21 },

  paragraph: { fontSize: 15, color: '#374151', lineHeight: 25, marginBottom: 14 },

  vocabCard: {
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  vocabWord: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  vocabDef: { fontSize: 13, color: '#4b5563', marginBottom: 4, lineHeight: 19 },
  vocabKo: { fontSize: 13, color: '#6b7280' },

  questionCard: {
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  questionText: { fontSize: 14, color: '#111827', lineHeight: 20, flex: 1, paddingRight: 8, fontWeight: '500' },
  answerText: { fontSize: 14, color: '#059669', lineHeight: 20, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#d1fae5' },

  // Podcast
  podcastHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  podcastTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#111827', lineHeight: 26 },
  introBox: { backgroundColor: '#fef2f2', padding: 14, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#ef4444', marginBottom: 20 },
  introText: { fontSize: 14, color: '#7f1d1d', lineHeight: 21 },

  playerBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937',
    borderRadius: 14, padding: 12, gap: 12, marginBottom: 4,
  },
  playBtn: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#b91c1c',
    alignItems: 'center', justifyContent: 'center',
  },
  playBtnLoading: { backgroundColor: '#6b7280' },
  playerInfo: { flex: 1 },
  playerStatus: { fontSize: 13, color: '#e5e7eb' },
  stopBtn: { padding: 8 },

  scriptPara: {
    flexDirection: 'row', gap: 10, padding: 14, borderRadius: 10,
    marginBottom: 10, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
  },
  scriptParaActive: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  scriptParaNum: { fontSize: 13, fontWeight: '700', color: '#9ca3af', minWidth: 20 },
  scriptText: { flex: 1, fontSize: 15, color: '#374151', lineHeight: 24 },

  phraseCard: {
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  phrase: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  phraseMeaning: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  phraseExample: { fontSize: 13, color: '#4b5563', fontStyle: 'italic', lineHeight: 19 },
});
