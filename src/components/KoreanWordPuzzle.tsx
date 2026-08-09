import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ToastAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { getDatabase, ref, set as dbSet } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { userRef } from '../utils/userDb';
import { PuzzleWord } from '../data/koreanContent';

function getKSTDateString(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

interface Props {
  words: PuzzleWord[];
  uid: string;
}

export default function KoreanWordPuzzle({ words, uid }: Props) {
  const today = getKSTDateString();
  const storageKey = `puzzle_done_${today}`;

  const [inputs, setInputs] = useState<string[]>(words.map(() => ''));
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(v => { if (v === 'true') setDone(true); });
  }, [storageKey]);

  const isCorrect = useCallback((i: number) => inputs[i].trim() === words[i].word, [inputs, words]);
  const allCorrect = words.every((_, i) => isCorrect(i));

  const handleCheck = () => setChecked(true);

  const handleRetry = () => {
    setChecked(false);
    setInputs(words.map((_, i) => (isCorrect(i) ? inputs[i] : '')));
  };

  const handleComplete = async () => {
    setDone(true);
    await AsyncStorage.setItem(storageKey, 'true');
    if (uid) {
      dbSet(userRef(uid, `completion/puzzle/${today}`), true).catch(() => {});
    }
    ToastAndroid.show('✅ 낱말퍼즐 완료!', ToastAndroid.SHORT);
  };

  if (done) {
    return (
      <View style={s.doneBox}>
        <MaterialIcons name="check-circle" size={28} color="#16a34a" />
        <Text style={s.doneText}>오늘 낱말퍼즐 완료!</Text>
      </View>
    );
  }

  return (
    <View>
      {words.map((w, i) => {
        const correct = checked && isCorrect(i);
        const wrong = checked && !isCorrect(i);
        return (
          <View key={i} style={s.wordRow}>
            <View style={s.clueRow}>
              <View style={s.numBadge}>
                <Text style={s.numText}>{i + 1}</Text>
              </View>
              <Text style={s.clueText}>{w.clue}</Text>
            </View>
            <View style={s.inputRow}>
              <Text style={s.blankHint}>
                {Array.from({ length: w.word.length }, () => '_').join(' ')}
              </Text>
              <TextInput
                ref={el => { inputRefs.current[i] = el; }}
                value={inputs[i]}
                onChangeText={v => {
                  const next = [...inputs];
                  next[i] = v;
                  setInputs(next);
                }}
                style={[
                  s.input,
                  correct && s.inputCorrect,
                  wrong && s.inputWrong,
                ]}
                editable={!done && !(checked && isCorrect(i))}
                placeholder={`${w.word.length}글자`}
                placeholderTextColor="#c0c0c0"
                returnKeyType={i < words.length - 1 ? 'next' : 'done'}
                onSubmitEditing={() => inputRefs.current[i + 1]?.focus()}
              />
              {checked && (
                <View style={s.resultBadge}>
                  {correct ? (
                    <MaterialIcons name="check-circle" size={20} color="#16a34a" />
                  ) : (
                    <Text style={s.answerReveal}>→ {w.word}</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        );
      })}

      <View style={s.btnRow}>
        {!checked ? (
          <TouchableOpacity style={s.checkBtn} onPress={handleCheck} activeOpacity={0.85}>
            <Text style={s.checkBtnText}>정답 확인</Text>
          </TouchableOpacity>
        ) : allCorrect ? (
          <TouchableOpacity style={s.completeBtn} onPress={handleComplete} activeOpacity={0.85}>
            <MaterialIcons name="emoji-events" size={18} color="#fff" />
            <Text style={s.completeBtnText}>완료!</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.retryBtn} onPress={handleRetry} activeOpacity={0.85}>
            <MaterialIcons name="refresh" size={18} color="#fff" />
            <Text style={s.retryBtnText}>다시 시도</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wordRow: {
    marginBottom: 18,
  },
  clueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  numBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0095f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  clueText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 28,
  },
  blankHint: {
    fontSize: 13,
    color: '#c0c0c0',
    letterSpacing: 3,
    minWidth: 36,
  },
  input: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderColor: '#dbdbdb',
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontSize: 16,
    color: '#262626',
  },
  inputCorrect: {
    borderColor: '#16a34a',
    color: '#16a34a',
  },
  inputWrong: {
    borderColor: '#dc2626',
    color: '#dc2626',
  },
  resultBadge: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  answerReveal: {
    fontSize: 13,
    color: '#0095f6',
    fontWeight: '600',
  },
  btnRow: {
    marginTop: 8,
  },
  checkBtn: {
    backgroundColor: '#0095f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  checkBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  completeBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  retryBtn: {
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  doneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16a34a',
  },
});
