import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import WordMatchGame from './WordMatchGame';
import CrosswordGame from './CrosswordGame';
import ScrambleGame from './ScrambleGame';

type Mode = 'select' | 'match' | 'crossword' | 'scramble';

export default function GameHub() {
  const [mode, setMode] = useState<Mode>('select');

  if (mode === 'match') {
    return (
      <View style={s.flex}>
        <TouchableOpacity style={s.backBar} onPress={() => setMode('select')}>
          <Text style={s.backText}>← 게임 선택</Text>
        </TouchableOpacity>
        <WordMatchGame />
      </View>
    );
  }

  if (mode === 'crossword') {
    return (
      <View style={s.flex}>
        <TouchableOpacity style={s.backBar} onPress={() => setMode('select')}>
          <Text style={s.backText}>← 게임 선택</Text>
        </TouchableOpacity>
        <CrosswordGame />
      </View>
    );
  }

  if (mode === 'scramble') {
    return (
      <View style={s.flex}>
        <TouchableOpacity style={s.backBar} onPress={() => setMode('select')}>
          <Text style={s.backText}>← 게임 선택</Text>
        </TouchableOpacity>
        <ScrambleGame />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>게임 선택</Text>

      <TouchableOpacity style={s.card} onPress={() => setMode('match')} activeOpacity={0.8}>
        <Text style={s.cardEmoji}>🃏</Text>
        <View style={s.cardBody}>
          <Text style={s.cardName}>카드 매칭</Text>
          <Text style={s.cardDesc}>단어와 뜻을 짝지어보세요</Text>
        </View>
        <Text style={s.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.card} onPress={() => setMode('crossword')} activeOpacity={0.8}>
        <Text style={s.cardEmoji}>📝</Text>
        <View style={s.cardBody}>
          <Text style={s.cardName}>낱말 퍼즐</Text>
          <Text style={s.cardDesc}>가로세로 크로스워드</Text>
        </View>
        <Text style={s.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.card} onPress={() => setMode('scramble')} activeOpacity={0.8}>
        <Text style={s.cardEmoji}>🔀</Text>
        <View style={s.cardBody}>
          <Text style={s.cardName}>스크램블</Text>
          <Text style={s.cardDesc}>섞인 글자를 순서대로 탭하세요</Text>
        </View>
        <Text style={s.arrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  backBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },

  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 28,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    gap: 16,
  },
  cardEmoji: { fontSize: 36 },
  cardBody: { flex: 1 },
  cardName: { fontSize: 17, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#64748b' },
  arrow: { fontSize: 26, color: '#94a3b8', fontWeight: '300' },
});
