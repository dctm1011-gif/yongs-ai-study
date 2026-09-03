"""
KBS 뉴스 로컬 스크래퍼
- KBS는 Netlify에서 본문 스크래핑 실패 시 이 스크립트로 보완
- Firebase: english/korea_news/{YYYY-MM-DD}
"""
import re, json, os, sys, urllib.request
from datetime import date
from pathlib import Path

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
    entities = [
        ("&amp;", "&"), ("&nbsp;", " "), ("&#39;", "'"), ("&#039;", "'"),
        ("&quot;", '"'), ("&lt;", "<"), ("&gt;", ">"),
        ("&ldquo;", '"'), ("&rdquo;", '"'), ("&lsquo;", "'"), ("&rsquo;", "'"),
    ]
    for ent, ch in entities:
        s = s.replace(ent, ch)
    return re.sub(r"\s+", " ", s).strip()


def parse_rss_first(xml):
    tm = re.search(r"<item[^>]*>[\s\S]*?<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<item[^>]*>[\s\S]*?<title[^>]*>(.*?)<\/title>", xml)
    lm = re.search(r"<item[^>]*>[\s\S]*?<link[^>]*>(.*?)<\/link>", xml, re.S)
    cm = re.search(r"<item[^>]*>[\s\S]*?<category[^>]*>(.*?)<\/category>", xml)
    if not lm:
        return None
    title = strip_html((tm.group(1) or tm.group(2)) if tm else "")
    link = (lm.group(1) or "").strip().replace("<![CDATA[", "").replace("]]>", "").strip()
    return {"title": title, "url": link, "category": strip_html(cm.group(1) if cm else "")}


def scrape_kbs(html):
    m = re.search(r'<p[^>]*class="cap[^"]*"[^>]*>[\s\S]*?<\/p>\s*([\s\S]*?)\s*<div', html)
    if not m:
        return ""
    body = m.group(1)
    paras = re.split(r'<br\s*\/?>\s*<br\s*\/?>', body, flags=re.I)
    result = []
    for p in paras:
        t = re.sub(r"<[^>]+>", "", p)
        for ent, ch in [("&#039;", "'"), ("&quot;", '"'), ("&amp;", "&"), ("&nbsp;", " ")]:
            t = t.replace(ent, ch)
        t = re.sub(r"\s+", " ", t).strip()
        if len(t) > 30:
            result.append(t)
    return "\n".join(result)


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
        f"{DB_URL}/{path}.json", data=payload, method="PUT",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def translate_and_analyze(client, sentences):
    BATCH = 8
    results = []
    for i in range(0, len(sentences), BATCH):
        batch = sentences[i:i + BATCH]
        prompt = (
            "You are a cheerful 20-year-old Korean woman explaining English sentences to your boyfriend in Korean. "
            "Use emojis naturally, be warm and casual, and make it fun to read. "
            "Write the analysis as one flowing paragraph.\n\n"
            "For each English sentence below, return a JSON array where each element has:\n"
            '- "ko": natural Korean translation\n'
            '- "analysis": a friendly Korean explanation covering structure, key words, casual alternatives, useful tips\n\n'
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


def process_kbs(client):
    existing = firebase_get(f"english/korea_news/{TODAY}")
    if existing and isinstance(existing, list) and existing[0].get("sentences"):
        print(f"[KBS] 이미 완료됨: {existing[0].get('title', '')[:50]}")
        return

    print("[KBS] RSS 가져오는 중...")
    rss = fetch("https://world.kbs.co.kr/rss/rss_news.htm?lang=e")
    if not rss:
        print("[KBS] RSS 실패")
        return

    article = parse_rss_first(rss)
    if not article or not article.get("url"):
        print("[KBS] 기사 파싱 실패")
        return

    print(f"[KBS] 기사: {article['title'][:60]}")
    html = fetch(article["url"], {"X-PJAX": "true", "X-Requested-With": "XMLHttpRequest"})
    body = scrape_kbs(html) if html else ""

    if not body:
        print("[KBS] PJAX 헤더로 본문 없음 — 일반 요청으로 재시도")
        html = fetch(article["url"])
        body = scrape_kbs(html) if html else ""

    if not body:
        print(f"[KBS] 본문 없음 (html={len(html) if html else 0}자)")
        if html:
            print("[KBS] HTML 샘플:", html[:600])
        return

    sents = split_sentences(body)
    print(f"[KBS] {len(sents)}개 문장 번역 중...")
    analyzed = translate_and_analyze(client, sents)
    article["sentences"] = [{"en": s, **analyzed[i]} for i, s in enumerate(sents)]

    status = firebase_put(f"english/korea_news/{TODAY}", [article])
    print(f"[KBS] Firebase PUT {status}: {article['title'][:50]} ({len(sents)}문장)")


if __name__ == "__main__":
    load_env()
    import anthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[!] ANTHROPIC_API_KEY 없음")
        sys.exit(1)
    client = anthropic.Anthropic(api_key=api_key)
    process_kbs(client)
    print("완료")
