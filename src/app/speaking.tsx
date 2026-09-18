import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, ref, set as dbSet, get } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { GRADUATE_AT } from '../utils/reviewPool';

const CHAT_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/speaking-chat';
const MIN_EXCHANGES = 8;
const TARGET_WORD_COUNT = 3; // 오늘 대화에서 써볼 취약 단어 수
const WEEKLY_GOAL = 4;        // 주간 스피킹 목표 횟수

const DAILY_TOPICS = [
  'Your weekend plans',
  'A memorable trip you\'ve taken',
  'Your favorite food and cooking',
  'A hobby you enjoy',
  'A movie or TV show you recommend',
  'Your daily routine',
  'Technology you use most',
  'A book that influenced you',
  'Your dream job or career goals',
  'Sports or exercise habits',
  'A skill you want to learn',
  'Your hometown or neighborhood',
  'Social media habits',
  'A challenge you\'ve overcome',
  'Your favorite season and why',
  'Plans for the future',
  'A person who inspired you',
  'Your shopping habits',
  'Music you enjoy',
  'Environmental issues you care about',
  'Your study or work habits',
  'A recent news story that interested you',
  'Your favorite restaurant or café',
  'A cultural difference you\'ve noticed',
  'Your morning or evening routine',
  'A gift that meant a lot to you',
  'Your favorite way to relax',
  'An achievement you\'re proud of',
  'A place you want to visit',
  'Your opinions on learning English',
  'A lesson learned from a mistake',
];

function ChatImage({ uri, style }: { uri: string; style: any }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
}

import { getKSTDateString } from '../utils/dateUtils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string | null;
}

interface Correction { wrong: string; correct: string; note: string; }

type ChatResponse = { text: string; imageUrl?: string | null; summary?: string | null; corrections?: Correction[] };

type ViewState = 'idle' | 'loading' | 'chatting' | 'ending' | 'done';

interface HistoryEntry {
  date: string;
  topic: string;
  summary: string;
  exchanges: number;
}

interface TargetWord { word: string; meaning: string; }

export default function SpeakingScreen() {
  const { user } = useAuth();
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [targetWords, setTargetWords] = useState<TargetWord[]>([]);
  const [weekCount, setWeekCount] = useState(0);
  const listRef = useRef<FlatList>(null);

  const scrollToBottom = (animated = true) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 80);
  };

  const today = getKSTDateString();
  const dayOfMonth = new Date(today).getDate();
  const topic = DAILY_TOPICS[(dayOfMonth - 1) % DAILY_TOPICS.length];
  const STORAGE_KEY = `speaking_session_${today}`;

  // Restore today's session from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.messages) && saved.messages.length > 0) {
        setMessages(saved.messages);
        setUserMsgCount(saved.userMsgCount ?? 0);
        setViewState(saved.viewState === 'done' ? 'done' : 'chatting');
      }
    }).catch(() => {});
  }, []);

  // Persist session whenever messages or state changes
  useEffect(() => {
    if (messages.length === 0) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, userMsgCount, viewState })).catch(() => {});
  }, [messages, userMsgCount, viewState]);

  // 메시지 추가 또는 viewState 변경 시 스크롤 (레이아웃 완료 후 80ms 딜레이)
  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (viewState === 'done' || viewState === 'chatting') scrollToBottom();
  }, [viewState]);

  // Load past conversation summaries from Firebase (last 7 days, excluding today)
  useEffect(() => {
    if (!user?.uid) return;
    const db = getDatabase(getFirebaseApp());
    get(ref(db, `users/${user.uid}/speaking_history`)).then(snap => {
      if (!snap.exists()) return;
      const all: HistoryEntry[] = Object.values(snap.val() as Record<string, HistoryEntry>);
      const recent = all
        .filter(h => h.date < today)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10);
      setHistory(recent);
    }).catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const db = getDatabase(getFirebaseApp());
    get(ref(db, `users/${user.uid}/completion/english_speaking/${today}`))
      .then(snap => { if (snap.exists() && snap.val()?.done) setViewState('done'); })
      .catch(() => {});
  }, [user?.uid]);

  // 이번 주(최근 7일) 스피킹 횟수 — 헤더에 목표 대비로 보여준다
  useEffect(() => {
    if (!user?.uid) return;
    const db = getDatabase(getFirebaseApp());
    get(ref(db, `users/${user.uid}/completion/english_speaking`)).then(snap => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, any>;
      const [y, m, d] = today.split('-').map(Number);
      let n = 0;
      for (let i = 0; i < 7; i++) {
        const dt = new Date(y, m - 1, d - i);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const v = data[key];
        if (v === true || (typeof v === 'object' && v !== null && v.done === true)) n++;
      }
      setWeekCount(n);
    }).catch(() => {});
  }, [user?.uid]);

  // 오늘 대화에서 써볼 취약 단어 — 오답 이력 우선, 그다음 복습 횟수가 적은 순
  useEffect(() => {
    if (!user?.uid) return;
    const db = getDatabase(getFirebaseApp());
    Promise.all([
      get(ref(db, `users/${user.uid}/english/reviewPool`)),
      get(ref(db, `users/${user.uid}/wrongPool/english`)),
    ]).then(([poolSnap, wrongSnap]) => {
      if (!poolSnap.exists()) return;
      const wrongIds = new Set(wrongSnap.exists() ? Object.keys(wrongSnap.val()) : []);
      const picked = Object.entries(poolSnap.val() as Record<string, any>)
        .map(([id, v]) => ({ id, word: v.word as string, meaning: v.meaning as string, count: v.count ?? 0 }))
        .filter(w => w.word && w.count < GRADUATE_AT)
        .sort((a, b) => {
          const aw = wrongIds.has(a.id) ? 0 : 1;
          const bw = wrongIds.has(b.id) ? 0 : 1;
          return aw !== bw ? aw - bw : a.count - b.count;
        })
        .slice(0, TARGET_WORD_COUNT)
        .map(w => ({ word: w.word, meaning: w.meaning }));
      setTargetWords(picked);
    }).catch(() => {});
  }, [user?.uid]);

  function stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^---+$/gm, '')
      .replace(/^#{1,3}\s/gm, '')
      .replace(/^-\s/gm, '• ')
      .trim();
  }

  async function callChat(
    msgs: { role: string; content: string }[],
    isFeedbackRequest = false,
  ): Promise<ChatResponse> {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, topic, isFeedbackRequest, history, targetWords }),
    });
    const data = await res.json();
    const raw = (data.reply as string) ?? '';
    const text = isFeedbackRequest ? stripMarkdown(raw) : raw;
    return {
      text, imageUrl: data.imageUrl ?? null, summary: data.summary ?? null,
      corrections: Array.isArray(data.corrections) ? data.corrections : [],
    };
  }

  async function startConversation() {
    setViewState('loading');
    try {
      const { text, imageUrl } = await callChat([{
        role: 'user',
        content: 'Please greet me and ask your first question about the topic.',
      }]);
      setMessages([{ id: '0', role: 'assistant', content: text, imageUrl }]);
      setViewState('chatting');
    } catch {
      setViewState('idle');
    }
  }

  async function sendMessage() {
    if (!input.trim() || (viewState !== 'chatting' && viewState !== 'done')) return;
    const resumeState = viewState; // remember whether we were chatting or done
    const text = input.trim();
    setInput('');
    const userMsg: Message = { id: String(Date.now()), role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setUserMsgCount(c => c + 1);
    setViewState('loading');
    try {
      const { text: reply, imageUrl } = await callChat(
        newMessages.map(m => ({ role: m.role, content: m.content })),
      );
      setMessages(prev => [...prev, {
        id: String(Date.now() + 1), role: 'assistant', content: reply, imageUrl,
      }]);
    } catch {}
    setViewState(resumeState);
  }

  async function endConversation() {
    setViewState('ending');
    let feedback = '';
    let summary: string | null = null;
    let corrections: Correction[] = [];
    try {
      const res = await callChat(
        messages.map(m => ({ role: m.role, content: m.content })),
        true,
      );
      feedback = res.text ?? '';
      summary = res.summary ?? null;
      corrections = res.corrections ?? [];
    } catch {}

    setMessages(prev => [...prev, {
      id: 'feedback',
      role: 'assistant',
      content: feedback.trim()
        ? `✅ 오늘 대화 완료!\n\n${feedback}`
        : '✅ 오늘 대화 완료! 수고하셨어요 👍\n(피드백을 불러오지 못했어요. 다음번에 다시 시도해보세요.)',
    }]);

    if (user?.uid) {
      const db = getDatabase(getFirebaseApp());
      const tasks: Promise<any>[] = [
        dbSet(ref(db, `users/${user.uid}/completion/english_speaking/${today}`), {
          done: true, exchanges: userMsgCount, ts: Date.now(),
        }),
      ];
      if (summary) {
        tasks.push(dbSet(ref(db, `users/${user.uid}/speaking_history/${today}`), {
          date: today, topic, summary, exchanges: userMsgCount, ts: Date.now(),
        }));
      }
      if (corrections.length > 0) {
        tasks.push(dbSet(ref(db, `users/${user.uid}/speaking_corrections/${today}`), {
          date: today, topic, corrections, ts: Date.now(),
        }));
      }
      await Promise.all(tasks).catch(() => {});
    }
    setViewState('done');
  }

  function renderBubble({ item }: { item: Message }) {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {item.content ? (
          <Text style={[styles.bubbleText, isUser ? styles.userText : styles.aiText]}>
            {item.content}
          </Text>
        ) : null}
        {item.imageUrl ? <ChatImage uri={item.imageUrl} style={styles.chatImage} /> : null}
      </View>
    );
  }

  // Already completed from a previous session — show done badge + continue button
  if (viewState === 'done' && messages.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>스피킹</Text>
          <Text style={styles.topicLabel}>이번 주 {weekCount}회 · 목표 {WEEKLY_GOAL}회</Text>
        </View>
        <View style={styles.centeredContent}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>오늘 대화 완료!</Text>
          <Text style={styles.doneSub}>더 이야기하고 싶으면 계속할 수 있어요</Text>
          <TouchableOpacity style={[styles.startBtn, { marginTop: 24 }]} onPress={startConversation}>
            <Text style={styles.startBtnText}>계속 대화하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>스피킹</Text>
        <Text style={styles.topicLabel}>
          이번 주 {weekCount}회 · 목표 {WEEKLY_GOAL}회
        </Text>
      </View>

      {viewState === 'idle' && (
        <View style={styles.centeredContent}>
          <Text style={styles.topicBig}>{topic}</Text>
          <Text style={styles.startHint}>
            {'AI와 영어로 대화해보세요.\n'}
            {`${MIN_EXCHANGES}번 이상 답변하면 종료할 수 있어요.\n`}
            {'사진이 보고 싶으면 "show me a picture of ..." 라고 해보세요!'}
          </Text>
          {targetWords.length > 0 && (
            <View style={styles.targetBox}>
              <Text style={styles.targetTitle}>오늘 써볼 단어</Text>
              {targetWords.map(t => (
                <Text key={t.word} style={styles.targetWord}>
                  {t.word} <Text style={styles.targetMeaning}>{t.meaning}</Text>
                </Text>
              ))}
            </View>
          )}
          <TouchableOpacity style={styles.startBtn} onPress={startConversation}>
            <Text style={styles.startBtnText}>대화 시작</Text>
          </TouchableOpacity>

          {/* 지난 대화가 화면 어디에도 없어서, 어제 무슨 얘기를 했는지 모른 채 새로 시작하게 됐다 */}
          {history.length > 0 && (
            <View style={styles.historyBox}>
              <Text style={styles.historyLabel}>지난 대화</Text>
              {history.slice(0, 3).map(h => (
                <View key={h.date} style={styles.historyRow}>
                  <Text style={styles.historyTopic} numberOfLines={1}>{h.topic}</Text>
                  <Text style={styles.historyMeta}>
                    {h.date.slice(5).replace('-', '/')} · {h.exchanges}턴
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {viewState !== 'idle' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* 목표 단어와 남은 턴은 대화 위로 스크롤되어 사라지곤 했다. 여기서 고정한다. */}
          {viewState === 'chatting' && (
            <View style={styles.liveBar}>
              <View style={styles.liveBarTop}>
                <Text style={styles.liveBarText}>
                  {userMsgCount >= MIN_EXCHANGES
                    ? `${userMsgCount}턴 · 언제든 마칠 수 있어요`
                    : `${userMsgCount}/${MIN_EXCHANGES}턴`}
                </Text>
                <View style={styles.liveTrack}>
                  <View style={[styles.liveFill, { width: `${Math.min(userMsgCount / MIN_EXCHANGES, 1) * 100}%` }]} />
                </View>
              </View>
              {targetWords.length > 0 && (
                <View style={styles.liveChips}>
                  {targetWords.map(w => {
                    const used = messages.some(m =>
                      m.role === 'user' && m.content.toLowerCase().includes(w.word.toLowerCase()));
                    return (
                      <View key={w.word} style={[styles.liveChip, used && styles.liveChipOn]}>
                        <Text style={[styles.liveChipText, used && styles.liveChipTextOn]}>
                          {used ? '✓ ' : ''}{w.word}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderBubble}
            contentContainerStyle={styles.messageList}
          />

          {(viewState === 'loading' || viewState === 'ending') && (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color="#6366f1" />
              <Text style={styles.typingText}>AI가 답변 중...</Text>
            </View>
          )}

          {viewState === 'chatting' && (
            <>
              {userMsgCount >= MIN_EXCHANGES && (
                <TouchableOpacity style={styles.endBtn} onPress={endConversation}>
                  <Text style={styles.endBtnText}>대화 종료 & 피드백 받기</Text>
                </TouchableOpacity>
              )}
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder='Type in English... (or "show me a picture of ...")'
                  placeholderTextColor="#94a3b8"
                  multiline
                  maxLength={300}
                  blurOnSubmit={false}
                  autoCorrect={false}
                  autoCapitalize="none"
                  disableFullscreenUI={true}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
                  onPress={sendMessage}
                  disabled={!input.trim()}
                >
                  <Text style={styles.sendBtnText}>전송</Text>
                </TouchableOpacity>
              </View>
              {userMsgCount < MIN_EXCHANGES && (
                <Text style={styles.progressHint}>
                  {`${userMsgCount}/${MIN_EXCHANGES}번 답변 — ${MIN_EXCHANGES - userMsgCount}번 더 하면 종료 가능`}
                </Text>
              )}
            </>
          )}

          {viewState === 'done' && (
            <>
              <View style={styles.doneBanner}>
                <Text style={styles.doneBannerText}>🎉 완료! 계속 대화해도 괜찮아요.</Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder='Type in English...'
                  placeholderTextColor="#94a3b8"
                  multiline
                  maxLength={300}
                  blurOnSubmit={false}
                  autoCorrect={false}
                  autoCapitalize="none"
                  disableFullscreenUI={true}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
                  onPress={sendMessage}
                  disabled={!input.trim()}
                >
                  <Text style={styles.sendBtnText}>전송</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#fff', padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { color: '#262626', fontSize: 18, fontWeight: '800' },
  topicLabel: { color: '#8e8e8e', fontSize: 12, marginTop: 2 },
  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  topicBig: { fontSize: 22, fontWeight: '700', color: '#1e293b', textAlign: 'center', marginBottom: 12 },
  startHint: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  targetBox: {
    backgroundColor: '#eef2ff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
    marginBottom: 24, alignSelf: 'stretch', borderWidth: 1, borderColor: '#c7d2fe',
  },
  targetTitle: { fontSize: 11, fontWeight: '800', color: '#6366f1', letterSpacing: 0.5, marginBottom: 8 },
  targetWord: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  targetMeaning: { fontSize: 13, fontWeight: '400', color: '#64748b' },
  liveBar: { backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 8, gap: 7 },
  liveBarTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveBarText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  liveTrack: { flex: 1, height: 4, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden' },
  liveFill: { height: '100%', backgroundColor: '#6366f1', borderRadius: 99 },
  liveChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  liveChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1' },
  liveChipOn: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  liveChipText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  liveChipTextOn: { color: '#15803d' },
  historyBox: { alignSelf: 'stretch', marginTop: 26, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 14 },
  historyLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5, marginBottom: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 6 },
  historyTopic: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1e293b' },
  historyMeta: { fontSize: 11, color: '#94a3b8' },
  startBtn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  doneEmoji: { fontSize: 56, marginBottom: 12 },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  doneSub: { fontSize: 14, color: '#64748b' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12, marginVertical: 3 },
  userBubble: {
    alignSelf: 'flex-end', backgroundColor: '#6366f1', borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  userText: { color: '#fff' },
  aiText: { color: '#1e293b' },
  chatImage: { width: 220, height: 150, borderRadius: 10, marginTop: 8 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  typingText: { color: '#94a3b8', fontSize: 13 },
  endBtn: {
    backgroundColor: '#10b981', margin: 12, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  endBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', padding: 10, gap: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12,
    padding: 10, fontSize: 14, color: '#1e293b', maxHeight: 80,
  },
  sendBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#c7d2fe' },
  sendBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  progressHint: { textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingBottom: 6 },
  doneBanner: { backgroundColor: '#dcfce7', padding: 14, alignItems: 'center', margin: 12, borderRadius: 12 },
  doneBannerText: { color: '#16a34a', fontSize: 14, fontWeight: '600' },
});
