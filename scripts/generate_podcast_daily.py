#!/usr/bin/env python3
"""
영어학습 팟캐스트 수집기
- BBC Learning English: RSS description 내 transcript URL로 스크립트 스크래핑
- All Ears English: RSS description 사용
- KBS World / Korea Herald: 기사 전문 스크래핑 + Claude Haiku 문장별 번역
매일 05:00 KST GitHub Actions에서 실행 — MIN_SCRIPT_LEN 미만이면 재시도
"""
import json
import os
import re
import urllib.request
from datetime import datetime, timezone, timedelta
from email.utils import parsedate
from xml.etree import ElementTree

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"
ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd"
MIN_SCRIPT_LEN = 500  # 미만이면 스크래핑 실패로 간주 → 재시도

SOURCES = {
    "bbc_learning": {
        "rss": "https://podcasts.files.bbci.co.uk/p02pc9zn.rss",
        "name": "BBC Learning English",
        "max": 20,
        "min_script_len": 2000,
    },
    "all_ears_english": {
        "rss": "https://feeds.megaphone.fm/allearsenglish",
        "name": "All Ears English",
        "max": 7,
        "min_script_len": 0,  # transcript 없음, description 사용
    },
}


def fetch(url: str, timeout: int = 15) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except Exception as e:
        print(f"  [!] {url[:70]} → {e}")
        return None


def strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    for ent, ch in [("&amp;","&"),("&nbsp;"," "),("&#39;","'"),("&apos;","'"),("&lt;","<"),
                    ("&gt;",">"),("&quot;",'"'),("&lsquo;","'"),("&rsquo;","'"),
                    ("&ldquo;",'"'),("&rdquo;",'"')]:
        s = s.replace(ent, ch)
    return re.sub(r"\s+", " ", s).strip()


def parse_duration(s: str) -> int:
    if not s:
        return 0
    parts = s.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        return int(s)
    except ValueError:
        return 0


def pub_to_date(pub: str) -> str:
    try:
        t = parsedate(pub)
        if t:
            return f"{t[0]:04d}-{t[1]:02d}-{t[2]:02d}"
    except Exception:
        pass
    return pub[:10] if len(pub) >= 10 else pub


def parse_rss(raw: bytes, max_items: int) -> list[dict]:
    try:
        root = ElementTree.fromstring(raw)
    except Exception as e:
        print(f"  [!] RSS 파싱 실패: {e}")
        return []

    results = []
    for item in root.findall(".//item"):
        if len(results) >= max_items:
            break
        enc = item.find("enclosure")
        if enc is None:
            continue
        audio_url = enc.get("url", "")
        if not audio_url:
            continue
        audio_url = audio_url.replace("http://", "https://").replace("/proto/http/", "/proto/https/")

        pub = item.findtext("pubDate", "").strip()
        desc_raw = item.findtext("description", "") or ""
        sum_raw = (item.findtext(f"{{{ITUNES_NS}}}summary", "") or "").strip()

        # BBC transcript URL 추출 (HTML 스트립 전)
        bbc_transcript_url = ""
        m = re.search(r'href="(https://www\.bbc\.co\.uk/learningenglish/[^"]+)"', desc_raw or sum_raw)
        if m:
            bbc_transcript_url = m.group(1)

        desc = strip_html(desc_raw)
        summary = strip_html(sum_raw) if sum_raw else desc

        results.append({
            "title": item.findtext("title", "").strip(),
            "link": item.findtext("link", "").strip(),
            "bbc_transcript_url": bbc_transcript_url,
            "audio_url": audio_url,
            "pub_date": pub_to_date(pub),
            "duration_sec": parse_duration(item.findtext(f"{{{ITUNES_NS}}}duration", "").strip()),
            "script": summary,
        })
    return results


# ── BBC 스크립트 스크래핑 ─────────────────────────────────────────────────────
# 네비게이션/JS 문자열 → 스크립트 p 태그가 아님을 판별
_BBC_JUNK = re.compile(r"require\(|function\(|document\.|\.className|Accessibility|Homepage|window\.")

def scrape_bbc_script(bbc_transcript_url: str) -> str:
    """BBC Learning English transcript 페이지에서 대화 스크립트 추출"""
    if not bbc_transcript_url:
        return ""
    raw = fetch(bbc_transcript_url, timeout=15)
    if not raw:
        return ""
    html = raw.decode("utf-8", errors="ignore")

    texts = []
    for p in re.findall(r"<p[^>]*>(.*?)</p>", html, re.DOTALL):
        t = strip_html(p)
        if len(t) < 30 or _BBC_JUNK.search(t):
            continue
        # BBC 공지 문구 제외
        if any(kw in t for kw in ["bbclearningenglish.com", "newsletter", "BBC Account",
                                   "find a free transcript", "visit bbc"]):
            continue
        texts.append(t)

    if len(texts) >= 3:
        result = "\n\n".join(texts)
        print(f"    BBC 스크립트: {len(result)}자 ({len(texts)}단락)")
        return result
    return ""


# ── 뉴스 기사 본문 스크래핑 ──────────────────────────────────────────────────
def scrape_kbs_article(url: str) -> str:
    """KBS World 기사 → 본문 텍스트 (X-PJAX + <br/> 파싱)"""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0",
        "X-PJAX": "true",
        "X-Requested-With": "XMLHttpRequest",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"  [!] KBS 스크래핑 실패: {e}")
        return ""

    # 사진 캡션 div 이후 ~ 다음 div 이전 구간이 기사 본문
    m = re.search(r'<p[^>]*class="cap[^"]*"[^>]*>.*?</p>\s*(.*?)\s*<div', html, re.DOTALL)
    if not m:
        return ""

    body = m.group(1)
    paras = re.split(r'<br\s*/?\s*>\s*<br\s*/?\s*>', body)
    clean = []
    for p in paras:
        t = re.sub(r"<[^>]+>", "", p)
        for ent, ch in [("&#039;", "'"), ("&quot;", '"'), ("&amp;", "&"), ("&nbsp;", " ")]:
            t = t.replace(ent, ch)
        t = re.sub(r"\s+", " ", t).strip()
        if len(t) > 30:
            clean.append(t)
    return "\n".join(clean)


def scrape_herald_article(url: str) -> str:
    """Korea Herald 기사 → 본문 텍스트 (id=articleText 파싱)"""
    raw = fetch(url)
    if not raw:
        return ""
    html = raw.decode("utf-8", errors="ignore")

    m = re.search(r'id="articleText"[^>]*>(.*?)</article>', html, re.DOTALL)
    if not m:
        return ""

    paras = re.findall(r'<p[^>]*>(.*?)</p>', m.group(1), re.DOTALL)
    clean = []
    for p in paras:
        t = strip_html(p)
        if len(t) > 40:  # 짧은 바이라인("Korea Herald correspondent" 등) 제외
            clean.append(t)
    return "\n".join(clean)


def scrape_news_article(url: str) -> str:
    """뉴스 기사 URL → 본문 텍스트 (범용, Korea Herald 등)"""
    raw = fetch(url)
    if not raw:
        return ""
    html = raw.decode("utf-8", errors="ignore")

    # 공통 기사 컨테이너 패턴 시도
    for pat in [
        r'<div[^>]+class="[^"]*(?:article[_-](?:view|body|content|text)|news[_-](?:body|content|text)|story[_-]body|detail[_-]body|content[_-]area|board[_-]content)[^"]*"[^>]*>(.*?)</div\s*>',
        r'<div[^>]+id="[^"]*(?:articleText|article[_-]body|news[_-]content|story[_-]body)[^"]*"[^>]*>(.*?)</div\s*>',
        r'<article[^>]*>(.*?)</article>',
    ]:
        m = re.search(pat, html, re.DOTALL | re.IGNORECASE)
        if m:
            paras = [strip_html(p) for p in re.findall(r'<p[^>]*>(.*?)</p>', m.group(1), re.DOTALL)]
            paras = [p for p in paras if len(p) > 30]
            if len(paras) >= 2:
                return "\n".join(paras)

    # fallback: 전체 <p> 태그에서 본문 추정
    paras = [strip_html(p) for p in re.findall(r'<p[^>]*>(.*?)</p>', html, re.DOTALL)]
    bad = ['copyright', 'rights reserved', 'subscribe', 'newsletter',
           'advertisement', '©', 'sign up', 'click here']
    paras = [p for p in paras if len(p) > 60 and not any(kw in p.lower() for kw in bad)]
    return "\n".join(paras[:40])


def split_into_sentences(text: str, max_count: int = 25) -> list[str]:
    """영어 본문 → 문장 배열 (최대 max_count개)"""
    text = text.replace("\n", " ")
    sents = re.split(r'(?<=[.!?])\s+(?=[A-Z"\'])', text)
    sents = [s.strip() for s in sents if len(s.strip()) > 20]
    return sents[:max_count]


def analyze_podcast_script(script: str) -> dict:
    """팟캐스트 스크립트 → 한국어 요약 + 핵심 표현 5개"""
    if not ANTHROPIC_API_KEY or not script:
        return {"summary_ko": "", "key_expressions": []}
    try:
        import anthropic as ant
        client = ant.Anthropic(api_key=ANTHROPIC_API_KEY)
        # 긴 스크립트는 앞 1500자(광고/인트로 구간) 건너뛰고 본문 위주로 전달
        if len(script) > 3000:
            start = 1500
            truncated = script[start:start + 5000]
        else:
            truncated = script
        prompt = (
            "You are a cheerful 20-year-old Korean woman helping your boyfriend study English podcasts. "
            "Use emojis naturally and write in a warm, casual tone (친구한테 말하듯이).\n\n"
            "IMPORTANT: Completely IGNORE any advertisement, sponsor mention, promotional segment, "
            "or call-to-action at the start or end of the script (e.g. 'brought to you by', "
            "'check out our sponsor', 'sign up at', 'use code', 'visit our website', "
            "'subscribe', 'follow us', 'leave a review', 'join our community'). "
            "Focus ONLY on the actual educational/conversational content of the episode.\n\n"
            "Given the following English podcast script, return a JSON object with exactly these two keys:\n\n"
            '- "summary_ko": a detailed Korean summary of the episode content, 7-10 sentences long. '
            "Cover: main topic, key points discussed, any interesting facts or examples mentioned, "
            "and what the listener can take away. Be thorough but natural — like explaining to a friend what you just listened to. "
            "Do NOT mention sponsors, ads, or promotions.\n\n"
            '- "key_expressions": array of exactly 5 useful English expressions/phrases picked from the actual episode content (not from ads). '
            "For each, include:\n"
            '  - "en": the expression as it appears in the script\n'
            '  - "ko": natural Korean translation\n'
            '  - "analysis": friendly Korean explanation — structure, synonyms/alternatives, '
            "colloquial English version shown in single quotes like 'casual version here', and a memorable tip\n\n"
            "Return ONLY valid JSON, no other text.\n\n"
            "SCRIPT:\n" + truncated
        )
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        txt = msg.content[0].text.strip()
        m = re.search(r"\{.*\}", txt, re.DOTALL)
        if not m:
            return {"summary_ko": "", "key_expressions": []}
        result = json.loads(m.group())
        return {
            "summary_ko": str(result.get("summary_ko", "")),
            "key_expressions": result.get("key_expressions", [])[:5],
        }
    except Exception as e:
        print(f"  [!] 팟캐스트 분석 실패: {e}")
    return {"summary_ko": "", "key_expressions": []}


def _call_translate_api(client, batch: list[str]) -> list[dict]:
    """배치 단위로 Claude Haiku 호출 → [{ko, analysis}, ...]"""
    prompt = (
        "You are a cheerful 20-year-old Korean woman explaining English sentences to your boyfriend in Korean. "
        "Use emojis naturally, be warm and casual (친구한테 말하듯이), and make it fun to read. "
        "Write the analysis as one flowing paragraph — no rigid bullet points, just talk naturally.\n\n"
        "For each English sentence below, return a JSON array where each element has:\n"
        '- "ko": natural Korean translation\n'
        '- "analysis": a friendly Korean explanation that naturally covers:\n'
        "  · 문장 구조나 핵심 표현을 쉽게 설명\n"
        "  · 핵심 단어의 동의어나 다른 표현\n"
        "  · 동사+전치사 조합이나 숙어가 있으면 용법 설명\n"
        "  · 일상 영어에서 어떻게 더 캐주얼하게 말하는지 — 실제 영어 표현을 직접 보여줄 것 "
        "(예: 구어체로는 'It's not a big deal' 이렇게 말해~ 처럼 작은따옴표로 감싸서)\n"
        "  · 기억에 남을 팁이나 재미있는 비유\n\n"
        "Return ONLY valid JSON array, no other text.\n\n"
        + json.dumps(batch, ensure_ascii=False)
    )
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}],
    )
    txt = msg.content[0].text.strip()
    m = re.search(r"\[.*\]", txt, re.DOTALL)
    if not m:
        return []
    raw_json = m.group()
    try:
        result = json.loads(raw_json)
    except json.JSONDecodeError:
        import ast
        try:
            result = ast.literal_eval(raw_json)
        except Exception:
            return []
    if not isinstance(result, list) or len(result) != len(batch):
        return []
    return [{"ko": str(r.get("ko", "")), "analysis": str(r.get("analysis", ""))} for r in result]


def translate_and_analyze(sentences: list[str]) -> list[dict]:
    """Claude Haiku로 영어 문장 배열 → 번역 + 문장 분석 (8문장씩 배치 처리)"""
    if not ANTHROPIC_API_KEY or not sentences:
        return [{"ko": "", "analysis": ""} for _ in sentences]
    try:
        import anthropic as ant
        client = ant.Anthropic(api_key=ANTHROPIC_API_KEY)
        BATCH = 8
        results: list[dict] = []
        for i in range(0, len(sentences), BATCH):
            batch = sentences[i:i + BATCH]
            batch_result = _call_translate_api(client, batch)
            if not batch_result:
                print(f"  [!] 배치 {i//BATCH+1} 번역 실패 — 빈값으로 대체")
                batch_result = [{"ko": "", "analysis": ""} for _ in batch]
            results.extend(batch_result)
        return results
    except Exception as e:
        print(f"  [!] 번역/분석 실패: {e}")
    return [{"ko": "", "analysis": ""} for _ in sentences]


# ── NPR transcript 스크래핑 ──────────────────────────────────────────────────
def _extract_npr_text(html: str) -> str:
    for pattern in [
        r'<div[^>]+id="storytext"[^>]*>(.*?)</div\s*>\s*<div',
        r'<div[^>]+class="[^"]*storytext[^"]*"[^>]*>(.*?)</div\s*>\s*<div',
        r'<article[^>]*>(.*?)</article>',
    ]:
        m = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
        if m:
            texts = [strip_html(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", m.group(1), re.DOTALL)
                     if len(strip_html(p)) > 20]
            if texts:
                return "\n\n".join(texts[:100])
    return ""


def scrape_npr_transcript(episode_url: str) -> str:
    """NPR 에피소드 → transcript 전문 (ID 기반 직접 접근 + 링크 탐색)"""
    if not episode_url:
        return ""

    # 방법 1: 에피소드 페이지에서 /transcripts/ 링크 탐색
    raw = fetch(episode_url, timeout=15)
    html = raw.decode("utf-8", errors="ignore") if raw else ""
    m = re.search(r'"(https?://www\.npr\.org/transcripts/\d+[^"]*)"', html)
    if m:
        raw2 = fetch(m.group(1), timeout=15)
        if raw2:
            result = _extract_npr_text(raw2.decode("utf-8", errors="ignore"))
            if result:
                print(f"    NPR transcript via link: {len(result)}자")
                return result

    # 방법 2: URL에서 숫자 ID 추출 → transcript URL 직접 구성
    ids = re.findall(r"\d{7,}", episode_url)
    for nid in ids:
        transcript_url = f"https://www.npr.org/transcripts/{nid}"
        raw2 = fetch(transcript_url, timeout=15)
        if raw2:
            h2 = raw2.decode("utf-8", errors="ignore")
            if "not found" not in h2[:500].lower():
                result = _extract_npr_text(h2)
                if result:
                    print(f"    NPR transcript via ID {nid}: {len(result)}자")
                    return result

    print(f"    NPR transcript 없음 (아직 미게시)")
    return ""


# ── Firebase ─────────────────────────────────────────────────────────────────
def get_existing_entries(source: str) -> dict[str, int]:
    """반환: {date_key: script_len} — short이면 재시도 대상"""
    raw = fetch(f"{DB_URL}/english/podcasts/{source}.json", timeout=20)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {}
        return {k: len(v.get("script", "")) if isinstance(v, dict) else 9999
                for k, v in data.items()}
    except Exception:
        return {}


def push(source: str, key: str, data: dict) -> bool:
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{DB_URL}/english/podcasts/{source}/{key}.json",
        data=payload, method="PUT",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        return True
    except Exception as e:
        print(f"  [!] Firebase 저장 실패 ({key}): {e}")
        return False


def patch_script(source: str, key: str, script: str) -> bool:
    payload = json.dumps({"script": script}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{DB_URL}/english/podcasts/{source}/{key}.json",
        data=payload, method="PATCH",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        return True
    except Exception as e:
        print(f"  [!] Firebase 패치 실패 ({key}): {e}")
        return False


# ── 소스별 처리 ───────────────────────────────────────────────────────────────
def process_source(source_key: str, config: dict, scraper=None):
    """
    scraper(ep) → str  : 에피소드 dict를 받아 스크립트 반환
    """
    min_len = config.get("min_script_len", MIN_SCRIPT_LEN)
    print(f"\n[{config['name']}] (기준 {min_len}자)")
    raw = fetch(config["rss"])
    if not raw:
        return

    episodes = parse_rss(raw, config["max"])
    if not episodes:
        print("  에피소드 없음")
        return

    existing = get_existing_entries(source_key)
    print(f"  RSS {len(episodes)}개 / 기존 저장 {len(existing)}개")
    new_count = retry_count = 0

    for ep in episodes:
        key = ep["pub_date"]
        if not key:
            continue

        existing_len = existing.get(key, -1)
        if existing_len >= min_len:
            continue  # 충분한 스크립트 이미 있음

        # 스크립트 스크래핑
        script = ep["script"]
        if scraper:
            scraped = scraper(ep)
            if scraped:
                script = scraped

        if existing_len == -1:
            print(f"  분석 중: {ep['title'][:48]}")
            ep_analysis = analyze_podcast_script(script)
            data = {
                "source": config["name"],
                "title": ep["title"],
                "script": script,
                "audio_url": ep["audio_url"],
                "duration_sec": ep["duration_sec"],
                "pub_date": ep["pub_date"],
                "episode_url": ep["link"],
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "analysis": ep_analysis,
            }
            if push(source_key, key, data):
                print(f"  ✓ {key} — {ep['title'][:48]} ({len(script)}자)")
                new_count += 1
        else:
            # 기존 항목 재시도
            if len(script) > existing_len + 100:  # 100자 이상 개선될 때만 업데이트
                if patch_script(source_key, key, script):
                    print(f"  ↻ {key} — {existing_len}자 → {len(script)}자")
                    retry_count += 1
            else:
                print(f"  - {key} — 개선 없음 ({existing_len}자 → {len(script)}자)")

    print(f"  → 신규 {new_count}개, 재시도 업데이트 {retry_count}개")


def fetch_korea_herald():
    """Korea Herald 최신 기사 1개 → 스크래핑+번역 → Firebase english/korea_herald/{date}"""
    print("\n[Korea Herald]")
    rss_url = "https://www.koreaherald.com/rss/newsAll"
    raw = fetch(rss_url)
    if not raw:
        return

    try:
        root = ElementTree.fromstring(raw)
    except Exception as e:
        print(f"  RSS 파싱 실패: {e}")
        return

    today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")

    # 첫 번째 유효한 기사만 처리
    article = None
    for item in root.findall(".//item"):
        title = strip_html(item.findtext("title", "").strip())
        link = item.findtext("link", "").strip()
        cat = item.findtext("category", "").strip()
        if title and link:
            article = {"title": title, "category": cat, "url": link}
            break

    if not article:
        print("  기사 없음")
        return

    print(f"  스크래핑: {article['title'][:50]}")
    body = scrape_herald_article(article["url"])
    if not body:
        print("  [!] 스크래핑 실패")
        return

    sents_en = split_into_sentences(body)
    analyzed = translate_and_analyze(sents_en)
    article["sentences"] = [{"en": e, **a} for e, a in zip(sents_en, analyzed)]

    payload = json.dumps([article], ensure_ascii=False).encode("utf-8")
    url = f"{DB_URL}/english/korea_herald/{today}.json"
    req = urllib.request.Request(url, data=payload, method="PUT",
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        print(f"  ✓ {today} — {article['title'][:50]} ({len(sents_en)}문장)")
    except Exception as e:
        print(f"  [!] Firebase 저장 실패: {e}")


def fetch_kbs_news():
    """KBS World 최신 기사 1개 → 스크래핑+번역 → Firebase english/korea_news/{date}"""
    print("\n[KBS World Korea News]")
    rss_url = "https://world.kbs.co.kr/rss/rss_news.htm?lang=e"
    raw = fetch(rss_url)
    if not raw:
        return

    try:
        root = ElementTree.fromstring(raw)
    except Exception as e:
        print(f"  RSS 파싱 실패: {e}")
        return

    today = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")

    # 첫 번째 유효한 기사만 처리
    article = None
    for item in root.findall(".//item"):
        title = strip_html(item.findtext("title", "").strip())
        link = item.findtext("link", "").strip()
        desc_raw = item.findtext("description", "") or ""
        desc = re.sub(r"<[^>]+>", " ", desc_raw)
        for ent, ch in [("&quot;", '"'), ("&amp;", "&"), ("&nbsp;", " "), ("&#39;", "'")]:
            desc = desc.replace(ent, ch)
        desc = re.sub(r"\s+", " ", desc).strip()
        cat = ""
        m = re.match(r"\[([^\]]+)\]\s*:?\s*", desc)
        if m:
            cat = m.group(1)
        if title and link:
            article = {"title": title, "category": cat, "url": link}
            break

    if not article:
        print("  기사 없음")
        return

    print(f"  스크래핑: {article['title'][:50]}")
    body = scrape_kbs_article(article["url"])
    if not body:
        print("  [!] 스크래핑 실패")
        return

    sents_en = split_into_sentences(body)
    analyzed = translate_and_analyze(sents_en)
    article["sentences"] = [{"en": e, **a} for e, a in zip(sents_en, analyzed)]

    payload = json.dumps([article], ensure_ascii=False).encode("utf-8")
    url = f"{DB_URL}/english/korea_news/{today}.json"
    req = urllib.request.Request(url, data=payload, method="PUT",
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        print(f"  ✓ {today} — {article['title'][:50]} ({len(sents_en)}문장)")
    except Exception as e:
        print(f"  [!] Firebase 저장 실패: {e}")


def main():
    print(f"[*] 팟캐스트 수집 — {datetime.now(timezone.utc).isoformat()[:19]} UTC")

    process_source(
        "bbc_learning", SOURCES["bbc_learning"],
        scraper=lambda ep: scrape_bbc_script(ep.get("bbc_transcript_url", ""))
    )
    process_source("all_ears_english", SOURCES["all_ears_english"])
    fetch_kbs_news()
    fetch_korea_herald()

    print("\n[*] 완료")


if __name__ == "__main__":
    main()
