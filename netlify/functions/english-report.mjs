import nodemailer from 'nodemailer';

export const config = {
  schedule: '0 13 * * *', // UTC 13:00 = KST 22:00
};

const DB_URL = process.env.FIREBASE_DATABASE_URL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REPORT_TO = process.env.REPORT_TO_EMAIL || 'dctm1011@naver.com';

function getKSTDateString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

async function fbGet(path) {
  const res = await fetch(`${DB_URL}/${path}.json`);
  if (!res.ok) return null;
  return res.json();
}

function buildHtml({ today, words, summary }) {
  const correct = summary?.correct ?? 0;
  const total = summary?.total ?? 0;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const quizDetails = summary?.quizDetails ?? [];
  const pool = summary?.pool ?? { active: 0, graduated: 0 };

  const wrongItems = quizDetails
    .filter(q => !q.correct_answer)
    .map(q => {
      const wordData = words?.find(w => w.word === q.word);
      return {
        word: q.word || '?',
        meaning: wordData?.meaning_ko || '',
        selected: q.selectedOption || '',
      };
    });

  const scoreColor = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const gradeLabel = pct === 100 ? '완벽 🏆' : pct >= 80 ? '우수 👍' : pct >= 60 ? '보통 📈' : '분발 💪';

  const wordRows = (words || []).map(w => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e293b;">${w.emoji || '📖'} ${w.word}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;">${w.part_of_speech || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#334155;">${w.meaning_ko || ''}</td>
    </tr>`).join('');

  const wrongRows = wrongItems.length > 0
    ? wrongItems.map(w => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #fff1f2;font-weight:600;color:#dc2626;">❌ ${w.word}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fff1f2;color:#475569;">${w.meaning}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fff1f2;color:#94a3b8;font-size:12px;">선택: ${w.selected}</td>
    </tr>`).join('')
    : `<tr><td colspan="3" style="padding:14px;text-align:center;color:#22c55e;font-weight:600;">모두 정답! 🎉</td></tr>`;

  const hasSummary = summary !== null;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YongStudy 학습 리포트 ${today}</title>
</head>
<body style="margin:0;padding:20px 0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.10);">

  <!-- 헤더 -->
  <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:32px 28px 28px;">
    <p style="margin:0 0 6px;color:rgba(255,255,255,.7);font-size:13px;letter-spacing:.04em;">📅 ${today} · 매일 22:00 KST</p>
    <h1 style="margin:0 0 4px;color:#fff;font-size:26px;font-weight:800;">YongStudy 일간 리포트</h1>
    <p style="margin:0;color:rgba(255,255,255,.8);font-size:14px;">
      ${hasSummary ? '✅ 오늘 학습을 완료했습니다' : '⏳ 오늘 학습을 아직 완료하지 않았습니다'}
    </p>
  </div>

  ${hasSummary ? `
  <!-- 퀴즈 점수 -->
  <div style="padding:28px 28px 0;">
    <h2 style="margin:0 0 16px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">🎯 오늘 퀴즈 결과</h2>
    <div style="display:flex;align-items:center;gap:24px;">
      <div style="text-align:center;min-width:80px;">
        <div style="font-size:52px;font-weight:900;color:${scoreColor};line-height:1;">${pct}%</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">${gradeLabel}</div>
      </div>
      <div style="flex:1;">
        <div style="background:#f1f5f9;border-radius:99px;height:12px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${scoreColor};border-radius:99px;transition:width .3s;"></div>
        </div>
        <p style="margin:8px 0 0;font-size:14px;color:#64748b;">${correct}개 정답 / 전체 ${total}개</p>
      </div>
    </div>
  </div>

  <!-- 틀린 단어 -->
  <div style="padding:24px 28px 0;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">❌ 틀린 단어</h2>
    <div style="background:#fff5f5;border-radius:12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        ${wrongRows}
      </table>
    </div>
  </div>

  <!-- 복습풀 현황 -->
  <div style="padding:24px 28px 0;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📦 복습풀 현황</h2>
    <div style="display:flex;gap:12px;">
      <div style="flex:1;background:#eff6ff;border-radius:14px;padding:18px 12px;text-align:center;">
        <div style="font-size:32px;font-weight:800;color:#3b82f6;">${pool.active}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">복습 중</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border-radius:14px;padding:18px 12px;text-align:center;">
        <div style="font-size:32px;font-weight:800;color:#22c55e;">${pool.graduated}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">졸업</div>
      </div>
      <div style="flex:1;background:#f8fafc;border-radius:14px;padding:18px 12px;text-align:center;">
        <div style="font-size:32px;font-weight:800;color:#94a3b8;">${pool.active + pool.graduated}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">누적 합계</div>
      </div>
    </div>
  </div>
  ` : `
  <!-- 미완료 안내 -->
  <div style="padding:28px 28px 0;">
    <div style="background:#fffbeb;border-radius:14px;padding:20px;text-align:center;">
      <p style="margin:0;font-size:15px;color:#92400e;">앱을 열어 오늘 단어를 학습해보세요! 📱</p>
    </div>
  </div>
  `}

  <!-- 오늘 배운 단어 -->
  <div style="padding:24px 28px 28px;">
    <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📚 오늘 배운 단어</h2>
    <div style="border-radius:12px;overflow:hidden;border:1px solid #f1f5f9;">
      <table style="width:100%;border-collapse:collapse;">
        ${wordRows || `<tr><td style="padding:14px;color:#94a3b8;text-align:center;">단어 데이터 없음</td></tr>`}
      </table>
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

    const [todayData, summary] = await Promise.all([
      fbGet(`english/words/${today}`),
      fbGet(`english/dailySummary/${today}`),
    ]);

    const words = todayData?.words || [];
    const correct = summary?.correct ?? 0;
    const total = summary?.total ?? 0;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const html = buildHtml({ today, words, summary });

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    const subject = summary
      ? `📚 [${today}] YongStudy 리포트 — ${correct}/${total} (${pct}%)`
      : `📚 [${today}] YongStudy 리포트 — 오늘 학습 미완료`;

    await transport.sendMail({
      from: `"YongStudy 리포트" <${GMAIL_USER}>`,
      to: REPORT_TO,
      subject,
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
