import nodemailer from 'nodemailer';

export const config = {
  schedule: '0 13 * * *', // UTC 13:00 = KST 22:00
};

const DB_URL = process.env.FIREBASE_DATABASE_URL;
const DB_SECRET = process.env.FIREBASE_DB_SECRET;
const USER_UID = process.env.FIREBASE_USER_UID;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_TO = process.env.REPORT_TO_EMAIL || 'dctm1011@naver.com';

function getKSTDateString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

async function fbGet(path) {
  const auth = DB_SECRET ? `?auth=${DB_SECRET}` : '';
  const res = await fetch(`${DB_URL}/${path}.json${auth}`);
  if (!res.ok) return null;
  return res.json();
}

function buildHtml({ today, words, quizStatus, reviewPool, completion }) {
  // 퀴즈 결과 집계
  const quizList = quizStatus ? Object.values(quizStatus) : [];
  const total = quizList.length;
  const correct = quizList.filter(q => q.correct_answer === true).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const wrongQuizzes = quizList.filter(q => q.correct_answer === false);

  // 오늘 틀린 단어 (선택한 답 + 단어 이름)
  const wrongItems = wrongQuizzes.map(q => {
    const word = words?.find(w => w.word === q.word || w.word === q.wordId);
    return {
      word: q.word || q.wordId || '?',
      meaning: word?.meaning_ko || '',
      selected: q.selectedOption || '',
    };
  });

  // 복습풀 통계
  const poolEntries = reviewPool ? Object.values(reviewPool) : [];
  const active = poolEntries.filter(e => (e.count ?? 0) < 10).length;
  const graduated = poolEntries.filter(e => (e.count ?? 0) >= 10).length;

  const isDone = completion?.done === true;
  const scoreColor = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const gradeLabel = pct === 100 ? '완벽' : pct >= 80 ? '우수' : pct >= 60 ? '보통' : '분발';

  // 오늘 배운 단어 목록
  const wordRows = (words || []).map(w => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e293b;">${w.emoji || '📖'} ${w.word}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${w.part_of_speech || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#334155;">${w.meaning_ko || ''}</td>
    </tr>`).join('');

  // 틀린 단어 목록
  const wrongRows = wrongItems.length > 0
    ? wrongItems.map(w => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #fef2f2;font-weight:600;color:#dc2626;">❌ ${w.word}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fef2f2;color:#475569;">${w.meaning}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fef2f2;color:#94a3b8;font-size:12px;">선택: ${w.selected}</td>
    </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#22c55e;">모두 정답! 🎉</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YongStudy 학습 리포트 ${today}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

  <!-- 헤더 -->
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 28px 24px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.75);font-size:13px;">📅 ${today}</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">YongStudy 일간 리포트</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px;">
      ${isDone ? '✅ 오늘 학습 완료' : '⏳ 학습 미완료'}
    </p>
  </div>

  <!-- 퀴즈 점수 -->
  <div style="padding:24px 28px 20px;">
    <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">🎯 오늘 퀴즈 결과</h2>
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
      <div style="text-align:center;">
        <div style="font-size:48px;font-weight:800;color:${scoreColor};line-height:1;">${pct}%</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:2px;">${gradeLabel}</div>
      </div>
      <div style="flex:1;">
        <div style="background:#f1f5f9;border-radius:99px;height:10px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${scoreColor};border-radius:99px;"></div>
        </div>
        <p style="margin:8px 0 0;font-size:14px;color:#475569;">${correct} / ${total} 정답</p>
      </div>
    </div>
  </div>

  <!-- 틀린 단어 -->
  <div style="padding:0 28px 20px;">
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">❌ 틀린 단어</h2>
    <table style="width:100%;border-collapse:collapse;background:#fff5f5;border-radius:8px;overflow:hidden;">
      ${wrongRows}
    </table>
  </div>

  <!-- 오늘 배운 단어 -->
  <div style="padding:0 28px 20px;">
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">📚 오늘 배운 단어</h2>
    <table style="width:100%;border-collapse:collapse;">
      ${wordRows}
    </table>
  </div>

  <!-- 복습풀 현황 -->
  <div style="padding:0 28px 28px;">
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">📦 복습풀 현황</h2>
    <div style="display:flex;gap:12px;">
      <div style="flex:1;background:#eff6ff;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#3b82f6;">${active}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">복습 중</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#22c55e;">${graduated}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">졸업</div>
      </div>
      <div style="flex:1;background:#fafafa;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#94a3b8;">${active + graduated}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">누적 총계</div>
      </div>
    </div>
  </div>

  <!-- 푸터 -->
  <div style="background:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">YongStudy · 자동 발송 · 매일 22:00 KST</p>
  </div>

</div>
</body>
</html>`;
}

export default async () => {
  try {
    const today = getKSTDateString();

    const [todayData, quizStatus, reviewPool, completion] = await Promise.all([
      fbGet(`english/words/${today}`),
      fbGet(`users/${USER_UID}/english/quizStatus/${today}`),
      fbGet(`users/${USER_UID}/english/reviewPool`),
      fbGet(`users/${USER_UID}/completion/english/${today}`),
    ]);

    const words = todayData?.words || [];

    const html = buildHtml({ today, words, quizStatus, reviewPool, completion });

    const quizList = quizStatus ? Object.values(quizStatus) : [];
    const total = quizList.length;
    const correct = quizList.filter(q => q.correct_answer === true).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    await transport.sendMail({
      from: `"YongStudy 리포트" <${GMAIL_USER}>`,
      to: REPORT_TO,
      subject: `📚 [${today}] YongStudy 학습 리포트 — ${correct}/${total} (${pct}%)`,
      html,
    });

    console.log(`✅ 리포트 발송 완료: ${today} ${correct}/${total}`);
    return new Response(
      JSON.stringify({ success: true, date: today, score: `${correct}/${total}` }),
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
