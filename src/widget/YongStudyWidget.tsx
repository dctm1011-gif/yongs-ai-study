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
    </FlexWidget>
  );
}
