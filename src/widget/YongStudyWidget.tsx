import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export interface WidgetData {
  date: string;
  completed: number;
  total: number;
  quizScore: number | null;
  quizDetail: string;
  poolActive: number;
  poolGraduated: number;
  streak: number;
  activities: Record<string, boolean>;
  calendarData: Record<string, number>;
}

const ROW1 = [
  { key: 'english',           label: '단어장' },
  { key: 'english_word_match', label: '카드' },
  { key: 'english_crossword', label: '퍼즐' },
  { key: 'english_scramble',  label: '스크램블' },
];
const ROW2 = [
  { key: 'english_sentence',       label: '예문OX' },
  { key: 'english_review',         label: '복습' },
  { key: 'english_news_reading',   label: '리딩' },
  { key: 'english_news_listening', label: '리스닝' },
];
const ROW3 = [
  { key: 'investment',   label: '투자' },
  { key: 'reading',      label: '독서' },
  { key: 'korean_diary', label: '어휘일기' },
];

function calCellBg(pct: number | undefined): string {
  if (pct === undefined) return '#1e293b';
  if (pct === 0)   return '#334155';
  if (pct < 40)   return '#312e81';
  if (pct < 70)   return '#4f46e5';
  if (pct < 100)  return '#16a34a';
  return '#15803d';
}

function calCellText(bg: string): string {
  if (bg === '#1e293b' || bg === '#334155') return '#475569';
  if (bg === '#312e81') return '#a5b4fc';
  return '#ffffff';
}

function MiniCalendar({ calendarData }: { calendarData: Record<string, number> }) {
  const now = new Date(Date.now() + 9 * 3600000);
  const yr = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const todayStr = now.toISOString().slice(0, 10);
  const mm = String(mo + 1).padStart(2, '0');

  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const startDow = new Date(yr, mo, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const pctVals = Object.values(calendarData);
  const avg = pctVals.length
    ? Math.round(pctVals.reduce((a, b) => a + b, 0) / pctVals.length)
    : null;

  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginTop: 10 }}>
      {/* divider */}
      <FlexWidget style={{ width: 'match_parent', height: 1, backgroundColor: '#1e293b', marginBottom: 8 }} />

      {/* section header */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <TextWidget text={`📅 ${mo + 1}월 진행률`} style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 'bold' }} />
        {avg !== null && (
          <TextWidget text={`평균 ${avg}%`} style={{ fontSize: 10, color: '#6ee7b7' }} />
        )}
      </FlexWidget>

      {/* week day header */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', marginBottom: 3 }}>
        {['일','월','화','수','목','금','토'].map((wd, i) => (
          <FlexWidget key={i} style={{ flex: 1 }}>
            <TextWidget text={wd} style={{ fontSize: 8, color: '#64748b' }} />
          </FlexWidget>
        ))}
      </FlexWidget>

      {/* calendar rows — 날짜+% 셀 */}
      {weeks.map((wk, wi) => (
        <FlexWidget key={wi} style={{ width: 'match_parent', flexDirection: 'row', marginBottom: 2 }}>
          {wk.map((day, di) => {
            if (day === null) {
              // 빈 셀: 같은 구조로 높이 균일 유지
              return (
                <FlexWidget key={di} style={{ flex: 1, flexDirection: 'column', backgroundColor: '#0f172a', borderRadius: 4, margin: 1, paddingHorizontal: 2, paddingVertical: 3 }}>
                  <TextWidget text=" " style={{ fontSize: 9, color: '#0f172a' }} />
                  <TextWidget text=" " style={{ fontSize: 7, color: '#0f172a' }} />
                </FlexWidget>
              );
            }
            const dd = String(day).padStart(2, '0');
            const ds = `${yr}-${mm}-${dd}`;
            const isToday = ds === todayStr;
            const pct = calendarData[ds];
            const bg = isToday ? '#2563eb' : calCellBg(pct);
            const tc = isToday ? '#ffffff' : calCellText(bg);
            return (
              <FlexWidget key={di} style={{ flex: 1, flexDirection: 'column', backgroundColor: bg, borderRadius: 4, margin: 1, paddingHorizontal: 2, paddingVertical: 3 }}>
                <TextWidget text={`${day}`} style={{ fontSize: 9, color: tc, fontWeight: 'bold' }} />
                <TextWidget
                  text={pct !== undefined ? `${pct}%` : ''}
                  style={{ fontSize: 7, color: tc }}
                />
              </FlexWidget>
            );
          })}
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

function Badge({ done, label }: { done: boolean; label: string }) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        backgroundColor: done ? '#14532d' : '#1e293b',
        borderRadius: 6,
        paddingVertical: 4,
        marginRight: 3,
        borderWidth: 1,
        borderColor: done ? '#16a34a' : '#334155',
        alignItems: 'center',
      }}
    >
      <TextWidget
        text={`${done ? '✓' : '·'} ${label}`}
        style={{ fontSize: 9, color: done ? '#86efac' : '#475569' }}
      />
    </FlexWidget>
  );
}

export function YongStudyWidget({ data }: { data: WidgetData }) {
  const pct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
  const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#6366f1' : '#f59e0b';
  const filledFlex = Math.max(1, pct);
  const emptyFlex = Math.max(1, 100 - pct);

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: '#0f172a',
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
      }}
      clickAction="OPEN_APP"
    >
      {/* Header */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget
          text="📚 YongStudy"
          style={{ fontSize: 14, fontWeight: 'bold', color: '#a5b4fc' }}
        />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          {data.streak > 0 && (
            <TextWidget
              text={`🔥${data.streak}  `}
              style={{ fontSize: 11, color: '#fb923c' }}
            />
          )}
          <TextWidget
            text={data.date}
            style={{ fontSize: 11, color: '#475569' }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Progress label */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <TextWidget
          text={`완료 ${data.completed} / ${data.total}`}
          style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 'bold' }}
        />
        <TextWidget
          text={`${pct}%`}
          style={{ fontSize: 12, color: barColor, fontWeight: 'bold' }}
        />
      </FlexWidget>

      {/* Progress bar */}
      <FlexWidget
        style={{ width: 'match_parent', flexDirection: 'row', height: 6, backgroundColor: '#1e293b', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}
      >
        <FlexWidget style={{ flex: filledFlex, backgroundColor: barColor }} />
        <FlexWidget style={{ flex: emptyFlex, backgroundColor: '#1e293b' }} />
      </FlexWidget>

      {/* Badge row 1 — 영어 A */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', marginTop: 8 }}>
        {ROW1.map(({ key, label }) => (
          <Badge key={key} done={!!data.activities[key]} label={label} />
        ))}
      </FlexWidget>

      {/* Badge row 2 — 영어 B */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', marginTop: 4 }}>
        {ROW2.map(({ key, label }) => (
          <Badge key={key} done={!!data.activities[key]} label={label} />
        ))}
      </FlexWidget>

      {/* Badge row 3 — 투자+한국어 */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', marginTop: 4 }}>
        {ROW3.map(({ key, label }) => (
          <Badge key={key} done={!!data.activities[key]} label={label} />
        ))}
      </FlexWidget>

      {/* Bottom stats */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <TextWidget
          text={data.quizScore !== null ? `🎯 ${data.quizScore}% (${data.quizDetail})` : '🎯 퀴즈 미완료'}
          style={{ fontSize: 10, color: data.quizScore !== null ? '#fbbf24' : '#475569' }}
        />
        <TextWidget
          text={`📖${data.poolActive} 🎓${data.poolGraduated}`}
          style={{ fontSize: 10, color: '#64748b' }}
        />
      </FlexWidget>

      {/* Monthly calendar */}
      <MiniCalendar calendarData={data.calendarData} />
    </FlexWidget>
  );
}
