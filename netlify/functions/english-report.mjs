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

const check = v => v ? '✅' : '❌';

function statusRow(label, done) {
  const color = done ? '#22c55e' : '#94a3b8';
  const bg = done ? '#f0fdf4' : '#f8fafc';
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;background:${bg};border-radius:8px;margin-bottom:6px;">
    <span style="font-size:14px;color:#334155;">${label}</span>
    <span style="font-size:16px;color:${color};font-weight:700;">${check(done)}</span>
  </div>`;
}

function sectionBlock(title, rows) {
  return `<div style="padding:0 28px 20px;">
    <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">${title}</h2>
    ${rows}
  </div>`;
}

function buildHtml({ today, words, summary }) {
  const c = summary?.completion ?? {};
  const eng = summary?.english ?? null;

  // 영어 퀴즈 점수
  const correct = eng?.correct ?? 0;
  const total = eng?.total ?? 0;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const scoreColor = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const gradeLabel = pct === 100 ? '완벽 🏆' : pct >= 80 ? '우수 👍' : pct >= 60 ? '보통 📈' : '분발 💪';

  // 오늘 전체 완료 항목 수
  const allKeys = [
    'english','english_crossword','english_review','english_scramble',
    'english_sentence','english_word_match','english_news_reading','english_news_listening',
    'reading','sajaseongeo','sangshik','korean_ox',
    'investment',
    'toefl_reading','toefl_listening','toefl_writing','toefl_speaking',
  ];
  const doneCount = allKeys.filter(k => c[k]).length;
  const totalTasks = allKeys.length;

  // 틀린 단어
  const wrongItems = (eng?.quizDetails ?? [])
    .filter(q => !q.correct_answer)
    .map(q => {
      const w = words?.find(w => w.word === q.word);
      return { word: q.word || '?', meaning: w?.meaning_ko || '', selected: q.selectedOption || '' };
    });

  const wrongRows = wrongItems.length > 0
    ? wrongItems.map(w => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #fff1f2;font-weight:600;color:#dc2626;">❌ ${w.word}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fff1f2;color:#475569;">${w.meaning}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fff1f2;color:#94a3b8;font-size:12px;">선택: ${w.selected}</td>
    </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#22c55e;font-weight:600;">모두 정답! 🎉</td></tr>`;

  const wordRows = (words || []).map(w => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e293b;">${w.emoji || '📖'} ${w.word}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;">${w.part_of_speech || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#334155;">${w.meaning_ko || ''}</td>
    </tr>`).join('');

  // 복습풀
  const pool = eng?.pool ?? { active: 0, graduated: 0 };

  const koreanOxScore = typeof c['korean_ox'] === 'number' ? `${c['korean_ox']}점` : null;

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px 0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.10);">

  <!-- 헤더 -->
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 28px 28px;">
    <p style="margin:0 0 6px;color:rgba(255,255,255,.7);font-size:13px;">📅 ${today} · 매일 22:00 KST</p>
    <h1 style="margin:0 0 8px;color:#fff;font-size:26px;font-weight:800;">YongStudy 일간 리포트</h1>
    <div style="background:rgba(255,255,255,.15);border-radius:12px;padding:12px 16px;display:inline-block;">
      <span style="color:#fff;font-size:20px;font-weight:800;">${doneCount} / ${totalTasks}</span>
      <span style="color:rgba(255,255,255,.8);font-size:13px;margin-left:6px;">항목 완료</span>
    </div>
  </div>

  <!-- 영어 퀴즈 점수 -->
  ${eng ? `
  <div style="padding:24px 28px 0;">
    <h2 style="margin:0 0 14px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">🎯 영어 퀴즈</h2>
    <div style="display:flex;align-items:center;gap:20px;background:#f8fafc;border-radius:14px;padding:16px 20px;">
      <div style="text-align:center;min-width:72px;">
        <div style="font-size:44px;font-weight:900;color:${scoreColor};line-height:1;">${pct}%</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:3px;">${gradeLabel}</div>
      </div>
      <div style="flex:1;">
        <div style="background:#e2e8f0;border-radius:99px;height:10px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${scoreColor};border-radius:99px;"></div>
        </div>
        <p style="margin:7px 0 0;font-size:13px;color:#64748b;">${correct}개 정답 / 전체 ${total}개</p>
      </div>
    </div>
  </div>` : ''}

  <!-- 틀린 단어 -->
  ${eng && wrongItems.length > 0 ? `
  <div style="padding:16px 28px 0;">
    <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">❌ 틀린 단어</h2>
    <div style="background:#fff5f5;border-radius:12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">${wrongRows}</table>
    </div>
  </div>` : ''}

  <!-- 영어 활동 -->
  ${sectionBlock('📚 영어 학습', [
    statusRow('오늘 단어 퀴즈', !!c['english']),
    statusRow('복습 리뷰', !!c['english_review']),
    statusRow('크로스워드 게임', !!c['english_crossword']),
    statusRow('스크램블 게임', !!c['english_scramble']),
    statusRow('문장 퀴즈', !!c['english_sentence']),
    statusRow('단어 매칭 게임', !!c['english_word_match']),
    statusRow('BBC 뉴스 읽기', !!c['english_news_reading']),
    statusRow('BBC 뉴스 듣기', !!c['english_news_listening']),
  ].join(''))}

  <!-- 한국어 -->
  ${sectionBlock('🇰🇷 한국어', [
    statusRow('독해', !!c['reading']),
    statusRow('사자성어', !!c['sajaseongeo']),
    statusRow('상식', !!c['sangshik']),
    koreanOxScore
      ? statusRow(`OX 퀴즈 (${koreanOxScore})`, true)
      : statusRow('OX 퀴즈', false),
  ].join(''))}

  <!-- 투자/부동산 -->
  ${sectionBlock('📈 투자 · 부동산', statusRow('투자 칼럼', !!c['investment']))}

  <!-- TOEFL -->
  ${sectionBlock('🎓 TOEFL', [
    statusRow('Reading', !!c['toefl_reading']),
    statusRow('Listening', !!c['toefl_listening']),
    statusRow('Writing', !!c['toefl_writing']),
    statusRow('Speaking', !!c['toefl_speaking']),
  ].join(''))}

  <!-- 복습풀 -->
  <div style="padding:0 28px 24px;">
    <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📦 복습풀</h2>
    <div style="display:flex;gap:10px;">
      <div style="flex:1;background:#eff6ff;border-radius:14px;padding:16px 10px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#3b82f6;">${pool.active}</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px;">복습 중</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border-radius:14px;padding:16px 10px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#22c55e;">${pool.graduated}</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px;">졸업</div>
      </div>
      <div style="flex:1;background:#f8fafc;border-radius:14px;padding:16px 10px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#94a3b8;">${pool.active + pool.graduated}</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px;">누적 합계</div>
      </div>
    </div>
  </div>

  <!-- 오늘 단어 -->
  ${words?.length ? `
  <div style="padding:0 28px 28px;">
    <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">📖 오늘 배운 단어</h2>
    <div style="border-radius:12px;overflow:hidden;border:1px solid #f1f5f9;">
      <table style="width:100%;border-collapse:collapse;">${wordRows}</table>
    </div>
  </div>` : ''}

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
      fbGet(`dailySummary/${today}`),
    ]);

    const words = todayData?.words || [];
    const eng = summary?.english;
    const correct = eng?.correct ?? 0;
    const total = eng?.total ?? 0;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const c = summary?.completion ?? {};
    const doneCount = Object.keys(c).filter(k => c[k]).length;

    const html = buildHtml({ today, words, summary });

    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    await transport.sendMail({
      from: `"YongStudy 리포트" <${GMAIL_USER}>`,
      to: REPORT_TO,
      subject: `📚 [${today}] YongStudy 리포트 — ${doneCount}개 완료 · 퀴즈 ${correct}/${total} (${pct}%)`,
      html,
    });

    console.log(`✅ 리포트 발송 완료: ${today} done=${doneCount} quiz=${correct}/${total}`);
    return new Response(
      JSON.stringify({ success: true, date: today, done: doneCount, score: `${correct}/${total}` }),
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
