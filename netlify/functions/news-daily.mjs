import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get, set } from 'firebase/database';

export const config = {
  schedule: '30 19 * * *', // 매일 04:30 KST
};

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

let app = null;
function getFirebaseApp() {
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

function getKSTDateString() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

function stripHtml(s) {
  s = s.replace(/<[^>]+>/g, ' ');
  const entities = { '&amp;': '&', '&nbsp;': ' ', '&#39;': "'", '&apos;': "'",
    '&lt;': '<', '&gt;': '>', '&quot;': '"', '&ldquo;': '"', '&rdquo;': '"',
    '&lsquo;': "'", '&rsquo;': "'" };
  for (const [ent, ch] of Object.entries(entities)) s = s.replaceAll(ent, ch);
  return s.replace(/\s+/g, ' ').trim();
}

function splitIntoSentences(text, max = 25) {
  const sents = text.replace(/\n/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"'])/);
  return sents.filter(s => s.trim().length > 20).slice(0, max);
}

async function fetchUrl(url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function parseRssFirstItem(xml) {
  const titleM = xml.match(/<item[^>]*>[\s\S]*?<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<item[^>]*>[\s\S]*?<title[^>]*>(.*?)<\/title>/);
  const linkM = xml.match(/<item[^>]*>[\s\S]*?<link[^>]*>(.*?)<\/link>/s);
  const catM = xml.match(/<item[^>]*>[\s\S]*?<category[^>]*>(.*?)<\/category>/);
  if (!linkM) return null;
  const title = stripHtml(titleM?.[1] || titleM?.[2] || '');
  let link = (linkM[1] || '').trim();
  link = link.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
  const category = stripHtml(catM?.[1] || '');
  return { title, url: link, category };
}

function scrapeHerald(html) {
  const m = html.match(/id="articleText"[^>]*>([\s\S]*?)<\/article>/);
  if (!m) return '';
  const paras = [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(p => stripHtml(p[1]))
    .filter(p => p.length > 40);
  return paras.join('\n');
}

function scrapeKbs(html) {
  const m = html.match(/<p[^>]*class="cap[^"]*"[^>]*>[\s\S]*?<\/p>\s*([\s\S]*?)\s*<div/);
  if (!m) return '';
  const body = m[1];
  const paras = body.split(/<br\s*\/?>\s*<br\s*\/?>/i)
    .map(p => {
      let t = p.replace(/<[^>]+>/g, '');
      [["&#039;","'"],['&quot;','"'],['&amp;','&'],['&nbsp;',' ']].forEach(([e,c]) => { t = t.replaceAll(e, c); });
      return t.replace(/\s+/g, ' ').trim();
    })
    .filter(p => p.length > 30);
  return paras.join('\n');
}

async function translateAndAnalyze(sentences) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || sentences.length === 0) return sentences.map(() => ({ ko: '', analysis: '' }));

  const BATCH = 8;
  const results = [];
  for (let i = 0; i < sentences.length; i += BATCH) {
    const batch = sentences.slice(i, i + BATCH);
    const prompt = `You are a cheerful 20-year-old Korean woman explaining English sentences to your boyfriend in Korean. Use emojis naturally, be warm and casual (친구한테 말하듯이), and make it fun to read. Write the analysis as one flowing paragraph — no rigid bullet points, just talk naturally.

For each English sentence below, return a JSON array where each element has:
- "ko": natural Korean translation
- "analysis": a friendly Korean explanation that naturally covers:
  · 문장 구조나 핵심 표현을 쉽게 설명
  · 핵심 단어의 동의어나 다른 표현
  · 동사+전치사 조합이나 숙어가 있으면 용법 설명
  · 일상 영어에서 어떻게 더 캐주얼하게 말하는지 — 실제 영어 표현을 직접 보여줄 것 (예: 구어체로는 'It's not a big deal' 이렇게 말해~ 처럼 작은따옴표로 감싸서)
  · 기억에 남을 팁이나 재미있는 비유

Return ONLY valid JSON array, no other text.

${JSON.stringify(batch, null, 0)}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      const txt = data?.content?.[0]?.text?.trim() || '';
      const m = txt.match(/\[[\s\S]*\]/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed) && parsed.length === batch.length) {
          results.push(...parsed.map(r => ({ ko: String(r.ko || ''), analysis: String(r.analysis || '') })));
          continue;
        }
      }
    } catch (e) {
      console.error(`번역 배치 ${Math.floor(i/BATCH)+1} 실패:`, e.message);
    }
    results.push(...batch.map(() => ({ ko: '', analysis: '' })));
  }
  return results;
}

async function processKbsNews(db, today) {
  const existing = await get(ref(db, `english/korea_news/${today}`));
  if (existing.exists()) {
    const data = existing.val();
    const articles = Array.isArray(data) ? data : [data];
    if (articles[0]?.sentences?.[0]?.ko) {
      console.log(`✅ korea_news/${today} already complete`);
      return;
    }
  }

  const rss = await fetchUrl('https://world.kbs.co.kr/rss/rss_news.htm?lang=e');
  if (!rss) { console.log('[KBS] RSS 실패'); return; }

  const article = parseRssFirstItem(rss);
  if (!article?.url) { console.log('[KBS] 기사 없음'); return; }

  console.log(`[KBS] 스크래핑: ${article.title.slice(0,50)}`);
  const html = await fetchUrl(article.url, { 'X-PJAX': 'true', 'X-Requested-With': 'XMLHttpRequest' });
  const body = html ? scrapeKbs(html) : '';
  if (!body) { console.log('[KBS] 본문 없음'); return; }

  const sentsEn = splitIntoSentences(body);
  const analyzed = await translateAndAnalyze(sentsEn);
  article.sentences = sentsEn.map((en, i) => ({ en, ...analyzed[i] }));

  await set(ref(db, `english/korea_news/${today}`), [article]);
  console.log(`✅ korea_news/${today} — ${article.title.slice(0,40)} (${sentsEn.length}문장)`);
}

async function processHeraldNews(db, today) {
  const existing = await get(ref(db, `english/korea_herald/${today}`));
  if (existing.exists()) {
    const data = existing.val();
    const articles = Array.isArray(data) ? data : [data];
    if (articles[0]?.sentences?.[0]?.ko) {
      console.log(`✅ korea_herald/${today} already complete`);
      return;
    }
  }

  const rss = await fetchUrl('https://www.koreaherald.com/rss/newsAll');
  if (!rss) { console.log('[Herald] RSS 실패'); return; }

  const article = parseRssFirstItem(rss);
  if (!article?.url) { console.log('[Herald] 기사 없음'); return; }

  console.log(`[Herald] 스크래핑: ${article.title.slice(0,50)}`);
  const html = await fetchUrl(article.url);
  const body = html ? scrapeHerald(html) : '';
  if (!body) { console.log('[Herald] 본문 없음'); return; }

  const sentsEn = splitIntoSentences(body);
  const analyzed = await translateAndAnalyze(sentsEn);
  article.sentences = sentsEn.map((en, i) => ({ en, ...analyzed[i] }));

  await set(ref(db, `english/korea_herald/${today}`), [article]);
  console.log(`✅ korea_herald/${today} — ${article.title.slice(0,40)} (${sentsEn.length}문장)`);
}

export default async (req, context) => {
  const today = getKSTDateString();
  console.log(`[news-daily] ${today} 시작`);

  const db = getDatabase(getFirebaseApp());

  await processKbsNews(db, today);
  await processHeraldNews(db, today);

  return new Response(JSON.stringify({ ok: true, date: today }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
