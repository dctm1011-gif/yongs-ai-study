import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '0 1 * * *', // 10:00 KST
};

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DB_URL = 'https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

let _app = null;
function getFirebaseApp() {
  if (!_app) {
    const existing = getApps();
    _app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return _app;
}

function getKSTDateString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

function stripHtml(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'").replace(/&rsquo;/g, "'").replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

async function fetchUrl(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', ...extraHeaders },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 60)}`);
  return res.text();
}

function splitSentences(text, maxCount = 25) {
  const flat = text.replace(/\n/g, ' ');
  const sents = flat.split(/(?<=[.!?])\s+(?=[A-Z"'])/).map(s => s.trim()).filter(s => s.length > 20);
  return sents.slice(0, maxCount);
}

async function translateBatch(sentences) {
  if (!ANTHROPIC_API_KEY || sentences.length === 0) return sentences.map(() => ({ ko: '', analysis: '' }));

  const prompt =
    'You are a cheerful 20-year-old Korean woman explaining English sentences to your boyfriend in Korean. ' +
    'Use emojis naturally, be warm and casual (친구한테 말하듯이), and make it fun to read. ' +
    'Write the analysis as one flowing paragraph — no rigid bullet points, just talk naturally.\n\n' +
    'For each English sentence below, return a JSON array where each element has:\n' +
    '- "ko": natural Korean translation\n' +
    '- "analysis": a friendly Korean explanation that naturally covers: 문장 구조나 핵심 표현, 핵심 단어의 동의어, ' +
    '동사+전치사 조합이나 숙어 용법, 일상 구어체 표현 (작은따옴표로 감싸서), 기억에 남을 팁\n\n' +
    'Return ONLY valid JSON array, no other text.\n\n' +
    JSON.stringify(sentences);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const text = data.content[0].text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return sentences.map(() => ({ ko: '', analysis: '' }));

  try {
    const result = JSON.parse(match[0]);
    if (!Array.isArray(result) || result.length !== sentences.length) return sentences.map(() => ({ ko: '', analysis: '' }));
    return result.map(r => ({ ko: String(r.ko || ''), analysis: String(r.analysis || '') }));
  } catch {
    return sentences.map(() => ({ ko: '', analysis: '' }));
  }
}

async function translateAll(sentences) {
  const BATCH = 8;
  const results = [];
  for (let i = 0; i < sentences.length; i += BATCH) {
    const batch = sentences.slice(i, i + BATCH);
    try {
      results.push(...await translateBatch(batch));
    } catch (e) {
      console.warn(`[translate] 배치 ${Math.floor(i / BATCH) + 1} 실패:`, e.message);
      results.push(...batch.map(() => ({ ko: '', analysis: '' })));
    }
  }
  return results;
}

// ── KBS World ──────────────────────────────────────────────────────────────

async function scrapeKbsArticle(url) {
  const html = await fetchUrl(url, { 'X-PJAX': 'true', 'X-Requested-With': 'XMLHttpRequest' });
  const m = html.match(/<p[^>]*class="cap[^"]*"[^>]*>[\s\S]*?<\/p>\s*([\s\S]*?)\s*<div/);
  if (!m) return '';

  const body = m[1];
  const paras = body.split(/<br\s*\/?>\s*<br\s*\/?>/i).map(p => {
    let t = p.replace(/<[^>]+>/g, '');
    t = t.replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }).filter(t => t.length > 30);

  return paras.join('\n');
}

async function fetchKbsNews(today) {
  console.log('[KBS World Korea News]');
  const rssText = await fetchUrl('https://world.kbs.co.kr/rss/rss_news.htm?lang=e');

  const items = [...rssText.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  for (const [, item] of items) {
    const titleM = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkM = item.match(/<link>\s*(https?[^\s<]+)\s*<\/link>/);
    const catM = item.match(/<description>(?:<!\[CDATA\[)?\[([^\]]+)\]/);

    if (!titleM || !linkM) continue;
    const title = stripHtml(titleM[1]);
    const url = linkM[1].trim();
    const category = catM ? catM[1] : '';
    if (!title || !url) continue;

    try {
      const body = await scrapeKbsArticle(url);
      if (!body) { console.warn('  KBS 본문 없음'); continue; }

      const sentsEn = splitSentences(body);
      const analyzed = await translateAll(sentsEn);
      const sentences = sentsEn.map((en, i) => ({ en, ...analyzed[i] }));

      const db = getDatabase(getFirebaseApp());
      await set(ref(db, `english/korea_news/${today}`), [{ title, category, url, sentences }]);
      console.log(`  ✓ ${today} — ${title.slice(0, 50)} (${sentsEn.length}문장)`);
      return;
    } catch (e) {
      console.warn('  KBS 처리 실패:', e.message);
    }
  }
  console.warn('  KBS 기사 없음');
}

// ── Korea Herald ───────────────────────────────────────────────────────────

async function scrapeHeraldArticle(url) {
  const html = await fetchUrl(url);
  const m = html.match(/id="articleText"[^>]*>([\s\S]*?)<\/article>/);
  if (!m) return '';

  const paras = [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(([, p]) => stripHtml(p))
    .filter(t => t.length > 40);
  return paras.join('\n');
}

async function fetchKoreaHerald(today) {
  console.log('[Korea Herald]');
  const rssText = await fetchUrl('https://www.koreaherald.com/rss/newsAll');

  const items = [...rssText.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  for (const [, item] of items) {
    const titleM = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkM = item.match(/<link>\s*(https?[^\s<]+)\s*<\/link>/);
    const catM = item.match(/<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/);

    if (!titleM || !linkM) continue;
    const title = stripHtml(titleM[1]);
    const url = linkM[1].trim();
    const category = catM ? stripHtml(catM[1]) : '';
    if (!title || !url) continue;

    try {
      const body = await scrapeHeraldArticle(url);
      if (!body) { console.warn('  Herald 본문 없음'); continue; }

      const sentsEn = splitSentences(body);
      const analyzed = await translateAll(sentsEn);
      const sentences = sentsEn.map((en, i) => ({ en, ...analyzed[i] }));

      const db = getDatabase(getFirebaseApp());
      await set(ref(db, `english/korea_herald/${today}`), [{ title, category, url, sentences }]);
      console.log(`  ✓ ${today} — ${title.slice(0, 50)} (${sentsEn.length}문장)`);
      return;
    } catch (e) {
      console.warn('  Herald 처리 실패:', e.message);
    }
  }
  console.warn('  Herald 기사 없음');
}

// ── Push 알림 ──────────────────────────────────────────────────────────────

async function sendPushNotifications(title, body) {
  const res = await fetch(`${DB_URL}/pushTokens.json`);
  if (!res.ok) { console.warn('  pushTokens 조회 실패:', res.status); return; }

  const data = await res.json();
  if (!data || typeof data !== 'object') { console.warn('  pushToken 없음'); return; }

  const tokens = Object.values(data).filter(v => typeof v === 'string' && v.startsWith('ExponentPushToken'));
  if (tokens.length === 0) { console.warn('  유효한 Expo 토큰 없음'); return; }

  const messages = tokens.map(to => ({ to, title, body, sound: 'default' }));
  const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!pushRes.ok) { console.warn('  알림 발송 실패:', pushRes.status); return; }
  const result = await pushRes.json();
  const ok = (result.data || []).filter(d => d.status === 'ok').length;
  console.log(`  ✓ 알림 발송: ${ok}/${tokens.length}명 성공`);
}

// ── Main ───────────────────────────────────────────────────────────────────

export default async (req, context) => {
  const today = getKSTDateString();
  console.log(`[podcast-daily] ${new Date().toISOString()} — ${today}`);

  try {
    await fetchKbsNews(today);
  } catch (e) {
    console.error('[KBS] 실패:', e.message);
  }

  try {
    await fetchKoreaHerald(today);
  } catch (e) {
    console.error('[Herald] 실패:', e.message);
  }

  try {
    await sendPushNotifications(
      '📰 오늘의 영어 뉴스 도착!',
      'KBS뉴스 · Korea Herald 리딩이 업데이트됐어요 → English 탭에서 확인!'
    );
  } catch (e) {
    console.error('[push] 실패:', e.message);
  }

  return new Response(JSON.stringify({ success: true, date: today }), { status: 200 });
};
