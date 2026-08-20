export const config = {
  schedule: '0 0 15 * *', // 매월 15일 00:00 UTC = 09:00 KST
};

export default async () => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL 없음');
    return new Response('no webhook', { status: 500 });
  }

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const month = now.toISOString().slice(0, 7); // e.g. 2026-09
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    .toISOString().slice(0, 7); // e.g. 2026-07

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `📊 **부동산 단지 데이터 업데이트 알림** (${month})\n\n${twoMonthsAgo} 기준 실거래가 수집할 시간입니다.\n\`\`\`bash\ncd YongStudyApp && source .env && cd investment && python push_jukjeon_complexes.py\n\`\`\``,
    }),
  });

  return new Response('ok', { status: 200 });
};
