"""
VOA Learning English 기사 → 문장별 번역+분석 → Firebase 저장
- Words and Their Stories / Everyday Grammar / Science in the News 등 504개 학습 기사 순환
- Task Scheduler: 매일 05:45 KST
- Firebase: english/podcasts/voa/{YYYY-MM-DD}
"""
import re, json, os, sys, gzip, io, urllib.request
from datetime import date, timedelta
from pathlib import Path
import anthropic

TODAY = date.today().isoformat()
DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"

SITEMAP_URLS = [
    "https://learningenglish.voanews.com/sitemap_428_1.xml.gz",
    "https://learningenglish.voanews.com/sitemap_428_2.xml.gz",
    "https://learningenglish.voanews.com/sitemap_428_3.xml.gz",
]
LEARNING_SLUGS = [
    "words-and-their-stories", "everyday-grammar", "science-in-the-news",
    "american-stories", "news-words", "health-lifestyle",
    "technology-report", "education-report",
]
CACHE_FILE = Path(__file__).parent / "voa_articles.json"
CACHE_MAX_AGE_DAYS = 30


def load_env():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def fetch(url, gz=False, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
        if gz:
            with gzip.open(io.BytesIO(raw)) as f:
                return f.read().decode("utf-8", errors="replace")
        return raw.decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  fetch 실패 ({url[:60]}): {e}")
        return None


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s)
    for ent, ch in [("&amp;", "&"), ("&nbsp;", " "), ("&#39;", "'"), ("&#x27;", "'"),
                    ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'),
                    ("&ldquo;", '"'), ("&rdquo;", '"'), ("&lsquo;", "'"), ("&rsquo;", "'")]:
        s = s.replace(ent, ch)
    return re.sub(r"\s+", " ", s).strip()


def build_article_cache():
    """사이트맵 GZ에서 학습 기사 URL 목록 빌드 후 로컬 캐시."""
    articles = []
    for sitemap_url in SITEMAP_URLS:
        print(f"  사이트맵 다운로드: {sitemap_url}")
        xml = fetch(sitemap_url, gz=True)
        if not xml:
            continue
        locs = re.findall(r"<loc>(.*?)</loc>", xml)
        dates = re.findall(r"<lastmod>(.*?)</lastmod>", xml)
        for loc, dt in zip(locs, dates):
            if any(slug in loc for slug in LEARNING_SLUGS):
                articles.append({"url": loc, "lastmod": dt[:10]})
    print(f"  총 {len(articles)}개 학습 기사 발견")
    cache = {"built": TODAY, "articles": articles}
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return articles


def get_article_list():
    """캐시에서 기사 목록 반환. 30일 이상 오래됐으면 재빌드."""
    if CACHE_FILE.exists():
        cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        built = date.fromisoformat(cache.get("built", "2000-01-01"))
        if (date.today() - built).days < CACHE_MAX_AGE_DAYS:
            return cache["articles"]
    print("[VOA] 기사 목록 캐시 재빌드...")
    return build_article_cache()


def firebase_get(path):
    try:
        with urllib.request.urlopen(f"{DB_URL}/{path}.json", timeout=10) as r:
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


def get_recently_used_urls(days=60):
    """최근 N일 이내 사용된 episode_url 목록."""
    used = set()
    for i in range(days):
        d = (date.today() - timedelta(days=i)).isoformat()
        data = firebase_get(f"english/podcasts/voa/{d}")
        if data and data.get("episode_url"):
            used.add(data["episode_url"])
    return used


def pick_article(articles, used_urls):
    """사용되지 않은 기사 선택 (가장 오래된 lastmod 우선)."""
    unused = [a for a in articles if a["url"] not in used_urls]
    if not unused:
        print("[VOA] 모든 기사 사용됨 — 전체 목록에서 랜덤 선택")
        unused = articles
    # lastmod 내림차순 (최신 기사 우선)
    unused.sort(key=lambda a: a.get("lastmod", ""), reverse=True)
    return unused[0]


def extract_article(html):
    """기사 HTML에서 오디오 URL + 본문 텍스트 추출."""
    # 오디오 URL (voa-audio 도메인, _hq 없는 것 선호)
    audio_urls = re.findall(r'"(https?://voa-audio[^"]+\.mp3[^"]*)"', html)
    audio_url = ""
    for u in audio_urls:
        if "_hq" not in u and "download" not in u:
            audio_url = u
            break
    if not audio_url and audio_urls:
        audio_url = audio_urls[0].split("?")[0]  # ?download=1 제거

    # 제목
    title_m = re.search(r"<title[^>]*>(.*?)</title>", html)
    title = strip_html(title_m.group(1) if title_m else "").replace(" - VOA Learning English", "").strip()

    # 본문: 모든 <p> 태그에서 추출 (wsw 클래스 내 중첩 div가 regex를 끊으므로 전체 HTML 사용)
    paras = re.findall(r"<p[^>]*>([\s\S]*?)</p>", html, re.I)
    skip_patterns = [
        "media source", "No media source", "Download audio", "Listen to this story",
        "Click here", "Sign up", "VOA Learning English program", "This is .*VOA",
        "VOA's ", "All materials", "follow us on", "subscribe to",
    ]
    texts = []
    for p in paras:
        t = strip_html(p)
        if len(t) < 30:
            continue
        if any(pat.lower() in t.lower() for pat in skip_patterns):
            continue
        texts.append(t)

    return {"title": title, "audio_url": audio_url, "paragraphs": texts}


def check_yesterday_listening_done() -> bool:
    """어제 english_news_listening 완료 여부 확인. 환경변수 없으면 True 반환(스킵 안 함)."""
    uid = os.environ.get("FIREBASE_USER_UID")
    secret = os.environ.get("FIREBASE_DATABASE_SECRET")
    if not uid or not secret:
        return True
    yesterday = str(date.today() - timedelta(days=1))
    url = f"{DB_URL}/users/{uid}/completion/english_listening_voa/{yesterday}.json?auth={secret}"
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            val = json.loads(r.read())
        return bool(val)
    except Exception as e:
        print(f"[VOA] 완료 확인 오류: {e} → 실행 허용")
        return True


def split_sentences(paragraphs):
    combined = " ".join(paragraphs)
    sents = re.split(r'(?<=[.!?])\s+(?=[A-Z])', combined)
    return [s.strip() for s in sents if len(s.strip()) > 20]


def translate_and_analyze(client, sentences):
    BATCH = 8
    results = []
    for i in range(0, len(sentences), BATCH):
        batch = sentences[i:i + BATCH]
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
            try:
                parsed = json.loads(m.group(0))
                results.extend(
                    {"ko": str(r.get("ko", "")), "analysis": str(r.get("analysis", ""))}
                    for r in parsed
                )
            except (json.JSONDecodeError, TypeError) as e:
                print(f"  [!] JSON 파싱 실패 (배치 {i//BATCH+1}): {e} — 빈값으로 대체")
                results.extend({"ko": "", "analysis": ""} for _ in batch)
        else:
            results.extend({"ko": "", "analysis": ""} for _ in batch)
    return results


def main():
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[!] ANTHROPIC_API_KEY 없음"); sys.exit(1)

    # 어제 리스닝 미완료 시 오늘 업데이트 스킵
    if not check_yesterday_listening_done():
        yesterday = str(date.today() - timedelta(days=1))
        print(f"[VOA] 어제({yesterday}) 리스닝 미완료 → 오늘 업데이트 스킵")
        return

    # 이미 오늘 데이터 있으면 스킵
    existing = firebase_get(f"english/podcasts/voa/{TODAY}")
    if existing and existing.get("sentences"):
        print(f"[VOA] 이미 완료됨: {existing.get('title', '')[:50]}")
        return

    # 기사 목록 로드
    articles = get_article_list()
    if not articles:
        print("[VOA] 기사 목록 빈값"); sys.exit(1)

    # 최근 사용 목록 확인
    print("[VOA] 최근 사용 기사 확인 중...")
    used_urls = get_recently_used_urls(days=60)
    print(f"[VOA] 최근 60일 사용 기사 {len(used_urls)}개")

    # 기사 선택
    article = pick_article(articles, used_urls)
    article_url = article["url"]
    print(f"[VOA] 선택된 기사: {article_url}")

    # 기사 HTML 가져오기
    html = fetch(article_url)
    if not html:
        print("[VOA] 기사 fetch 실패"); sys.exit(1)

    extracted = extract_article(html)
    title = extracted["title"]
    audio_url = extracted["audio_url"]
    paragraphs = extracted["paragraphs"]

    print(f"[VOA] 제목: {title[:60]}")
    print(f"[VOA] 오디오: {audio_url[:60] if audio_url else '없음'}")
    print(f"[VOA] 본문 {len(paragraphs)}문단")

    if not paragraphs:
        print("[VOA] 본문 없음"); sys.exit(1)

    sents = split_sentences(paragraphs)
    print(f"[VOA] {len(sents)}개 문장 번역+분석 중...")

    client = anthropic.Anthropic(api_key=api_key)
    analyzed = translate_and_analyze(client, sents)

    sentences = [
        {"speaker": "", "en": sents[i], "ko": analyzed[i]["ko"], "analysis": analyzed[i]["analysis"]}
        for i in range(min(len(sents), len(analyzed)))
    ]

    data = {
        "source": "voa",
        "title": title,
        "audio_url": audio_url,
        "duration_sec": 0,
        "pub_date": article.get("lastmod", ""),
        "episode_url": article_url,
        "sentences": sentences,
    }

    status = firebase_put(f"english/podcasts/voa/{TODAY}", data)
    print(f"[VOA] Firebase PUT {status}: {len(sentences)}문장 저장")


if __name__ == "__main__":
    main()
