import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import React from 'react';
import { YongStudyWidget, WidgetData } from './YongStudyWidget';
import { CHECKLIST_KEYS, isDone } from '../constants/studyKeys';

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

export async function fetchWidgetData(): Promise<WidgetData> {
  const date = getKSTDateString();
  const fallback: WidgetData = {
    date: getDisplayDate(),
    completed: 0,
    total: CHECKLIST_KEYS.length,
    quizScore: null,
    quizDetail: '',
    poolActive: 0,
    poolGraduated: 0,
    streak: 0,
    activities: {},
  };

  try {
    const res = await fetch(`${DB_URL}/studySummary/${date}.json`);
    if (!res.ok) return fallback;
    const data = await res.json();
    if (!data) return fallback;

    const completion = data.completion ?? {};
    const english = data.english ?? {};

    const activities: Record<string, boolean> = {};
    let completed = 0;
    for (const key of CHECKLIST_KEYS) {
      const done = isDone(completion[key]);
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
      total: CHECKLIST_KEYS.length,
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
  const { widgetAction, renderWidget } = props;

  if (widgetAction === 'WIDGET_DELETED') return;

  const data = await fetchWidgetData();

  const element = React.createElement(YongStudyWidget, { data });
  renderWidget({ light: element, dark: element });
}
