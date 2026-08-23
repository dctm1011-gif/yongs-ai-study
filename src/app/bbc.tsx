import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { getDatabase, get, ref, query, orderByKey, limitToLast } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { MaterialIcons } from '@expo/vector-icons';

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

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
interface PodcastEpisode {
  source: string; title: string; script: string;
  audio_url: string; duration_sec: number;
  pub_date: string; episode_url: string;
}
interface KoreaNewsArticle {
  title: string; category: string; summary: string; url: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  // KBS World
  Politics: '#dc2626', Economy: '#059669', Society: '#7c3aed',
  Culture: '#d97706', Science: '#0891b2', Sports: '#ea580c',
  World: '#1d4ed8', North: '#b45309',
  // Korea Herald
  National: '#dc2626', Business: '#059669', 'Life&Culture': '#d97706',
  LifenCulture: '#d97706', Opinion: '#6b7280', 'K-pop': '#db2777', Kpop: '#db2777',
};

const PODCAST_SOURCES = [
  { key: 'bbc_learning',  label: 'BBC Learning English', color: '#dc2626' },
  { key: 'npr_upfirst',   label: 'NPR Up First',         color: '#1a56db' },
  { key: 'npr_consider',  label: 'NPR Consider This',    color: '#7c3aed' },
] as const;

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
  const cleanScript = ep.script ? stripHtml(ep.script) : '';
  const PREVIEW = 300;
  const hasMore = cleanScript.length > PREVIEW;
  const displayScript = scriptFull ? cleanScript : cleanScript.slice(0, PREVIEW);

  return (
    <View style={[styles.episodeCard, { borderLeftColor: color }]}>
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

      {cleanScript ? (
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
                    {scriptFull ? '접기 ▲' : `전체 보기 (${cleanScript.length.toLocaleString()}자) ▼`}
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
  const [koreaNews, setKoreaNews] = useState<KoreaNewsArticle[]>([]);
  const [loadingKorea, setLoadingKorea] = useState(true);
  const [herald, setHerald] = useState<KoreaNewsArticle[]>([]);
  const [loadingHerald, setLoadingHerald] = useState(true);
  const [podcasts, setPodcasts] = useState<Record<string, PodcastEpisode | null>>({});
  const [loadingPodcasts, setLoadingPodcasts] = useState(true);
  const [readingOpen, setReadingOpen] = useState(true);
  const today = getKSTDateString();

  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    get(ref(db, `english/korea_news/${today}`))
      .then(snap => {
        if (snap.exists()) {
          const val = snap.val();
          setKoreaNews(Array.isArray(val) ? val : Object.values(val));
        }
      })
      .catch(e => console.error('Korea news:', e?.message))
      .finally(() => setLoadingKorea(false));
  }, [today]);

  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    get(ref(db, `english/korea_herald/${today}`))
      .then(snap => {
        if (snap.exists()) {
          const val = snap.val();
          setHerald(Array.isArray(val) ? val : Object.values(val));
        }
      })
      .catch(e => console.error('Korea Herald:', e?.message))
      .finally(() => setLoadingHerald(false));
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

  const kbsArticle = koreaNews[0] ?? null;
  const heraldArticle = herald[0] ?? null;
  const readingLoading = loadingKorea || loadingHerald;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dateLabel}>{today}</Text>

      {/* ── Reading ────────────────────────────────── */}
      <TouchableOpacity style={styles.sectionBtn} onPress={() => setReadingOpen(v => !v)} activeOpacity={0.7}>
        <MaterialIcons name="menu-book" size={18} color="#111827" />
        <Text style={styles.sectionTitle}>Reading</Text>
        <MaterialIcons name={readingOpen ? 'expand-less' : 'expand-more'} size={22} color="#6b7280" />
      </TouchableOpacity>

      {readingOpen && (
        readingLoading ? (
          <View style={styles.skeleton}>
            <ActivityIndicator size="small" color="#9ca3af" />
            <Text style={styles.skeletonText}>불러오는 중...</Text>
          </View>
        ) : (
          <>
            {/* KBS World 1개 */}
            {kbsArticle ? (
              <TouchableOpacity style={styles.koreaCard}
                onPress={() => Linking.openURL(kbsArticle.url)} activeOpacity={0.8}>
                <View style={styles.readingCardMeta}>
                  <View style={[styles.sourceBadge, { backgroundColor: '#dc5f00' }]}>
                    <Text style={styles.sourceBadgeText}>KBS World</Text>
                  </View>
                  {kbsArticle.category ? (
                    <View style={[styles.sourceBadge, { backgroundColor: CATEGORY_COLORS[kbsArticle.category] ?? '#6b7280' }]}>
                      <Text style={styles.sourceBadgeText}>{kbsArticle.category}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.koreaTitle}>{kbsArticle.title}</Text>
                <Text style={styles.koreaSummary}>{kbsArticle.summary}</Text>
                <Text style={styles.koreaLink}>원문 보기 →</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.skeleton, { borderLeftWidth: 3, borderLeftColor: '#dc5f00' }]}>
                <Text style={styles.skeletonText}>KBS World 기사 없음 (05:00 KST)</Text>
              </View>
            )}

            {/* Korea Herald 1개 */}
            {heraldArticle ? (
              <TouchableOpacity style={styles.koreaCard}
                onPress={() => Linking.openURL(heraldArticle.url)} activeOpacity={0.8}>
                <View style={styles.readingCardMeta}>
                  <View style={[styles.sourceBadge, { backgroundColor: '#1a3a5c' }]}>
                    <Text style={styles.sourceBadgeText}>Korea Herald</Text>
                  </View>
                  {heraldArticle.category ? (
                    <View style={[styles.sourceBadge, { backgroundColor: CATEGORY_COLORS[heraldArticle.category] ?? '#6b7280' }]}>
                      <Text style={styles.sourceBadgeText}>{heraldArticle.category}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.koreaTitle}>{heraldArticle.title}</Text>
                <Text style={styles.koreaSummary}>{heraldArticle.summary}</Text>
                <Text style={styles.koreaLink}>원문 보기 →</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.skeleton, { borderLeftWidth: 3, borderLeftColor: '#1a3a5c' }]}>
                <Text style={styles.skeletonText}>Korea Herald 기사 없음 (05:00 KST)</Text>
              </View>
            )}
          </>
        )
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
  sectionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, paddingVertical: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827', flex: 1 },

  skeleton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f9fafb', borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  skeletonText: { fontSize: 13, color: '#9ca3af' },

  // Korea News (Reading) cards
  readingCardMeta: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },

  koreaCard: {
    backgroundColor: '#fafafa', borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  koreaTitle: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20, marginBottom: 6 },
  koreaSummary: { fontSize: 13, color: '#4b5563', lineHeight: 19, marginBottom: 4 },
  koreaLink: { fontSize: 12, color: '#1d4ed8', marginTop: 4 },

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
});
