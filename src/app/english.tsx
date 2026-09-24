import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { getDatabase, get, ref as dbRef, set, query, orderByKey, limitToLast } from 'firebase/database';
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

/** "2026-09-18" → "9월 18일 금요일" */
function formatToday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const w = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 ${w}요일`;
}

/** RSS 원문("Mon, 14 Sep 2026 05:00:00 +0000")을 "9월 14일"로 */
/**
 * 문장별 대략 재생 위치.
 *
 * 수집된 문장에는 타임스탬프가 없다. 그래서 정확한 하이라이트는 만들 수 없고,
 * 여기서는 전체 길이를 글자 수에 비례해 나눠 "대략 이쯤"을 잡는다.
 * 인트로 음악과 아웃트로 때문에 앞뒤로 수십 초 어긋날 수 있어, 화면에서도
 * 정확한 위치인 척하지 않고 건너뛰기 용도로만 쓴다.
 */
function estimateSentenceStarts(sentences: { en: string }[], durationSec: number): number[] {
  if (!durationSec || sentences.length === 0) return [];
  const lens = sentences.map(s => Math.max(s.en.length, 1));
  const total = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  return lens.map(len => {
    const start = (acc / total) * durationSec;
    acc += len;
    return Math.floor(start);
  });
}

function formatPubDate(raw: string): string {
  if (!raw) return '';
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw;
  const d = new Date(t);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

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
function EpisodeCard({ ep, color, label, onComplete, isDone, srcKey, epDate, uid }: {
  ep: PodcastEpisode; color: string; label: string;
  onComplete?: () => void; isDone?: boolean;
  /** 재생하며 알게 된 실제 길이를 되쓰기 위한 위치 */
  srcKey?: string; epDate?: string; uid?: string;
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const durationPushed = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(ep.duration_sec || 0);
  const [expandedSentence, setExpandedSentence] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [shownKo, setShownKo] = useState<Set<number>>(new Set());
  const [sentenceDifficulty, setSentenceDifficulty] = useState<Record<number, 'easy' | 'medium' | 'hard'>>({});
  const [selectedDifficultyIdx, setSelectedDifficultyIdx] = useState<number | null>(null);

  const toggleKo = (i: number) => setShownKo(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const saveSentenceDifficulty = async (sentenceIdx: number, diff: 'easy' | 'medium' | 'hard') => {
    if (!uid || !srcKey) return;
    try {
      const db = getDatabase(getFirebaseApp());
      const episodeId = `${srcKey}_${ep.title.replace(/\s+/g, '_').slice(0, 40)}`;
      const sent = ep.sentences?.[sentenceIdx];
      await set(dbRef(db, `users/${uid}/english/sentenceDifficulty/listening/${episodeId}/${sentenceIdx}`), {
        difficulty: diff,
        en: sent?.en || '',
        ko: sent?.ko || '',
        ts: Date.now(),
      });
    } catch (e) {
      console.warn('난이도 저장 실패:', e);
    }
    setSentenceDifficulty(prev => ({ ...prev, [sentenceIdx]: diff }));
  };

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
    if (status.durationMillis) {
      const secs = Math.floor(status.durationMillis / 1000);
      setDurationSec(secs);
      // 수집 스크립트가 길이를 못 구해 0으로 넣는다. 한 번 재생하면 진짜 길이를
      // 알게 되므로 그때 채워 넣어, 다음부터는 재생 전에도 길이가 보이게 한다.
      if (!ep.duration_sec && secs > 0 && srcKey && epDate && !durationPushed.current) {
        durationPushed.current = true;
        set(dbRef(getDatabase(getFirebaseApp()), `english/listening/podcasts/${srcKey}/${epDate}/duration_sec`), secs)
          .catch(() => {});
      }
    }
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

  const starts = React.useMemo(
    () => estimateSentenceStarts(ep.sentences ?? [], durationSec),
    [ep.sentences, durationSec],
  );

  const handleSeekTo = async (sec: number) => {
    if (!soundRef.current) {
      await handlePlayPause();       // 아직 안 틀었으면 재생부터 시작
      setTimeout(() => { soundRef.current?.setPositionAsync(sec * 1000).catch(() => {}); }, 400);
      return;
    }
    await soundRef.current.setPositionAsync(sec * 1000);
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
          <Text style={styles.epDate}>
            {formatPubDate(ep.pub_date)}{ep.sentences?.length ? ` · ${ep.sentences.length}문장` : ''}
          </Text>
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
              {/* 수집 단계에서 duration_sec이 0으로 저장돼 재생 전에는 길이를 모른다.
                  재생을 시작하면 플레이어가 실제 길이를 알려주므로, 그전까지는
                  "0:00"이라는 틀린 숫자 대신 아무것도 보여주지 않는다. */}
              {positionSec > 0 ? `${formatDuration(positionSec)}` : ''}
              {durationSec > 0 ? `${positionSec > 0 ? ' / ' : ''}${formatDuration(durationSec)}` : ''}
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
                    <TouchableOpacity
                      onPress={() => starts[i] !== undefined && handleSeekTo(starts[i])}
                      activeOpacity={starts[i] !== undefined ? 0.6 : 1}
                    >
                      <Text style={styles.sentenceEn}>{s.en}</Text>
                      {starts[i] !== undefined ? (
                        <Text style={styles.seekHint}>▶ 약 {formatDuration(starts[i])}부터</Text>
                      ) : null}
                    </TouchableOpacity>
                    {s.ko ? (
                      shownKo.has(i) ? (
                        <Text style={styles.sentenceKo}>{s.ko}</Text>
                      ) : (
                        <TouchableOpacity onPress={() => toggleKo(i)} activeOpacity={0.7}>
                          <Text style={[styles.analysisToggleText, { color, marginTop: 5 }]}>번역 보기</Text>
                        </TouchableOpacity>
                      )
                    ) : null}
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
                    <TouchableOpacity
                      onPress={() => setSelectedDifficultyIdx(selectedDifficultyIdx === i ? null : i)}
                      activeOpacity={0.7}
                      style={{ marginTop: 6 }}
                    >
                      <Text style={[styles.analysisToggleText, { color: sentenceDifficulty[i] ? color : '#d1d5db' }]}>
                        {sentenceDifficulty[i] ? `난이도: ${sentenceDifficulty[i] === 'easy' ? '쉬움' : sentenceDifficulty[i] === 'medium' ? '보통' : '어려움'}` : '난이도 선택'}
                      </Text>
                    </TouchableOpacity>

                    {selectedDifficultyIdx === i && (
                      <View style={styles.difficultySelector}>
                        {(['easy', 'medium', 'hard'] as const).map(level => (
                          <TouchableOpacity
                            key={level}
                            style={[styles.difficultyOption, sentenceDifficulty[i] === level && styles.difficultyOptionSelected]}
                            onPress={() => {
                              saveSentenceDifficulty(i, level);
                              setSelectedDifficultyIdx(null);
                            }}
                          >
                            <Text style={[styles.difficultyOptionText, sentenceDifficulty[i] === level && styles.difficultyOptionTextSelected]}>
                              {level === 'easy' ? '🟢 쉬움' : level === 'medium' ? '🟡 보통' : '🔴 어려움'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
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
function NewsCard({ article, sourceName, sourceColor, uid }: {
  article: KoreaNewsArticle; sourceName: string; sourceColor: string; uid?: string;
}) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const [shownKo, setShownKo] = useState<Set<number>>(new Set());
  const [sentenceDifficulty, setSentenceDifficulty] = useState<Record<number, 'easy' | 'medium' | 'hard'>>({});
  const [selectedDifficultyIdx, setSelectedDifficultyIdx] = useState<number | null>(null);

  const toggleKo = (i: number) => setShownKo(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const saveSentenceDifficulty = async (sentenceIdx: number, diff: 'easy' | 'medium' | 'hard') => {
    if (!uid) return;
    try {
      const db = getDatabase(getFirebaseApp());
      const articleId = article.title.replace(/\s+/g, '_').slice(0, 50);
      const sent = article.sentences?.[sentenceIdx];
      await set(dbRef(db, `users/${uid}/english/sentenceDifficulty/reading/${articleId}/${sentenceIdx}`), {
        difficulty: diff,
        en: sent?.en || '',
        ko: sent?.ko || '',
        ts: Date.now(),
      });
    } catch (e) {
      console.warn('난이도 저장 실패:', e);
    }
    setSentenceDifficulty(prev => ({ ...prev, [sentenceIdx]: diff }));
  };

  useEffect(() => {
    if (!uid) return;
    const articleId = article.title.replace(/\s+/g, '_').slice(0, 50);
    const migrateOldData = async () => {
      try {
        const db = getDatabase(getFirebaseApp());
        const oldPath = dbRef(db, `users/${uid}/english/sentenceDifficulty/${articleId}`);
        const snap = await get(oldPath);
        if (snap.exists()) {
          const oldData = snap.val();
          const migrated: Record<number, 'easy' | 'medium' | 'hard'> = {};
          for (const [key, val] of Object.entries(oldData)) {
            const idx = parseInt(key);
            if (!isNaN(idx) && val && typeof val === 'object' && 'difficulty' in val) {
              migrated[idx] = (val as any).difficulty;
              await set(dbRef(db, `users/${uid}/english/sentenceDifficulty/reading/${articleId}/${idx}`), val);
            }
          }
          setSentenceDifficulty(migrated);
        }
      } catch (e) {
        console.warn('난이도 마이그레이션 실패:', e);
      }
    };
    migrateOldData();
  }, [uid, article.title]);

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
        <Text style={styles.newsMeta}>{article.sentences!.length}문장</Text>
      ) : null}

      {hasSentences ? (
        <View style={[styles.sentenceList, { borderTopColor: sourceColor + '33' }]}>
          {article.sentences!.map((s, i) => {
            const open = expandedSet.has(i);
            return (
              <View key={i} style={[styles.sentenceRow, i > 0 && styles.sentenceRowBorder]}>
                <Text style={styles.sentenceEn}>{s.en}</Text>
                {s.ko && shownKo.has(i) ? <Text style={styles.sentenceKo}>{s.ko}</Text> : null}

                <View style={styles.sentenceActions}>
                  {s.ko ? (
                    <TouchableOpacity onPress={() => toggleKo(i)} activeOpacity={0.7}>
                      <Text style={[styles.analysisToggleText, { color: shownKo.has(i) ? '#9ca3af' : sourceColor }]}>
                        {shownKo.has(i) ? '번역 닫기' : '번역 보기'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {s.analysis ? (
                    <TouchableOpacity onPress={() => toggleAnalysis(i)} activeOpacity={0.7}>
                      <Text style={[styles.analysisToggleText, { color: open ? '#9ca3af' : sourceColor }]}>
                        {open ? '분석 닫기 ▲' : '문장 분석 ▼'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setSelectedDifficultyIdx(selectedDifficultyIdx === i ? null : i)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.analysisToggleText, { color: sentenceDifficulty[i] ? sourceColor : '#d1d5db' }]}>
                      {sentenceDifficulty[i] ? `난이도: ${sentenceDifficulty[i] === 'easy' ? '쉬움' : sentenceDifficulty[i] === 'medium' ? '보통' : '어려움'}` : '난이도 선택'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {selectedDifficultyIdx === i && (
                  <View style={styles.difficultySelector}>
                    {(['easy', 'medium', 'hard'] as const).map(level => (
                      <TouchableOpacity
                        key={level}
                        style={[styles.difficultyOption, sentenceDifficulty[i] === level && styles.difficultyOptionSelected]}
                        onPress={() => {
                          saveSentenceDifficulty(i, level);
                          setSelectedDifficultyIdx(null);
                        }}
                      >
                        <Text style={[styles.difficultyOptionText, sentenceDifficulty[i] === level && styles.difficultyOptionTextSelected]}>
                          {level === 'easy' ? '🟢 쉬움' : level === 'medium' ? '🟡 보통' : '🔴 어려움'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {s.analysis && open ? (
                  <View style={[styles.analysisBox, { borderLeftColor: sourceColor }]}>
                    <Text style={styles.analysisText}>{s.analysis}</Text>
                  </View>
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
type EnglishView = 'hub' | 'reading' | 'listening' | 'speaking' | 'collection';

export default function EnglishScreen() {
  const { user } = useAuth();
  const [view, setView] = useState<EnglishView>('hub');
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
  const [difficultyModal, setDifficultyModal] = useState<{ visible: boolean; key?: string; type?: 'reading' | 'listening' }>(
    { visible: false }
  );
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [collectedSentences, setCollectedSentences] = useState<Array<{
    id: string;
    source: 'reading' | 'listening';
    articleId: string;
    sentenceIdx: number;
    en: string;
    ko: string;
    difficulty: 'medium' | 'hard';
  }>>([]);
  const [loadingCollection, setLoadingCollection] = useState(true);
  const today = getKSTDateString();

  const markDone = async (key: string, setDone: (v: boolean) => void, difficulty: 'easy' | 'medium' | 'hard' = 'medium') => {
    setDone(true);
    const uid = user?.uid;
    if (!uid) return;
    const db = getDatabase(getFirebaseApp());
    await set(dbRef(db, `users/${uid}/completion/${key}/${today}`), { done: true, difficulty, ts: Date.now() });
  };

  const markSourceDone = async (sourceKey: string, difficulty: 'easy' | 'medium' | 'hard' = 'medium') => {
    const newDone = { ...sourceDone, [sourceKey]: true };
    setSourceDone(newDone);
    const uid = user?.uid;
    if (!uid) return;
    const db = getDatabase(getFirebaseApp());
    await set(dbRef(db, `users/${uid}/completion/english_listening_${sourceKey}/${today}`), { done: true, difficulty, ts: Date.now() });
    // 소스 하나라도 완료되면 Today탭 반영 (각 소스는 독립)
    setListeningDone(true);
    await set(dbRef(db, `users/${uid}/completion/english_news_listening/${today}`), { done: true, difficulty, ts: Date.now() });
  };

  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    get(dbRef(db, `english/reading/korea_news/${today}`))
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
    get(dbRef(db, `english/reading/korea_herald/${today}`))
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
        get(dbRef(db, `english/listening/podcasts/${src.key}/${today}`))
          .then(snap => {
            if (!snap.exists()) return { key: src.key, ep: null, dateKey: '' };
            const ep = snap.val() as PodcastEpisode;
            return { key: src.key, ep, dateKey: today };
          })
          .catch(() => ({ key: src.key, ep: null, dateKey: '' }))
      ),
      // 소스별 완료 상태 로드
      ...(uid ? PODCAST_SOURCES.map(src =>
        get(dbRef(db, `users/${uid}/completion/english_listening_${src.key}/${today}`))
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

  // Load collected sentences
  useEffect(() => {
    if (!user?.uid) return;
    const db = getDatabase(getFirebaseApp());

    Promise.all([
      get(dbRef(db, `users/${user.uid}/english/sentenceDifficulty/reading`)),
      get(dbRef(db, `users/${user.uid}/english/sentenceDifficulty/listening`)),
    ]).then(([readSnap, listenSnap]) => {
      const sentences: typeof collectedSentences = [];

      // Reading sentences
      if (readSnap.exists()) {
        Object.entries(readSnap.val()).forEach(([articleId, difficulties]: [string, any]) => {
          Object.entries(difficulties).forEach(([sentenceIdx, difficultyObj]: [string, any]) => {
            const diffLevel = difficultyObj?.difficulty || difficultyObj;
            if (diffLevel === 'medium' || diffLevel === 'hard') {
              sentences.push({
                id: `reading-${articleId}-${sentenceIdx}`,
                source: 'reading',
                articleId,
                sentenceIdx: parseInt(sentenceIdx),
                en: difficultyObj?.en || '',
                ko: difficultyObj?.ko || '',
                difficulty: diffLevel,
              });
            }
          });
        });
      }

      // Listening sentences
      if (listenSnap.exists()) {
        Object.entries(listenSnap.val()).forEach(([articleId, difficulties]: [string, any]) => {
          Object.entries(difficulties).forEach(([sentenceIdx, difficultyObj]: [string, any]) => {
            const diffLevel = difficultyObj?.difficulty || difficultyObj;
            if (diffLevel === 'medium' || diffLevel === 'hard') {
              sentences.push({
                id: `listening-${articleId}-${sentenceIdx}`,
                source: 'listening',
                articleId,
                sentenceIdx: parseInt(sentenceIdx),
                en: difficultyObj?.en || '',
                ko: difficultyObj?.ko || '',
                difficulty: diffLevel,
              });
            }
          });
        });
      }

      setCollectedSentences(sentences);
      setLoadingCollection(false);
    }).catch(() => {
      setCollectedSentences([]);
      setLoadingCollection(false);
    });
  }, [user?.uid]);

  // ── Reading view ─────────────────────────────────────────────────────────
  if (view === 'reading') {
    const kbsArticle = koreaNews[0] ?? null;
    const heraldArticle = herald[0] ?? null;
    const loading = loadingKorea || loadingHerald;
    return (
      <View style={styles.flex}>
        <TouchableOpacity style={styles.backBar} onPress={() => setView('hub')}>
          <Text style={styles.backText}>← Reading</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={styles.dateLabel}>{formatToday(today)}</Text>
          {!loading && (kbsArticle || heraldArticle) ? (
            <Text style={styles.readingMeta}>
              기사 {[kbsArticle, heraldArticle].filter(Boolean).length}개 ·{' '}
              {[kbsArticle, heraldArticle].filter(Boolean)
                .reduce((n, a) => n + (a!.sentences?.length ?? 0), 0)}문장
            </Text>
          ) : null}
          {loading ? (
            <View style={styles.skeleton}>
              <ActivityIndicator size="small" color="#9ca3af" />
              <Text style={styles.skeletonText}>불러오는 중...</Text>
            </View>
          ) : (
            <>
              {kbsArticle
                ? <NewsCard article={kbsArticle} sourceName="KBS World" sourceColor="#dc5f00" uid={user?.uid} />
                : <View style={styles.skeleton}><Text style={styles.skeletonText}>KBS World 기사 없음</Text></View>}
              {heraldArticle
                ? <NewsCard article={heraldArticle} sourceName="Korea Herald" sourceColor="#1a3a5c" uid={user?.uid} />
                : <View style={styles.skeleton}><Text style={styles.skeletonText}>Korea Herald 기사 없음</Text></View>}
            </>
          )}
          <TouchableOpacity
            style={[styles.doneBtn, readingDone && styles.doneBtnDone]}
            onPress={() => setDifficultyModal({ visible: true, key: 'english_news_reading', type: 'reading' })}
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
      <SafeAreaView style={styles.flex}>
        <TouchableOpacity style={styles.backBar} onPress={() => setView('hub')}>
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
            onComplete={() => setDifficultyModal({ visible: true, key: activeSrc.key, type: 'listening' })}
            srcKey={activeSrc.key}
            epDate={podcastDates[activeSrc.key]}
            isDone={sourceDone[activeSrc.key] ?? false}
            uid={user?.uid}
          />
        ) : (
          <ScrollView style={styles.flex}>
            <View style={[styles.skeleton, { margin: 20, borderLeftWidth: 3, borderLeftColor: activeSrc.color }]}>
              <View style={[styles.badge, { backgroundColor: activeSrc.color }]}>
                <Text style={styles.badgeText}>{activeSrc.label}</Text>
              </View>
              <Text style={styles.skeletonText}>📻 준비 중...</Text>
              <Text style={{ fontSize: 12, color: '#666', marginTop: 8 }}>오늘의 에피소드가 아직 준비되지 않았습니다.</Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ── Speaking view ─────────────────────────────────────────────────────────
  if (view === 'speaking') {
    return (
      <View style={styles.flex}>
        <TouchableOpacity style={styles.backBar} onPress={() => setView('hub')}>
          <Text style={styles.backText}>← Speaking</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={styles.dateLabel}>{formatToday(today)}</Text>
          <View style={styles.skeleton}>
            <Text style={styles.skeletonText}>스피킹 기능 준비 중</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Collection view ────────────────────────────────────────────────────────
  if (view === 'collection') {

    return (
      <View style={styles.flex}>
        <TouchableOpacity style={styles.backBar} onPress={() => setView('hub')}>
          <Text style={styles.backText}>← 수집 문장</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={styles.dateLabel}>수집한 문장</Text>
          {loadingCollection ? (
            <View style={styles.skeleton}>
              <ActivityIndicator size="small" color="#9ca3af" />
              <Text style={styles.skeletonText}>문장 불러오는 중...</Text>
            </View>
          ) : collectedSentences.length === 0 ? (
            <View style={styles.skeleton}>
              <Text style={styles.skeletonText}>📝 수집한 문장이 없습니다</Text>
            </View>
          ) : (
            collectedSentences.map(sent => (
              <View key={sent.id} style={styles.collectionCard}>
                <View style={styles.collectionMeta}>
                  <View style={[
                    styles.collectionBadge,
                    { backgroundColor: sent.source === 'reading' ? '#1d4ed8' : '#7c3aed' }
                  ]}>
                    <Text style={styles.collectionBadgeText}>
                      {sent.source === 'reading' ? '리딩' : '리스닝'}
                    </Text>
                  </View>
                  <View style={[
                    styles.collectionDifficultyBadge,
                    { backgroundColor: sent.difficulty === 'medium' ? '#f59e0b' : '#ef4444' }
                  ]}>
                    <Text style={styles.collectionBadgeText}>
                      {sent.difficulty === 'medium' ? '🟡 보통' : '🔴 어려움'}
                    </Text>
                  </View>
                </View>
                {sent.en && <Text style={styles.collectionSentenceEn}>{sent.en}</Text>}
                {sent.ko && <Text style={styles.collectionSentenceKo}>{sent.ko}</Text>}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Hub view ──────────────────────────────────────────────────────────────
  // 출처 이름만 적혀 있어서 눌러보기 전엔 오늘 뭐가 왔는지 몰랐다.
  // 기사 제목과 새 회차 여부를 카드에 바로 보여준다.
  const readingTitle = koreaNews[0]?.title ?? herald[0]?.title ?? null;
  const readingCount = (koreaNews[0] ? 1 : 0) + (herald[0] ? 1 : 0);
  const newSources = PODCAST_SOURCES.filter(src => podcastDates[src.key] === today);

  return (
    <View style={styles.homeContainer}>
      <Text style={styles.dateLabel}>{formatToday(today)}</Text>

      <TouchableOpacity style={styles.hubCard} onPress={() => setView('reading')} activeOpacity={0.8}>
        <MaterialIcons name="menu-book" size={36} color="#1d4ed8" />
        <View style={styles.hubCardBody}>
          <View style={styles.hubCardTop}>
            <Text style={styles.hubCardName}>리딩</Text>
            {readingDone && <Text style={styles.hubDone}>✓ 완료</Text>}
          </View>
          {loadingKorea || loadingHerald ? (
            <Text style={styles.hubCardDesc}>불러오는 중…</Text>
          ) : readingTitle ? (
            <>
              <Text style={styles.hubPreview} numberOfLines={2}>{readingTitle}</Text>
              <Text style={styles.hubCardDesc}>KBS World · Korea Herald · 기사 {readingCount}개</Text>
            </>
          ) : (
            <Text style={styles.hubCardDesc}>오늘 기사 준비 중</Text>
          )}
        </View>
        <Text style={styles.hubArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.hubCard} onPress={() => setView('listening')} activeOpacity={0.8}>
        <MaterialIcons name="headphones" size={36} color="#7c3aed" />
        <View style={styles.hubCardBody}>
          <View style={styles.hubCardTop}>
            <Text style={styles.hubCardName}>리스닝</Text>
            {newSources.map(src => (
              <View key={src.key} style={[styles.newBadge, { backgroundColor: src.color }]}>
                <Text style={styles.newBadgeText}>{src.label.split(' ')[0]} NEW</Text>
              </View>
            ))}
          </View>
          {loadingPodcasts ? (
            <Text style={styles.hubCardDesc}>불러오는 중…</Text>
          ) : (
            <>
              {PODCAST_SOURCES.map(src => {
                const ep = podcasts[src.key];
                if (!ep) return null;
                return (
                  <Text key={src.key} style={styles.hubPreview} numberOfLines={1}>
                    {sourceDone[src.key] ? '✓ ' : ''}{ep.title}
                  </Text>
                );
              })}
              <Text style={styles.hubCardDesc}>Spotlight · VOA</Text>
            </>
          )}
        </View>
        <Text style={styles.hubArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.hubCard} onPress={() => setView('speaking')} activeOpacity={0.8}>
        <MaterialIcons name="mic" size={36} color="#db2777" />
        <View style={styles.hubCardBody}>
          <View style={styles.hubCardTop}>
            <Text style={styles.hubCardName}>스피킹</Text>
          </View>
          <Text style={styles.hubPreview} numberOfLines={1}>AI와 영어 대화</Text>
          <Text style={styles.hubCardDesc}>일상 주제로 실전 회화</Text>
        </View>
        <Text style={styles.hubArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.hubCard} onPress={() => setView('collection')} activeOpacity={0.8}>
        <MaterialIcons name="bookmark" size={36} color="#f59e0b" />
        <View style={styles.hubCardBody}>
          <View style={styles.hubCardTop}>
            <Text style={styles.hubCardName}>수집 문장</Text>
          </View>
          <Text style={styles.hubPreview} numberOfLines={1}>리딩 · 리스닝에서 마크</Text>
          <Text style={styles.hubCardDesc}>보통, 어려움 난이도만 모음</Text>
        </View>
        <Text style={styles.hubArrow}>›</Text>
      </TouchableOpacity>

      <Modal visible={difficultyModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>난이도를 평가해주세요</Text>
            <View style={styles.difficultyGrid}>
              {(['easy', 'medium', 'hard'] as const).map(level => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.difficultyBtn,
                    selectedDifficulty === level && styles.difficultyBtnSelected,
                  ]}
                  onPress={() => setSelectedDifficulty(level)}
                >
                  <Text
                    style={[
                      styles.difficultyLabel,
                      selectedDifficulty === level && styles.difficultyLabelSelected,
                    ]}
                  >
                    {level === 'easy' ? '쉬움' : level === 'medium' ? '보통' : '어려움'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => setDifficultyModal({ visible: false })}
              >
                <Text style={styles.modalBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={async () => {
                  if (difficultyModal.type === 'reading' && difficultyModal.key) {
                    await markDone(difficultyModal.key, setReadingDone, selectedDifficulty);
                  } else if (difficultyModal.type === 'listening' && difficultyModal.key) {
                    await markSourceDone(difficultyModal.key, selectedDifficulty);
                  }
                  setDifficultyModal({ visible: false });
                }}
              >
                <Text style={styles.modalBtnConfirmText}>완료</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  hubCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  hubDone: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  hubPreview: { fontSize: 12.5, color: '#374151', fontWeight: '600', lineHeight: 17, marginTop: 3 },
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
  newsTitle: { fontSize: 17, fontWeight: '800', color: '#111827', lineHeight: 24, marginBottom: 4 },
  newsSummary: { fontSize: 13, color: '#4b5563', lineHeight: 19 },
  sentenceActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 5 },
  newsMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  readingMeta: { fontSize: 11.5, color: '#6b7280', textAlign: 'center', marginTop: -4, marginBottom: 10 },
  sentenceList: { marginTop: 10, borderTopWidth: 1 },
  sentenceRow: { paddingVertical: 8 },
  sentenceRowBorder: { borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  sentenceEn: { fontSize: 13.5, color: '#111827', lineHeight: 20 },
  sentenceKo: { fontSize: 13, color: '#6b7280', lineHeight: 20, marginTop: 4 },
  seekHint: { fontSize: 10, color: '#9ca3af', marginTop: 3 },
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

  // 난이도 선택 모달
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: 12,
    padding: 24, width: '85%', maxWidth: 360,
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: '#1f2937',
    marginBottom: 20, textAlign: 'center',
  },
  difficultyGrid: {
    flexDirection: 'row', gap: 12, marginBottom: 24,
  },
  difficultyBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 2, borderColor: '#d1d5db',
    backgroundColor: '#f9fafb', alignItems: 'center',
  },
  difficultyBtnSelected: {
    borderColor: '#3b82f6', backgroundColor: '#eff6ff',
  },
  difficultyLabel: {
    fontSize: 14, fontWeight: '600', color: '#6b7280',
  },
  difficultyLabelSelected: {
    color: '#3b82f6',
  },
  modalButtonRow: {
    flexDirection: 'row', gap: 12,
  },
  modalBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 6,
    backgroundColor: '#e5e7eb', alignItems: 'center',
  },
  modalBtnConfirm: {
    backgroundColor: '#3b82f6',
  },
  modalBtnText: {
    fontSize: 14, fontWeight: '600', color: '#374151',
  },
  modalBtnConfirmText: {
    fontSize: 14, fontWeight: '600', color: '#fff',
  },

  // 문장별 난이도 선택
  difficultySelector: {
    flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  difficultyOption: {
    flex: 1, paddingVertical: 6, paddingHorizontal: 8,
    borderRadius: 4, backgroundColor: '#f3f4f6',
    borderWidth: 1, borderColor: '#d1d5db',
    alignItems: 'center',
  },
  difficultyOptionSelected: {
    backgroundColor: '#dbeafe', borderColor: '#3b82f6',
  },
  difficultyOptionText: {
    fontSize: 12, fontWeight: '500', color: '#6b7280',
  },
  difficultyOptionTextSelected: {
    color: '#3b82f6',
  },

  // Collection view
  collectionCard: {
    backgroundColor: '#fafafa', borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  collectionMeta: {
    flexDirection: 'row', gap: 6, marginBottom: 8,
  },
  collectionBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
  },
  collectionDifficultyBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
  },
  collectionBadgeText: {
    fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.3,
  },
  collectionSentenceEn: {
    fontSize: 13.5, color: '#111827', lineHeight: 20, marginBottom: 4,
  },
  collectionSentenceKo: {
    fontSize: 12, color: '#6b7280', lineHeight: 19,
  },
});
