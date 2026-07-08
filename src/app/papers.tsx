import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  useColorScheme,
  AsyncStorage,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CACHE_KEY           = 'papers_data_cache';
const CACHE_TIMESTAMP_KEY = 'papers_data_timestamp';
const CACHE_DURATION      = 60 * 60 * 1000;
const LIKES_KEY           = 'papers_likes';
const READ_KEY            = 'papers_read';

// ─── colours ──────────────────────────────────────────────────────────────────
const C = {
  purple:       '#8b5cf6',
  purpleLight:  '#f5f3ff',
  purpleBorder: '#ddd6fe',
  primary:      '#0ea5e9',
  primaryLight: '#e0f2fe',
  success:      '#22c55e',
  successLight: '#f0fdf4',
  error:        '#ef4444',
  orange:       '#f97316',
  surface:      '#ffffff',
  bg:           '#f8fafc',
  border:       '#e9e9e7',
  text:         '#111827',
  textSec:      '#6b7280',
  textMuted:    '#9b9a97',
  // dark
  darkBg:       '#111827',
  darkSurface:  '#1f2937',
  darkBorder:   '#374151',
  darkText:     '#f9fafb',
  darkTextSec:  '#d1d5db',
};

// ─── skeleton ─────────────────────────────────────────────────────────────────
function SkeletonBlock({ width = '100%', height = 16, radius = 8, style = {} }: any) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return (
    <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: '#d1d5db', opacity }, style]} />
  );
}

function PaperSkeleton() {
  return (
    <View style={sk.card}>
      <SkeletonBlock width="80%" height={18} style={{ marginBottom: 8 }} />
      <SkeletonBlock width="50%" height={13} style={{ marginBottom: 6 }} />
      <SkeletonBlock width="25%" height={12} style={{ marginBottom: 12 }} />
      <SkeletonBlock width="100%" height={14} style={{ marginBottom: 4 }} />
      <SkeletonBlock width="90%"  height={14} style={{ marginBottom: 14 }} />
      <View style={sk.row}>
        <SkeletonBlock width={60} height={36} radius={10} />
        <SkeletonBlock width={60} height={36} radius={10} />
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  card: { backgroundColor: '#f3f4f6', borderRadius: 14, padding: 14, marginBottom: 12 },
  row:  { flexDirection: 'row', gap: 8 },
});

// ─── paper card ───────────────────────────────────────────────────────────────
interface Paper {
  id: string;
  title?: string;
  authors?: string | string[];
  year?: number | string;
  summary?: string;
  url?: string;
  keywords?: string[];
  hidden?: boolean;
}

function PaperCard({
  paper,
  index,
  liked,
  isRead,
  onLike,
  onRead,
}: {
  paper: Paper;
  index: number;
  liked: boolean;
  isRead: boolean;
  onLike: () => void;
  onRead: () => void;
}) {
  const isDark  = useColorScheme() === 'dark';
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const delay = Math.min(index * 60, 500);
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(slideIn, { toValue: 0, duration: 350, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  const surface = isDark ? C.darkSurface : C.surface;
  const border  = isDark ? C.darkBorder  : C.border;
  const text    = isDark ? C.darkText    : C.text;
  const textSec = isDark ? C.darkTextSec : C.textSec;

  const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors ?? '');

  if (paper.hidden) return null;

  return (
    <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideIn }] }}>
      <View style={[pc.card, { backgroundColor: surface, borderColor: border }, isRead && pc.cardRead]}>
        {/* read indicator stripe */}
        {isRead && <View style={pc.readStripe} />}

        {/* title */}
        <Text style={[pc.title, { color: text }]} numberOfLines={3}>{paper.title ?? '제목 없음'}</Text>

        {/* meta row */}
        <View style={pc.metaRow}>
          {authors ? <Text style={[pc.authors, { color: textSec }]} numberOfLines={1}>{authors}</Text> : null}
          {paper.year ? (
            <View style={pc.yearBadge}>
              <Text style={pc.yearText}>{paper.year}</Text>
            </View>
          ) : null}
        </View>

        {/* keywords */}
        {paper.keywords && paper.keywords.length > 0 && (
          <View style={pc.keywordsRow}>
            {paper.keywords.slice(0, 4).map((kw, i) => (
              <View key={i} style={pc.keyword}>
                <Text style={pc.keywordText}>{kw}</Text>
              </View>
            ))}
          </View>
        )}

        {/* summary */}
        {paper.summary ? (
          <Text style={[pc.summary, { color: textSec }]} numberOfLines={3}>{paper.summary}</Text>
        ) : null}

        {/* actions */}
        <View style={[pc.actions, { borderTopColor: border }]}>
          <TouchableOpacity
            style={[pc.actionBtn, liked && pc.actionBtnLiked]}
            onPress={onLike}
            activeOpacity={0.75}
          >
            <Text style={pc.actionIcon}>{liked ? '❤️' : '🤍'}</Text>
            <Text style={[pc.actionLabel, liked && { color: '#ef4444' }]}>
              {liked ? '좋아요' : '좋아요'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[pc.actionBtn, isRead && pc.actionBtnRead]}
            onPress={onRead}
            activeOpacity={0.75}
          >
            <Text style={pc.actionIcon}>{isRead ? '✅' : '⬜'}</Text>
            <Text style={[pc.actionLabel, isRead && { color: C.success }]}>
              {isRead ? '읽음' : '미읽음'}
            </Text>
          </TouchableOpacity>

          {paper.url ? (
            <View style={[pc.actionBtn, pc.actionBtnLink]}>
              <Text style={pc.actionIcon}>🔗</Text>
              <Text style={[pc.actionLabel, { color: C.primary }]}>링크</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const pc = StyleSheet.create({
  card: {
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    overflow: 'hidden', position: 'relative',
  },
  cardRead:   { borderColor: C.success + '60' },
  readStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.success, borderRadius: 2 },
  title:    { fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 8, paddingLeft: 4 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  authors:  { flex: 1, fontSize: 12, lineHeight: 16 },
  yearBadge:{ backgroundColor: C.purpleLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  yearText: { fontSize: 11, fontWeight: '700', color: C.purple },
  keywordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  keyword:  { backgroundColor: C.primaryLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  keywordText: { fontSize: 10, fontWeight: '600', color: C.primary },
  summary:  { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  actions:  { flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1 },
  actionBtn:{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f1f0ef', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 36 },
  actionBtnLiked: { backgroundColor: '#fff1f2' },
  actionBtnRead:  { backgroundColor: C.successLight },
  actionBtnLink:  { backgroundColor: C.primaryLight },
  actionIcon:  { fontSize: 15 },
  actionLabel: { fontSize: 12, fontWeight: '600', color: C.textMuted },
});

// ─── main screen ──────────────────────────────────────────────────────────────
type FilterKey = 'all' | 'liked' | 'read';

const FILTER_LABELS: Record<FilterKey, string> = { all: '전체', liked: '❤️ 좋아요', read: '✅ 읽음' };

export default function PapersScreen() {
  const isDark = useColorScheme() === 'dark';
  const [papers,          setPapers]          = useState<Paper[]>([]);
  const [filteredPapers,  setFilteredPapers]  = useState<Paper[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(false);
  const [searchText,      setSearchText]      = useState('');
  const [likes,           setLikes]           = useState(new Set<string>());
  const [readSet,         setReadSet]         = useState(new Set<string>());
  const [filter,          setFilter]          = useState<FilterKey>('all');
  const [searchFocused,   setSearchFocused]   = useState(false);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { filterPapers(); }, [papers, searchText, filter, likes, readSet]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(false);
      const [cachedPapers, cachedLikes, cachedRead, timestamp] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY),
        AsyncStorage.getItem(LIKES_KEY),
        AsyncStorage.getItem(READ_KEY),
        AsyncStorage.getItem(CACHE_TIMESTAMP_KEY),
      ]);

      setLikes(cachedLikes ? new Set(JSON.parse(cachedLikes)) : new Set());
      setReadSet(cachedRead ? new Set(JSON.parse(cachedRead)) : new Set());

      if (cachedPapers && timestamp) {
        const cachedTime = parseInt(timestamp, 10);
        if (Date.now() - cachedTime < CACHE_DURATION) {
          setPapers(JSON.parse(cachedPapers));
          setLoading(false);
          return;
        }
      }
      await fetchAndCache();
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  const fetchAndCache = async () => {
    try {
      const response   = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/papers/papers.json');
      const papersData = await response.json();
      await AsyncStorage.setItem(CACHE_KEY,           JSON.stringify(papersData));
      await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      setPapers(papersData);
    } catch {
      const testPapers: Paper[] = [
        { id: '1', title: 'Sample Paper: Machine Learning', authors: ['John Doe', 'Jane Smith'], year: 2024, summary: 'This is a sample paper about machine learning and AI.', keywords: ['ML', 'AI'] },
        { id: '2', title: 'Advanced Neural Networks',       authors: ['Alice Johnson'],            year: 2025, summary: 'A comprehensive study on neural network architectures.',  keywords: ['Deep Learning', 'CNN'] },
      ];
      setPapers(testPapers);
    } finally {
      setLoading(false);
    }
  };

  const filterPapers = useCallback(() => {
    let result = papers.filter((p) => !p.hidden);

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter((p) =>
        p.title?.toLowerCase().includes(q) ||
        (Array.isArray(p.authors) ? p.authors : [p.authors ?? '']).some((a) => a.toLowerCase().includes(q)) ||
        p.summary?.toLowerCase().includes(q) ||
        p.keywords?.some((k) => k.toLowerCase().includes(q))
      );
    }

    if (filter === 'liked') result = result.filter((p) => likes.has(p.id));
    if (filter === 'read')  result = result.filter((p) => readSet.has(p.id));

    setFilteredPapers(result);
  }, [papers, searchText, filter, likes, readSet]);

  const toggleLike = async (id: string) => {
    const n = new Set(likes);
    n.has(id) ? n.delete(id) : n.add(id);
    setLikes(n);
    await AsyncStorage.setItem(LIKES_KEY, JSON.stringify(Array.from(n)));
  };

  const toggleRead = async (id: string) => {
    const n = new Set(readSet);
    n.has(id) ? n.delete(id) : n.add(id);
    setReadSet(n);
    await AsyncStorage.setItem(READ_KEY, JSON.stringify(Array.from(n)));
  };

  const bg      = isDark ? C.darkBg      : C.bg;
  const surface = isDark ? C.darkSurface : C.surface;
  const border  = isDark ? C.darkBorder  : C.border;
  const text    = isDark ? C.darkText    : C.text;
  const textSec = isDark ? C.darkTextSec : C.textSec;

  // ── skeleton ──
  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
        <View style={s.header}>
          <Text style={s.headerTitle}>📄 논문</Text>
          <Text style={s.headerSub}>arXiv 논문을 탐색해요</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {[0, 1, 2, 3].map((i) => <PaperSkeleton key={i} />)}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── error ──
  if (error) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
        <View style={s.header}><Text style={s.headerTitle}>📄 논문</Text></View>
        <View style={s.center}>
          <Text style={s.stateEmoji}>😅</Text>
          <Text style={[s.stateTitle, { color: text }]}>논문을 불러오지 못했어요</Text>
          <Text style={[s.stateSub, { color: textSec }]}>네트워크 연결을 확인해 주세요</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadData}>
            <Text style={s.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const visibleCount = filteredPapers.length;
  const totalCount   = papers.filter((p) => !p.hidden).length;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      {/* header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>📄 논문</Text>
        <Text style={s.headerSub}>arXiv 논문을 탐색해요</Text>
      </View>

      {/* search */}
      <View style={[s.searchWrap, { backgroundColor: surface, borderBottomColor: border }]}>
        <View style={[s.searchBox, { borderColor: searchFocused ? C.purple : border, backgroundColor: isDark ? C.darkBg : '#f1f0ef' }]}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={[s.searchInput, { color: text }]}
            placeholder="제목, 저자, 키워드 검색..."
            placeholderTextColor={C.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} activeOpacity={0.6}>
              <Text style={s.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* filter chips */}
      <View style={[s.filterRow, { backgroundColor: surface, borderBottomColor: border }]}>
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.chip, filter === f && { backgroundColor: C.purple }]}
            onPress={() => setFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[s.chipText, filter === f && { color: '#fff' }]}>{FILTER_LABELS[f]}</Text>
          </TouchableOpacity>
        ))}
        <Text style={[s.countLabel, { color: textSec }]}>{visibleCount} / {totalCount}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filteredPapers.length === 0 ? (
          <View style={s.center}>
            <Text style={s.stateEmoji}>
              {filter === 'liked' ? '🤍' : filter === 'read' ? '📖' : '🔍'}
            </Text>
            <Text style={[s.stateTitle, { color: text }]}>
              {filter === 'liked' ? '좋아요한 논문이 없어요' :
               filter === 'read'  ? '읽은 논문이 없어요' :
               searchText         ? '검색 결과가 없어요' :
               '논문이 없어요'}
            </Text>
            <Text style={[s.stateSub, { color: textSec }]}>
              {filter !== 'all' ? '필터를 변경해 보세요' : '나중에 다시 확인해 보세요'}
            </Text>
          </View>
        ) : (
          filteredPapers.map((paper, idx) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              index={idx}
              liked={likes.has(paper.id)}
              isRead={readSet.has(paper.id)}
              onLike={() => toggleLike(paper.id)}
              onRead={() => toggleRead(paper.id)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    backgroundColor: C.purple,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.85)' },

  searchWrap: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchIcon: { fontSize: 15 },
  searchInput:{ flex: 1, fontSize: 15, padding: 0 },
  clearBtn:   { fontSize: 14, color: C.textMuted, paddingHorizontal: 4 },

  filterRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  chip:       { backgroundColor: '#f1f0ef', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipText:   { fontSize: 13, fontWeight: '600', color: C.textMuted },
  countLabel: { marginLeft: 'auto', fontSize: 12, fontWeight: '500' },

  center:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  stateEmoji: { fontSize: 52, marginBottom: 14 },
  stateTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  stateSub:   { fontSize: 13, textAlign: 'center', marginBottom: 24 },
  retryBtn:   { backgroundColor: C.purple, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
});
