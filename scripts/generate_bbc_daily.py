#!/usr/bin/env python3
"""
BBC 뉴스 데일리 생성기
BBC RSS 기사 → Claude 학습 콘텐츠 + NPR/BBC Global News 팟캐스트 RSS 수집 → Firebase push
매일 GitHub Actions (20:00 UTC = 05:00 KST)에서 실행
"""
import json
import os
import sys
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.etree import ElementTree

import anthropic

ROOT = Path(__file__).parent.parent
DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"

BBC_NEWS_FEEDS = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://feeds.bbci.co.uk/news/technology/rss.xml",
    "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
]

PODCAST_FEEDS = {
    "npr": {
        "url": "https://feeds.npr.org/500005/podcast.xml",
        "name": "NPR News Now",
        "desc_ko": "NPR 5분 뉴스",
    },
    "bbc_global": {
        "url": "https://podcasts.files.bbci.co.uk/p02nq0gn.rss",
        "name": "BBC Global News",
        "desc_ko": "BBC 글로벌 뉴스 팟캐스트",
    },
}

ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd"


def get_kst_date() -> str:
    kst = datetime.now(timezone.utc) + timedelta(hours=9)
    return kst.strftime("%Y-%m-%d")


def fetch_rss_news(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
    except Exception as e:
        print(f"[!] RSS fetch failed {url}: {e}")
        return []

    root = ElementTree.fromstring(raw)
    items = []
    for item in root.findall(".//item"):
        title = item.findtext("title", "").strip()
        desc = re.sub(r"<[^>]+>", "", item.findtext("description", "")).strip()
        link = item.findtext("link", "").strip()
        pub = item.findtext("pubDate", "").strip()
        if title and link:
            items.append({"title": title, "description": desc, "url": link, "published": pub})
    return items



def fetch_podcast_episode(feed_key: str, feed_info: dict) -> dict | None:
    """RSS 피드에서 최신 에피소드의 오디오 URL과 메타데이터를 추출"""
    req = urllib.request.Request(feed_info["url"], headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
    except Exception as e:
        print(f"[!] Podcast RSS fetch failed ({feed_key}): {e}")
        return None

    try:
        root = ElementTree.fromstring(raw)
    except Exception as e:
        print(f"[!] Podcast RSS parse failed ({feed_key}): {e}")
        return None

    for item in root.findall(".//item"):
        enc = item.find("enclosure")
        if enc is None:
            continue
        audio_url = enc.get("url", "")
        if not audio_url or not audio_url.lower().endswith((".mp3", ".m4a", ".aac")):
            # Some feeds have Spotify redirect URLs — check content type attr too
            ctype = enc.get("type", "")
            if "audio" not in ctype:
                continue

        title = item.findtext("title", "").strip()
        desc = re.sub(r"<[^>]+>", "", item.findtext("description", "") or "").strip()
        pub = item.findtext("pubDate", "").strip()
        duration = item.findtext(f"{{{ITUNES_NS}}}duration", "").strip()
        summary = item.findtext(f"{{{ITUNES_NS}}}summary", "").strip() or desc

        # duration을 초로 변환
        duration_sec = 0
        if duration:
            parts = duration.split(":")
            try:
                if len(parts) == 3:
                    duration_sec = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                elif len(parts) == 2:
                    duration_sec = int(parts[0]) * 60 + int(parts[1])
                else:
                    duration_sec = int(duration)
            except ValueError:
                pass

        print(f"[+] {feed_info['name']}: {title[:55]}")
        print(f"    오디오: {audio_url[:65]}")
        print(f"    길이: {duration_sec}초")

        return {
            "source": feed_info["name"],
            "source_ko": feed_info["desc_ko"],
            "title": title,
            "description": summary[:300] if summary else "",
            "audio_url": audio_url,
            "duration_sec": duration_sec,
            "published": pub,
        }

    print(f"[!] {feed_info['name']}: 오디오 URL 있는 에피소드 없음")
    return None


def fetch_article_text(url: str) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[!] Article fetch failed: {e}")
        return ""

    paragraphs = re.findall(r'data-component="text-block"[^>]*>.*?<p[^>]*>(.*?)</p>', html, re.DOTALL)
    if not paragraphs:
        paragraphs = re.findall(r'<p[^>]*class="[^"]*gel-body-copy[^"]*"[^>]*>(.*?)</p>', html, re.DOTALL)
    if not paragraphs:
        paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', html, re.DOTALL)

    texts = []
    for p in paragraphs:
        text = re.sub(r"<[^>]+>", "", p).strip()
        text = (text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                    .replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"'))
        if len(text) > 40:
            texts.append(text)
    return "\n\n".join(texts[:20])


def generate_reading_with_claude(client: anthropic.Anthropic, article: dict, full_text: str) -> dict:
    title = article["title"]
    url = article["url"]
    body = full_text if full_text else article.get("description", "")

    prompt = f"""You are an English learning content creator for Korean students.

Article Title: {title}
Article URL: {url}
Article Body:
{body}

Generate structured reading content in JSON. Return ONLY valid JSON, no other text.

{{
  "title": "<original BBC title>",
  "category": "<World/Tech/Science/etc>",
  "url": "{url}",
  "summary_ko": "<2-3 sentence Korean summary of the article>",
  "paragraphs": ["<paragraph 1>", "<paragraph 2>", ...],
  "vocabulary": [
    {{"word": "...", "definition_en": "...", "meaning_ko": "..."}}
  ],
  "comprehension_questions": [
    {{"question": "...", "answer": "..."}}
  ]
}}

Rules:
- paragraphs: up to 8 paragraphs, keep original BBC text as much as possible
- vocabulary: 6-8 advanced/useful words with clear definitions
- comprehension_questions: 3 questions to check understanding
- All Korean text must be natural Korean
"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    text = response.content[0].text.strip()
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1:
        raise ValueError("No JSON in Claude response")
    return json.loads(text[start:end])


def push_to_firebase(date: str, data: dict) -> bool:
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    url = f"{DB_URL}/english/bbc/{date}.json"
    req = urllib.request.Request(url, data=payload, method="PUT",
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
        print(f"[+] Firebase 업로드 완료: english/bbc/{date}")
        return True
    except urllib.error.HTTPError as e:
        print(f"[!] HTTP {e.code}: {e.read().decode()}")
        return False
    except Exception as e:
        print(f"[!] Firebase 업로드 실패: {e}")
        return False


def main():
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    today = get_kst_date()
    print(f"[*] BBC 데일리 생성 — {today}")

    # ── 1. BBC 뉴스 기사 수집 ──────────────────────────────────────────────
    all_items = []
    for feed_url in BBC_NEWS_FEEDS:
        items = fetch_rss_news(feed_url)
        all_items.extend(items)
        print(f"[*] 뉴스 RSS {feed_url.split('/')[-2]}: {len(items)}개")

    if not all_items:
        print("[!] BBC 기사 없음 — 종료")
        sys.exit(1)

    article = all_items[0]
    print(f"[*] 선택 기사: {article['title']}")

    print("[*] 기사 본문 파싱 중...")
    full_text = fetch_article_text(article["url"])
    print(f"[*] 본문 {len(full_text)}자")

    # ── 2. Claude로 리딩 콘텐츠 생성 ────────────────────────────────────────
    print("[*] Claude로 리딩 콘텐츠 생성 중...")
    reading = generate_reading_with_claude(client, article, full_text)

    # ── 3. 팟캐스트 RSS 수집 ─────────────────────────────────────────────────
    podcasts = {}
    for key, info in PODCAST_FEEDS.items():
        print(f"[*] {info['name']} RSS 수집 중...")
        episode = fetch_podcast_episode(key, info)
        if episode:
            podcasts[key] = episode

    # ── 4. Firebase push ──────────────────────────────────────────────────
    content = {
        "date": today,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source_url": article["url"],
        "reading": reading,
        "podcasts": podcasts,
    }

    success = push_to_firebase(today, content)
    if not success:
        sys.exit(1)

    pod_list = ", ".join(f"{k}({v['duration_sec']}초)" for k, v in podcasts.items())
    print(f"[+] 완료! Reading {len(reading.get('paragraphs', []))}단락 | 팟캐스트: {pod_list}")


if __name__ == "__main__":
    main()
