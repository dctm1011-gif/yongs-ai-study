import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { set as dbSet } from 'firebase/database';
import { userRef } from '../utils/userDb';
import { PuzzleWord } from '../data/koreanContent';

const GRID_SIZE = 15;
const SCREEN_WIDTH = Dimensions.get('window').width;

function getKSTDate(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

interface PlacedWord {
  id: string;
  word: string;
  clue: string;
  direction: 'across' | 'down';
  startRow: number;
  startCol: number;
  clueNumber: number;
}

interface CellInfo {
  letter: string;
  wordIds: string[];
  clueNumber?: number;
}

type Grid = (CellInfo | null)[][];

function canPlace(grid: Grid, word: string, row: number, col: number, dir: 'across' | 'down'): boolean {
  const chars = [...word];
  const len = chars.length;
  if (dir === 'across') {
    if (row < 0 || row >= GRID_SIZE || col < 0 || col + len > GRID_SIZE) return false;
    if (col > 0 && grid[row][col - 1]) return false;
    if (col + len < GRID_SIZE && grid[row][col + len]) return false;
    for (let i = 0; i < len; i++) {
      const cell = grid[row][col + i];
      if (cell) { if (cell.letter !== chars[i]) return false; }
      else {
        if (row > 0 && grid[row - 1][col + i]) return false;
        if (row < GRID_SIZE - 1 && grid[row + 1][col + i]) return false;
      }
    }
  } else {
    if (col < 0 || col >= GRID_SIZE || row < 0 || row + len > GRID_SIZE) return false;
    if (row > 0 && grid[row - 1][col]) return false;
    if (row + len < GRID_SIZE && grid[row + len][col]) return false;
    for (let i = 0; i < len; i++) {
      const cell = grid[row + i][col];
      if (cell) { if (cell.letter !== chars[i]) return false; }
      else {
        if (col > 0 && grid[row + i][col - 1]) return false;
        if (col < GRID_SIZE - 1 && grid[row + i][col + 1]) return false;
      }
    }
  }
  return true;
}

function placeWord(grid: Grid, id: string, word: string, row: number, col: number, dir: 'across' | 'down') {
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const r = dir === 'down' ? row + i : row;
    const c = dir === 'across' ? col + i : col;
    if (!grid[r][c]) grid[r][c] = { letter: chars[i], wordIds: [id] };
    else if (!grid[r][c]!.wordIds.includes(id)) grid[r][c]!.wordIds.push(id);
  }
}

function generateCrossword(words: PuzzleWord[]): { placed: PlacedWord[]; grid: Grid } {
  const grid: Grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  const placed: PlacedWord[] = [];
  const sorted = [...words].sort((a, b) => [...b.word].length - [...a.word].length);

  if (!sorted.length) return { placed, grid };

  const first = sorted[0];
  const r0 = Math.floor(GRID_SIZE / 2);
  const c0 = Math.floor((GRID_SIZE - [...first.word].length) / 2);
  placeWord(grid, '0', first.word, r0, c0, 'across');
  placed.push({ id: '0', word: first.word, clue: first.clue, direction: 'across', startRow: r0, startCol: c0, clueNumber: 0 });

  sorted.slice(1).forEach((wd, idx) => {
    const wdChars = [...wd.word];
    let best: { row: number; col: number; dir: 'across' | 'down'; score: number } | null = null;
    for (const pw of placed) {
      const dir: 'across' | 'down' = pw.direction === 'across' ? 'down' : 'across';
      const pwChars = [...pw.word];
      for (let ni = 0; ni < wdChars.length; ni++) {
        for (let pi = 0; pi < pwChars.length; pi++) {
          if (wdChars[ni] !== pwChars[pi]) continue;
          const row = dir === 'down' ? pw.startRow - ni : pw.startRow + pi;
          const col = dir === 'across' ? pw.startCol - ni : pw.startCol + pi;
          if (!canPlace(grid, wd.word, row, col, dir)) continue;
          let score = 0;
          for (let k = 0; k < wdChars.length; k++) {
            const r = dir === 'down' ? row + k : row;
            const c = dir === 'across' ? col + k : col;
            if (grid[r][c]) score++;
          }
          if (!best || score > best.score) best = { row, col, dir, score };
        }
      }
    }
    if (best) {
      const id = String(idx + 1);
      placeWord(grid, id, wd.word, best.row, best.col, best.dir);
      placed.push({ id, word: wd.word, clue: wd.clue, direction: best.dir, startRow: best.row, startCol: best.col, clueNumber: 0 });
    }
  });

  const cellNums = new Map<string, number>();
  let num = 1;
  [...placed]
    .sort((a, b) => a.startRow !== b.startRow ? a.startRow - b.startRow : a.startCol - b.startCol)
    .forEach(pw => {
      const k = `${pw.startRow},${pw.startCol}`;
      if (!cellNums.has(k)) cellNums.set(k, num++);
      pw.clueNumber = cellNums.get(k)!;
    });
  for (const pw of placed) {
    const c = grid[pw.startRow][pw.startCol];
    if (c) c.clueNumber = pw.clueNumber;
  }

  return { placed, grid };
}

function getBounds(placed: PlacedWord[]) {
  let minR = GRID_SIZE, maxR = 0, minC = GRID_SIZE, maxC = 0;
  for (const pw of placed) {
    const len = [...pw.word].length;
    const endR = pw.direction === 'down' ? pw.startRow + len - 1 : pw.startRow;
    const endC = pw.direction === 'across' ? pw.startCol + len - 1 : pw.startCol;
    minR = Math.min(minR, pw.startRow); maxR = Math.max(maxR, endR);
    minC = Math.min(minC, pw.startCol); maxC = Math.max(maxC, endC);
  }
  return { minR, maxR, minC, maxC };
}

interface Props { words: PuzzleWord[]; uid: string; }

export default function KoreanWordPuzzle({ words, uid }: Props) {
  const today = getKSTDate();
  const storageKey = `puzzle_done_${today}`;
  const inputRef = useRef<TextInput>(null);

  const [placed, setPlaced] = useState<PlacedWord[]>([]);
  const [grid, setGrid] = useState<Grid>([]);
  const [bounds, setBounds] = useState({ minR: 0, maxR: 0, minC: 0, maxC: 0 });
  const [userInputs, setUserInputs] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const { placed: p, grid: g } = generateCrossword(words);
    setPlaced(p);
    setGrid(g);
    setBounds(getBounds(p));
    setSelectedId(p[0]?.id ?? null);
    AsyncStorage.getItem(storageKey).then(v => { if (v === 'true') setDone(true); });
  }, [words, storageKey]);

  const ck = (r: number, c: number) => `${r},${c}`;

  const selectedWord = useMemo(
    () => placed.find(p => p.id === selectedId) ?? null,
    [placed, selectedId]
  );

  const activeCellSet = useMemo(() => {
    if (!selectedWord) return new Set<string>();
    const cells = new Set<string>();
    [...selectedWord.word].forEach((_, i) => {
      const r = selectedWord.direction === 'down' ? selectedWord.startRow + i : selectedWord.startRow;
      const c = selectedWord.direction === 'across' ? selectedWord.startCol + i : selectedWord.startCol;
      cells.add(ck(r, c));
    });
    return cells;
  }, [selectedWord]);

  // Build the text shown in the input bar from current cell values for the selected word
  const currentWordText = useMemo(() => {
    if (!selectedWord) return '';
    return [...selectedWord.word].map((_, i) => {
      const r = selectedWord.direction === 'down' ? selectedWord.startRow + i : selectedWord.startRow;
      const c = selectedWord.direction === 'across' ? selectedWord.startCol + i : selectedWord.startCol;
      return userInputs[ck(r, c)] ?? '';
    }).join('');
  }, [selectedWord, userInputs]);

  const handleCellPress = useCallback((row: number, col: number) => {
    if (done) return;
    const cell = grid[row]?.[col];
    if (!cell) return;
    // Tap same intersection → toggle to the other word
    if (cell.wordIds.includes(selectedId ?? '') && cell.wordIds.length > 1) {
      const other = cell.wordIds.find(id => id !== selectedId);
      if (other) { setSelectedId(other); setTimeout(() => inputRef.current?.focus(), 50); return; }
    }
    setSelectedId(cell.wordIds[0]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [grid, selectedId, done]);

  const handleInputChange = useCallback((text: string) => {
    if (!selectedWord) return;
    const wordChars = [...selectedWord.word];
    const typed = [...text].slice(0, wordChars.length);
    setUserInputs(prev => {
      const next = { ...prev };
      wordChars.forEach((_, i) => {
        const r = selectedWord.direction === 'down' ? selectedWord.startRow + i : selectedWord.startRow;
        const c = selectedWord.direction === 'across' ? selectedWord.startCol + i : selectedWord.startCol;
        const k = ck(r, c);
        if (i < typed.length) next[k] = typed[i];
        else delete next[k];
      });
      return next;
    });
  }, [selectedWord]);

  const handleReveal = useCallback(() => {
    if (!selectedWord) return;
    setUserInputs(prev => {
      const next = { ...prev };
      [...selectedWord.word].forEach((ch, i) => {
        const r = selectedWord.direction === 'down' ? selectedWord.startRow + i : selectedWord.startRow;
        const c = selectedWord.direction === 'across' ? selectedWord.startCol + i : selectedWord.startCol;
        next[ck(r, c)] = ch;
      });
      return next;
    });
    setRevealedIds(prev => new Set([...prev, selectedWord.id]));
  }, [selectedWord]);

  const allCorrect = useMemo(() => {
    if (!placed.length) return false;
    return placed.every(pw =>
      [...pw.word].every((ch, i) => {
        const r = pw.direction === 'down' ? pw.startRow + i : pw.startRow;
        const c = pw.direction === 'across' ? pw.startCol + i : pw.startCol;
        return userInputs[ck(r, c)] === ch;
      })
    );
  }, [placed, userInputs]);

  useEffect(() => {
    if (allCorrect && !done && placed.length > 0) {
      setDone(true);
      AsyncStorage.setItem(storageKey, 'true').catch(() => {});
      if (uid) dbSet(userRef(uid, `completion/puzzle/${today}`), true).catch(() => {});
    }
  }, [allCorrect, done, placed.length, storageKey, today, uid]);

  if (!placed.length) {
    return <View style={s.doneBox}><Text style={s.doneSub}>퍼즐을 불러오는 중...</Text></View>;
  }

  if (done) {
    return (
      <View style={s.doneBox}>
        <Text style={s.bigEmoji}>🎉</Text>
        <Text style={s.doneTitle}>완성!</Text>
        <Text style={s.doneSub}>오늘 낱말퍼즐 완료</Text>
        {revealedIds.size > 0 && (
          <View style={s.reviewSection}>
            <Text style={s.reviewTitle}>📖 정답 확인한 단어</Text>
            {placed.filter(pw => revealedIds.has(pw.id)).map(pw => (
              <View key={pw.id} style={s.reviewItem}>
                <Text style={s.reviewWord}>{pw.word}</Text>
                <Text style={s.reviewClue}>{pw.clue}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  const { minR, maxR, minC, maxC } = bounds;
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const cellSize = Math.min(44, Math.floor((SCREEN_WIDTH - 24) / cols));

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.gridOuter} keyboardShouldPersistTaps="always">
        <View>
          {Array.from({ length: rows }, (_, ri) => {
            const row = minR + ri;
            return (
              <View key={row} style={s.gridRow}>
                {Array.from({ length: cols }, (_, ci) => {
                  const col = minC + ci;
                  const cell = grid[row]?.[col];
                  if (!cell) {
                    return <View key={col} style={[s.cellBlank, { width: cellSize, height: cellSize }]} />;
                  }
                  const key = ck(row, col);
                  const input = userInputs[key] ?? '';
                  const isActive = activeCellSet.has(key);
                  const isCorrect = input !== '' && input === cell.letter;
                  const isWrong = input !== '' && input !== cell.letter;
                  return (
                    <TouchableOpacity
                      key={col}
                      style={[
                        s.cell, { width: cellSize, height: cellSize },
                        isActive && s.cellActive,
                        isCorrect && s.cellCorrect,
                        isWrong && s.cellWrong,
                      ]}
                      onPress={() => handleCellPress(row, col)}
                      activeOpacity={0.7}
                    >
                      {cell.clueNumber !== undefined && (
                        <Text style={[s.cellNum, { fontSize: Math.max(7, cellSize * 0.2) }]}>
                          {cell.clueNumber}
                        </Text>
                      )}
                      <Text style={[s.cellLetter, { fontSize: Math.max(11, cellSize * 0.40) }]}>
                        {input}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Clue bar */}
      <View style={s.clueBar}>
        <Text style={s.clueNum}>
          {selectedWord?.clueNumber}{selectedWord?.direction === 'across' ? ' →' : ' ↓'}
        </Text>
        <Text style={s.clueText} numberOfLines={2}>
          {selectedWord?.clue ?? '칸을 눌러 선택하세요'}
        </Text>
        <TouchableOpacity style={s.revealBtn} onPress={handleReveal} activeOpacity={0.7}>
          <Text style={s.revealBtnText}>정답보기</Text>
        </TouchableOpacity>
      </View>

      {/* Input bar with system Korean keyboard */}
      <View style={s.inputBar}>
        <Text style={s.inputLabel}>입력</Text>
        <TextInput
          ref={inputRef}
          value={currentWordText}
          onChangeText={handleInputChange}
          style={s.textInput}
          autoCorrect={false}
          autoCapitalize="none"
          placeholder={selectedWord ? '_'.repeat([...selectedWord.word].length) : ''}
          placeholderTextColor="#c0c0c0"
          maxLength={selectedWord ? [...selectedWord.word].length * 3 : 20}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  gridOuter: { padding: 12, alignItems: 'center' },
  gridRow: { flexDirection: 'row' },
  cellBlank: { margin: 1 },
  cell: {
    margin: 1, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#dbdbdb',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  cellActive: { backgroundColor: '#e7f5ff', borderColor: '#0095f6' },
  cellCorrect: { backgroundColor: '#d1fae5', borderColor: '#10b981' },
  cellWrong: { backgroundColor: '#fee2e2', borderColor: '#ef4444' },
  cellNum: {
    position: 'absolute', top: 1, left: 2,
    fontWeight: '600', color: '#8e8e8e', lineHeight: 10,
  },
  cellLetter: { fontWeight: '600', color: '#262626', textAlign: 'center' },

  clueBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#dbdbdb',
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 52,
  },
  clueNum: { fontSize: 14, fontWeight: '600', color: '#0095f6', marginRight: 10, minWidth: 32 },
  clueText: { flex: 1, fontSize: 13, color: '#262626', lineHeight: 19 },
  revealBtn: {
    marginLeft: 8, paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8,
  },
  revealBtnText: { fontSize: 12, fontWeight: '600', color: '#0095f6' },

  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fafafa', borderTopWidth: 1, borderTopColor: '#dbdbdb',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  inputLabel: { fontSize: 13, color: '#8e8e8e', marginRight: 10, fontWeight: '600' },
  textInput: {
    flex: 1, fontSize: 20, fontWeight: '700', color: '#262626',
    borderBottomWidth: 1.5, borderColor: '#0095f6',
    paddingVertical: 4, paddingHorizontal: 4,
    letterSpacing: 6,
  },

  doneBox: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  bigEmoji: { fontSize: 40, marginBottom: 8 },
  doneTitle: { fontSize: 22, fontWeight: '700', color: '#262626', marginBottom: 4 },
  doneSub: { fontSize: 14, color: '#8e8e8e', marginBottom: 16 },
  reviewSection: {
    width: '100%', marginTop: 8,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#dbdbdb', overflow: 'hidden',
  },
  reviewTitle: {
    fontSize: 13, fontWeight: '600', color: '#262626',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#dbdbdb',
  },
  reviewItem: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#dbdbdb',
  },
  reviewWord: { fontSize: 15, fontWeight: '600', color: '#262626', marginBottom: 2 },
  reviewClue: { fontSize: 13, color: '#8e8e8e' },
});
