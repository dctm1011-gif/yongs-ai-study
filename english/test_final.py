"""VOA LE Words and Their Stories 실제 URL + BBC The English We Speak 검증"""
import urllib.request, re

def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        return f"ERROR: {e}"

def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s)
    for ent, ch in [("&amp;","&"),("&nbsp;"," "),("&#39;","'"),("&lt;","<"),("&gt;",">"),("&quot;",'"'),
                    ("&ldquo;",'"'),("&rdquo;",'"'),("&lsquo;","'"),("&rsquo;","'")]:
        s = s.replace(ent, ch)
    return re.sub(r"\s+", " ", s).strip()

# 1. VOA LE 실제 Words and Their Stories 기사
print("=== VOA Words and Their Stories 실제 URL ===")
voa_wats_urls = [
    "https://learningenglish.voanews.com/a/words-and-their-stories-dont-look-a-gift-horse-in-the-mouth/4168731.html",
    "https://learningenglish.voanews.com/a/the-story-of-jack-frost-/4699263.html",
    "https://learningenglish.voanews.com/a/immigrants-learn-to-lose-their-accents/3213118.html",
]
for url in voa_wats_urls:
    art = fetch(url)
    if art.startswith("ERROR"):
        print(f"  오류: {art[:60]}")
        continue
    title_m = re.search(r"<title[^>]*>(.*?)</title>", art)
    title = strip_html(title_m.group(1) if title_m else "N/A")
    audio = re.search(r'"(https?://[^"]+\.mp3[^"]*)"', art)
    paras = re.findall(r"<p[^>]*>([\s\S]*?)</p>", art, re.I)
    texts = [strip_html(p) for p in paras if len(strip_html(p)) > 30]
    print(f"\n제목: {title[:70]}")
    print(f"오디오: {audio.group(1)[:70] if audio else 'None'}")
    print(f"본문: {len(texts)}문단, 크기: {len(art)}자")
    for t in texts[:4]:
        print(f"  {t[:110]}")

# 2. BBC The English We Speak RSS 상세 분석
print("\n\n=== BBC The English We Speak ===")
xml = fetch("https://podcasts.files.bbci.co.uk/p02pc9zn.rss")
if xml.startswith("ERROR"):
    print(xml)
else:
    items = re.findall(r"<item>([\s\S]*?)</item>", xml)
    print(f"총 {len(items)}개 아이템")
    for item in items[:3]:
        title_m = re.search(r"<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)</title>", item)
        link_m = re.search(r"<link>(.*?)</link>", item)
        date_m = re.search(r"<pubDate>(.*?)</pubDate>", item)
        enc_m = re.search(r'<enclosure[^>]+url=["\']([^"\']+)["\']', item)
        desc_m = re.search(r"<description><!\[CDATA\[([\s\S]*?)\]\]>", item)
        guid_m = re.search(r"<guid[^>]*>(.*?)</guid>", item)

        title = strip_html((title_m.group(1) or title_m.group(2)) if title_m else "N/A")
        link = link_m.group(1).strip() if link_m else ""
        guid = guid_m.group(1).strip() if guid_m else ""
        desc = strip_html(desc_m.group(1) if desc_m else "")

        print(f"\n제목: {title}")
        print(f"날짜: {date_m.group(1) if date_m else 'N/A'}")
        print(f"링크: {link or guid}")
        if enc_m:
            print(f"오디오: {enc_m.group(1)[:80]}")
        print(f"설명: {desc[:200]}")

        # 에피소드 페이지에서 트랜스크립트 찾기
        episode_url = link or guid
        if episode_url and episode_url.startswith("http"):
            art = fetch(episode_url)
            if not art.startswith("ERROR"):
                # BBC transcript
                for cls in ["text-content", "body-text", "gel-body-copy", "article__body"]:
                    m = re.search(rf'class="[^"]*{cls}[^"]*"[^>]*>([\s\S]*?)</div>', art, re.I)
                    if m:
                        paras = re.findall(r"<p[^>]*>([\s\S]*?)</p>", m.group(1), re.I)
                        texts = [strip_html(p) for p in paras if len(strip_html(p)) > 30]
                        if texts:
                            print(f"  트랜스크립트({cls}): {len(texts)}문단")
                            for t in texts[:2]:
                                print(f"    {t[:110]}")
                            break
                # BBC Learning English 특정 패턴
                script_data = re.search(r'"transcript":\s*"([^"]{100,})"', art)
                if script_data:
                    print(f"  JSON 트랜스크립트: {script_data.group(1)[:150]}")
            else:
                print(f"  에피소드 페이지: {art[:60]}")
        break  # 첫 아이템만 자세히
