"""
Spotlight English RSS → 오디오 URL + 스크립트 추출 → Firebase 저장
Task Scheduler: 매일 05:40 KST (run_news_local.py 이후)
Firebase: english/podcasts/spotlight/{YYYY-MM-DD}
"""
import re, json, os, sys, urllib.request, urllib.error
from datetime import date, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
import anthropic

KST = timezone(timedelta(hours=9))
TODAY = (date.today() + timedelta(hours=0)).isoformat()
DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"
RSS_URL = "https://spotlightenglish.com/feed/"


def load_env():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  fetch 실패: {e}")
        return None


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s)
    for ent, ch in [("&amp;", "&"), ("&nbsp;", " "), ("&#39;", "'"),
                    ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'),
                    ("&ldquo;", '"'), ("&rdquo;", '"'), ("&lsquo;", "'"), ("&rsquo;", "'")]:
        s = s.replace(ent, ch)
    return re.sub(r"\s+", " ", s).strip()


def parse_rss(xml):
    """Word of the Day(YouTube only) 아이템 제외하고 팟캐스트 에피소드 반환."""
    items = re.findall(r"<item>([\s\S]*?)</item>", xml)
    for item in items:
        cat_m = re.search(r"<category[^>]*><!\[CDATA\[(.*?)\]\]>", item)
        category = cat_m.group(1) if cat_m else ""
        if "Word of the Day" in category:
            continue

        title_m = re.search(r"<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)</title>", item)
        link_m = re.search(r"<link>(.*?)</link>", item)
        date_m = re.search(r"<pubDate>(.*?)</pubDate>", item)
        content_m = re.search(r"<content:encoded><!\[CDATA\[([\s\S]*?)\]\]>", item)

        if not link_m or not content_m:
            continue

        title = strip_html((title_m.group(1) or title_m.group(2)) if title_m else "")
        link = link_m.group(1).strip()
        pub_date = date_m.group(1).strip() if date_m else ""
        content = content_m.group(1)

        # MP3 URL 추출
        audio_m = re.search(r'<audio[^>]+src=["\']([^"\']+\.mp3[^"\']*)["\']', content)
        if not audio_m:
            continue
        audio_url = audio_m.group(1)

        # 스크립트 추출: Voice N 레이블(h5) + 본문(p) 순서대로
        script_parts = []
        for tag in re.finditer(r"<(h5|p)[^>]*>([\s\S]*?)</(h5|p)>", content):
            text = strip_html(tag.group(2))
            if not text or len(text) < 3:
                continue
            if "appeared first on" in text:
                continue
            if "Click here to follow" in text:
                continue
            if tag.group(1) == "h5":
                script_parts.append(f"[{text}]")
            else:
                if len(text) >= 15:
                    script_parts.append(text)

        script = "\n".join(script_parts)
        if not script:
            continue

        return {
            "title": title,
            "link": link,
            "pub_date": pub_date,
            "audio_url": audio_url,
            "script": script,
        }
    return None


def analyze_with_claude(client, title, script):
    """Haiku로 한국어 요약 + 핵심 표현 5개 추출."""
    # 스크립트가 너무 길면 앞부분만 사용
    truncated = script[:3000] if len(script) > 3000 else script

    prompt = f"""This is a transcript from Spotlight English podcast episode titled "{title}".
Analyze it for Korean English learners.

Transcript:
{truncated}

Return ONLY valid JSON:
{{
  "summary_ko": "2-3문장 한국어 요약",
  "key_expressions": [
    {{"en": "expression", "ko": "한국어 뜻", "analysis": "사용법/뉘앙스 1-2문장"}}
  ]
}}

Pick 5 useful expressions from the transcript. Keep analysis friendly and practical."""

    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    txt = resp.content[0].text.strip()
    m = re.search(r"\{[\s\S]*\}", txt)
    if m:
        return json.loads(m.group(0))
    return None


def firebase_get(path):
    url = f"{DB_URL}/{path}.json"
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            return json.loads(r.read())
    except Exception:
        return None


def firebase_put(path, data):
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{DB_URL}/{path}.json",
        data=payload, method="PUT",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def main():
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[!] ANTHROPIC_API_KEY 없음")
        sys.exit(1)

    # 이미 오늘 데이터 있으면 스킵
    existing = firebase_get(f"english/podcasts/spotlight/{TODAY}")
    if existing and existing.get("audio_url"):
        print(f"[Spotlight] 이미 완료됨: {existing.get('title', '')[:50]}")
        return

    print("[Spotlight] RSS 가져오는 중...")
    xml = fetch(RSS_URL)
    if not xml:
        print("[Spotlight] RSS 실패")
        return

    episode = parse_rss(xml)
    if not episode:
        print("[Spotlight] 파싱 가능한 에피소드 없음")
        return

    # 어제(또는 최근 7일) 저장된 에피소드와 URL이 같으면 신규 에피소드 없음 → 스킵
    for days_ago in range(1, 8):
        past_date = (date.today() - timedelta(days=days_ago)).isoformat()
        past = firebase_get(f"english/podcasts/spotlight/{past_date}")
        if past and past.get("episode_url"):
            if past["episode_url"] == episode["link"]:
                print(f"[Spotlight] 신규 에피소드 없음 ({past_date}와 동일). 스킵.")
                return
            break  # 가장 최근 날 데이터 확인했으면 충분

    print(f"[Spotlight] 에피소드: {episode['title'][:60]}")
    print(f"[Spotlight] 오디오: {episode['audio_url'][:60]}")

    client = anthropic.Anthropic(api_key=api_key)
    print("[Spotlight] Claude 분석 중...")
    analysis = analyze_with_claude(client, episode["title"], episode["script"])

    data = {
        "source": "spotlight",
        "title": episode["title"],
        "script": episode["script"],
        "audio_url": episode["audio_url"],
        "duration_sec": 0,
        "pub_date": episode["pub_date"],
        "episode_url": episode["link"],
    }
    if analysis:
        data["analysis"] = analysis

    status = firebase_put(f"english/podcasts/spotlight/{TODAY}", data)
    print(f"[Spotlight] Firebase PUT {status}: {episode['title'][:50]}")


if __name__ == "__main__":
    main()
