"""
Spotlight English RSS → 문장별 번역+분석 → Firebase 저장
Task Scheduler: 매일 05:40 KST
Firebase: english/podcasts/spotlight/{YYYY-MM-DD}
sentences: [{speaker, en, ko, analysis}]
"""
import re, json, os, sys, urllib.request
from datetime import date, timedelta
from pathlib import Path
import anthropic

TODAY = date.today().isoformat()
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
    """Word of the Day(YouTube) 제외, 팟캐스트 에피소드 파싱."""
    items = re.findall(r"<item>([\s\S]*?)</item>", xml)
    for item in items:
        cat_m = re.search(r"<category[^>]*><!\[CDATA\[(.*?)\]\]>", item)
        if "Word of the Day" in (cat_m.group(1) if cat_m else ""):
            continue

        title_m = re.search(r"<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)</title>", item)
        link_m  = re.search(r"<link>(.*?)</link>", item)
        date_m  = re.search(r"<pubDate>(.*?)</pubDate>", item)
        content_m = re.search(r"<content:encoded><!\[CDATA\[([\s\S]*?)\]\]>", item)
        if not link_m or not content_m:
            continue

        title   = strip_html((title_m.group(1) or title_m.group(2)) if title_m else "")
        link    = link_m.group(1).strip()
        pub_date = date_m.group(1).strip() if date_m else ""
        content = content_m.group(1)

        audio_m = re.search(r'<audio[^>]+src=["\']([^"\']+\.mp3[^"\']*)["\']', content)
        if not audio_m:
            continue
        audio_url = audio_m.group(1)

        # Voice N 레이블(h5) + 본문(p) → [{speaker, en}] 리스트
        raw_sentences = []
        current_speaker = ""
        for tag in re.finditer(r"<(h5|p)[^>]*>([\s\S]*?)</(h5|p)>", content):
            text = strip_html(tag.group(2))
            if not text:
                continue
            if "appeared first on" in text or "Click here to follow" in text:
                continue
            if tag.group(1) == "h5":
                current_speaker = text
            elif len(text) >= 15:
                raw_sentences.append({"speaker": current_speaker, "en": text})

        if not raw_sentences:
            continue

        return {
            "title": title, "link": link,
            "pub_date": pub_date, "audio_url": audio_url,
            "raw_sentences": raw_sentences,
        }
    return None


def translate_and_analyze(client, sentences):
    """문장 리스트 → [{ko, analysis}] 애교있는 말투로."""
    BATCH = 8
    results = []
    texts = [s["en"] for s in sentences]
    for i in range(0, len(texts), BATCH):
        batch = texts[i:i + BATCH]
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
            "  · 일상 영어에서 어떻게 더 캐주얼하게 말하는지 — 실제 영어 표현을 직접 보여줄 것\n"
            "  · 기억에 남을 팁이나 재미있는 비유\n\n"
            "Return ONLY valid JSON array, no other text.\n\n"
            f"{json.dumps(batch, ensure_ascii=False)}"
        )
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}]
        )
        txt = resp.content[0].text.strip()
        m = re.search(r"\[[\s\S]*\]", txt)
        if m:
            parsed = json.loads(m.group(0))
            results.extend(
                {"ko": str(r.get("ko", "")), "analysis": str(r.get("analysis", ""))}
                for r in parsed
            )
        else:
            results.extend({"ko": "", "analysis": ""} for _ in batch)
    return results


def firebase_get(path):
    try:
        with urllib.request.urlopen(f"{DB_URL}/{path}.json", timeout=8) as r:
            return json.loads(r.read())
    except Exception:
        return None


def firebase_put(path, data):
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{DB_URL}/{path}.json", data=payload, method="PUT",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def main():
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[!] ANTHROPIC_API_KEY 없음"); sys.exit(1)

    existing = firebase_get(f"english/podcasts/spotlight/{TODAY}")
    if existing and existing.get("audio_url"):
        print(f"[Spotlight] 이미 완료됨: {existing.get('title', '')[:50]}")
        return

    print("[Spotlight] RSS 가져오는 중...")
    xml = fetch(RSS_URL)
    if not xml:
        print("[Spotlight] RSS 실패"); return

    episode = parse_rss(xml)
    if not episode:
        print("[Spotlight] 파싱 가능한 에피소드 없음"); return

    # 최근 7일과 동일 에피소드면 스킵
    for days_ago in range(1, 8):
        past = firebase_get(f"english/podcasts/spotlight/{(date.today() - timedelta(days=days_ago)).isoformat()}")
        if past and past.get("episode_url"):
            if past["episode_url"] == episode["link"]:
                print(f"[Spotlight] 신규 에피소드 없음. 스킵.")
                return
            break

    print(f"[Spotlight] 에피소드: {episode['title'][:60]}")
    print(f"[Spotlight] 문장 수: {len(episode['raw_sentences'])}개")

    client = anthropic.Anthropic(api_key=api_key)
    print("[Spotlight] 번역+분석 중...")
    analyzed = translate_and_analyze(client, episode["raw_sentences"])

    sentences = [
        {
            "speaker": episode["raw_sentences"][i]["speaker"],
            "en": episode["raw_sentences"][i]["en"],
            "ko": analyzed[i]["ko"],
            "analysis": analyzed[i]["analysis"],
        }
        for i in range(min(len(episode["raw_sentences"]), len(analyzed)))
    ]

    data = {
        "source": "spotlight",
        "title": episode["title"],
        "audio_url": episode["audio_url"],
        "duration_sec": 0,
        "pub_date": episode["pub_date"],
        "episode_url": episode["link"],
        "sentences": sentences,
    }

    status = firebase_put(f"english/podcasts/spotlight/{TODAY}", data)
    print(f"[Spotlight] Firebase PUT {status}: {len(sentences)}문장 저장")


if __name__ == "__main__":
    main()
