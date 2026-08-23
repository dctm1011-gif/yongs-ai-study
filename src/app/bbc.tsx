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
  { key: 'bbc_learning', label: 'BBC Learning English', color: '#dc2626', limit: 5 },
  { key: 'npr_upfirst',  label: 'NPR Up First',         color: '#1a56db', limit: 5 },
  { key: 'voa',          label: 'VOA Learning English',  color: '#059669', limit: 5 },
] as const;

// ─── BBC Reading view ─────────────────────────────────────────────────────
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
      {data.paragraphs.map((p, i) => <Text key={i} style={styles.paragraph}>{p}</Text>)}
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

// ─── Episode card ─────────────────────────────────────────────────────────
function EpisodeCard({ ep, color }: { ep: PodcastEpisode; color: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(ep.duration_sec || 0);
  const [scriptExpanded, setScriptExpanded] = useState(false);
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

  const progressPct = durationSec > 0 ? (positionSec / durationSec) * 100 : 0;
  const SCRIPT_PREVIEW = 300;
  const hasLongScript = ep.script && ep.script.length > SCRIPT_PREVIEW;
  const displayScript = scriptFull ? ep.script : ep.script?.slice(0, SCRIPT_PREVIEW);

  return (
    <View style={[styles.episodeCard, { borderLeftColor: color }]}>
      {/* 날짜 + 제목 */}
      <Text style={styles.epDate}>{ep.pub_date}</Text>
      <Text style={styles.epTitle}>{ep.title}</Text>

      {/* 플레이어 */}
      <View style={styles.playerRow}>
        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: color }, loading && styles.playBtnLoading]}
          onPress={handlePlayPause} disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={24} color="#fff" />}
        </TouchableOpacity>
        <View style={styles.playerCenter}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progressPct}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={styles.playerTime}>
            {positionSec > 0 ? `${formatDuration(positionSec)} / ` : ''}{formatDuration(durationSec)}
          </Text>
        </View>
        {(playing || positionSec > 0) && (
          <TouchableOpacity onPress={handleStop} style={styles.stopBtn}>
            <MaterialIcons name="stop" size={18} color="#6b7280" />
          </TouchableOpacity>
        )}
        {ep.episode_url ? (
          <TouchableOpacity onPress={() => Linking.openURL(ep.episode_url)} style={styles.stopBtn}>
            <MaterialIcons name="open-in-new" size={16} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 스크립트 */}
      {ep.script ? (
        <>
          <TouchableOpacity
            style={styles.scriptToggle}
            onPress={() => setScriptExpanded(v => !v)} activeOpacity={0.7}
          >
            <Text style={[styles.scriptToggleText, { color }]}>SCRIPT</Text>
            <MaterialIcons name={scriptExpanded ? 'expand-less' : 'expand-more'} size={18} color={color} />
          </TouchableOpacity>
          {scriptExpanded && (
            <View>
              <Text style={styles.scriptText}>{displayScript}</Text>
              {hasLongScript && (
                <TouchableOpacity onPress={() => setScriptFull(v => !v)} style={styles.scriptMoreBtn}>
                  <Text style={[styles.scriptMoreText, { color }]}>
                    {scriptFull ? '접기 ▲' : `전체 보기 (${ep.script.length.toLocaleString()}자) ▼`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

// ─── Podcast section (소스별) ─────────────────────────────────────────────
function PodcastSection({ sourceKey, label, color, limit }: {
  sourceKey: string; label: string; color: string; limit: number;
}) {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    get(query(ref(db, `english/podcasts/${sourceKey}`), orderByKey(), limitToLast(20)))
      .then(snap => {
        if (snap.exists()) {
          const vals = Object.values(snap.val() as Record<string, PodcastEpisode>)
            .sort((a, b) => b.pub_date.localeCompare(a.pub_date));
          setEpisodes(vals);
        }
      })
      .catch(e => console.error(`${sourceKey} load error:`, e?.message))
      .finally(() => setLoading(false));
  }, [sourceKey]);

  const displayed = showAll ? episodes : episodes.slice(0, limit);

  return (
    <View style={styles.sourceSection}>
      <View style={[styles.sourceTitleRow, { borderLeftColor: color }]}>
        <Text style={[styles.sourceTitle, { color }]}>{label}</Text>
        {loading && <ActivityIndicator size="small" color={color} />}
        {!loading && <Text style={styles.sourceCount}>{episodes.length}개</Text>}
      </View>

      {!loading && episodes.length === 0 && (
        <Text style={styles.emptyText}>에피소드가 없습니다</Text>
      )}

      {displayed.map(ep => (
        <EpisodeCard key={ep.pub_date + ep.title} ep={ep} color={color} />
      ))}

      {!showAll && episodes.length > limit && (
        <TouchableOpacity style={styles.showMoreBtn} onPress={() => setShowAll(true)}>
          <Text style={[styles.showMoreText, { color }]}>
            더 보기 ({episodes.length - limit}개 더) ▼
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────
export default function BBCScreen() {
  const [reading, setReading] = useState<ReadingData | null>(null);
  const [loadingReading, setLoadingReading] = useState(true);
  const [view, setView] = useState<'home' | 'reading'>('home');
  const today = getKSTDateString();

  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    get(ref(db, `english/bbc/${today}`))
      .then(snap => { if (snap.exists()) setReading(snap.val().reading as ReadingData); })
      .catch(e => console.error('BBC reading error:', e?.message))
      .finally(() => setLoadingReading(false));
  }, [today]);

  if (view === 'reading' && reading) {
    return <ReadingView data={reading} onBack={() => setView('home')} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dateLabel}>{today}</Text>

      {/* BBC News Reading 카드 */}
      {loadingReading ? (
        <View style={[styles.readingCard, { opacity: 0.6 }]}>
          <ActivityIndicator size="small" color="#1d4ed8" style={{ marginRight: 12 }} />
          <Text style={styles.readingCardTitle}>뉴스 리딩 불러오는 중...</Text>
        </View>
      ) : reading ? (
        <TouchableOpacity style={styles.readingCard} onPress={() => setView('reading')} activeOpacity={0.85}>
          <View style={styles.readingCardLeft}>
            <View style={styles.bbcBadge}><Text style={styles.bbcBadgeText}>BBC</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.readingCardTitle} numberOfLines={2}>{reading.title}</Text>
              <Text style={styles.readingCardSub}>
                어휘 {reading.vocabulary?.length ?? 0}개 · 이해확인 {reading.comprehension_questions?.length ?? 0}문항
              </Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
        </TouchableOpacity>
      ) : (
        <View style={[styles.readingCard, { opacity: 0.4 }]}>
          <View style={styles.readingCardLeft}>
            <View style={[styles.bbcBadge, { backgroundColor: '#9ca3af' }]}>
              <Text style={styles.bbcBadgeText}>BBC</Text>
            </View>
            <Text style={styles.readingCardTitle}>05:00 KST에 자동 생성됩니다</Text>
          </View>
        </View>
      )}

      {/* 팟캐스트 섹션들 */}
      {PODCAST_SOURCES.map(src => (
        <PodcastSection
          key={src.key}
          sourceKey={src.key}
          label={src.label}
          color={src.color}
          limit={src.limit}
        />
      ))}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 56 },
  dateLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 16, letterSpacing: 1 },

  // BBC Reading card
  readingCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 14, marginBottom: 24,
    backgroundColor: '#f0f4ff', borderWidth: 1, borderColor: '#bfdbfe',
    borderLeftWidth: 4, borderLeftColor: '#1d4ed8',
  },
  readingCardLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  bbcBadge: { backgroundColor: '#1d4ed8', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginTop: 1 },
  bbcBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  readingCardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20, marginBottom: 4 },
  readingCardSub: { fontSize: 12, color: '#4b5563' },

  // Podcast source section
  sourceSection: { marginBottom: 24 },
  sourceTitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderLeftWidth: 3, paddingLeft: 10, marginBottom: 12,
  },
  sourceTitle: { fontSize: 14, fontWeight: '800', flex: 1 },
  sourceCount: { fontSize: 12, color: '#9ca3af' },
  emptyText: { fontSize: 13, color: '#9ca3af', paddingLeft: 10 },

  showMoreBtn: { alignItems: 'center', paddingVertical: 10 },
  showMoreText: { fontSize: 13, fontWeight: '600' },

  // Episode card
  episodeCard: {
    backgroundColor: '#fafafa', borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
    borderLeftWidth: 4,
  },
  epDate: { fontSize: 10, color: '#9ca3af', fontWeight: '600', marginBottom: 4 },
  epTitle: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20, marginBottom: 10 },

  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playBtnLoading: { backgroundColor: '#4b5563' },
  playerCenter: { flex: 1 },
  progressBg: { height: 3, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden', marginBottom: 3 },
  progressFill: { height: 3, borderRadius: 2 },
  playerTime: { fontSize: 10, color: '#9ca3af' },
  stopBtn: { padding: 4 },

  scriptToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  scriptToggleText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  scriptText: { fontSize: 13, color: '#374151', lineHeight: 20, marginTop: 8 },
  scriptMoreBtn: { marginTop: 8, alignSelf: 'flex-start' },
  scriptMoreText: { fontSize: 12, fontWeight: '600' },

  // Reading detail
  detailContainer: { flex: 1, backgroundColor: '#fff' },
  detailContent: { padding: 20, paddingTop: 56 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 6 },
  backText: { fontSize: 15, color: '#262626', fontWeight: '500' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#262626', marginTop: 28, marginBottom: 12, letterSpacing: 0.3 },
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
