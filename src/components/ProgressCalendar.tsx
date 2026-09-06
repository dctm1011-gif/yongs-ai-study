import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getDatabase, ref, get, query, orderByKey, startAt, endAt } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { CHECKLIST_KEYS, isDone } from '../constants/studyKeys';

function calcPct(completion: Record<string, any>): number {
  const done = CHECKLIST_KEYS.filter(k => isDone(completion[k])).length;
  return Math.round((done / CHECKLIST_KEYS.length) * 100);
}

function pctColor(pct: number): { bg: string; text: string } {
  if (pct === 0)   return { bg: '#e2e8f0', text: '#94a3b8' };
  if (pct < 40)   return { bg: '#c7d2fe', text: '#3730a3' };
  if (pct < 70)   return { bg: '#818cf8', text: '#fff'    };
  if (pct < 100)  return { bg: '#4ade80', text: '#166534' };
  return                  { bg: '#16a34a', text: '#fff'    };
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function kstNow() {
  return new Date(Date.now() + 9 * 3600000);
}

export function ProgressCalendar() {
  const now = kstNow();
  const todayStr = now.toISOString().slice(0, 10);
  const maxYr = now.getUTCFullYear();
  const maxMo = now.getUTCMonth();

  const [yr, setYr] = useState(maxYr);
  const [mo, setMo] = useState(maxMo);
  const [data, setData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const isMaxMonth = yr === maxYr && mo === maxMo;

  useEffect(() => {
    setLoading(true);
    const db = getDatabase(getFirebaseApp());
    const mm = String(mo + 1).padStart(2, '0');
    get(
      query(
        ref(db, 'studySummary'),
        orderByKey(),
        startAt(`${yr}-${mm}-01`),
        endAt(`${yr}-${mm}-31`),
      )
    )
      .then(snap => {
        const result: Record<string, number> = {};
        snap.forEach(child => {
          const d = child.val();
          if (!d) return;
          result[child.key!] =
            typeof d.progress?.pct === 'number'
              ? d.progress.pct
              : d.completion
              ? calcPct(d.completion)
              : 0;
        });
        setData(result);
      })
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [yr, mo]);

  // 달력 그리드 생성
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const startDow = new Date(yr, mo, 1).getDay(); // 0=일
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function prev() {
    if (mo === 0) { setYr(y => y - 1); setMo(11); }
    else setMo(m => m - 1);
  }
  function next() {
    if (isMaxMonth) return;
    if (mo === 11) { setYr(y => y + 1); setMo(0); }
    else setMo(m => m + 1);
  }

  // 월 평균 계산
  const pctValues = Object.entries(data)
    .filter(([d]) => d.startsWith(`${yr}-${String(mo + 1).padStart(2, '0')}`))
    .map(([, p]) => p);
  const avgPct = pctValues.length
    ? Math.round(pctValues.reduce((a, b) => a + b, 0) / pctValues.length)
    : null;

  return (
    <View style={s.card}>
      {/* 헤더 */}
      <View style={s.hdr}>
        <TouchableOpacity onPress={prev} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Text style={s.arrow}>‹</Text>
        </TouchableOpacity>
        <View style={s.titleWrap}>
          <Text style={s.title}>{yr}년 {mo + 1}월</Text>
          {avgPct !== null && (
            <Text style={s.avg}>평균 {avgPct}%</Text>
          )}
        </View>
        <TouchableOpacity onPress={next} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} disabled={isMaxMonth}>
          <Text style={[s.arrow, isMaxMonth && s.dimmed]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 요일 헤더 */}
      <View style={s.row}>
        {WEEK.map(d => <Text key={d} style={s.wd}>{d}</Text>)}
      </View>

      {/* 날짜 셀 */}
      {loading ? (
        <ActivityIndicator style={{ marginVertical: 24 }} color="#0095f6" />
      ) : (
        weeks.map((wk, wi) => (
          <View key={wi} style={s.row}>
            {wk.map((day, di) => {
              if (!day) return <View key={di} style={s.cellWrap} />;
              const mm = String(mo + 1).padStart(2, '0');
              const dd = String(day).padStart(2, '0');
              const ds = `${yr}-${mm}-${dd}`;
              const pct = data[ds];
              const hasPct = pct !== undefined;
              const col = hasPct ? pctColor(pct) : { bg: '#f1f5f9', text: '#cbd5e1' };
              const isToday = ds === todayStr;
              return (
                <View key={di} style={s.cellWrap}>
                  <View style={[s.cell, { backgroundColor: col.bg }, isToday && s.todayRing]}>
                    <Text style={[s.dayN, { color: col.text }, isToday && s.todayDayN]}>{day}</Text>
                    {hasPct && <Text style={[s.pctT, { color: col.text }]}>{pct}%</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}

      {/* 범례 */}
      <View style={s.legend}>
        {[
          { bg: '#e2e8f0', label: '0%' },
          { bg: '#c7d2fe', label: '~40%' },
          { bg: '#818cf8', label: '~70%' },
          { bg: '#4ade80', label: '~99%' },
          { bg: '#16a34a', label: '100%' },
        ].map(({ bg, label }) => (
          <View key={label} style={s.lgItem}>
            <View style={[s.lgDot, { backgroundColor: bg }]} />
            <Text style={s.lgLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#f8f8f8',
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  arrow: { fontSize: 26, color: '#262626', paddingHorizontal: 2 },
  dimmed: { color: '#d1d5db' },
  titleWrap: { alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: '#262626' },
  avg: { fontSize: 11, color: '#0095f6', fontWeight: '600', marginTop: 2 },
  row: { flexDirection: 'row', marginBottom: 3 },
  wd: { flex: 1, textAlign: 'center', fontSize: 11, color: '#9ca3af', fontWeight: '600', paddingVertical: 3 },
  cellWrap: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  cell: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayRing: { borderWidth: 2, borderColor: '#0095f6' },
  dayN: { fontSize: 12, fontWeight: '600' },
  todayDayN: { fontWeight: '800' },
  pctT: { fontSize: 8, marginTop: 1 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  lgItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lgDot: { width: 10, height: 10, borderRadius: 3 },
  lgLabel: { fontSize: 10, color: '#6b7280' },
});
