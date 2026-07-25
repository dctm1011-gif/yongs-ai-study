import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { getDatabase, ref, get } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';

const GRID_SIZE = 15;
const MAX_WORDS = 8;
const SCREEN_WIDTH = Dimensions.get('window').width;
const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M','⌫'],
];

// --- Types ---

interface WordData {
  wordId: string;
  word: string;
  meaning: string;
}

interface PlacedWord {
  wordId: string;
  word: string;
  meaning: string;
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

type RawGrid = (CellInfo | null)[][];

// --- Crossword Generator ---

function canPlace(grid: RawGrid, word: string, row: number, col: number, dir: 'across' | 'down'): boolean {
  const len = word.length;
  if (dir === 'across') {
    if (row < 0 || row >= GRID_SIZE || col < 0 || col + len > GRID_SIZE) return false;
    if (col > 0 && grid[row][col - 1]) return false;
    if (col + len < GRID_SIZE && grid[row][col + len]) return false;
    for (let i = 0; i < len; i++) {
      const cell = grid[row][col + i];
      if (cell) {
        if (cell.letter !== word[i]) return false;
      } else {
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
      if (cell) {
        if (cell.letter !== word[i]) return false;
      } else {
        if (col > 0 && grid[row + i][col - 1]) return false;
        if (col < GRID_SIZE - 1 && grid[row + i][col + 1]) return false;
      }
    }
  }
  return true;
}

function placeInGrid(grid: RawGrid, pw: Omit<PlacedWord, 'clueNumber'>) {
  for (let i = 0; i < pw.word.length; i++) {
    const r = pw.direction === 'down' ? pw.startRow + i : pw.startRow;
    const c = pw.direction === 'across' ? pw.startCol + i : pw.startCol;
    if (!grid[r][c]) {
      grid[r][c] = { letter: pw.word[i], wordIds: [pw.wordId] };
    } else {
      if (!grid[r][c]!.wordIds.includes(pw.wordId)) {
        grid[r][c]!.wordIds.push(pw.wordId);
      }
    }
  }
}

function generateCrossword(words: WordData[]): { placed: PlacedWord[]; grid: RawGrid } {
  const grid: RawGrid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  const placed: PlacedWord[] = [];

  const sorted = [...words]
    .sort((a, b) => b.word.length - a.word.length)
    .map(w => ({ ...w, word: w.word.toUpperCase().replace(/[^A-Z]/g, '') }))
    .filter(w => w.word.length >= 3);

  if (sorted.length === 0) return { placed: [], grid };

  // First word horizontally at center
  const first = sorted[0];
  const r0 = Math.floor(GRID_SIZE / 2);
  const c0 = Math.floor((GRID_SIZE - first.word.length) / 2);
  const firstEntry = {
    wordId: first.wordId, word: first.word, meaning: first.meaning,
    direction: 'across' as const, startRow: r0, startCol: c0,
  };
  placeInGrid(grid, firstEntry);
  placed.push({ ...firstEntry, clueNumber: 0 });

  for (const wd of sorted.slice(1)) {
    let best: { row: number; col: number; dir: 'across' | 'down'; score: number } | null = null;

    for (const pw of placed) {
      const tryDir: 'across' | 'down' = pw.direction === 'across' ? 'down' : 'across';

      for (let ni = 0; ni < wd.word.length; ni++) {
        for (let pi = 0; pi < pw.word.length; pi++) {
          if (wd.word[ni] !== pw.word[pi]) continue;

          let row: number, col: number;
          if (tryDir === 'down') {
            col = pw.startCol + pi;
            row = pw.startRow - ni;
          } else {
            row = pw.startRow + pi;
            col = pw.startCol - ni;
          }

          if (!canPlace(grid, wd.word, row, col, tryDir)) continue;

          // Score by number of intersections with existing words
          let score = 0;
          for (let k = 0; k < wd.word.length; k++) {
            const r = tryDir === 'down' ? row + k : row;
            const c = tryDir === 'across' ? col + k : col;
            if (grid[r][c]) score++;
          }

          if (!best || score > best.score) {
            best = { row, col, dir: tryDir, score };
          }
        }
      }
    }

    if (best) {
      const entry = {
        wordId: wd.wordId, word: wd.word, meaning: wd.meaning,
        direction: best.dir, startRow: best.row, startCol: best.col,
      };
      placeInGrid(grid, entry);
      placed.push({ ...entry, clueNumber: 0 });
    }
  }

  // Assign clue numbers in reading order (top→bottom, left→right)
  const cellNums = new Map<string, number>();
  let num = 1;
  const byPos = [...placed].sort((a, b) =>
    a.startRow !== b.startRow ? a.startRow - b.startRow : a.startCol - b.startCol
  );
  for (const pw of byPos) {
    const key = `${pw.startRow},${pw.startCol}`;
    if (!cellNums.has(key)) cellNums.set(key, num++);
    pw.clueNumber = cellNums.get(key)!;
  }

  // Write clue numbers into grid cells
  for (const pw of placed) {
    const cell = grid[pw.startRow][pw.startCol];
    if (cell) cell.clueNumber = pw.clueNumber;
  }

  return { placed, grid };
}

function getBounds(placed: PlacedWord[]) {
  let minR = GRID_SIZE, maxR = 0, minC = GRID_SIZE, maxC = 0;
  for (const pw of placed) {
    const endR = pw.direction === 'down' ? pw.startRow + pw.word.length - 1 : pw.startRow;
    const endC = pw.direction === 'across' ? pw.startCol + pw.word.length - 1 : pw.startCol;
    minR = Math.min(minR, pw.startRow);
    maxR = Math.max(maxR, endR);
    minC = Math.min(minC, pw.startCol);
    maxC = Math.max(maxC, endC);
  }
  return { minR, maxR, minC, maxC };
}

// --- Component ---

type GameState = 'loading' | 'empty' | 'playing' | 'complete';

export default function CrosswordGame() {
  const [gameState, setGameState] = useState<GameState>('loading');
  const [placedWords, setPlacedWords] = useState<PlacedWord[]>([]);
  const [grid, setGrid] = useState<RawGrid>([]);
  const [userInputs, setUserInputs] = useState<Record<string, string>>({});
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [cursorCell, setCursorCell] = useState<{ row: number; col: number } | null>(null);
  const [bounds, setBounds] = useState({ minR: 0, maxR: 0, minC: 0, maxC: 0 });

  const loadGame = useCallback(async () => {
    setGameState('loading');
    try {
      const db = getDatabase(getFirebaseApp());
      const snapshot = await get(ref(db, 'english/reviewPool'));
      if (!snapshot.exists()) { setGameState('empty'); return; }

      const pool = snapshot.val() as Record<string, any>;
      const wordList: WordData[] = Object.entries(pool)
        .map(([wordId, v]: [string, any]) => ({ wordId, word: v.word ?? '', meaning: v.meaning ?? '' }))
        .filter(w => /^[a-zA-Z]{3,}$/.test(w.word));

      if (wordList.length < 2) { setGameState('empty'); return; }

      const shuffled = [...wordList].sort(() => Math.random() - 0.5).slice(0, MAX_WORDS);
      const { placed, grid: g } = generateCrossword(shuffled);

      if (placed.length < 2) { setGameState('empty'); return; }

      const b = getBounds(placed);
      setPlacedWords(placed);
      setGrid(g);
      setBounds(b);
      setUserInputs({});
      setSelectedWordId(placed[0].wordId);
      setCursorCell({ row: placed[0].startRow, col: placed[0].startCol });
      setGameState('playing');
    } catch (e) {
      console.warn('CrosswordGame load error:', e);
      setGameState('empty');
    }
  }, []);

  useEffect(() => { loadGame(); }, [loadGame]);

  const selectedWord = useMemo(
    () => placedWords.find(pw => pw.wordId === selectedWordId) ?? null,
    [placedWords, selectedWordId]
  );

  const ck = (row: number, col: number) => `${row},${col}`;

  const wordCells = useCallback((pw: PlacedWord) =>
    Array.from({ length: pw.word.length }, (_, i) => ({
      row: pw.direction === 'down' ? pw.startRow + i : pw.startRow,
      col: pw.direction === 'across' ? pw.startCol + i : pw.startCol,
    })), []
  );

  const activeCellSet = useMemo(() => {
    if (!selectedWord) return new Set<string>();
    return new Set(wordCells(selectedWord).map(c => ck(c.row, c.col)));
  }, [selectedWord, wordCells]);

  const handleCellPress = useCallback((row: number, col: number) => {
    const cell = grid[row]?.[col];
    if (!cell) return;

    // Tap same cursor cell at intersection → switch to other word
    if (cursorCell?.row === row && cursorCell?.col === col && cell.wordIds.length > 1) {
      const other = cell.wordIds.find(id => id !== selectedWordId);
      if (other) { setSelectedWordId(other); return; }
    }

    if (cell.wordIds.includes(selectedWordId ?? '')) {
      setCursorCell({ row, col });
    } else {
      setSelectedWordId(cell.wordIds[0]);
      setCursorCell({ row, col });
    }
  }, [grid, selectedWordId, cursorCell]);

  const handleKey = useCallback((key: string) => {
    if (!selectedWord || !cursorCell) return;
    const cells = wordCells(selectedWord);
    const idx = cells.findIndex(c => c.row === cursorCell.row && c.col === cursorCell.col);
    if (idx === -1) return;

    if (key === '⌫') {
      const k = ck(cursorCell.row, cursorCell.col);
      if (userInputs[k]) {
        setUserInputs(prev => { const n = { ...prev }; delete n[k]; return n; });
      } else if (idx > 0) {
        const prev = cells[idx - 1];
        setCursorCell(prev);
        setUserInputs(p => { const n = { ...p }; delete n[ck(prev.row, prev.col)]; return n; });
      }
    } else {
      setUserInputs(prev => ({ ...prev, [ck(cursorCell.row, cursorCell.col)]: key }));
      if (idx < cells.length - 1) setCursorCell(cells[idx + 1]);
    }
  }, [selectedWord, cursorCell, wordCells, userInputs]);

  // Completion check
  useEffect(() => {
    if (gameState !== 'playing' || placedWords.length === 0) return;
    const done = placedWords.every(pw =>
      pw.word.split('').every((letter, i) => {
        const r = pw.direction === 'down' ? pw.startRow + i : pw.startRow;
        const c = pw.direction === 'across' ? pw.startCol + i : pw.startCol;
        return userInputs[ck(r, c)] === letter;
      })
    );
    if (done) setGameState('complete');
  }, [userInputs, placedWords, gameState]);

  if (gameState === 'loading') {
    return <View style={s.centered}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  if (gameState === 'empty') {
    return (
      <View style={s.centered}>
        <Text style={s.bigEmoji}>📝</Text>
        <Text style={s.emptyTitle}>복습할 단어가 없어요</Text>
        <Text style={s.emptySub}>단어장에서 단어를 읽음 처리하면{'\n'}낱말퍼즐에 등장합니다</Text>
      </View>
    );
  }

  if (gameState === 'complete') {
    return (
      <View style={s.centered}>
        <Text style={s.bigEmoji}>🎉</Text>
        <Text style={s.emptyTitle}>완성!</Text>
        <Text style={s.emptySub}>모든 단어를 맞췄어요</Text>
        <TouchableOpacity style={s.retryBtn} onPress={loadGame}>
          <Text style={s.retryBtnText}>다시하기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { minR, maxR, minC, maxC } = bounds;
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const cellSize = Math.min(38, Math.floor((SCREEN_WIDTH - 24) / cols));

  return (
    <View style={s.container}>
      {/* Grid */}
      <ScrollView style={s.gridScroll} contentContainerStyle={s.gridOuter}>
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
                  const isCursor = cursorCell?.row === row && cursorCell?.col === col;
                  const isCorrect = input !== '' && input === cell.letter;
                  const isWrong = input !== '' && input !== cell.letter;

                  return (
                    <TouchableOpacity
                      key={col}
                      style={[
                        s.cell,
                        { width: cellSize, height: cellSize },
                        isActive && s.cellActive,
                        isCursor && s.cellCursor,
                        isCorrect && s.cellCorrect,
                        isWrong && s.cellWrong,
                      ]}
                      onPress={() => handleCellPress(row, col)}
                      activeOpacity={0.7}
                    >
                      {cell.clueNumber !== undefined && (
                        <Text style={[s.cellClueNum, { fontSize: Math.max(7, cellSize * 0.22) }]}>
                          {cell.clueNumber}
                        </Text>
                      )}
                      <Text style={[
                        s.cellLetter,
                        { fontSize: Math.max(11, cellSize * 0.45) },
                        isCursor && s.cellLetterCursor,
                      ]}>
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
        <Text style={s.clueLabel}>
          {selectedWord?.clueNumber}{selectedWord?.direction === 'across' ? ' →' : ' ↓'}
        </Text>
        <Text style={s.clueText} numberOfLines={2}>
          {selectedWord?.meaning ?? '단어를 선택하세요'}
        </Text>
      </View>

      {/* Keyboard */}
      <View style={s.keyboard}>
        {KEYBOARD_ROWS.map((row, ri) => (
          <View key={ri} style={s.keyRow}>
            {row.map(key => (
              <TouchableOpacity
                key={key}
                style={[s.key, key === '⌫' && s.keyBs]}
                onPress={() => handleKey(key)}
                activeOpacity={0.6}
              >
                <Text style={[s.keyText, key === '⌫' && s.keyBsText]}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const KEY_W = Math.floor((SCREEN_WIDTH - 12) / 10) - 3;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  bigEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: 20, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  gridScroll: { flex: 1 },
  gridOuter: { padding: 12, alignItems: 'center' },
  gridRow: { flexDirection: 'row' },

  cellBlank: { margin: 1 },
  cell: {
    margin: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cellActive: { backgroundColor: '#dbeafe', borderColor: '#60a5fa' },
  cellCursor: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  cellCorrect: { backgroundColor: '#d1fae5', borderColor: '#10b981' },
  cellWrong: { backgroundColor: '#fee2e2', borderColor: '#ef4444' },

  cellClueNum: {
    position: 'absolute',
    top: 1,
    left: 2,
    fontWeight: '700',
    color: '#475569',
    lineHeight: 10,
  },
  cellLetter: { fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  cellLetterCursor: { color: '#fff' },

  clueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 52,
  },
  clueLabel: { fontSize: 14, fontWeight: '800', color: '#2563eb', marginRight: 10, minWidth: 32 },
  clueText: { flex: 1, fontSize: 13, color: '#1e293b', lineHeight: 19 },

  keyboard: { backgroundColor: '#d1d5db', paddingVertical: 6, paddingHorizontal: 4 },
  keyRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 2 },
  key: {
    width: KEY_W,
    marginHorizontal: 2,
    paddingVertical: 11,
    backgroundColor: '#fff',
    borderRadius: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
    elevation: 2,
  },
  keyText: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  keyBs: { width: KEY_W * 1.5, backgroundColor: '#6b7280' },
  keyBsText: { color: '#fff' },
});
