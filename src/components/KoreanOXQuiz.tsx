import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, ToastAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, ref, set as dbSet } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { userRef } from '../utils/userDb';
import { MaterialIcons } from '@expo/vector-icons';

export interface OXItem {
  word: string;
  sentence: string;
  isO: boolean;
  explanation: string;
}

interface Props {
  items: OXItem[];
  uid: string;
}

type Phase = 'waiting' | 'correct' | 'wrong';

function getKSTDate() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

export default function KoreanOXQuiz({ items, uid }: Props) {
  const today = getKSTDate();
  const storageKey = `korean_ox_done_${today}`;

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [wrongItems, setWrongItems] = useState<OXItem[]>([]);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(v => { if (v === 'true') setAlreadyDone(true); });
  }, [storageKey]);

  // finished가 true가 된 렌더 이후에 실행 → score/wrongItems 모두 확정된 상태
  useEffect(() => {
    if (!finished || !uid) return;
    const db = getDatabase(getFirebaseApp());
    dbSet(ref(db, `users/${uid}/completion/korean_ox/${today}`), score).catch(() => {});
    if (wrongItems.length > 0) {
      dbSet(ref(db, `users/${uid}/wrongPool/korean_ox/${today}`), wrongItems).catch(() => {});
    }
  }, [finished]);

  if (!items || items.length === 0) return null;

  if (alreadyDone) {
    return (
      <View style={styles.doneBox}>
        <MaterialIcons name="check-circle" size={28} color="#16a34a" />
        <Text style={styles.doneText}>오늘 퀴즈 완료!</Text>
      </View>
    );
  }

  const current = items[index];
  const totalItems = items.length;

  const highlightSentence = (sentence: string, word: string) => {
    const idx = sentence.indexOf(word);
    if (idx === -1) return <Text style={styles.sentence}>{sentence}</Text>;
    return (
      <Text style={styles.sentence}>
        {sentence.slice(0, idx)}
        <Text style={styles.sentenceHighlight}>{word}</Text>
        {sentence.slice(idx + word.length)}
      </Text>
    );
  };

  const handleAnswer = (userAnswerIsO: boolean) => {
    if (phase !== 'waiting') return;
    const correct = userAnswerIsO === current.isO;
    setPhase(correct ? 'correct' : 'wrong');
    if (correct) {
      setScore(s => s + 1);
    } else {
      setWrongItems(prev => [...prev, current]);
    }
  };

  const handleNext = () => {
    if (index + 1 >= totalItems) {
      setFinished(true);
      AsyncStorage.setItem(storageKey, 'true');
      ToastAndroid.show('✅ 어휘 퀴즈 완료!', ToastAndroid.SHORT);
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setIndex(i => i + 1);
      setPhase('waiting');
      fadeAnim.setValue(1);
    });
  };

  if (finished) {
    const pct = Math.round((score / totalItems) * 100);
    return (
      <ScrollView>
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>퀴즈 완료</Text>
          <Text style={styles.resultScore}>{score} <Text style={styles.resultTotal}>/ {totalItems}</Text></Text>
          <Text style={styles.resultPct}>{pct}% 정답</Text>
          <Text style={styles.resultMsg}>
            {pct >= 80 ? '훌륭해요! 어휘력이 뛰어납니다.' : pct >= 50 ? '잘 했어요! 꾸준히 학습하세요.' : '틀린 단어를 다시 확인해보세요.'}
          </Text>
        </View>
        {wrongItems.length > 0 && (
          <View style={styles.wrongReviewBox}>
            <Text style={styles.wrongReviewTitle}>❌ 틀린 문제 복습 ({wrongItems.length}개)</Text>
            {wrongItems.map((item, i) => (
              <View key={i} style={styles.wrongReviewItem}>
                <Text style={styles.wrongReviewWord}>{item.word}</Text>
                <View style={[styles.wrongReviewBadge, item.isO ? styles.oBadge : styles.xBadge]}>
                  <Text style={styles.wrongReviewBadgeText}>정답: {item.isO ? 'O' : 'X'}</Text>
                </View>
                <Text style={styles.wrongReviewSentence}>{item.sentence}</Text>
                <Text style={styles.wrongReviewExpl}>{item.explanation}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* 진행 */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>{index + 1} / {totalItems}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((index) / totalItems) * 100}%` }]} />
        </View>
        <Text style={styles.scoreText}>🎯 {score}</Text>
      </View>

      {/* 단어 */}
      <View style={styles.wordBox}>
        <Text style={styles.word}>{current.word}</Text>
      </View>

      {/* 예문 */}
      <View style={styles.sentenceBox}>
        <Text style={styles.sentenceLabel}>예문</Text>
        {highlightSentence(current.sentence, current.word)}
      </View>

      {/* 문제 */}
      <Text style={styles.question}>이 예문에서 단어의 쓰임이 올바른가?</Text>

      {/* O/X 버튼 */}
      {phase === 'waiting' ? (
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.oxBtn, styles.oBtn]} onPress={() => handleAnswer(true)} activeOpacity={0.8}>
            <Text style={styles.oxBtnText}>O</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.oxBtn, styles.xBtn]} onPress={() => handleAnswer(false)} activeOpacity={0.8}>
            <Text style={styles.oxBtnText}>X</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          {/* 결과 */}
          <View style={[styles.resultBadge, phase === 'correct' ? styles.correctBadge : styles.wrongBadge]}>
            <Text style={styles.resultBadgeText}>
              {phase === 'correct' ? '✅ 정답!' : `❌ 오답 — 정답은 ${current.isO ? 'O' : 'X'}`}
            </Text>
          </View>
          {/* 해설 */}
          <View style={styles.explanationBox}>
            <Text style={styles.explanationText}>{current.explanation}</Text>
          </View>
          {/* 다음 */}
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>{index + 1 >= totalItems ? '결과 보기' : '다음'}</Text>
            <MaterialIcons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  progressText: { fontSize: 12, color: '#8e8e8e', width: 36 },
  progressBar: { flex: 1, height: 4, backgroundColor: '#f0f0f0', borderRadius: 2 },
  progressFill: { height: '100%', backgroundColor: '#0891b2', borderRadius: 2 },
  scoreText: { fontSize: 12, color: '#8e8e8e', width: 36, textAlign: 'right' },

  wordBox: { alignItems: 'center', marginBottom: 16 },
  word: { fontSize: 26, fontWeight: '700', color: '#0891b2', letterSpacing: 1 },

  sentenceBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#0891b2' },
  sentenceLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' },
  sentence: { fontSize: 15, color: '#334155', lineHeight: 24 },
  sentenceHighlight: { fontWeight: '700', color: '#0891b2' },

  question: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 16 },

  btnRow: { flexDirection: 'row', gap: 12 },
  oxBtn: { flex: 1, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  oBtn: { backgroundColor: '#16a34a' },
  xBtn: { backgroundColor: '#dc2626' },
  oxBtnText: { fontSize: 28, fontWeight: '800', color: '#fff' },

  resultBadge: { padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  correctBadge: { backgroundColor: '#dcfce7' },
  wrongBadge: { backgroundColor: '#fee2e2' },
  resultBadgeText: { fontSize: 14, fontWeight: '700', color: '#1e293b' },

  explanationBox: { backgroundColor: '#fafafa', borderRadius: 8, padding: 12, marginBottom: 12 },
  explanationText: { fontSize: 13, color: '#475569', lineHeight: 20 },

  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0891b2', borderRadius: 10, paddingVertical: 13 },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  resultBox: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  resultTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  resultScore: { fontSize: 40, fontWeight: '800', color: '#0891b2' },
  resultTotal: { fontSize: 20, color: '#94a3b8' },
  resultPct: { fontSize: 14, color: '#64748b' },
  resultMsg: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 4 },

  doneBox: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  doneText: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
  doneScore: { fontSize: 13, color: '#64748b' },

  wrongReviewBox: { marginTop: 8, paddingHorizontal: 4 },
  wrongReviewTitle: { fontSize: 14, fontWeight: '700', color: '#dc2626', marginBottom: 12 },
  wrongReviewItem: { backgroundColor: '#fff5f5', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  wrongReviewWord: { fontSize: 17, fontWeight: '700', color: '#1e293b', marginBottom: 6 },
  wrongReviewBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 6 },
  oBadge: { backgroundColor: '#dcfce7' },
  xBadge: { backgroundColor: '#fee2e2' },
  wrongReviewBadgeText: { fontSize: 11, fontWeight: '700', color: '#1e293b' },
  wrongReviewSentence: { fontSize: 13, color: '#334155', lineHeight: 20, marginBottom: 4 },
  wrongReviewExpl: { fontSize: 12, color: '#64748b', lineHeight: 18 },
});
