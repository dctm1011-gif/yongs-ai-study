import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import React from 'react';
import { YongStudyWidget, WidgetData } from './YongStudyWidget';

const DB_URL = 'https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app';

function getKSTDateString(): string {
  const now = new Date(Date.now() + 9 * 3600000);
  return now.toISOString().slice(0, 10);
}

function getDisplayDate(): string {
  const now = new Date(Date.now() + 9 * 3600000);
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  return `${m}/${d}`;
}

async function fetchWidgetData(): Promise<WidgetData> {
  const date = getKSTDateString();
  const fallback: WidgetData = {
    date: getDisplayDate(),
    completed: 0,
    total: 18,
    quizScore: null,
    quizDetail: '',
    poolActive: 0,
    poolGraduated: 0,
    streak: 0,
    activities: {},
  };

  try {
    const res = await fetch(`${DB_URL}/dailySummary/${date}.json`);
    if (!res.ok) return fallback;
    const data = await res.json();
    if (!data) return fallback;

    const completionKeys: string[] = [
      'sajaseongeo', 'english', 'english_review', 'reading',
      'english_news_reading', 'english_speaking', 'investment',
      'investment_reflection', 'toefl_reading', 'news_summary',
      'shadowing', 'writing', 'grammar', 'journal', 'cultural_reading',
      'vocabulary_expansion', 'pronunciation', 'listening_comprehension',
    ];

    const activities: Record<string, boolean> = {};
    let completed = 0;
    for (const key of completionKeys) {
      const done = !!(data[key] === true || data[key] === 1 || data[key]?.completed);
      activities[key] = done;
      if (done) completed++;
    }

    const quizCorrect = data.quiz_correct ?? null;
    const quizTotal = data.quiz_total ?? null;
    const quizScore = quizCorrect !== null && quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : null;
    const quizDetail = quizScore !== null ? `${quizCorrect}/${quizTotal}` : '';

    return {
      date: getDisplayDate(),
      completed,
      total: completionKeys.length,
      quizScore,
      quizDetail,
      poolActive: data.pool_active ?? 0,
      poolGraduated: data.pool_graduated ?? 0,
      streak: data.streak ?? 0,
      activities,
    };
  } catch {
    return fallback;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, renderWidget } = props;

  if (widgetAction === 'WIDGET_DELETED') return;

  const data = await fetchWidgetData();

  renderWidget(
    React.createElement(YongStudyWidget, { data })
  );
}
