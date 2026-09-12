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

import { getKSTDateString } from '../utils/dateUtils';

function formatDuration(sec: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

// ─── Types ────────────────────────────────────────────────────────────────
interface SpotlightSentence { speaker: string; en: string; ko: string; analysis: string; }
interface PodcastEpisode {
  source: string; title: string;
  audio_url: string; duration_sec: number;
  pub_date: string; episode_url: string;
  sentences?: SpotlightSentence[];
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
  { key: 'spotlight', label: 'Spotlight English', color: '#16a34a' },
  { key: 'voa', label: 'VOA Learning English', color: '#1d4ed8' },
] as const;

// ─── Podcast episode card ─────────────────────────────────────────────────
function EpisodeCard({ ep, color, label, onComplete, isDone }: {
  ep: PodcastEpisode; color: string; label: string;
  onComplete?: () => void; isDone?: boolean;
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(ep.duration_sec || 0);
  const [expandedSentence, setExpandedSentence] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const toggleSentence = (i: number) => setExpandedSentence(prev => {
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

  const handleSeek = async (deltaSec: number) => {
    if (!soundRef.current) return;
    const newPos = Math.max(0, Math.min(positionSec + deltaSec, durationSec || positionSec + Math.max(0, deltaSec)));
    await soundRef.current.setPositionAsync(newPos * 1000);
    setPositionSec(newPos);
  };

  const pct = durationSec > 0 ? (positionSec / durationSec) * 100 : 0;

  return (
    <View style={[styles.episodeCard, styles.episodeCardFull, { borderLeftColor: color }]}>
      {/* STICKY: header + title + player */}
      <View style={styles.stickyPlayerSection}>
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
        <View style={styles.seekRow}>
          {([[-60, '−1분'], [-10, '−10초'], [10, '+10초'], [60, '+1분']] as [number, string][]).map(([delta, label]) => (
            <TouchableOpacity
              key={label}
              style={[styles.seekBtn, !soundRef.current && styles.seekBtnDisabled]}
              onPress={() => handleSeek(delta)}
              disabled={!soundRef.current}
            >
              <Text style={[styles.seekBtnText, !soundRef.current && styles.seekBtnTextDisabled]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* SCROLLABLE: sentences + done button */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.sentenceScrollContent}>
        {ep.sentences?.length ? (() => {
          const PREVIEW_COUNT = 5;
          const visible = showAll ? ep.sentences : ep.sentences.slice(0, PREVIEW_COUNT);
          return (
            <View style={styles.sentenceListPod}>
              {visible.map((s, i) => {
                const prevSpeaker = i > 0 ? ep.sentences![i - 1].speaker : '';
                const showSpeaker = s.speaker && s.speaker !== prevSpeaker;
                const open = expandedSentence.has(i);
                return (
                  <View key={i} style={[styles.sentenceRowPod, i > 0 && styles.sentenceRowBorder]}>
                    {showSpeaker && (
                      <Text style={[styles.speakerLabel, { color }]}>{s.speaker}</Text>
                    )}
                    <Text style={styles.sentenceEn}>{s.en}</Text>
                    {s.ko ? <Text style={styles.sentenceKo}>{s.ko}</Text> : null}
                    {s.analysis ? (
                      <>
                        <TouchableOpacity style={styles.analysisToggle} onPress={() => toggleSentence(i)}>
                          <Text style={[styles.analysisToggleText, { color }]}>
                            {open ? '분석 닫기 ▲' : '문장 분석 ▼'}
                          </Text>
                        </TouchableOpacity>
                        {open && (
                          <View style={[styles.analysisBox, { borderLeftColor: color }]}>
                            <Text style={styles.analysisText}>{s.analysis}</Text>
                          </View>
                        )}
                      </>
                    ) : null}
                  </View>
                );
              })}
              {ep.sentences.length > PREVIEW_COUNT && (
                <TouchableOpacity onPress={() => setShowAll(v => !v)} style={styles.showAllBtn}>
                  <Text style={[styles.scriptMoreText, { color }]}>
                    {showAll ? '접기 ▲' : `전체 보기 (${ep.sentences.length}문장) ▼`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })() : null}
        {onComplete && (
          <TouchableOpacity
            style={[styles.doneBtn, isDone && styles.doneBtnDone]}
            onPress={onComplete}
            disabled={isDone}
            activeOpacity={0.8}
          >
            <Text style={[styles.doneBtnText, isDone && styles.doneBtnTextDone]}>
              {isDone ? '✓ 완료됨' : '완료'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
  const [podcastDates, setPodcastDates] = useState<Record<string, string>>({});
  const [loadingPodcasts, setLoadingPodcasts] = useState(true);
  const [readingDone, setReadingDone] = useState(false);
  const [listeningDone, setListeningDone] = useState(false);
  const [sourceDone, setSourceDone] = useState<Record<string, boolean>>({});
  const [selectedSource, setSelectedSource] = useState<string>(PODCAST_SOURCES[0].key);
  const today = getKSTDateString();

  const markDone = async (key: string, setDone: (v: boolean) => void) => {
    setDone(true);
    const uid = user?.uid;
    if (!uid) return;
    const db = getDatabase(getFirebaseApp());
    await set(ref(db, `users/${uid}/completion/${key}/${today}`), true);
  };

  const markSourceDone = async (sourceKey: string) => {
    const newDone = { ...sourceDone, [sourceKey]: true };
    setSourceDone(newDone);
    const uid = user?.uid;
    if (!uid) return;
    const db = getDatabase(getFirebaseApp());
    await set(ref(db, `users/${uid}/completion/english_listening_${sourceKey}/${today}`), true);
    // 소스 하나라도 완료되면 Today탭 반영 (각 소스는 독립)
    setListeningDone(true);
    await set(ref(db, `users/${uid}/completion/english_news_listening/${today}`), true);
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
    const uid = user?.uid;
    Promise.all([
      ...PODCAST_SOURCES.map(src =>
        get(query(ref(db, `english/podcasts/${src.key}`), orderByKey(), limitToLast(1)))
          .then(snap => {
            if (!snap.exists()) return { key: src.key, ep: null, dateKey: '' };
            const entries = Object.entries(snap.val() as Record<string, PodcastEpisode>);
            const [dateKey, ep] = entries[0];
            if (ep?.sentences && !Array.isArray(ep.sentences)) {
              ep.sentences = Object.values(ep.sentences as any);
            }
            return { key: src.key, ep, dateKey };
          })
          .catch(() => ({ key: src.key, ep: null, dateKey: '' }))
      ),
      // 소스별 완료 상태 로드
      ...(uid ? PODCAST_SOURCES.map(src =>
        get(ref(db, `users/${uid}/completion/english_listening_${src.key}/${today}`))
          .then(snap => ({ doneKey: src.key, done: snap.exists() && snap.val() === true }))
          .catch(() => ({ doneKey: src.key, done: false }))
      ) : []),
    ]).then(results => {
      const epMap: Record<string, PodcastEpisode | null> = {};
      const dateMap: Record<string, string> = {};
      const doneMap: Record<string, boolean> = {};
      results.forEach(r => {
        if ('ep' in r) { epMap[r.key] = r.ep; dateMap[r.key] = r.dateKey; }
        if ('doneKey' in r) { doneMap[r.doneKey] = r.done; }
      });
      setPodcasts(epMap);
      setPodcastDates(dateMap);
      setSourceDone(doneMap);
    }).finally(() => setLoadingPodcasts(false));
  }, [today, user?.uid]);

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
    const activeSrc = PODCAST_SOURCES.find(s => s.key === selectedSource) ?? PODCAST_SOURCES[0];
    const activeEp = podcasts[activeSrc.key];
    return (
      <View style={styles.flex}>
        <TouchableOpacity style={styles.backBar} onPress={() => setView('home')}>
          <Text style={styles.backText}>← Listening</Text>
        </TouchableOpacity>
        {/* 소스 탭 */}
        <View style={styles.sourceTabRow}>
          {PODCAST_SOURCES.map(src => {
            const isSelected = selectedSource === src.key;
            const isNew = !loadingPodcasts && podcastDates[src.key] === today;
            const isDone = sourceDone[src.key];
            return (
              <TouchableOpacity
                key={src.key}
                style={[styles.sourceTab, isSelected && { borderBottomColor: src.color, borderBottomWidth: 2 }]}
                onPress={() => setSelectedSource(src.key)}
                activeOpacity={0.7}
              >
                <View style={styles.sourceTabInner}>
                  <Text style={[styles.sourceTabText, isSelected && { color: src.color, fontWeight: '700' }]}>
                    {src.label}
                  </Text>
                  {isDone && <Text style={styles.sourceTabDone}> ✓</Text>}
                  {isNew && !isDone && (
                    <View style={[styles.newBadge, { backgroundColor: src.color }]}>
                      <Text style={styles.newBadgeText}>NEW</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {loadingPodcasts ? (
          <View style={[styles.skeleton, { margin: 20 }]}>
            <ActivityIndicator size="small" color="#9ca3af" />
            <Text style={styles.skeletonText}>팟캐스트 불러오는 중...</Text>
          </View>
        ) : activeEp ? (
          <EpisodeCard
            key={activeSrc.key}
            ep={activeEp}
            color={activeSrc.color}
            label={activeSrc.label}
            onComplete={() => markSourceDone(activeSrc.key)}
            isDone={sourceDone[activeSrc.key] ?? false}
          />
        ) : (
          <View style={[styles.skeleton, { margin: 20, borderLeftWidth: 3, borderLeftColor: activeSrc.color }]}>
            <View style={[styles.badge, { backgroundColor: activeSrc.color }]}>
              <Text style={styles.badgeText}>{activeSrc.label}</Text>
            </View>
            <Text style={styles.skeletonText}>오늘의 에피소드 준비 중</Text>
          </View>
        )}
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
          <Text style={styles.hubCardDesc}>Spotlight English · VOA Learning English</Text>
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

  // Source tab selector
  sourceTabRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  sourceTab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  sourceTabInner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  sourceTabText: {
    fontSize: 13, color: '#6b7280', fontWeight: '500',
  },
  sourceTabDone: {
    fontSize: 13, color: '#16a34a', fontWeight: '700',
  },
  newBadge: {
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
  },
  newBadgeText: {
    fontSize: 9, color: '#fff', fontWeight: '800', letterSpacing: 0.5,
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
  episodeCardFull: {
    flex: 1, marginBottom: 0, borderRadius: 0,
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0,
  },
  stickyPlayerSection: {
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  sentenceScrollContent: { paddingTop: 8, paddingBottom: 32 },

  seekRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  seekBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  seekBtnDisabled: { backgroundColor: '#f9fafb', borderColor: '#f0f0f0' },
  seekBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  seekBtnTextDisabled: { color: '#d1d5db' },
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

  sentenceListPod: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  sentenceRowPod: { paddingVertical: 10 },
  speakerLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  showAllBtn: { paddingVertical: 8, alignItems: 'center' },
  scriptMoreText: { fontSize: 12, fontWeight: '600' },

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
