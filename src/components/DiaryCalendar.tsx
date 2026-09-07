import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase, ref, get, query, orderByKey, startAt, endAt } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { MaterialIcons } from '@expo/vector-icons';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function kstNow() {
  return new Date(Date.now() + 9 * 3600000);
}

interface Props {
  uid: string;
  visible: boolean;
  onClose: () => void;
}

export function DiaryCalendarModal({ uid, visible, onClose }: Props) {
  const now = kstNow();
  const maxYr = now.getUTCFullYear();
  const maxMo = now.getUTCMonth();
  const todayStr = now.toISOString().slice(0, 10);

  const [yr, setYr] = useState(maxYr);
  const [mo, setMo] = useState(maxMo);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const isMaxMonth = yr === maxYr && mo === maxMo;

  useEffect(() => {
    if (!visible || !uid) return;
    setLoading(true);
    setSelectedDate(null);
    const db = getDatabase(getFirebaseApp());
    const mm = String(mo + 1).padStart(2, '0');
    get(
      query(
        ref(db, `users/${uid}/diary`),
        orderByKey(),
        startAt(`${yr}-${mm}-01`),
        endAt(`${yr}-${mm}-31`),
      )
    )
      .then(snap => {
        const result: Record<string, string> = {};
        snap.forEach(child => {
          if (child.val()) result[child.key!] = child.val() as string;
        });
        setEntries(result);
      })
      .catch(() => setEntries({}))
      .finally(() => setLoading(false));
  }, [yr, mo, visible, uid]);

  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const startDow = new Date(yr, mo, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function prev() {
    setSelectedDate(null);
    if (mo === 0) { setYr(y => y - 1); setMo(11); }
    else setMo(m => m - 1);
  }
  function next() {
    if (isMaxMonth) return;
    setSelectedDate(null);
    if (mo === 11) { setYr(y => y + 1); setMo(0); }
    else setMo(m => m + 1);
  }

  const selectedText = selectedDate ? entries[selectedDate] : null;
  const entryCount = Object.keys(entries).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.container} edges={['top']}>
        {/* 헤더 */}
        <View style={s.header}>
          <Text style={s.headerTitle}>📔 일기장</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={24} color="#262626" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content}>
          {/* 월 이동 */}
          <View style={s.monthNav}>
            <TouchableOpacity onPress={prev} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
              <Text style={s.arrow}>‹</Text>
            </TouchableOpacity>
            <View style={s.monthCenter}>
              <Text style={s.monthTitle}>{yr}년 {mo + 1}월</Text>
              {!loading && (
                <Text style={s.entryCount}>
                  {entryCount > 0 ? `${entryCount}일 기록됨` : '기록 없음'}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={next} disabled={isMaxMonth} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
              <Text style={[s.arrow, isMaxMonth && s.dimmed]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* 요일 헤더 */}
          <View style={s.row}>
            {WEEK.map(d => <Text key={d} style={s.wd}>{d}</Text>)}
          </View>

          {/* 달력 */}
          {loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color="#059669" />
          ) : (
            weeks.map((wk, wi) => (
              <View key={wi} style={s.row}>
                {wk.map((day, di) => {
                  if (!day) return <View key={di} style={s.cellWrap} />;
                  const mm = String(mo + 1).padStart(2, '0');
                  const dd = String(day).padStart(2, '0');
                  const ds = `${yr}-${mm}-${dd}`;
                  const hasEntry = !!entries[ds];
                  const isToday = ds === todayStr;
                  const isSelected = ds === selectedDate;
                  return (
                    <TouchableOpacity
                      key={di}
                      style={s.cellWrap}
                      onPress={() => hasEntry && setSelectedDate(isSelected ? null : ds)}
                      activeOpacity={hasEntry ? 0.7 : 1}
                    >
                      <View style={[
                        s.cell,
                        hasEntry && s.cellHasEntry,
                        isSelected && s.cellSelected,
                        isToday && !isSelected && s.cellToday,
                      ]}>
                        <Text style={[
                          s.dayN,
                          hasEntry && s.dayNEntry,
                          isSelected && s.dayNSelected,
                        ]}>{day}</Text>
                        {hasEntry && <View style={[s.dot, isSelected && s.dotSelected]} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}

          {/* 선택된 일기 */}
          {selectedDate && selectedText && (
            <View style={s.entryBox}>
              <Text style={s.entryDate}>
                {selectedDate} ({WEEK[new Date(selectedDate + 'T00:00:00+09:00').getDay()]})
              </Text>
              <Text style={s.entryText}>{selectedText}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#262626' },
  content: { padding: 16, paddingBottom: 48 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  arrow: { fontSize: 28, color: '#262626', paddingHorizontal: 4 },
  dimmed: { color: '#d1d5db' },
  monthCenter: { alignItems: 'center' },
  monthTitle: { fontSize: 16, fontWeight: '700', color: '#262626' },
  entryCount: { fontSize: 11, color: '#059669', fontWeight: '600', marginTop: 2 },
  row: { flexDirection: 'row', marginBottom: 4 },
  wd: { flex: 1, textAlign: 'center', fontSize: 11, color: '#9ca3af', fontWeight: '600', paddingVertical: 4 },
  cellWrap: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  cell: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  cellHasEntry: { backgroundColor: '#f0fdf4' },
  cellSelected: { backgroundColor: '#059669' },
  cellToday: { borderWidth: 2, borderColor: '#059669' },
  dayN: { fontSize: 13, fontWeight: '500', color: '#cbd5e1' },
  dayNEntry: { color: '#059669', fontWeight: '700' },
  dayNSelected: { color: '#fff', fontWeight: '800' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#059669', marginTop: 1 },
  dotSelected: { backgroundColor: '#rgba(255,255,255,0.8)' },
  entryBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  entryDate: { fontSize: 13, fontWeight: '700', color: '#16a34a', marginBottom: 10 },
  entryText: { fontSize: 14, color: '#1f2937', lineHeight: 23 },
});
