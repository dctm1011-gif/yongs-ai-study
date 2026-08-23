#!/usr/bin/env python3
"""
영어학습 팟캐스트 수집기
- BBC Learning English: 최근 20개 에피소드 (주기적 신규)
- NPR Up First: 최근 7개 (매일)
- VOA Learning English: 최근 20개 (있는대로)
매일 05:00 KST GitHub Actions에서 실행 — 중복 자동 제거
"""
import json
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone
from email.utils import parsedate
from xml.etree import ElementTree

DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"
ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd"

SOURCES = {
    "bbc_learning": {
        "rss": "https://podcasts.files.bbci.co.uk/p02pc9zn.rss",
        "name": "BBC Learning English",
        "max": 20,
    },
    "npr_upfirst": {
        "rss": "https://feeds.npr.org/510318/podcast.xml",
        "name": "NPR Up First",
        "max": 7,
    },
    "voa": {
        "rss": "https://learningenglish.voanews.com/podcast?zoneId=1689",
        "name": "VOA Learning English",
        "max": 20,
    },
}


def fetch(url: str, timeout: int = 15) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except Exception as e:
        print(f"  [!] {url[:60]} → {e}")
        return None


def parse_duration(s: str) -> int:
    if not s:
        return 0
    parts = s.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
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

        def strip_html(s: str) -> str:
            s = re.sub(r"<[^>]+>", "", s)
            s = s.replace("&amp;", "&").replace("&nbsp;", " ").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">")
            return re.sub(r"\s+", " ", s).strip()

        pub = item.findtext("pubDate", "").strip()
        desc = strip_html(item.findtext("description", "") or "")
        raw_summary = (item.findtext(f"{{{ITUNES_NS}}}summary", "") or "").strip()
        summary = strip_html(raw_summary) if raw_summary else desc

        results.append({
            "title": item.findtext("title", "").strip(),
            "link": item.findtext("link", "").strip(),
            "audio_url": audio_url,
            "pub_date": pub_to_date(pub),
            "duration_sec": parse_duration(item.findtext(f"{{{ITUNES_NS}}}duration", "").strip()),
            "script": summary,
        })
    return results


def scrape_npr_transcript(episode_url: str) -> str:
    """NPR 에피소드 페이지에서 transcript 링크를 찾아 텍스트 추출"""
    raw = fetch(episode_url, timeout=12)
    if not raw:
        return ""
    html = raw.decode("utf-8", errors="ignore")

    # transcript URL 패턴 검색
    m = re.search(r'href="(https://www\.npr\.org/transcripts/[^"]+)"', html)
    if not m:
        return ""

    raw2 = fetch(m.group(1), timeout=12)
    if not raw2:
        return ""
    html2 = raw2.decode("utf-8", errors="ignore")

    # transcript div 내 p 태그 추출
    section = re.search(r'<div[^>]+class="[^"]*transcript[^"]*"[^>]*>(.*?)</div>',
                        html2, re.DOTALL | re.IGNORECASE)
    if not section:
        # 대안: article-text 내 p 태그
        section = re.search(r'<article[^>]*>(.*?)</article>', html2, re.DOTALL)
    if not section:
        return ""

    texts = []
    for p in re.findall(r'<p[^>]*>(.*?)</p>', section.group(1), re.DOTALL):
        text = re.sub(r"<[^>]+>", "", p).strip()
        text = text.replace("&amp;", "&").replace("&nbsp;", " ").replace("&#39;", "'")
        if len(text) > 20:
            texts.append(text)

    return "\n\n".join(texts[:80])


def get_existing_keys(source: str) -> set[str]:
    raw = fetch(f"{DB_URL}/english/podcasts/{source}.json?shallow=true", timeout=10)
    if not raw:
        return set()
    try:
        data = json.loads(raw)
        return set(data.keys()) if isinstance(data, dict) else set()
    except Exception:
        return set()


def push(source: str, key: str, data: dict) -> bool:
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    url = f"{DB_URL}/english/podcasts/{source}/{key}.json"
    req = urllib.request.Request(url, data=payload, method="PUT",
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        return True
    except Exception as e:
        print(f"  [!] Firebase 저장 실패 ({key}): {e}")
        return False


def process_source(source_key: str, config: dict, extra_scrape=None):
    print(f"\n[{config['name']}]")
    raw = fetch(config["rss"])
    if not raw:
        return

    episodes = parse_rss(raw, config["max"])
    if not episodes:
        print("  에피소드 없음")
        return

    existing = get_existing_keys(source_key)
    print(f"  RSS {len(episodes)}개 / 기존 저장 {len(existing)}개")
    new_count = 0

    for ep in episodes:
        key = ep["pub_date"]
        if not key or key in existing:
            continue

        script = ep["script"]
        if extra_scrape and ep["link"]:
            scraped = extra_scrape(ep["link"])
            if scraped:
                script = scraped

        data = {
            "source": config["name"],
            "title": ep["title"],
            "script": script,
            "audio_url": ep["audio_url"],
            "duration_sec": ep["duration_sec"],
            "pub_date": ep["pub_date"],
            "episode_url": ep["link"],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

        if push(source_key, key, data):
            script_len = len(script)
            print(f"  ✓ {key} — {ep['title'][:48]} (스크립트 {script_len}자)")
            existing.add(key)
            new_count += 1

    print(f"  → {new_count}개 신규 저장")


def main():
    print(f"[*] 팟캐스트 수집 — {datetime.now(timezone.utc).isoformat()[:19]} UTC")
    process_source("bbc_learning", SOURCES["bbc_learning"])
    process_source("npr_upfirst", SOURCES["npr_upfirst"], extra_scrape=scrape_npr_transcript)
    process_source("voa", SOURCES["voa"])
    print("\n[*] 완료")


if __name__ == "__main__":
    main()
