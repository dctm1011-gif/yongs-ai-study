import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Animated,
  useColorScheme,
  AsyncStorage,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CACHE_KEY           = 'toefl_data_cache';
const CACHE_TIMESTAMP_KEY = 'toefl_data_timestamp';
const CACHE_DURATION      = 60 * 60 * 1000;

// ─── colours ──────────────────────────────────────────────────────────────────
const C = {
  accent:      '#f59e0b',
  accentDark:  '#d97706',
  accentLight: '#fef3c7',
  primary:     '#0ea5e9',
  success:     '#22c55e',
  purple:      '#8b5cf6',
  surface:     '#ffffff',
  bg:          '#f8fafc',
  border:      '#e9e9e7',
  text:        '#111827',
  textSec:     '#6b7280',
  textMuted:   '#9b9a97',
  // dark
  darkBg:      '#111827',
  darkSurface: '#1f2937',
  darkBorder:  '#374151',
  darkText:    '#f9fafb',
  darkTextSec: '#d1d5db',
};

// ─── tab meta ─────────────────────────────────────────────────────────────────
type TabKey = 'reading' | 'writing' | 'speaking' | 'listening';

const TAB_META: Record<TabKey, { emoji: string; label: string; color: string }> = {
  reading:   { emoji: '📖', label: 'Reading',   color: C.primary },
  writing:   { emoji: '✍️', label: 'Writing',   color: C.success },
  speaking:  { emoji: '🗣️', label: 'Speaking',  color: C.accent },
  listening: { emoji: '🎧', label: 'Listening', color: C.purple },
};

// ─── skeleton ─────────────────────────────────────────────────────────────────
function SkeletonBlock({ width = '100%', height = 16, style = {} }: any) {
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
    <Animated.View
      style={[{ width, height, borderRadius: 8, backgroundColor: '#d1d5db', opacity }, style]}
    />
  );
}

// ─── recursive content renderer ───────────────────────────────────────────────
// Displays nested JSON objects/arrays in a user-friendly way
function RenderValue({ value, depth = 0 }: { value: any; depth?: number }) {
  const isDark = useColorScheme() === 'dark';
  const text   = isDark ? C.darkText    : C.text;
  const textSec= isDark ? C.darkTextSec : C.textSec;

  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    return <Text style={[rv.string, { color: text }]}>{value}</Text>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <Text style={[rv.primitive, { color: C.accent }]}>{String(value)}</Text>;
  }

  if (Array.isArray(value)) {
    return (
      <View style={rv.array}>
        {value.map((item, i) => (
          <View key={i} style={rv.arrayItem}>
            <Text style={[rv.bullet, { color: C.accent }]}>•</Text>
            <View style={{ flex: 1 }}>
              <RenderValue value={item} depth={depth + 1} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (typeof value === 'object') {
    return (
      <View style={depth > 0 ? rv.nested : undefined}>
        {Object.entries(value).map(([key, val]) => (
          <View key={key} style={rv.field}>
            <Text style={[rv.key, { color: textSec }]}>
              {key.replace(/_/g, ' ')}
            </Text>
            <RenderValue value={val} depth={depth + 1} />
          </View>
        ))}
      </View>
    );
  }

  return <Text style={{ color: text }}>{String(value)}</Text>;
}

const rv = StyleSheet.create({
  string:    { fontSize: 15, lineHeight: 23, marginBottom: 2 },
  primitive: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  array:     { gap: 6 },
  arrayItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bullet:    { fontSize: 16, lineHeight: 22, marginTop: 1 },
  nested:    { marginLeft: 12, marginTop: 6, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#e5e7eb' },
  field:     { marginBottom: 14 },
  key:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
});

// ─── section card ─────────────────────────────────────────────────────────────
function SectionContent({ data, tab }: { data: any; tab: TabKey }) {
  const isDark  = useColorScheme() === 'dark';
  const meta    = TAB_META[tab];
  const surface = isDark ? C.darkSurface : C.surface;
  const border  = isDark ? C.darkBorder  : C.border;
  const text    = isDark ? C.darkText    : C.text;

  if (!data) {
    return (
      <View style={sc.empty}>
        <Text style={sc.emptyEmoji}>{meta.emoji}</Text>
        <Text style={[sc.emptyText, { color: text }]}>콘텐츠를 불러오는 중이에요</Text>
      </View>
    );
  }

  return (
    <View>
      {/* section header */}
      <View style={[sc.sectionHeader, { backgroundColor: meta.color + '18', borderColor: meta.color + '40' }]}>
        <Text style={sc.sectionEmoji}>{meta.emoji}</Text>
        <Text style={[sc.sectionTitle, { color: meta.color }]}>{meta.label}</Text>
      </View>

      {/* content card */}
      <View style={[sc.card, { backgroundColor: surface, borderColor: border }]}>
        <RenderValue value={data} />
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14,
  },
  sectionEmoji: { fontSize: 22 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  card: {
    borderWidth: 1, borderRadius: 14, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, fontWeight: '600' },
});

// ─── main screen ──────────────────────────────────────────────────────────────
export default function ToeflScreen() {
  const isDark = useColorScheme() === 'dark';
  const [data, setData] = useState<Record<TabKey, any>>({
    reading: null, writing: null, speaking: null, listening: null,
  });
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [currentTab, setCurrentTab] = useState<TabKey>('reading');

  useEffect(() => {
    loadToeflData();
    checkForUpdates();
  }, []);

  const setAll = (d: Record<TabKey, any>) => setData(d);

  const loadToeflData = async () => {
    try {
      setLoading(true);
      setError(false);
      const cached    = await AsyncStorage.getItem(CACHE_KEY);
      const timestamp = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);
      const now       = Date.now();

      if (cached && timestamp) {
        const cachedTime = parseInt(timestamp, 10);
        if (now - cachedTime < CACHE_DURATION) {
          setAll(JSON.parse(cached));
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
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/toefl/index.html');
      const html     = await response.text();

      const readingMatch   = html.match(/const READING = (\{[\s\S]*?\});/);
      const writingMatch   = html.match(/const WRITING = (\{[\s\S]*?\});/);
      const speakingMatch  = html.match(/const SPEAKING = (\{[\s\S]*?\});/);
      const listeningMatch = html.match(/const LISTENING = (\{[\s\S]*?\});/);

      if (readingMatch && writingMatch && speakingMatch && listeningMatch) {
        const d: Record<TabKey, any> = {
          reading:   JSON.parse(readingMatch[1]),
          writing:   JSON.parse(writingMatch[1]),
          speaking:  JSON.parse(speakingMatch[1]),
          listening: JSON.parse(listeningMatch[1]),
        };
        await AsyncStorage.setItem(CACHE_KEY,           JSON.stringify(d));
        await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        setAll(d);
      } else {
        throw new Error('parse error');
      }
    } catch {
      // fallback
      const fallback: Record<TabKey, any> = {
        reading:   { content: 'Sample reading passage for TOEFL preparation.' },
        writing:   { task: 'Write a 300-word essay on a given topic.' },
        speaking:  { topic: 'Describe your favorite place and why.' },
        listening: { question: 'Listen and answer comprehension questions.' },
      };
      setAll(fallback);
    } finally {
      setLoading(false);
    }
  };

  const checkForUpdates = async () => {
    try {
      const response   = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/toefl/index.html');
      const html       = await response.text();
      const readingM   = html.match(/const READING = (\{[\s\S]*?\});/);
      const writingM   = html.match(/const WRITING = (\{[\s\S]*?\});/);
      const speakingM  = html.match(/const SPEAKING = (\{[\s\S]*?\});/);
      const listeningM = html.match(/const LISTENING = (\{[\s\S]*?\});/);
      if (readingM && writingM && speakingM && listeningM) {
        const d: Record<TabKey, any> = {
          reading:   JSON.parse(readingM[1]),
          writing:   JSON.parse(writingM[1]),
          speaking:  JSON.parse(speakingM[1]),
          listening: JSON.parse(listeningM[1]),
        };
        await AsyncStorage.setItem(CACHE_KEY,           JSON.stringify(d));
        await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      }
    } catch { /* 무시 */ }
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
          <Text style={s.headerTitle}>🎓 TOEFL</Text>
          <Text style={s.headerSub}>오늘의 TOEFL 학습</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <View style={{ gap: 10, marginBottom: 20 }}>
            {(Object.keys(TAB_META) as TabKey[]).map((t) => (
              <SkeletonBlock key={t} height={52} />
            ))}
          </View>
          <SkeletonBlock height={200} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── error ──
  if (error) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
        <View style={s.header}><Text style={s.headerTitle}>🎓 TOEFL</Text></View>
        <View style={s.center}>
          <Text style={s.stateEmoji}>😅</Text>
          <Text style={[s.stateTitle, { color: text }]}>데이터를 불러오지 못했어요</Text>
          <Text style={[s.stateSub, { color: textSec }]}>네트워크 연결을 확인해 주세요</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadToeflData}>
            <Text style={s.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      {/* header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>🎓 TOEFL</Text>
        <Text style={s.headerSub}>오늘의 TOEFL 학습</Text>
      </View>

      {/* pill tab bar */}
      <View style={[s.tabRow, { backgroundColor: surface, borderBottomColor: border }]}>
        {(Object.keys(TAB_META) as TabKey[]).map((tab) => {
          const meta = TAB_META[tab];
          const active = currentTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[s.pill, active && { backgroundColor: meta.color }]}
              onPress={() => setCurrentTab(tab)}
              activeOpacity={0.75}
            >
              <Text style={s.pillEmoji}>{meta.emoji}</Text>
              <Text style={[s.pillText, active ? { color: '#fff' } : { color: textSec }]}>
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <SectionContent data={data[currentTab]} tab={currentTab} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 4 },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.85)' },

  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f0ef',
  },
  pillEmoji: { fontSize: 14 },
  pillText:  { fontSize: 13, fontWeight: '700' },

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  stateEmoji: { fontSize: 52, marginBottom: 14 },
  stateTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  stateSub:   { fontSize: 13, marginBottom: 24, textAlign: 'center' },
  retryBtn:   { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
});
