import nodemailer from 'nodemailer';

export const config = {
  schedule: '0 0 1 * *', // 매월 1일 00:00 UTC = 09:00 KST
};

const DB_URL = process.env.FIREBASE_DATABASE_URL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_TO = process.env.REPORT_TO_EMAIL || 'dctm1011@naver.com';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function getKSTNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

// 지정 월의 모든 날짜 반환 (YYYY-MM-DD 배열)
function getDatesOfMonth(year, month) {
  const days = new Date(year, month, 0).getDate(); // month는 1-based
  return Array.from({ length: days }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });
}

async function fbGet(path) {
  const res = await fetch(`${DB_URL}/${path}.json`);
  if (!res.ok) return null;
  return res.json();
}

async function callHaiku(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

function section(title, content) {
  return `<div style="padding:0 28px 22px;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">${title}</h2>
    <div style="background:#f8fafc;border-radius:14px;padding:18px 20px;font-size:14px;line-height:1.8;color:#334155;">${content}</div>
  </div>`;
}

function statBox(label, value, sub, color) {
  return `<div style="flex:1;background:#f8fafc;border-radius:14px;padding:16px 8px;text-align:center;border-top:3px solid ${color};">
    <div style="font-size:24px;font-weight:800;color:${color};line-height:1.1;">${value}</div>
    ${sub ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${sub}</div>` : ''}
    <div style="font-size:11px;color:#64748b;margin-top:3px;">${label}</div>
  </div>`;
}

function trendBar(label, values, color) {
  const max = Math.max(...values, 1);
  const bars = values.map((v, i) => {
    const h = Math.round((v / max) * 40);
    const isLast = i === values.length - 1;
    return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;">
      <div style="width:100%;height:${h}px;background:${isLast ? color : color + '55'};border-radius:3px 3px 0 0;min-height:2px;"></div>
    </div>`;
  }).join('');
  return `<div style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:13px;color:#475569;">${label}</span>
      <span style="font-size:12px;color:#94a3b8;">${values[values.length-1]}${typeof values[0]==='number'&&values[0]<=100?'%':''} (오늘)</span>
    </div>
    <div style="display:flex;align-items:flex-end;gap:2px;height:44px;background:#f1f5f9;border-radius:8px;padding:4px 6px;">
      ${bars}
    </div>
  </div>`;
}

export async function generateMonthlyReport(year, month) {
  const dates = getDatesOfMonth(year, month);
  const monthLabel = `${year}년 ${month}월`;

  console.log(`[monthly-report] ${monthLabel} 데이터 수집 (${dates.length}일)`);

  const [summaries, wordSets] = await Promise.all([
    Promise.all(dates.map(d => fbGet(`dailySummary/${d}`))),
    Promise.all(dates.map(d => fbGet(`english/words/${d}`))),
  ]);

  const history = dates.map((date, i) => ({
    date,
    day: i + 1,
    summary: summaries[i],
    words: wordSets[i]?.words ?? [],
  }));

  const activeDays = history.filter(d => d.summary).length;
  const totalDays = dates.length;

  // 퀴즈 점수 추이 (주간 평균)
  const quizByWeek = [[], [], [], [], []];
  history.forEach(d => {
    if (d.summary?.english?.total > 0) {
      const weekIdx = Math.min(Math.floor((d.day - 1) / 7), 4);
      const pct = Math.round((d.summary.english.correct / d.summary.english.total) * 100);
      quizByWeek[weekIdx].push(pct);
    }
  });
  const weeklyAvg = quizByWeek.map(w => w.length > 0 ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : 0);

  const quizDays = history.filter(d => d.summary?.english?.total > 0);
  const avgScore = quizDays.length > 0
    ? Math.round(quizDays.reduce((s, d) => s + (d.summary.english.correct / d.summary.english.total) * 100, 0) / quizDays.length)
    : 0;

  // 누적 단어
  const monthWords = new Set(history.flatMap(d => d.words.map(w => w.word)));
  const totalWords = monthWords.size;

  // 복습풀 현황 (마지막 기록 기준)
  const lastWithPool = [...history].reverse().find(d => d.summary?.english?.pool);
  const pool = lastWithPool?.summary?.english?.pool ?? { active: 0, graduated: 0 };

  // 자주 틀린 단어
  const wrongCounts = {};
  history.forEach(d => {
    (d.summary?.english?.quizDetails ?? []).filter(q => !q.correct_answer)
      .forEach(q => { wrongCounts[q.word] = (wrongCounts[q.word] ?? 0) + 1; });
  });
  const topWrong = Object.entries(wrongCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);

  // 활동별 완료율
  const activityKeys = {
    'english': '영어 퀴즈', 'english_review': '복습 리뷰',
    'english_crossword': '크로스워드', 'english_scramble': '스크램블',
    'reading': '한국어 독해', 'sajaseongeo': '사자성어',
    'sangshik': '상식', 'investment': '투자 칼럼',
    'toefl_reading': 'TOEFL', 'english_news_reading': 'BBC 뉴스',
  };
  const activityStats = Object.entries(activityKeys).map(([key, label]) => {
    const done = history.filter(d => d.summary?.completion?.[key]).length;
    const rate = activeDays > 0 ? Math.round((done / activeDays) * 100) : 0;
    return { key, label, done, rate };
  }).sort((a, b) => b.rate - a.rate);

  // 연속 학습 최대 streak
  let maxStreak = 0, curStreak = 0;
  history.forEach(d => {
    if (d.summary) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else curStreak = 0;
  });

  // 일별 활동 수 (히트맵용 데이터)
  const dailyActivity = history.map(d => ({
    date: d.date, day: d.day,
    count: Object.keys(d.summary?.completion ?? {}).filter(k => d.summary.completion[k]).length,
  }));

  // Haiku 분석
  const dataForAI = {
    period: monthLabel,
    totalDays, activeDays,
    attendanceRate: `${Math.round((activeDays / totalDays) * 100)}%`,
    avgQuizScore: `${avgScore}%`,
    weeklyScoreTrend: weeklyAvg.filter(v => v > 0).map((v, i) => `${i+1}주차 ${v}%`).join(', ') || '데이터 없음',
    totalNewWords: totalWords,
    reviewPool: `복습중 ${pool.active}개, 졸업 ${pool.graduated}개`,
    maxStreak: `${maxStreak}일`,
    topWrongWords: topWrong.slice(0, 5).map(([w, n]) => `${w}(${n}회)`).join(', ') || '없음',
    bestActivities: activityStats.slice(0, 3).map(a => `${a.label} ${a.rate}%`).join(', '),
    worstActivities: activityStats.slice(-3).map(a => `${a.label} ${a.rate}%`).join(', '),
    appCoverage: {
      영어_수용적: 'BBC뉴스, TOEFL 리딩/리스닝, 어휘퀴즈, 크로스워드, 스크램블',
      영어_생산적: '스피킹 미지원 (앱에 없음), 라이팅은 TOEFL만',
      한국어: '독해, 사자성어, 상식, OX퀴즈',
      투자부동산: '칼럼 읽기',
    },
  };

  const aiPrompt = `당신은 학습 데이터 분석 전문가입니다. 아래는 YongStudy 앱 사용자의 ${monthLabel} 학습 데이터입니다.

${JSON.stringify(dataForAI, null, 2)}

다음 6가지를 한국어로 작성해주세요. HTML 없이 순수 텍스트, 각 섹션은 "---"로 구분:

1. 🗓️ 월간 총평 (3-4문장): 이달 학습의 전반적 특징과 성과 수준 평가
2. 🏆 이달의 성취 (2-3문장): 데이터에서 보이는 구체적 성과
3. 📉 이달의 약점 (2-3문장): 개선이 필요한 부분과 원인 분석
4. 🔧 영역별 보강 포인트 (각 영역 1-2문장씩):
   - 영어 어휘/독해:
   - 영어 스피킹/라이팅: (앱 미지원 영역이므로 AI 대화 연습 등 외부 방법 반드시 제안)
   - 한국어:
   - 투자/부동산:
   - TOEFL:
5. 🔁 반복 실수 패턴 (2문장): 자주 틀리는 단어 패턴 특징
6. 📅 다음 달 목표 (번호 매긴 3가지): 측정 가능한 목표

솔직하고 구체적으로, 데이터 근거 기반으로 작성해주세요.`;

  const aiText = await callHaiku(aiPrompt);
  const parts = aiText.split('---').map(s => s.trim());
  const [overview, achievement, weakness, reinforce, pattern, nextGoal] = parts;

  // HTML 생성
  const activityBars = activityStats.map(a => {
    const color = a.rate >= 70 ? '#22c55e' : a.rate >= 40 ? '#f59e0b' : '#ef4444';
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:13px;color:#475569;">${a.label}</span>
        <span style="font-size:12px;font-weight:600;color:${color};">${a.done}일 / ${a.rate}%</span>
      </div>
      <div style="background:#e2e8f0;border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${a.rate}%;height:100%;background:${color};border-radius:99px;"></div>
      </div>
    </div>`;
  }).join('');

  const wrongTags = topWrong.map(([w, n]) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#fff5f5;border-radius:8px;margin-bottom:6px;">
      <span style="font-weight:600;color:#dc2626;">${w}</span>
      <span style="background:#fecaca;color:#dc2626;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700;">${n}회 오답</span>
    </div>`
  ).join('') || '<div style="color:#94a3b8;font-size:13px;padding:8px;">데이터 누적 중...</div>';

  // 히트맵 (달력형)
  const heatmapCells = dailyActivity.map(d => {
    const intensity = d.count === 0 ? '#f1f5f9' : d.count < 3 ? '#bfdbfe' : d.count < 6 ? '#60a5fa' : '#2563eb';
    return `<div title="${d.date}: ${d.count}개 완료" style="width:20px;height:20px;background:${intensity};border-radius:4px;display:inline-block;margin:1px;"></div>`;
  }).join('');

  return {
    monthLabel, totalDays, activeDays, avgScore, totalWords, pool, maxStreak,
    overview, achievement, weakness, reinforce, pattern, nextGoal,
    activityBars, wrongTags, heatmapCells, weeklyAvg,
  };
}

export default async () => {
  try {
    const now = getKSTNow();
    // 1일에 실행되므로 전달 리포트 생성
    const targetMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const r = await generateMonthlyReport(targetYear, targetMonth);

    const html = buildHtml(r, `${targetYear}-${String(targetMonth).padStart(2, '0')}`);

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    await transport.sendMail({
      from: `"YongStudy 리포트" <${GMAIL_USER}>`,
      to: REPORT_TO,
      subject: `📅 [${r.monthLabel}] YongStudy 월간 리포트 — ${r.activeDays}일 활동 · 평균 ${r.avgScore}%`,
      html,
    });

    console.log(`✅ 월간 리포트 발송: ${r.monthLabel}`);
    return new Response(JSON.stringify({ success: true, month: r.monthLabel }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ 월간 리포트 실패:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

function buildHtml(r, yearMonth) {
  const scoreColor = r.avgScore >= 80 ? '#22c55e' : r.avgScore >= 60 ? '#f59e0b' : '#ef4444';
  const attendRate = Math.round((r.activeDays / r.totalDays) * 100);

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px 0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.10);">

  <!-- 헤더 -->
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:36px 28px 28px;">
    <p style="margin:0 0 6px;color:rgba(255,255,255,.6);font-size:13px;">📅 ${r.monthLabel} · 월간 리포트</p>
    <h1 style="margin:0 0 4px;color:#fff;font-size:28px;font-weight:800;">YongStudy 월간 분석</h1>
    <p style="margin:0;color:rgba(255,255,255,.7);font-size:13px;">Claude Haiku 학습 코치 제공</p>
  </div>

  <!-- 핵심 지표 -->
  <div style="padding:24px 28px 0;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📊 이달 핵심 지표</h2>
    <div style="display:flex;gap:8px;">
      ${statBox('출석률', `${attendRate}%`, `${r.activeDays}/${r.totalDays}일`, '#6366f1')}
      ${statBox('평균 퀴즈', `${r.avgScore}%`, '', scoreColor)}
      ${statBox('새 단어', `${r.totalWords}개`, '', '#3b82f6')}
      ${statBox('최대 스트릭', `${r.maxStreak}일`, '', '#f59e0b')}
      ${statBox('졸업 단어', `${r.pool.graduated}개`, `복습중 ${r.pool.active}개`, '#22c55e')}
    </div>
  </div>

  <!-- 활동 히트맵 -->
  <div style="padding:20px 28px 0;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📆 이달 학습 달력</h2>
    <div style="background:#f8fafc;border-radius:14px;padding:16px 14px;">
      ${r.heatmapCells}
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center;font-size:11px;color:#94a3b8;">
        <div style="width:14px;height:14px;background:#f1f5f9;border-radius:3px;"></div> 미활동
        <div style="width:14px;height:14px;background:#bfdbfe;border-radius:3px;"></div> 1-2개
        <div style="width:14px;height:14px;background:#60a5fa;border-radius:3px;"></div> 3-5개
        <div style="width:14px;height:14px;background:#2563eb;border-radius:3px;"></div> 6개+
      </div>
    </div>
  </div>

  <!-- AI 분석 -->
  ${section('🗓️ 월간 총평', (r.overview || '데이터 누적 중...').replace(/\n/g, '<br>'))}
  ${section('🏆 이달의 성취', (r.achievement || '-').replace(/\n/g, '<br>'))}
  ${section('📉 이달의 약점', (r.weakness || '-').replace(/\n/g, '<br>'))}
  ${section('🔧 영역별 보강 포인트', (r.reinforce || '-').replace(/\n/g, '<br>'))}
  ${section('🔁 반복 실수 패턴', (r.pattern || '-').replace(/\n/g, '<br>'))}
  ${section('📅 다음 달 목표', (r.nextGoal || '-').replace(/\n/g, '<br>'))}

  <!-- 활동별 완료율 -->
  <div style="padding:0 28px 22px;">
    <h2 style="margin:0 0 14px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📈 활동별 완료율</h2>
    ${r.activityBars}
  </div>

  <!-- 자주 틀린 단어 -->
  <div style="padding:0 28px 28px;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">❌ 이달 자주 틀린 단어 TOP 7</h2>
    ${r.wrongTags}
  </div>

  <!-- 푸터 -->
  <div style="background:#0f172a;padding:20px 28px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;color:rgba(255,255,255,.8);font-weight:600;">다음 달도 꾸준히! 💪</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,.4);">YongStudy · 월간 AI 리포트 · 매월 1일 09:00 KST</p>
  </div>

</div>
</body>
</html>`;
}
