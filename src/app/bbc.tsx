import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { getDatabase, get, ref, query, orderByKey, limitToLast } from 'firebase/database';
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
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

// ─── Types ────────────────────────────────────────────────────────────────
interface VocabItem { word: string; definition_en: string; meaning_ko: string }
interface QuestionItem { question: string; answer: string }
interface ReadingData {
  title: string; category: string; url: string;
  summary_ko: string; paragraphs: string[];
  vocabulary: VocabItem[]; comprehension_questions: QuestionItem[];
}
interface PodcastEpisode {
  source: string; title: string; script: string;
  audio_url: string; duration_sec: number;
  pub_date: string; episode_url: string;
}

const PODCAST_SOURCES = [
  { key: 'bbc_learning', label: 'BBC Learning English', color: '#dc2626' },
  { key: 'npr_upfirst',  label: 'NPR Up First',         color: '#1a56db' },
  { key: 'voa',          label: 'VOA Learning English',  color: '#059669' },
] as const;

// ─── BBC Reading detail view ───────────────────────────────────────────────
function ReadingView({ data, onBack }: { data: ReadingData; onBack: () => void }) {
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  return (
    <ScrollView style={styles.detailContainer} contentContainerStyle={styles.detailContent}>
      <TouchableOpacity onPress={onBack} style={styles.backRow}>
        <MaterialIcons name="arrow-back" size={20} color="#262626" />
        <Text style={styles.backText}>Reading</Text>
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
      <Text style={styles.sectionSubtitle}>Article</Text>
      {data.paragraphs.map((p, i) => <Text key={i} style={styles.paragraph}>{p}</Text>)}
      <Text style={styles.sectionSubtitle}>Vocabulary</Text>
      {data.vocabulary.map((v, i) => (
        <View key={i} style={styles.vocabCard}>
          <Text style={styles.vocabWord}>{v.word}</Text>
          <Text style={styles.vocabDef}>{v.definition_en}</Text>
          <Text style={styles.vocabKo}>{v.meaning_ko}</Text>
        </View>
      ))}
      <Text style={styles.sectionSubtitle}>Comprehension Check</Text>
      {data.comprehension_questions.map((q, i) => (
        <TouchableOpacity key={i} style={styles.questionCard}
          onPress={() => setExpandedQ(expandedQ === i ? null : i)} activeOpacity={0.8}>
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

// ─── Podcast episode card ─────────────────────────────────────────────────
function EpisodeCard({ ep, color, label }: { ep: PodcastEpisode; color: string; label: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(ep.duration_sec || 0);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptFull, setScriptFull] = useState(false);

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
    if (playing) { await soundRef.current?.pauseAsync(); setPlaying(false); return; }
    if (soundRef.current) { await soundRef.current.playAsync(); setPlaying(true); return; }
    setLoading(true);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: ep.audio_url }, { shouldPlay: true }, onStatus
      );
      soundRef.current = sound;
      setPlaying(true);
    } catch (e: any) {
      Alert.alert('재생 오류', `오디오를 불러올 수 없습니다.\n${e?.message ?? '알 수 없는 오류'}`);
    } finally { setLoading(false); }
  };

  const handleStop = async () => {
    await soundRef.current?.stopAsync();
    await soundRef.current?.setPositionAsync(0);
    setPlaying(false); setPositionSec(0);
  };

  const pct = durationSec > 0 ? (positionSec / durationSec) * 100 : 0;
  const PREVIEW = 300;
  const hasMore = ep.script?.length > PREVIEW;
  const displayScript = scriptFull ? ep.script : ep.script?.slice(0, PREVIEW);

  return (
    <View style={[styles.episodeCard, { borderLeftColor: color }]}>
      {/* 소스 배지 + 날짜 */}
      <View style={styles.epHeader}>
        <View style={[styles.sourceBadge, { backgroundColor: color }]}>
          <Text style={styles.sourceBadgeText}>{label}</Text>
        </View>
        <Text style={styles.epDate}>{ep.pub_date}</Text>
        {ep.episode_url ? (
          <TouchableOpacity onPress={() => Linking.openURL(ep.episode_url)}>
            <MaterialIcons name="open-in-new" size={14} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.epTitle}>{ep.title}</Text>

      {/* 플레이어 */}
      <View style={styles.playerRow}>
        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: loading ? '#4b5563' : color }]}
          onPress={handlePlayPause} disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={24} color="#fff" />}
        </TouchableOpacity>
        <View style={styles.playerCenter}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={styles.playerTime}>
            {positionSec > 0 ? `${formatDuration(positionSec)} / ` : ''}{formatDuration(durationSec)}
          </Text>
        </View>
        {(playing || positionSec > 0) && (
          <TouchableOpacity onPress={handleStop} style={styles.iconBtn}>
            <MaterialIcons name="stop" size={18} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* 스크립트 */}
      {ep.script ? (
        <>
          <TouchableOpacity style={styles.scriptToggle} onPress={() => setScriptOpen(v => !v)}>
            <Text style={[styles.scriptToggleText, { color }]}>SCRIPT</Text>
            <MaterialIcons name={scriptOpen ? 'expand-less' : 'expand-more'} size={18} color={color} />
          </TouchableOpacity>
          {scriptOpen && (
            <>
              <Text style={styles.scriptText}>{displayScript}{!scriptFull && hasMore ? '…' : ''}</Text>
              {hasMore && (
                <TouchableOpacity onPress={() => setScriptFull(v => !v)}>
                  <Text style={[styles.scriptMoreText, { color }]}>
                    {scriptFull ? '접기 ▲' : `전체 보기 (${ep.script.length.toLocaleString()}자) ▼`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      ) : null}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────
export default function BBCScreen() {
  const [reading, setReading] = useState<ReadingData | null>(null);
  const [loadingReading, setLoadingReading] = useState(true);
  const [podcasts, setPodcasts] = useState<Record<string, PodcastEpisode | null>>({});
  const [loadingPodcasts, setLoadingPodcasts] = useState(true);
  const [view, setView] = useState<'home' | 'reading'>('home');
  const today = getKSTDateString();

  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    get(ref(db, `english/bbc/${today}`))
      .then(snap => { if (snap.exists()) setReading(snap.val().reading as ReadingData); })
      .catch(e => console.error('BBC reading:', e?.message))
      .finally(() => setLoadingReading(false));
  }, [today]);

  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    Promise.all(
      PODCAST_SOURCES.map(src =>
        get(query(ref(db, `english/podcasts/${src.key}`), orderByKey(), limitToLast(1)))
          .then(snap => {
            if (!snap.exists()) return [src.key, null] as const;
            const vals = Object.values(snap.val() as Record<string, PodcastEpisode>);
            return [src.key, vals[0]] as const;
          })
          .catch(() => [src.key, null] as const)
      )
    ).then(results => {
      const map: Record<string, PodcastEpisode | null> = {};
      results.forEach(([k, v]) => { map[k] = v; });
      setPodcasts(map);
    }).finally(() => setLoadingPodcasts(false));
  }, [today]);

  if (view === 'reading' && reading) {
    return <ReadingView data={reading} onBack={() => setView('home')} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dateLabel}>{today}</Text>

      {/* ── Reading ────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <MaterialIcons name="menu-book" size={18} color="#111827" />
        <Text style={styles.sectionTitle}>Reading</Text>
      </View>

      {loadingReading ? (
        <View style={styles.skeleton}>
          <ActivityIndicator size="small" color="#9ca3af" />
          <Text style={styles.skeletonText}>불러오는 중...</Text>
        </View>
      ) : reading ? (
        <TouchableOpacity style={[styles.readingCard, { borderLeftColor: '#1d4ed8' }]}
          onPress={() => setView('reading')} activeOpacity={0.85}>
          <View style={styles.readingCardInner}>
            <View style={[styles.sourceBadge, { backgroundColor: '#1d4ed8' }]}>
              <Text style={styles.sourceBadgeText}>BBC</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.readingTitle} numberOfLines={2}>{reading.title}</Text>
              <Text style={styles.readingSub}>
                어휘 {reading.vocabulary?.length ?? 0}개 · 이해확인 {reading.comprehension_questions?.length ?? 0}문항
              </Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
        </TouchableOpacity>
      ) : (
        <View style={[styles.skeleton, { borderLeftWidth: 3, borderLeftColor: '#bfdbfe' }]}>
          <Text style={styles.skeletonText}>오늘의 뉴스 리딩이 아직 생성되지 않았습니다 (05:00 KST)</Text>
        </View>
      )}

      {/* ── Listening ──────────────────────────────── */}
      <View style={[styles.sectionHeader, { marginTop: 28 }]}>
        <MaterialIcons name="headphones" size={18} color="#111827" />
        <Text style={styles.sectionTitle}>Listening</Text>
      </View>

      {loadingPodcasts ? (
        <View style={styles.skeleton}>
          <ActivityIndicator size="small" color="#9ca3af" />
          <Text style={styles.skeletonText}>팟캐스트 불러오는 중...</Text>
        </View>
      ) : (
        PODCAST_SOURCES.map(src => {
          const ep = podcasts[src.key];
          return ep ? (
            <EpisodeCard key={src.key} ep={ep} color={src.color} label={src.label} />
          ) : (
            <View key={src.key} style={[styles.skeleton, { borderLeftWidth: 3, borderLeftColor: src.color }]}>
              <View style={[styles.sourceBadge, { backgroundColor: src.color }]}>
                <Text style={styles.sourceBadgeText}>{src.label}</Text>
              </View>
              <Text style={styles.skeletonText}>오늘의 에피소드 준비 중</Text>
            </View>
          );
        })
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 56 },
  dateLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 20, letterSpacing: 1 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },

  skeleton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f9fafb', borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  skeletonText: { fontSize: 13, color: '#9ca3af' },

  // Reading card
  readingCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f0f4ff', borderRadius: 14, padding: 16,
    marginBottom: 8, borderWidth: 1, borderColor: '#bfdbfe', borderLeftWidth: 4,
  },
  readingCardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  readingTitle: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20, marginBottom: 4 },
  readingSub: { fontSize: 12, color: '#4b5563' },

  // Episode card
  episodeCard: {
    backgroundColor: '#fafafa', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 4,
  },
  epHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  sourceBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  epDate: { fontSize: 11, color: '#9ca3af', fontWeight: '600', flex: 1 },
  epTitle: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20, marginBottom: 12 },

  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playerCenter: { flex: 1 },
  progressBg: { height: 3, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden', marginBottom: 3 },
  progressFill: { height: 3, borderRadius: 2 },
  playerTime: { fontSize: 10, color: '#9ca3af' },
  iconBtn: { padding: 4 },

  scriptToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  scriptToggleText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  scriptText: { fontSize: 13, color: '#374151', lineHeight: 20, marginTop: 8 },
  scriptMoreText: { fontSize: 12, fontWeight: '600', marginTop: 8 },

  // Reading detail
  detailContainer: { flex: 1, backgroundColor: '#fff' },
  detailContent: { padding: 20, paddingTop: 56 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 6 },
  backText: { fontSize: 15, color: '#262626', fontWeight: '500' },
  sectionSubtitle: { fontSize: 13, fontWeight: '700', color: '#262626', marginTop: 28, marginBottom: 12 },
  categoryBadge: { alignSelf: 'flex-start', backgroundColor: '#dbeafe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 10 },
  categoryText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8', letterSpacing: 0.5 },
  articleTitle: { fontSize: 20, fontWeight: '800', color: '#111827', lineHeight: 28, marginBottom: 10 },
  articleLink: { fontSize: 12, color: '#1d4ed8', marginBottom: 20 },
  summaryBox: { backgroundColor: '#eff6ff', padding: 14, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#3b82f6', marginBottom: 4 },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: '#1e40af', marginBottom: 6, letterSpacing: 0.5 },
  summaryText: { fontSize: 14, color: '#1e3a5f', lineHeight: 21 },
  paragraph: { fontSize: 15, color: '#374151', lineHeight: 25, marginBottom: 14 },
  vocabCard: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  vocabWord: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  vocabDef: { fontSize: 13, color: '#4b5563', marginBottom: 4, lineHeight: 19 },
  vocabKo: { fontSize: 13, color: '#6b7280' },
  questionCard: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  questionText: { fontSize: 14, color: '#111827', lineHeight: 20, flex: 1, paddingRight: 8, fontWeight: '500' },
  answerText: { fontSize: 14, color: '#059669', lineHeight: 20, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#d1fae5' },
});
