#!/usr/bin/env python3
"""
BBC 뉴스 데일리 생성기
BBC RSS 상위 기사 파싱 → Claude로 어휘/요약 생성 → Firebase push
매일 GitHub Actions (07:00 UTC = 16:00 KST)에서 실행
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

BBC_RSS_FEEDS = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://feeds.bbci.co.uk/news/technology/rss.xml",
    "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
]


def get_kst_date() -> str:
    kst = datetime.now(timezone.utc) + timedelta(hours=9)
    return kst.strftime("%Y-%m-%d")


def fetch_rss(url: str) -> list[dict]:
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
        desc = item.findtext("description", "").strip()
        link = item.findtext("link", "").strip()
        pub = item.findtext("pubDate", "").strip()
        # strip HTML tags from description
        desc = re.sub(r"<[^>]+>", "", desc).strip()
        if title and link:
            items.append({"title": title, "description": desc, "url": link, "published": pub})
    return items


def fetch_article_text(url: str) -> str:
    """BBC 기사 본문 텍스트 추출 (간단한 파싱)"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[!] Article fetch failed: {e}")
        return ""

    # BBC 기사 본문 <p> 태그 추출 (data-component="text-block" 내부)
    paragraphs = re.findall(
        r'data-component="text-block"[^>]*>.*?<p[^>]*>(.*?)</p>',
        html, re.DOTALL
    )
    if not paragraphs:
        # fallback: 일반 <p> 태그
        paragraphs = re.findall(r'<p[^>]*class="[^"]*gel-body-copy[^"]*"[^>]*>(.*?)</p>', html, re.DOTALL)
    if not paragraphs:
        paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', html, re.DOTALL)

    texts = []
    for p in paragraphs:
        text = re.sub(r"<[^>]+>", "", p).strip()
        text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"')
        if len(text) > 40:
            texts.append(text)
    return "\n\n".join(texts[:20])  # 최대 20단락


def generate_with_claude(client: anthropic.Anthropic, article: dict, full_text: str) -> dict:
    title = article["title"]
    desc = article.get("description", "")
    url = article["url"]
    body = full_text if full_text else desc

    prompt = f"""You are an English learning content creator for Korean students.

Article Title: {title}
Article URL: {url}
Article Body:
{body}

Generate structured learning content in JSON. Return ONLY valid JSON, no other text.

{{
  "reading": {{
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
  }},
  "podcast": {{
    "title": "<catchy podcast episode title>",
    "intro_ko": "<30-word Korean intro to hook the listener>",
    "script": ["<paragraph 1 of listening script - simplified, clear English>", "<paragraph 2>", ...],
    "key_phrases": [
      {{"phrase": "...", "meaning_ko": "...", "example": "..."}}
    ]
  }}
}}

Rules:
- reading.paragraphs: up to 8 paragraphs, keep original BBC text as much as possible
- vocabulary: pick 6-8 advanced/useful words from the article with clear definitions
- comprehension_questions: 3 questions to check understanding
- podcast.script: rewrite the article as a clear, natural spoken-English script (5-7 paragraphs, simpler vocab than reading, good for listening practice)
- key_phrases: 4-5 idiomatic/useful phrases from the article
- All Korean text must be natural Korean
"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=3000,
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
    req = urllib.request.Request(
        url, data=payload, method="PUT",
        headers={"Content-Type": "application/json"}
    )
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

    # 여러 RSS 피드에서 기사 수집
    all_items = []
    for feed_url in BBC_RSS_FEEDS:
        items = fetch_rss(feed_url)
        all_items.extend(items)
        print(f"[*] {feed_url}: {len(items)}개 기사")

    if not all_items:
        print("[!] RSS 기사 없음 — 종료")
        sys.exit(1)

    # 첫 번째 기사 선택 (가장 최신)
    article = all_items[0]
    print(f"[*] 선택 기사: {article['title']}")
    print(f"    URL: {article['url']}")

    # 본문 파싱
    print("[*] 기사 본문 파싱 중...")
    full_text = fetch_article_text(article["url"])
    print(f"[*] 본문 {len(full_text)}자 파싱 완료")

    # Claude로 학습 콘텐츠 생성
    print("[*] Claude로 학습 콘텐츠 생성 중...")
    content = generate_with_claude(client, article, full_text)

    # 날짜 + 메타데이터 추가
    content["date"] = today
    content["timestamp"] = datetime.now(timezone.utc).isoformat()
    content["source_url"] = article["url"]

    # Firebase push
    success = push_to_firebase(today, content)
    if not success:
        sys.exit(1)

    print(f"[+] 완료! Reading {len(content['reading']['paragraphs'])}단락, Podcast {len(content['podcast']['script'])}단락")


if __name__ == "__main__":
    main()
