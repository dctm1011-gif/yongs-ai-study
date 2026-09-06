import nodemailer from 'nodemailer';

export const config = {
  schedule: '0 13 * * *', // UTC 13:00 = KST 22:00
};

const DB_URL = process.env.FIREBASE_DATABASE_URL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_TO = process.env.REPORT_TO_EMAIL || 'dctm1011@naver.com';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function getKSTDateString(offsetDays = 0) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 - offsetDays * 86400000);
  return kst.toISOString().split('T')[0];
}

async function fbGet(path) {
  const res = await fetch(`${DB_URL}/${path}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  return data;
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
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

function section(title, content) {
  return `
  <div style="padding:0 28px 22px;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">${title}</h2>
    <div style="background:#f8fafc;border-radius:14px;padding:18px 20px;font-size:14px;line-height:1.8;color:#334155;">
      ${content}
    </div>
  </div>`;
}

function statBox(label, value, color) {
  return `<div style="flex:1;background:#f8fafc;border-radius:14px;padding:16px 10px;text-align:center;border-top:3px solid ${color};">
    <div style="font-size:26px;font-weight:800;color:${color};">${value}</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${label}</div>
  </div>`;
}

export default async () => {
  try {
    const today = getKSTDateString();

    // 지난 30일 데이터 수집
    const dates = Array.from({ length: 30 }, (_, i) => getKSTDateString(i));
    const [summaries, wordSets] = await Promise.all([
      Promise.all(dates.map(d => fbGet(`studySummary/${d}`))),
      Promise.all(dates.map(d => fbGet(`english/words/${d}`))),
    ]);

    // 날짜별 데이터 정리
    const history = dates.map((date, i) => ({
      date,
      summary: summaries[i],
      words: wordSets[i]?.words ?? [],
    })).filter(d => d.summary || d.words.length > 0);

    const todayData = history[0];
    const pool = todayData?.summary?.english?.pool ?? { active: 0, graduated: 0 };

    // 통계 집계
    const activeDays = history.filter(d => d.summary).length;
    const quizDays = history.filter(d => d.summary?.english?.total > 0);
    const avgScore = quizDays.length > 0
      ? Math.round(quizDays.reduce((s, d) => s + (d.summary.english.correct / d.summary.english.total) * 100, 0) / quizDays.length)
      : 0;
    const totalWords = new Set(
      history.flatMap(d => d.words.map(w => w.word))
    ).size;

    // 자주 틀린 단어 수집
    const wrongCounts = {};
    history.forEach(d => {
      (d.summary?.english?.quizDetails ?? [])
        .filter(q => !q.correct_answer)
        .forEach(q => { wrongCounts[q.word] = (wrongCounts[q.word] ?? 0) + 1; });
    });
    const topWrong = Object.entries(wrongCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w, n]) => `${w}(${n}회)`);

    // 활동별 완료율
    const activityKeys = {
      'english': '영어 퀴즈',
      'english_review': '복습 리뷰',
      'english_crossword': '크로스워드',
      'english_scramble': '스크램블',
      'english_sentence': '문장 퀴즈',
      'english_word_match': '단어 매칭',
      'english_speaking': 'AI 스피킹',
      'english_news_reading': '뉴스 읽기',
      'english_news_listening': '뉴스 듣기',
      'reading': '한국어 독해',
      'korean_diary': '어휘 일기',
      'investment': '투자 칼럼',
      'toefl_reading': 'TOEFL 읽기',
      'toefl_listening': 'TOEFL 듣기',
      'toefl_writing': 'TOEFL 쓰기',
    };
    const activityRates = Object.entries(activityKeys).map(([key, label]) => {
      const done = history.filter(d => d.summary?.completion?.[key]).length;
      const rate = activeDays > 0 ? Math.round((done / Math.max(activeDays, 1)) * 100) : 0;
      return { key, label, done, rate };
    }).sort((a, b) => b.rate - a.rate);

    // 오늘 배운 단어
    const todayWords = todayData?.words ?? [];

    // Haiku에게 분석 요청
    const dataForAI = {
      period: `최근 30일 (${dates[dates.length - 1]} ~ ${today})`,
      activeDays,
      avgQuizScore: `${avgScore}%`,
      totalUniqueWords: totalWords,
      reviewPool: `복습중 ${pool.active}개 / 졸업 ${pool.graduated}개`,
      topWrongWords: topWrong.join(', ') || '없음',
      activityRates: activityRates.map(a => `${a.label}: ${a.rate}%`).join(', '),
      todayScore: todayData?.summary?.english
        ? `${todayData.summary.english.correct}/${todayData.summary.english.total}`
        : '미완료',
      todayCompleted: Object.keys(todayData?.summary?.completion ?? {}).filter(k => todayData.summary.completion[k]).length,
      appCoverage: {
        영어_수용적: '뉴스읽기/듣기, TOEFL 읽기/듣기, 어휘퀴즈, 크로스워드, 스크램블, 문장퀴즈, 단어매칭',
        영어_생산적: 'AI 스피킹 대화 (앱 지원), TOEFL 쓰기',
        한국어: '독해, 사자성어, 상식, OX퀴즈',
        투자부동산: '칼럼 읽기',
      },
    };

    const aiPrompt = `당신은 학습 코치입니다. 아래는 YongStudy 앱 사용자의 최근 학습 데이터입니다.

${JSON.stringify(dataForAI, null, 2)}

다음 5가지를 한국어로 작성해주세요. HTML 없이 순수 텍스트, 각 섹션은 "---"로 구분:

1. 📊 총평 (2-3문장): 전반적인 학습 성과
2. 💪 잘하고 있는 점 (2문장): 데이터 기반 강점
3. ⚠️ 개선이 필요한 점 (2문장): 약점과 이유
4. 🔧 영역별 보강 포인트 (각 영역 1문장씩):
   - 영어 어휘/독해:
   - 영어 스피킹/라이팅: (AI 스피킹 활용 현황 언급, 개선 제안)
   - 한국어:
   - 투자/부동산:
   - TOEFL:
5. 🎯 이번 주 실천 과제 (번호 매긴 3가지): 구체적 행동

솔직하고 데이터에 근거해서, 스피킹처럼 앱에 없는 영역은 외부 방법을 제안해주세요.`;

    const aiText = await callHaiku(aiPrompt);
    const [totalReview, strength, weakness, reinforce, action] = aiText.split('---').map(s => s.trim());

    // 활동 완료율 바 차트
    const activityBars = activityRates.map(a => {
      const color = a.rate >= 70 ? '#22c55e' : a.rate >= 40 ? '#f59e0b' : '#ef4444';
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13px;color:#475569;">${a.label}</span>
          <span style="font-size:13px;font-weight:600;color:${color};">${a.rate}%</span>
        </div>
        <div style="background:#e2e8f0;border-radius:99px;height:7px;overflow:hidden;">
          <div style="width:${a.rate}%;height:100%;background:${color};border-radius:99px;"></div>
        </div>
      </div>`;
    }).join('');

    // 틀린 단어 태그
    const wrongTags = topWrong.length > 0
      ? topWrong.map(w => `<span style="display:inline-block;background:#fee2e2;color:#dc2626;border-radius:99px;padding:4px 12px;font-size:13px;font-weight:600;margin:3px;">${w}</span>`).join('')
      : '<span style="color:#94a3b8;font-size:13px;">데이터 누적 중...</span>';

    // 오늘 단어 목록
    const wordRows = todayWords.map(w =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e293b;">${w.emoji || '📖'} ${w.word}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:12px;">${w.part_of_speech || ''}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#334155;font-size:13px;">${w.meaning_ko || ''}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px 0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.10);">

  <!-- 헤더 -->
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 28px 28px;">
    <p style="margin:0 0 6px;color:rgba(255,255,255,.7);font-size:13px;">📅 ${today} · 매일 22:00 KST</p>
    <h1 style="margin:0 0 4px;color:#fff;font-size:26px;font-weight:800;">YongStudy 학습 리포트</h1>
    <p style="margin:0;color:rgba(255,255,255,.75);font-size:13px;">최근 30일 분석 · Claude Haiku 제공</p>
  </div>

  <!-- 핵심 지표 -->
  <div style="padding:24px 28px 0;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📊 30일 핵심 지표</h2>
    <div style="display:flex;gap:10px;">
      ${statBox('활동일', `${activeDays}일`, '#6366f1')}
      ${statBox('평균 퀴즈', `${avgScore}%`, avgScore >= 80 ? '#22c55e' : avgScore >= 60 ? '#f59e0b' : '#ef4444')}
      ${statBox('누적 단어', `${totalWords}개`, '#3b82f6')}
      ${statBox('복습 졸업', `${pool.graduated}개`, '#22c55e')}
    </div>
  </div>

  <!-- AI 총평 -->
  ${section('📊 총평', (totalReview || '데이터 누적 중...').replace(/\n/g, '<br>'))}
  ${section('💪 잘하고 있는 점', (strength || '-').replace(/\n/g, '<br>'))}
  ${section('⚠️ 개선이 필요한 점', (weakness || '-').replace(/\n/g, '<br>'))}
  ${section('🔧 영역별 보강 포인트', (reinforce || '-').replace(/\n/g, '<br>'))}
  ${section('🎯 이번 주 실천 과제', (action || '-').replace(/\n/g, '<br>'))}

  <!-- 활동별 완료율 -->
  <div style="padding:0 28px 22px;">
    <h2 style="margin:0 0 14px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📈 활동별 완료율 (30일)</h2>
    ${activityBars}
  </div>

  <!-- 자주 틀린 단어 -->
  <div style="padding:0 28px 22px;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">❌ 자주 틀리는 단어</h2>
    <div style="background:#fff5f5;border-radius:14px;padding:14px 16px;">
      ${wrongTags}
    </div>
  </div>

  <!-- 오늘 단어 -->
  ${todayWords.length ? `
  <div style="padding:0 28px 28px;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📖 오늘 배운 단어</h2>
    <div style="border-radius:12px;overflow:hidden;border:1px solid #f1f5f9;">
      <table style="width:100%;border-collapse:collapse;">${wordRows}</table>
    </div>
  </div>` : ''}

  <!-- 푸터 -->
  <div style="background:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">YongStudy · AI 리포트 · 매일 22:00 KST</p>
  </div>

</div>
</body>
</html>`;

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    await transport.sendMail({
      from: `"YongStudy 리포트" <${GMAIL_USER}>`,
      to: REPORT_TO,
      subject: `📚 [${today}] YongStudy AI 리포트 — ${activeDays}일 활동 · 평균 ${avgScore}%`,
      html,
    });

    console.log(`✅ AI 리포트 발송: ${today} activeDays=${activeDays} avgScore=${avgScore}%`);
    return new Response(
      JSON.stringify({ success: true, date: today, activeDays, avgScore }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('❌ 리포트 발송 실패:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
