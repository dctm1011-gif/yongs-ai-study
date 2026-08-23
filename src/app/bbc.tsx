import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { getDatabase, get, ref, set, query, orderByKey, limitToLast } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

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
interface PodcastKeyExpr { en: string; ko: string; analysis: string; }
interface PodcastAnalysis { summary_ko: string; key_expressions: PodcastKeyExpr[]; }
interface PodcastEpisode {
  source: string; title: string; script: string;
  audio_url: string; duration_sec: number;
  pub_date: string; episode_url: string;
  analysis?: PodcastAnalysis;
}
interface ArticleSentence { en: string; ko: string; analysis?: string; }
interface KoreaNewsArticle {
  title: string; category: string; url: string;
  sentences?: ArticleSentence[];
  summary?: string;  // fallback for old cached data
}

const CATEGORY_COLORS: Record<string, string> = {
  Politics: '#dc2626', Economy: '#059669', Society: '#7c3aed',
  Culture: '#d97706', Science: '#0891b2', Sports: '#ea580c',
  World: '#1d4ed8', North: '#b45309',
  National: '#dc2626', Business: '#059669', 'Life&Culture': '#d97706',
  LifenCulture: '#d97706', Opinion: '#6b7280', 'K-pop': '#db2777', Kpop: '#db2777',
};

const PODCAST_SOURCES = [
  { key: 'bbc_learning',    label: 'BBC Learning English', color: '#dc2626' },
  { key: 'all_ears_english', label: 'All Ears English',    color: '#059669' },
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
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [expandedExpr, setExpandedExpr] = useState<Set<number>>(new Set());

  const toggleExpr = (i: number) => setExpandedExpr(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

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
      const safeUrl = ep.audio_url
        .replace(/^http:\/\//, 'https://')
        .replace('/proto/http/', '/proto/https/');
      const { sound } = await Audio.Sound.createAsync(
        { uri: safeUrl }, { shouldPlay: true }, onStatus
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
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{label}</Text>
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

      {ep.analysis?.summary_ko ? (
        <>
          <TouchableOpacity style={styles.scriptToggle} onPress={() => setAnalysisOpen(v => !v)}>
            <Text style={[styles.scriptToggleText, { color }]}>요약 & 표현 분석</Text>
            <MaterialIcons name={analysisOpen ? 'expand-less' : 'expand-more'} size={18} color={color} />
          </TouchableOpacity>
          {analysisOpen && (
            <View style={styles.podAnalysisBox}>
              <Text style={styles.podSummaryText}>{ep.analysis.summary_ko}</Text>
              {ep.analysis.key_expressions?.length > 0 && (
                <View style={styles.podExpressionsBlock}>
                  <Text style={[styles.podExpressionsTitle, { color }]}>핵심 표현</Text>
                  {ep.analysis.key_expressions.map((expr, i) => (
                    <View key={i} style={styles.podExprRow}>
                      <Text style={styles.podExprEn}>{expr.en}</Text>
                      <Text style={styles.podExprKo}>{expr.ko}</Text>
                      {expr.analysis ? (
                        <>
                          <TouchableOpacity onPress={() => toggleExpr(i)}>
                            <Text style={[styles.analysisToggleText, { color }]}>
                              {expandedExpr.has(i) ? '분석 접기 ▲' : '문장 분석 ▼'}
                            </Text>
                          </TouchableOpacity>
                          {expandedExpr.has(i) && (
                            <View style={[styles.analysisBox, { borderLeftColor: color }]}>
                              <Text style={styles.analysisText}>{expr.analysis}</Text>
                            </View>
                          )}
                        </>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      ) : null}

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

// ─── News article card ─────────────────────────────────────────────────────
function NewsCard({ article, sourceName, sourceColor }: {
  article: KoreaNewsArticle; sourceName: string; sourceColor: string;
}) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const catColor = CATEGORY_COLORS[article.category] ?? '#6b7280';
  const hasSentences = article.sentences && article.sentences.length > 0;

  const toggleAnalysis = (i: number) => {
    setExpandedSet(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <View style={styles.newsCard}>
      <View style={styles.newsCardMeta}>
        <View style={[styles.badge, { backgroundColor: sourceColor }]}>
          <Text style={styles.badgeText}>{sourceName}</Text>
        </View>
        {article.category ? (
          <View style={[styles.badge, { backgroundColor: catColor }]}>
            <Text style={styles.badgeText}>{article.category}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.newsTitle}>{article.title}</Text>

      {hasSentences ? (
        <View style={[styles.sentenceList, { borderTopColor: sourceColor + '33' }]}>
          {article.sentences!.map((s, i) => {
            const open = expandedSet.has(i);
            return (
              <View key={i} style={[styles.sentenceRow, i > 0 && styles.sentenceRowBorder]}>
                <Text style={styles.sentenceEn}>{s.en}</Text>
                {s.ko ? <Text style={styles.sentenceKo}>{s.ko}</Text> : null}
                {s.analysis ? (
                  <>
                    <TouchableOpacity
                      style={styles.analysisToggle}
                      onPress={() => toggleAnalysis(i)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.analysisToggleText, { color: sourceColor }]}>
                        {open ? '분석 닫기 ▲' : '문장 분석 ▼'}
                      </Text>
                    </TouchableOpacity>
                    {open ? (
                      <View style={[styles.analysisBox, { borderLeftColor: sourceColor }]}>
                        <Text style={styles.analysisText}>{s.analysis}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.newsSummary}>{article.summary ?? ''}</Text>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────
type View = 'home' | 'reading' | 'listening';

export default function BBCScreen() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('home');
  const [koreaNews, setKoreaNews] = useState<KoreaNewsArticle[]>([]);
  const [loadingKorea, setLoadingKorea] = useState(true);
  const [herald, setHerald] = useState<KoreaNewsArticle[]>([]);
  const [loadingHerald, setLoadingHerald] = useState(true);
  const [podcasts, setPodcasts] = useState<Record<string, PodcastEpisode | null>>({});
  const [loadingPodcasts, setLoadingPodcasts] = useState(true);
  const [readingDone, setReadingDone] = useState(false);
  const [listeningDone, setListeningDone] = useState(false);
  const today = getKSTDateString();

  const markDone = async (key: string, setDone: (v: boolean) => void) => {
    setDone(true);
    const uid = user?.uid;
    if (!uid) return;
    const db = getDatabase(getFirebaseApp());
    await set(ref(db, `users/${uid}/completion/${key}/${today}`), true);
  };

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

  // ── Reading view ─────────────────────────────────────────────────────────
  if (view === 'reading') {
    const kbsArticle = koreaNews[0] ?? null;
    const heraldArticle = herald[0] ?? null;
    const loading = loadingKorea || loadingHerald;
    return (
      <View style={styles.flex}>
        <TouchableOpacity style={styles.backBar} onPress={() => setView('home')}>
          <Text style={styles.backText}>← Reading</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={styles.dateLabel}>{today}</Text>
          {loading ? (
            <View style={styles.skeleton}>
              <ActivityIndicator size="small" color="#9ca3af" />
              <Text style={styles.skeletonText}>불러오는 중...</Text>
            </View>
          ) : (
            <>
              {kbsArticle
                ? <NewsCard article={kbsArticle} sourceName="KBS World" sourceColor="#dc5f00" />
                : <View style={styles.skeleton}><Text style={styles.skeletonText}>KBS World 기사 없음</Text></View>}
              {heraldArticle
                ? <NewsCard article={heraldArticle} sourceName="Korea Herald" sourceColor="#1a3a5c" />
                : <View style={styles.skeleton}><Text style={styles.skeletonText}>Korea Herald 기사 없음</Text></View>}
            </>
          )}
          <TouchableOpacity
            style={[styles.doneBtn, readingDone && styles.doneBtnDone]}
            onPress={() => markDone('english_news_reading', setReadingDone)}
            disabled={readingDone}
            activeOpacity={0.8}
          >
            <Text style={[styles.doneBtnText, readingDone && styles.doneBtnTextDone]}>
              {readingDone ? '✓ 완료됨' : '완료'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Listening view ────────────────────────────────────────────────────────
  if (view === 'listening') {
    return (
      <View style={styles.flex}>
        <TouchableOpacity style={styles.backBar} onPress={() => setView('home')}>
          <Text style={styles.backText}>← Listening</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={styles.dateLabel}>{today}</Text>
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
                  <View style={[styles.badge, { backgroundColor: src.color }]}>
                    <Text style={styles.badgeText}>{src.label}</Text>
                  </View>
                  <Text style={styles.skeletonText}>오늘의 에피소드 준비 중</Text>
                </View>
              );
            })
          )}
          <TouchableOpacity
            style={[styles.doneBtn, listeningDone && styles.doneBtnDone]}
            onPress={() => markDone('english_news_listening', setListeningDone)}
            disabled={listeningDone}
            activeOpacity={0.8}
          >
            <Text style={[styles.doneBtnText, listeningDone && styles.doneBtnTextDone]}>
              {listeningDone ? '✓ 완료됨' : '완료'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Home view ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.homeContainer}>
      <Text style={styles.dateLabel}>{today}</Text>

      <TouchableOpacity style={styles.hubCard} onPress={() => setView('reading')} activeOpacity={0.8}>
        <MaterialIcons name="menu-book" size={36} color="#1d4ed8" />
        <View style={styles.hubCardBody}>
          <Text style={styles.hubCardName}>Reading</Text>
          <Text style={styles.hubCardDesc}>KBS World · Korea Herald</Text>
        </View>
        <Text style={styles.hubArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.hubCard} onPress={() => setView('listening')} activeOpacity={0.8}>
        <MaterialIcons name="headphones" size={36} color="#7c3aed" />
        <View style={styles.hubCardBody}>
          <Text style={styles.hubCardName}>Listening</Text>
          <Text style={styles.hubCardDesc}>BBC Learning English · All Ears English</Text>
        </View>
        <Text style={styles.hubArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },

  // Back bar (GameHub pattern)
  backBar: {
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 44,
    justifyContent: 'center', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  backText: { fontSize: 14, fontWeight: '600', color: '#1d4ed8' },

  // Home hub
  homeContainer: {
    flex: 1, backgroundColor: '#fff',
    paddingHorizontal: 20, justifyContent: 'center',
  },
  dateLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 28, letterSpacing: 1, textAlign: 'center' },
  hubCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    marginVertical: 8, borderWidth: 1, borderColor: '#e5e7eb',
    gap: 16,
  },
  hubCardBody: { flex: 1 },
  hubCardName: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4 },
  hubCardDesc: { fontSize: 12, color: '#9ca3af' },
  hubArrow: { fontSize: 26, color: '#9ca3af', fontWeight: '300' },

  // Detail views
  detailContent: { padding: 20, paddingBottom: 60 },

  skeleton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f9fafb', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb',
  },
  skeletonText: { fontSize: 13, color: '#9ca3af' },

  // Shared badge
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  // News cards (Reading)
  newsCard: {
    backgroundColor: '#fafafa', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb',
  },
  newsCardMeta: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  newsTitle: { fontSize: 15, fontWeight: '700', color: '#111827', lineHeight: 22, marginBottom: 4 },
  newsSummary: { fontSize: 13, color: '#4b5563', lineHeight: 19 },
  sentenceList: { marginTop: 10, borderTopWidth: 1 },
  sentenceRow: { paddingVertical: 8 },
  sentenceRowBorder: { borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  sentenceEn: { fontSize: 14, color: '#111827', lineHeight: 21 },
  sentenceKo: { fontSize: 13, color: '#6b7280', lineHeight: 20, marginTop: 4 },
  analysisToggle: { marginTop: 6 },
  analysisToggleText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  analysisBox: {
    marginTop: 6, padding: 10, backgroundColor: '#f8fafc',
    borderRadius: 8, borderLeftWidth: 3,
  },
  analysisText: { fontSize: 12, color: '#374151', lineHeight: 19 },

  // Episode cards (Listening)
  episodeCard: {
    backgroundColor: '#fafafa', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 4,
  },
  epHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
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

  podAnalysisBox: { marginTop: 10, padding: 12, backgroundColor: '#f8fafc', borderRadius: 10 },
  podSummaryText: { fontSize: 13, color: '#374151', lineHeight: 21 },
  podExpressionsBlock: { marginTop: 12 },
  podExpressionsTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  podExprRow: {
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  podExprEn: { fontSize: 13, fontWeight: '600', color: '#111827', lineHeight: 20 },
  podExprKo: { fontSize: 12, color: '#6b7280', lineHeight: 19, marginTop: 2, marginBottom: 4 },

  // 완료 button
  doneBtn: {
    marginTop: 8, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#1d4ed8', alignItems: 'center',
  },
  doneBtnDone: { backgroundColor: '#16a34a' },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  doneBtnTextDone: { color: '#fff' },
});
