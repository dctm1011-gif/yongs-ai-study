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

const TRACKED_KEYS = [
  'english', 'english_review', 'english_news_reading', 'english_speaking',
  'reading', 'korean_diary', 'investment', 'toefl_reading',
];

export async function fetchWidgetData(): Promise<WidgetData> {
  const date = getKSTDateString();
  const fallback: WidgetData = {
    date: getDisplayDate(),
    completed: 0,
    total: TRACKED_KEYS.length,
    quizScore: null,
    quizDetail: '',
    poolActive: 0,
    poolGraduated: 0,
    streak: 0,
    activities: {},
  };

  try {
    const res = await fetch(`${DB_URL}/english/summary/${date}.json`);
    if (!res.ok) return fallback;
    const data = await res.json();
    if (!data) return fallback;

    const completion = data.completion ?? {};
    const english = data.english ?? {};

    const activities: Record<string, boolean> = {};
    let completed = 0;
    for (const key of TRACKED_KEYS) {
      const val = completion[key];
      const done = !!(val === true || val === 1 || val?.completed);
      activities[key] = done;
      if (done) completed++;
    }

    const quizCorrect = english.correct ?? null;
    const quizTotal = english.total ?? null;
    const quizScore = quizCorrect !== null && quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : null;
    const quizDetail = quizScore !== null ? `${quizCorrect}/${quizTotal}` : '';

    return {
      date: getDisplayDate(),
      completed,
      total: TRACKED_KEYS.length,
      quizScore,
      quizDetail,
      poolActive: english.pool?.active ?? 0,
      poolGraduated: english.pool?.graduated ?? 0,
      streak: 0,
      activities,
    };
  } catch {
    return fallback;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetAction, widgetInfo, renderWidget } = props;

  if (widgetAction === 'WIDGET_DELETED') return;

  console.warn('[Widget] action=' + widgetAction + ' w=' + widgetInfo.width + ' h=' + widgetInfo.height);

  const data = await fetchWidgetData();

  renderWidget(
    React.createElement(YongStudyWidget, {
      data,
      width: widgetInfo.width,
      height: widgetInfo.height,
    })
  );
}
