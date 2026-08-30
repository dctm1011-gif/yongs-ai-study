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
  { key: 'english', label: 'Voca' },
  { key: 'english_review', label: '복습' },
  { key: 'english_news_reading', label: 'BBC' },
  { key: 'english_speaking', label: 'Talk' },
];
const ROW2 = [
  { key: 'reading', label: '독해' },
  { key: 'investment', label: '투자' },
  { key: 'toefl_reading', label: 'TOEFL' },
  { key: 'sajaseongeo', label: '사자성어' },
];

function Badge({ done, label }: { done: boolean; label: string }) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        backgroundColor: done ? '#14532d' : '#1e293b',
        borderRadius: 6,
        paddingVertical: 4,
        marginRight: 4,
        borderWidth: 1,
        borderColor: done ? '#16a34a' : '#334155',
        alignItems: 'center',
      }}
    >
      <TextWidget
        text={`${done ? '✓' : '·'} ${label}`}
        style={{ fontSize: 10, color: done ? '#86efac' : '#475569' }}
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
        flex: 1,
        backgroundColor: '#0f172a',
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
      }}
      clickAction="OPEN_APP"
    >
      {/* Header row */}
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
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
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <TextWidget
          text={`완료 ${data.completed} / ${data.total}`}
          style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 'bold' }}
        />
        <TextWidget
          text={`${pct}%`}
          style={{ fontSize: 13, color: barColor, fontWeight: 'bold' }}
        />
      </FlexWidget>

      {/* Progress bar using flex weights */}
      <FlexWidget
        style={{ flexDirection: 'row', height: 7, backgroundColor: '#1e293b', borderRadius: 4, marginTop: 5, overflow: 'hidden' }}
      >
        <FlexWidget style={{ flex: filledFlex, backgroundColor: barColor }} />
        <FlexWidget style={{ flex: emptyFlex, backgroundColor: '#1e293b' }} />
      </FlexWidget>

      {/* Badge row 1 */}
      <FlexWidget style={{ flexDirection: 'row', marginTop: 10 }}>
        {ROW1.map(({ key, label }) => (
          <Badge key={key} done={!!data.activities[key]} label={label} />
        ))}
      </FlexWidget>

      {/* Badge row 2 */}
      <FlexWidget style={{ flexDirection: 'row', marginTop: 5 }}>
        {ROW2.map(({ key, label }) => (
          <Badge key={key} done={!!data.activities[key]} label={label} />
        ))}
      </FlexWidget>

      {/* Bottom stats */}
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <TextWidget
          text={data.quizScore !== null ? `🎯 ${data.quizScore}% (${data.quizDetail})` : '🎯 퀴즈 미완료'}
          style={{ fontSize: 11, color: data.quizScore !== null ? '#fbbf24' : '#475569' }}
        />
        <TextWidget
          text={`📖${data.poolActive} 🎓${data.poolGraduated}`}
          style={{ fontSize: 11, color: '#64748b' }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
