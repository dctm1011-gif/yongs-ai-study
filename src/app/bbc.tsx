import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { getDatabase, get, ref } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { MaterialIcons } from '@expo/vector-icons';

function getKSTDateString(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

function formatDuration(sec: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m >= 60
    ? `${Math.floor(m / 60)}시간 ${m % 60}분`
    : `${m}분 ${s}초`;
}

// ─── Firebase data types ───────────────────────────────────────────────────
interface VocabItem { word: string; definition_en: string; meaning_ko: string }
interface QuestionItem { question: string; answer: string }
interface ReadingData {
  title: string; category: string; url: string;
  summary_ko: string; paragraphs: string[];
  vocabulary: VocabItem[]; comprehension_questions: QuestionItem[];
}
interface PodcastEpisode {
  source: string; source_ko: string;
  title: string; description: string;
  audio_url: string; duration_sec: number; published: string;
}
interface BBCDailyData {
  date: string; source_url: string;
  reading: ReadingData;
  podcasts: { npr?: PodcastEpisode; bbc_global?: PodcastEpisode };
}

type ViewMode = 'home' | 'reading' | 'podcast_npr' | 'podcast_bbc';

// ─── RSS Podcast Player ────────────────────────────────────────────────────
function RssPodcastView({ episode, onBack }: { episode: PodcastEpisode; onBack: () => void }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(episode.duration_sec || 0);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPositionSec(Math.floor((status.positionMillis ?? 0) / 1000));
    if (status.durationMillis) setDurationSec(Math.floor(status.durationMillis / 1000));
    if (status.didJustFinish) { setPlaying(false); setPositionSec(0); }
  }, []);

  const handlePlayPause = async () => {
    if (playing) {
      await soundRef.current?.pauseAsync();
      setPlaying(false);
      return;
    }
    if (soundRef.current) {
      await soundRef.current.playAsync();
      setPlaying(true);
      return;
    }
    setLoading(true);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: episode.audio_url },
        { shouldPlay: true },
        onStatus
      );
      soundRef.current = sound;
      setPlaying(true);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    await soundRef.current?.stopAsync();
    await soundRef.current?.setPositionAsync(0);
    setPlaying(false);
    setPositionSec(0);
  };

  const isNpr = episode.source.toLowerCase().includes('npr');
  const accentColor = isNpr ? '#1a56db' : '#b91c1c';
  const progressPct = durationSec > 0 ? (positionSec / durationSec) * 100 : 0;

  return (
    <ScrollView style={styles.detailContainer} contentContainerStyle={styles.detailContent}>
      <TouchableOpacity onPress={() => { handleStop(); onBack(); }} style={styles.backRow}>
        <MaterialIcons name="arrow-back" size={20} color="#262626" />
        <Text style={styles.backText}>BBC</Text>
      </TouchableOpacity>

      <View style={[styles.podcastBadge, { backgroundColor: accentColor }]}>
        <Text style={styles.podcastBadgeText}>{episode.source}</Text>
      </View>
      <Text style={styles.podcastEpTitle}>{episode.title}</Text>
      {episode.published ? (
        <Text style={styles.podcastPubDate}>{episode.published.slice(0, 22)}</Text>
      ) : null}

      {/* Player */}
      <View style={[styles.playerCard, { borderLeftColor: accentColor }]}>
        <View style={styles.playerRow}>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: accentColor }, loading && styles.playBtnLoading]}
            onPress={handlePlayPause}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={32} color="#fff" />}
          </TouchableOpacity>

          <View style={styles.playerMeta}>
            <Text style={styles.playerTime}>
              {formatDuration(positionSec)} / {formatDuration(durationSec)}
            </Text>
          </View>

          {playing && (
            <TouchableOpacity onPress={handleStop} style={styles.stopBtn}>
              <MaterialIcons name="stop" size={22} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Progress bar */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${progressPct}%` as any, backgroundColor: accentColor }]} />
        </View>
      </View>

      {episode.description ? (
        <>
          <Text style={styles.sectionTitle}>에피소드 설명</Text>
          <Text style={styles.epDescription}>{episode.description}</Text>
        </>
      ) : null}

      <TouchableOpacity
        style={styles.sourceLink}
        onPress={() => Linking.openURL(
          isNpr ? 'https://www.npr.org/podcasts/500005/npr-news-now'
                : 'https://www.bbc.co.uk/programmes/p02nq0gn'
        )}
      >
        <MaterialIcons name="open-in-new" size={14} color="#1d4ed8" />
        <Text style={styles.sourceLinkText}>원본 팟캐스트 보기</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Reading view ─────────────────────────────────────────────────────────
function ReadingView({ data, onBack }: { data: ReadingData; onBack: () => void }) {
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
        <Text style={styles.articleLink}>원문 보기 →</Text>
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
          key={i} style={styles.questionCard}
          onPress={() => setExpandedQ(expandedQ === i ? null : i)}
          activeOpacity={0.8}
        >
          <View style={styles.questionRow}>
            <Text style={styles.questionText}>Q{i + 1}. {q.question}</Text>
            <MaterialIcons name={expandedQ === i ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </View>
          {expandedQ === i && <Text style={styles.answerText}>{q.answer}</Text>}
        </TouchableOpacity>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Home cards ───────────────────────────────────────────────────────────
function HomeView({
  data, date, onSelectReading, onSelectNpr, onSelectBbc,
}: {
  data: BBCDailyData; date: string;
  onSelectReading: () => void; onSelectNpr: () => void; onSelectBbc: () => void;
}) {
  const npr = data.podcasts?.npr;
  const bbc = data.podcasts?.bbc_global;

  return (
    <ScrollView style={styles.homeContainer} contentContainerStyle={styles.homeContent}>
      <Text style={styles.dateLabel}>{date}</Text>
      <Text style={styles.todayTitle} numberOfLines={3}>{data.reading.title}</Text>

      {/* Reading card */}
      <TouchableOpacity style={[styles.card, styles.readingCard]} onPress={onSelectReading} activeOpacity={0.85}>
        <View style={styles.cardIcon}><MaterialIcons name="article" size={30} color="#1d4ed8" /></View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>News Reading</Text>
          <Text style={styles.cardSub}>어휘 {data.reading.vocabulary?.length ?? 0}개 · 이해확인 3문항</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
      </TouchableOpacity>

      {/* NPR card */}
      {npr ? (
        <TouchableOpacity style={[styles.card, styles.nprCard]} onPress={onSelectNpr} activeOpacity={0.85}>
          <View style={styles.cardIcon}><MaterialIcons name="podcasts" size={30} color="#1a56db" /></View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>NPR News Now</Text>
            <Text style={styles.cardSub} numberOfLines={1}>{npr.title}</Text>
            {npr.duration_sec > 0 && <Text style={styles.cardDur}>{formatDuration(npr.duration_sec)}</Text>}
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
        </TouchableOpacity>
      ) : (
        <View style={[styles.card, styles.cardDisabled]}>
          <View style={styles.cardIcon}><MaterialIcons name="podcasts" size={30} color="#d1d5db" /></View>
          <View style={styles.cardInfo}><Text style={styles.cardTitleDim}>NPR News Now</Text><Text style={styles.cardSub}>오늘 에피소드 없음</Text></View>
        </View>
      )}

      {/* BBC Global News Podcast card */}
      {bbc ? (
        <TouchableOpacity style={[styles.card, styles.bbcPodCard]} onPress={onSelectBbc} activeOpacity={0.85}>
          <View style={styles.cardIcon}><MaterialIcons name="podcasts" size={30} color="#b91c1c" /></View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>BBC Global News</Text>
            <Text style={styles.cardSub} numberOfLines={1}>{bbc.title}</Text>
            {bbc.duration_sec > 0 && <Text style={styles.cardDur}>{formatDuration(bbc.duration_sec)}</Text>}
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
        </TouchableOpacity>
      ) : (
        <View style={[styles.card, styles.cardDisabled]}>
          <View style={styles.cardIcon}><MaterialIcons name="podcasts" size={30} color="#d1d5db" /></View>
          <View style={styles.cardInfo}><Text style={styles.cardTitleDim}>BBC Global News</Text><Text style={styles.cardSub}>오늘 에피소드 없음</Text></View>
        </View>
      )}

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
    (async () => {
      try {
        setLoading(true);
        const db = getDatabase(getFirebaseApp());
        const snap = await get(ref(db, `english/bbc/${today}`));
        if (snap.exists()) {
          setData(snap.val() as BBCDailyData);
        } else {
          setError(`${today} 데이터가 아직 없습니다.\nGitHub Actions가 매일 05:00 KST에 생성합니다.`);
        }
      } catch (e: any) {
        setError('데이터 로드 실패: ' + (e?.message ?? '알 수 없는 오류'));
      } finally {
        setLoading(false);
      }
    })();
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

  if (view === 'reading') return <ReadingView data={data.reading} onBack={() => setView('home')} />;
  if (view === 'podcast_npr' && data.podcasts?.npr)
    return <RssPodcastView episode={data.podcasts.npr} onBack={() => setView('home')} />;
  if (view === 'podcast_bbc' && data.podcasts?.bbc_global)
    return <RssPodcastView episode={data.podcasts.bbc_global} onBack={() => setView('home')} />;

  return (
    <HomeView
      data={data} date={today}
      onSelectReading={() => setView('reading')}
      onSelectNpr={() => setView('podcast_npr')}
      onSelectBbc={() => setView('podcast_bbc')}
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
  dateLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 8, letterSpacing: 1 },
  todayTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 24, lineHeight: 26 },

  card: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderRadius: 14, marginBottom: 12, backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  readingCard: { borderLeftWidth: 4, borderLeftColor: '#1d4ed8' },
  nprCard:     { borderLeftWidth: 4, borderLeftColor: '#1a56db' },
  bbcPodCard:  { borderLeftWidth: 4, borderLeftColor: '#b91c1c' },
  cardDisabled: { borderLeftWidth: 4, borderLeftColor: '#e5e7eb', opacity: 0.5 },
  cardIcon: { marginRight: 14 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  cardTitleDim: { fontSize: 15, fontWeight: '700', color: '#9ca3af', marginBottom: 3 },
  cardSub:  { fontSize: 12, color: '#6b7280' },
  cardDur:  { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  summaryPreview: {
    marginTop: 8, padding: 16, backgroundColor: '#fef9ee',
    borderRadius: 12, borderWidth: 1, borderColor: '#fde68a',
  },
  summaryPreviewLabel: { fontSize: 11, fontWeight: '600', color: '#92400e', marginBottom: 8, letterSpacing: 0.5 },
  summaryPreviewText:  { fontSize: 14, color: '#451a03', lineHeight: 21 },

  // Detail common
  detailContainer: { flex: 1, backgroundColor: '#fff' },
  detailContent:   { padding: 20, paddingTop: 56 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 6 },
  backText: { fontSize: 15, color: '#262626', fontWeight: '500' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#262626', marginTop: 28, marginBottom: 12, letterSpacing: 0.3 },

  // Reading
  categoryBadge: {
    alignSelf: 'flex-start', backgroundColor: '#dbeafe', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 6, marginBottom: 10,
  },
  categoryText:  { fontSize: 11, fontWeight: '700', color: '#1d4ed8', letterSpacing: 0.5 },
  articleTitle:  { fontSize: 20, fontWeight: '800', color: '#111827', lineHeight: 28, marginBottom: 10 },
  articleLink:   { fontSize: 12, color: '#1d4ed8', marginBottom: 20 },

  summaryBox:  { backgroundColor: '#eff6ff', padding: 14, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#3b82f6', marginBottom: 4 },
  summaryLabel:{ fontSize: 10, fontWeight: '700', color: '#1e40af', marginBottom: 6, letterSpacing: 0.5 },
  summaryText: { fontSize: 14, color: '#1e3a5f', lineHeight: 21 },
  paragraph:   { fontSize: 15, color: '#374151', lineHeight: 25, marginBottom: 14 },

  vocabCard: {
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  vocabWord: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  vocabDef:  { fontSize: 13, color: '#4b5563', marginBottom: 4, lineHeight: 19 },
  vocabKo:   { fontSize: 13, color: '#6b7280' },

  questionCard: {
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  questionText: { fontSize: 14, color: '#111827', lineHeight: 20, flex: 1, paddingRight: 8, fontWeight: '500' },
  answerText:   { fontSize: 14, color: '#059669', lineHeight: 20, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#d1fae5' },

  // Podcast player
  podcastBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, marginBottom: 12,
  },
  podcastBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  podcastEpTitle:   { fontSize: 18, fontWeight: '800', color: '#111827', lineHeight: 26, marginBottom: 6 },
  podcastPubDate:   { fontSize: 12, color: '#9ca3af', marginBottom: 24 },

  playerCard: {
    backgroundColor: '#1f2937', borderRadius: 14, padding: 16,
    marginBottom: 4, borderLeftWidth: 4,
  },
  playerRow:  { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  playBtn: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
  },
  playBtnLoading: { backgroundColor: '#4b5563' },
  playerMeta: { flex: 1 },
  playerTime: { fontSize: 13, color: '#e5e7eb' },
  stopBtn:    { padding: 8 },

  progressBg:   { height: 4, backgroundColor: '#374151', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  epDescription: { fontSize: 14, color: '#374151', lineHeight: 22 },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 20 },
  sourceLinkText: { fontSize: 13, color: '#1d4ed8' },
});
