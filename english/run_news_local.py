"""
Korea Herald + KBS 뉴스 로컬 스크래퍼
- koreaherald.com은 Netlify(AWS) IP를 차단 → 로컬 PC에서 실행
- Task Scheduler: 매일 05:35 KST (news-daily.mjs 05:30 실패 후 보완)
- Firebase: english/korea_herald/{YYYY-MM-DD}
"""
import re, json, os, sys, urllib.request
from datetime import date, timezone, timedelta
from pathlib import Path
import anthropic

KST = timezone(timedelta(hours=9))
TODAY = date.today().isoformat()
DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"


def load_env():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def fetch(url, headers={}):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", **headers})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  fetch 실패: {e}")
        return None


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s)
    for ent, ch in [("&amp;","&"),("&nbsp;"," "),("&#39;","'"),("&apos;","'"),
                    ("&lt;","<"),("&gt;",">"),("&quot;",'"'),("&ldquo;",'"'),
                    ("&rdquo;",'"'),("&lsquo;","'"),("&rsquo;","'")]:
        s = s.replace(ent, ch)
    return re.sub(r"\s+", " ", s).strip()


def parse_rss_first(xml):
    tm = re.search(r"<item[^>]*>[\s\S]*?<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<item[^>]*>[\s\S]*?<title[^>]*>(.*?)<\/title>", xml)
    lm = re.search(r"<item[^>]*>[\s\S]*?<link[^>]*>(.*?)<\/link>", xml, re.S)
    cm = re.search(r"<item[^>]*>[\s\S]*?<category[^>]*>(.*?)<\/category>", xml)
    if not lm:
        return None
    title = strip_html((tm.group(1) or tm.group(2)) if tm else "")
    link = (lm.group(1) or "").strip().replace("<![CDATA[","").replace("]]>","").strip()
    return {"title": title, "url": link, "category": strip_html(cm.group(1) if cm else "")}


def scrape_herald(html):
    m = re.search(r'id="articleText"[^>]*>([\s\S]*?)<\/article>', html)
    if not m:
        return ""
    paras = [strip_html(p.group(1)) for p in re.finditer(r"<p[^>]*>([\s\S]*?)<\/p>", m.group(1))]
    return "\n".join(p for p in paras if len(p) > 40)


def split_sentences(text, max_n=25):
    sents = re.split(r"(?<=[.!?])\s+(?=[A-Z\"'])", text.replace("\n", " "))
    return [s.strip() for s in sents if len(s.strip()) > 20][:max_n]


def firebase_get(path):
    url = f"{DB_URL}/{path}.json"
    with urllib.request.urlopen(url, timeout=8) as r:
        return json.loads(r.read())


def firebase_put(path, data):
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{DB_URL}/{path}.json",
        data=payload, method="PUT",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def translate_and_analyze(client, sentences):
    BATCH = 8
    results = []
    for i in range(0, len(sentences), BATCH):
        batch = sentences[i:i+BATCH]
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
            results.extend({"ko": str(r.get("ko","")), "analysis": str(r.get("analysis",""))} for r in parsed)
        else:
            results.extend({"ko": "", "analysis": ""} for _ in batch)
    return results


def process_herald(client):
    # 이미 오늘 데이터 있으면 스킵
    existing = firebase_get(f"english/korea_herald/{TODAY}")
    if existing and isinstance(existing, list) and existing[0].get("sentences"):
        print(f"[Herald] 이미 완료됨: {existing[0].get('title','')[:50]}")
        return

    print("[Herald] RSS 가져오는 중...")
    rss = fetch("https://www.koreaherald.com/rss/newsAll")
    if not rss:
        print("[Herald] RSS 실패")
        return

    article = parse_rss_first(rss)
    if not article or not article.get("url"):
        print("[Herald] 기사 파싱 실패")
        return

    print(f"[Herald] 스크래핑: {article['title'][:60]}")
    html = fetch(article["url"])
    body = scrape_herald(html) if html else ""
    if not body:
        print("[Herald] 본문 없음")
        return

    sents = split_sentences(body)
    print(f"[Herald] {len(sents)}개 문장 번역 중...")
    analyzed = translate_and_analyze(client, sents)
    article["sentences"] = [{"en": s, **analyzed[i]} for i, s in enumerate(sents)]

    status = firebase_put(f"english/korea_herald/{TODAY}", [article])
    print(f"[Herald] Firebase PUT {status}: {article['title'][:50]}")


if __name__ == "__main__":
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[!] ANTHROPIC_API_KEY 없음")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    process_herald(client)
    print("완료")
