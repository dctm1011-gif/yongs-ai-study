"""
세션 JSON + Obsidian 논문 .md 파일을 읽어 모바일 친화적 index.html 생성.
OneDrive에 저장되므로 핸드폰에서 onedrive.live.com 으로 접근 가능.

⚠️  경고: 이 스크립트를 실행하면 history/index.html 전체를 재생성합니다.
    현재 index.html에 적용된 다음 커스텀 기능이 모두 초기화됩니다:
      - 서버 동기화 (_loadFromServer, _syncToServer, /api/prefs)
      - BFCache 대응 (pageshow 이벤트 핸들러)
      - 읽음 동기화 (_applyColReadBadges, toggleColRead 동기화)
      - 논문 정리 읽음 배지 CSS (.col-rdbadge.read)
      - 기기간 좋아요/삭제 동기화
    대신 inject_papers.py를 사용하세요:
      python history/inject_papers.py 20   # 새 논문 20개 추가
      python history/inject_papers.py 0    # 논문 정리만 동기화
"""
import base64
import io
import json
import math
import re
from datetime import date
from pathlib import Path

COLUMN_NOTES_FILE = Path(__file__).parent.parent / "paper_search" / "column_notes.json"


def load_column_notes() -> dict:
    if COLUMN_NOTES_FILE.exists():
        with open(COLUMN_NOTES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

ROOT = Path(__file__).parent.parent
VAULT_PAPERS = Path(r"C:\Users\dctm1\OneDrive\문서\Obsidian Vault\Papers")
ATTACHMENTS = VAULT_PAPERS / "attachments"
SESSIONS_DIR = Path(__file__).parent / "sessions"
OUTPUT = Path(__file__).parent / "index.html"
PREFS_FILE = ROOT / "paper_search" / "user_prefs.json"

TODAY = str(date.today())


# ── 환경설정 ──────────────────────────────────────────────

def load_prefs() -> dict:
    if PREFS_FILE.exists():
        with open(PREFS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"liked": [], "deleted": []}


# ── 추천 점수 ──────────────────────────────────────────────

def compute_rec_score(tags: list, citation_str: str, pid: str,
                      liked_pids: set, liked_tags: set) -> int:
    score = 0
    try:
        n = int(float(str(citation_str or "0").strip()))
        if n > 0:
            score += min(40, int(math.log10(n + 1) * 14))
    except (ValueError, TypeError):
        pass
    if pid in liked_pids:
        score += 30
    overlap = len(set(tags) & liked_tags)
    score += min(30, overlap * 10)
    return min(100, score)


def _rec_badge(score: int) -> str:
    if score >= 75:
        return '<span class="rec-badge rec-hot">추천 ★★★</span>'
    if score >= 55:
        return '<span class="rec-badge rec-good">추천 ★★</span>'
    if score >= 35:
        return '<span class="rec-badge rec-ok">추천 ★</span>'
    return ""


# ── 논문 파싱 ──────────────────────────────────────────────

def load_papers() -> list[dict]:
    papers = []
    for md in sorted(VAULT_PAPERS.glob("*.md"), reverse=True):
        p = _parse_md(md)
        if p:
            papers.append(p)
    return papers


def _parse_md(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")

    fm = _parse_frontmatter(text)
    if not fm.get("title"):
        return None

    abstract_ko = _section(text, "초록 (한국어)")
    tech_text   = _section(text, "주요 기술 분석")
    figs        = re.findall(r"!\[\[attachments/(.+?)\]\]", text)
    captions    = re.findall(r"!\[\[attachments/.+?\]\]\n> (.+)", text)

    cover_b64 = _first_figure_b64(figs)

    tags = re.findall(r'- "(.+?)"', fm.get("_tags_raw", ""))

    tech_lines = [
        re.sub(r"\*+", "", l).lstrip("-# ").rstrip(":").strip()
        for l in tech_text.splitlines()
        if l.strip() and not l.strip().startswith("*초록에서") and l.strip() != "---"
    ]
    tech_lines = [l for l in tech_lines if l]

    return {
        "title":        fm.get("title", ""),
        "authors":      fm.get("authors", ""),
        "year":         fm.get("year", ""),
        "venue":        fm.get("venue", ""),
        "citation":     fm.get("citation_count", ""),
        "date_added":   fm.get("date_added", ""),
        "url":          fm.get("url", ""),
        "pdf":          fm.get("pdf", ""),
        "tags":         tags,
        "abstract_ko":  abstract_ko,
        "tech_lines":   tech_lines,
        "fig_count":    len(figs),
        "cover_b64":    cover_b64,
        "captions":     captions[:5],
    }


def _parse_frontmatter(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return {}
    fm: dict = {}
    tags_lines = []
    in_tags = False
    for line in m.group(1).splitlines():
        if line.startswith("tags:"):
            in_tags = True
            continue
        if in_tags:
            if line.startswith("  -"):
                tags_lines.append(line)
                continue
            else:
                in_tags = False
        if ":" in line and not line.startswith(" "):
            k, _, v = line.partition(":")
            fm[k.strip()] = v.strip().strip('"')
    fm["_tags_raw"] = "\n".join(tags_lines)
    return fm


def _section(text: str, heading: str) -> str:
    m = re.search(rf"## {re.escape(heading)}\n\n(.+?)(?=\n---|\n## |\Z)", text, re.DOTALL)
    return m.group(1).strip() if m else ""


def _first_figure_b64(figs: list[str]) -> str | None:
    for name in figs:
        path = ATTACHMENTS / name
        if not path.exists():
            continue
        if path.stat().st_size > 3_000_000:
            continue
        try:
            if HAS_PIL:
                img = Image.open(path)
                img.thumbnail((800, 600))
                buf = io.BytesIO()
                fmt = "JPEG" if name.lower().endswith((".jpg", ".jpeg")) else "PNG"
                img.save(buf, format=fmt, optimize=True, quality=75)
                data = buf.getvalue()
            else:
                data = path.read_bytes()
            mime = "image/jpeg" if name.lower().endswith((".jpg", ".jpeg")) else "image/png"
            return f"data:{mime};base64,{base64.b64encode(data).decode()}"
        except Exception:
            continue
    return None


def _citation_badge(count_str: str) -> str:
    s = str(count_str).strip()
    if not s or s in ("", "null", "None"):
        return '<span class="cite-badge cite-none">미정</span>'
    try:
        n = int(float(s))
    except ValueError:
        return '<span class="cite-badge cite-none">미정</span>'
    if n <= 20:
        return f'<span class="cite-badge cite-new" title="인용 {n}회">신규</span>'
    if n <= 100:
        return f'<span class="cite-badge cite-watch" title="인용 {n}회">주목 ★</span>'
    if n <= 500:
        return f'<span class="cite-badge cite-pop" title="인용 {n}회">인기 ★★</span>'
    if n <= 2000:
        return f'<span class="cite-badge cite-key" title="인용 {n}회">핵심 ★★★</span>'
    return f'<span class="cite-badge cite-must" title="인용 {n}회">필독 ★★★★</span>'


def _paper_id(title: str) -> str:
    return re.sub(r"[^a-zA-Z0-9가-힣]", "_", title)[:40]


# ── 세션 파싱 ──────────────────────────────────────────────

def load_sessions() -> list[dict]:
    sessions = []
    for f in sorted(SESSIONS_DIR.glob("*.json"), reverse=True):
        with open(f, encoding="utf-8") as fp:
            sessions.append(json.load(fp))
    return sessions


# ── HTML 렌더 ──────────────────────────────────────────────

def render_paper_card(p: dict, idx: int) -> str:
    tags_html = "".join(f'<span class="tag">{t}</span>' for t in p["tags"])
    abstract  = p["abstract_ko"] or "초록 없음"
    if len(abstract) > 400:
        short   = abstract[:400]
        rest    = abstract[400:]
        abs_html = (
            f'<p class="abstract" id="abs{idx}">'
            f'<span class="abs-short">{short}</span>'
            f'<span class="abs-rest" style="display:none">{rest}</span>'
            f' <a class="expand-btn" onclick="toggleAbs({idx})">더 보기 ▾</a>'
            f'</p>'
        )
    else:
        abs_html = f'<p class="abstract">{abstract}</p>'

    cover_html = ""
    if p["cover_b64"]:
        cap = p["captions"][0] if p["captions"] else "Figure 1"
        cover_html = (
            f'<div class="cover-wrap">'
            f'<img class="cover-img" src="{p["cover_b64"]}" alt="Figure 1" loading="lazy">'
            f'<div class="cover-cap">{cap}</div>'
            f'</div>'
        )

    LABELS = ("공정 기술", "핵심 회로", "성능 지표")
    tech_items = ""
    for line in p["tech_lines"]:
        if any(line.startswith(lb) for lb in LABELS):
            tech_items += f'<div class="tech-label">{line}</div>'
        elif line:
            tech_items += f'<div class="tech-item">{line}</div>'

    tech_html = f'<div class="tech-block">{tech_items}</div>' if tech_items else ""

    fig_badge  = f'<span class="fig-badge">그림 {p["fig_count"]}개</span>' if p["fig_count"] else ""
    cite_badge = _citation_badge(p["citation"])
    rec_badge  = _rec_badge(p.get("rec_score", 0))

    cite_num = ""
    s = str(p["citation"]).strip()
    if s and s not in ("", "null", "None"):
        try:
            cite_num = f'<span class="meta-item">인용 {int(float(s)):,}회</span>'
        except ValueError:
            pass

    links_html = ""
    if p["url"]:
        links_html += f'<a class="link-btn" href="{p["url"]}" target="_blank">원문</a>'
    if p["pdf"]:
        links_html += f'<a class="link-btn" href="{p["pdf"]}" target="_blank">PDF</a>'

    tech_summary   = " / ".join(p["tech_lines"][:5]) if p["tech_lines"] else ""
    abstract_short = (p["abstract_ko"] or "")[:300].replace("'", "\\'").replace("\n", " ")
    title_esc      = p["title"].replace("'", "\\'")
    pid            = p.get("pid") or _paper_id(p["title"])
    score          = p.get("rec_score", 0)

    return f"""
<div class="paper-card" data-tags='{json.dumps(p["tags"])}' data-pid="{pid}" data-score="{score}">
  {cover_html}
  <div class="paper-body">
    <div class="paper-meta">
      <span class="venue">{p["venue"]} {p["year"]}</span>
      {cite_badge}
      {cite_num}
      {rec_badge}
      {fig_badge}
    </div>
    <h3 class="paper-title">{p["title"]}</h3>
    <div class="tags-row">{tags_html}</div>
    {abs_html}
    {tech_html}
    <div class="paper-links">
      {links_html}
      <button class="link-btn ask-btn" onclick="askAboutPaper('{title_esc}', '{abstract_short}', '{tech_summary}')">💬 질문</button>
      <button class="link-btn like-btn" id="like-{pid}" onclick="toggleLike('{pid}')">♡ 좋아요</button>
      <button class="link-btn del-btn" id="del-{pid}" onclick="toggleDelete('{pid}')" title="목록에서 숨기기">🗑</button>
    </div>
  </div>
</div>"""


def render_session_card(s: dict, is_latest: bool) -> str:
    badge = '<span class="badge-new">최신</span>' if is_latest else ""
    achievements = "".join(f"<li>{a}</li>" for a in s.get("achievements", []))
    next_ideas   = "".join(f"<li>{n}</li>" for n in s.get("next_ideas", []))
    cmds         = "".join(f'<div class="cmd">{c}</div>' for c in s.get("how_to_use", []))
    tags         = "".join(f'<span class="tag">{t}</span>' for t in s.get("tags", []))

    next_block = f'<div class="next-block"><div class="sub-label">다음 아이디어</div><ul class="next-list">{next_ideas}</ul></div>' if next_ideas else ""
    cmd_block  = f'<div class="cmd-block">{cmds}</div>' if cmds else ""

    return f"""
<div class="session-card {'session-latest' if is_latest else ''}">
  <div class="session-date">{s["date"]} {badge}</div>
  <h3 class="session-title">{s["title"]}</h3>
  <div class="tags-row">{tags}</div>
  <p class="session-summary">{s.get("summary","")}</p>
  <div class="sub-label">주요 성과</div>
  <ul class="ach-list">{achievements}</ul>
  {cmd_block}
  {next_block}
</div>"""


def render_column_cards(papers: list[dict], liked_pids: set, column_notes: dict) -> str:
    liked_papers = [p for p in papers if p.get("pid") in liked_pids]
    if not liked_papers:
        return '<div style="padding:40px 0;text-align:center;color:#9b9a97;font-size:14px">좋아요 표시한 논문이 없습니다.</div>'

    cards = []
    for p in liked_papers:
        pid   = p.get("pid") or _paper_id(p["title"])
        notes = column_notes.get(pid, {})
        headline  = notes.get("headline", "")
        why_note  = notes.get("why_important", "")
        hbm_note  = notes.get("hbm_perspective", "")

        venue_year = f"{p['venue']} {p['year']}".strip()

        tags_html = "".join(f'<span class="col-tag">{t}</span>' for t in p["tags"][:5])

        tech_items = ""
        for line in (p.get("tech_lines") or [])[:8]:
            tech_items += f'<li>{line}</li>'
        tech_html = f'<ul class="col-tech-list">{tech_items}</ul>' if tech_items else ""

        links_html = ""
        if p.get("url"):
            links_html += f'<a class="col-link" href="{p["url"]}" target="_blank">원문 →</a>'
        if p.get("pdf"):
            links_html += f'<a class="col-link" href="{p["pdf"]}" target="_blank">PDF →</a>'

        abstract = (p.get("abstract_ko") or "").strip()
        abs_html = f'<p class="col-abstract">{abstract}</p>' if abstract else ""

        why_html  = f'<div class="col-section"><div class="col-sec-label">왜 이 논문인가</div><p class="col-sec-body">{why_note}</p></div>' if why_note else ""
        hbm_html  = f'<div class="col-section col-hbm"><div class="col-sec-label">HBM 설계자 관점</div><p class="col-sec-body">{hbm_note}</p></div>' if hbm_note else ""

        cards.append(f"""
<div class="col-card" data-quality="stored">
  <div class="col-header">
    <span class="col-venue">{venue_year}</span>
    <div class="col-links">{links_html}</div>
  </div>
  <h2 class="col-title">{p["title"]}</h2>
  {"<div class='col-headline'>" + headline + "</div>" if headline else ""}
  <div class="col-tags">{tags_html}</div>
  {abs_html}
  {tech_html}
  {why_html}
  {hbm_html}
</div>""")

    return "\n".join(cards)


def generate(papers: list[dict], sessions: list[dict]) -> str:
    # 환경설정 로드
    prefs = load_prefs()
    liked_pids   = set(prefs.get("liked", []))
    deleted_pids = set(prefs.get("deleted", [])) | liked_pids  # 좋아요도 숨김 처리

    # 좋아요 논문의 태그 수집 → 추천 점수 계산에 사용
    liked_tags: set[str] = set()
    for p in papers:
        pid = _paper_id(p["title"])
        if pid in liked_pids:
            liked_tags.update(p["tags"])

    # 각 논문에 pid·rec_score 추가
    for p in papers:
        pid = _paper_id(p["title"])
        p["pid"] = pid
        p["rec_score"] = compute_rec_score(
            p["tags"], p["citation"], pid, liked_pids, liked_tags
        )

    # 추천 점수 내림차순 정렬
    papers.sort(key=lambda p: p["rec_score"], reverse=True)

    column_notes  = load_column_notes()
    paper_cards   = "\n".join(render_paper_card(p, i) for i, p in enumerate(papers))
    session_cards = "\n".join(render_session_card(s, i == 0) for i, s in enumerate(sessions))
    column_cards  = render_column_cards(papers, liked_pids, column_notes)

    all_tags = sorted({t for p in papers for t in p["tags"]})
    filter_btns = '<button class="filter-btn active" onclick="filterTag(\'all\',this)">전체</button>'
    filter_btns += "".join(
        f'<button class="filter-btn" onclick="filterTag(\'{t}\',this)">{t}</button>'
        for t in all_tags
    )

    # JS에 임베드할 환경설정 (localStorage 초기값)
    liked_js   = json.dumps(list(liked_pids))
    deleted_js = json.dumps(list(deleted_pids))

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>논문정리 · Yong's AI Study</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}}
body{{background:#fff;color:#37352f;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;padding-bottom:80px;font-size:15px}}

/* ── 상단 바 ── */
.top-bar{{background:#fff;border-bottom:1px solid #e9e9e7;padding:10px 16px;position:sticky;top:0;z-index:200}}
.breadcrumb{{font-size:12px;color:#9b9a97;margin-bottom:2px}}
.breadcrumb a{{color:#9b9a97;text-decoration:none}}
.breadcrumb a:hover{{color:#37352f}}
.top-row{{display:flex;align-items:center;justify-content:space-between;gap:8px}}
.top-title{{font-size:16px;font-weight:700;color:#37352f}}
.top-actions{{display:flex;gap:6px;align-items:center}}
.updated-pill{{font-size:11px;color:#9b9a97;background:#f1f0ef;padding:3px 10px;border-radius:4px}}
.sync-btn{{font-size:11px;color:#2383e2;background:#eef3fd;border:1px solid #c5d8f8;padding:3px 10px;border-radius:4px;cursor:pointer;font-weight:600}}
.sync-btn:hover{{background:#ddeafb}}

/* ── 탭 ── */
.tab-bar{{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e9e9e7;display:flex;z-index:200}}
.tab-btn{{flex:1;padding:10px 0 8px;font-size:11px;color:#9b9a97;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;transition:color .15s}}
.tab-btn.active{{color:#2383e2}}
.tab-icon{{font-size:18px}}

/* ── 페이지 ── */
.page{{display:none;padding:0 14px;max-width:680px;margin:0 auto}}
.page.active{{display:block}}

/* ── 통계 ── */
.stats-row{{display:flex;gap:8px;margin:14px 0}}
.stat-card{{flex:1;background:#f7f6f3;border-radius:6px;padding:10px 12px;border:1px solid #e9e9e7}}
.stat-num{{font-size:20px;font-weight:700;color:#37352f}}
.stat-label{{font-size:11px;color:#9b9a97;margin-top:1px}}

/* ── 필터 바 ── */
.filter-bar{{padding:10px 0;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}}
.filter-bar::-webkit-scrollbar{{display:none}}
.filter-btn{{white-space:nowrap;font-size:12px;padding:4px 12px;border-radius:4px;border:1px solid #e9e9e7;background:#fff;color:#6b6b6b;cursor:pointer;transition:all .15s}}
.filter-btn.active{{background:#eef3fd;color:#2383e2;border-color:#c5d8f8}}

/* ── 삭제된 논문 토글 ── */
.deleted-toggle{{font-size:12px;color:#9b9a97;text-align:center;padding:8px;cursor:pointer;text-decoration:underline;display:block;margin-bottom:8px}}

/* ── 논문 카드 ── */
.paper-card{{border:1px solid #e9e9e7;border-radius:8px;margin-bottom:12px;overflow:hidden;background:#fff;transition:box-shadow .15s}}
.paper-card:hover{{box-shadow:0 2px 8px rgba(0,0,0,.08)}}
.paper-card.deleted-card{{opacity:.5;border-style:dashed}}
.cover-wrap{{background:#f7f6f3;border-bottom:1px solid #e9e9e7}}
.cover-img{{width:100%;max-height:200px;object-fit:contain;display:block}}
.cover-cap{{font-size:11px;color:#9b9a97;padding:5px 12px;background:#f7f6f3;font-style:italic}}
.paper-body{{padding:14px}}
.paper-meta{{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px}}
.venue{{font-size:11px;font-weight:600;color:#2383e2}}
.meta-item{{font-size:11px;color:#9b9a97;background:#f1f0ef;padding:1px 7px;border-radius:3px}}
.fig-badge{{font-size:11px;color:#6940a5;background:#f3f0ff;padding:1px 7px;border-radius:3px}}
.paper-title{{font-size:15px;font-weight:600;color:#37352f;line-height:1.4;margin-bottom:8px}}
.tags-row{{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}}
.tag{{font-size:10px;padding:1px 7px;border-radius:3px;background:#eef3fd;color:#2383e2;border:1px solid #c5d8f8}}
.abstract{{font-size:13px;color:#6b6b6b;line-height:1.7;margin-bottom:10px}}
.expand-btn{{color:#2383e2;cursor:pointer;font-size:12px;text-decoration:none;font-weight:500}}
.tech-block{{background:#f7f6f3;border-radius:6px;padding:10px 12px;margin-bottom:10px;font-size:12px;border-left:3px solid #e9e9e7}}
.tech-label{{color:#37352f;font-weight:600;margin-top:6px;margin-bottom:3px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9b9a97}}
.tech-label:first-child{{margin-top:0}}
.tech-item{{color:#37352f;padding-left:6px;margin-bottom:2px}}
.tech-item::before{{content:"· ";color:#9b9a97}}
.paper-links{{display:flex;gap:6px;flex-wrap:wrap}}
.link-btn{{font-size:12px;padding:5px 12px;border-radius:4px;background:#f1f0ef;color:#37352f;text-decoration:none;border:1px solid #e9e9e7;font-weight:500;transition:background .1s;cursor:pointer}}
.link-btn:hover{{background:#e9e9e7}}

/* ── 세션 카드 ── */
.section-header{{padding:14px 0 6px;font-size:11px;font-weight:600;color:#9b9a97;letter-spacing:1px;text-transform:uppercase}}
.session-card{{border:1px solid #e9e9e7;border-radius:8px;padding:16px;margin-bottom:12px;background:#fff}}
.session-latest{{border-left:3px solid #2383e2}}
.session-date{{font-size:11px;color:#9b9a97;font-weight:600;letter-spacing:.5px;margin-bottom:4px;display:flex;align-items:center;gap:8px}}
.badge-new{{background:#eef3fd;color:#2383e2;font-size:10px;padding:1px 7px;border-radius:3px;font-weight:600}}
.session-title{{font-size:16px;font-weight:600;margin-bottom:6px;color:#37352f;line-height:1.3}}
.session-summary{{font-size:13px;color:#6b6b6b;line-height:1.6;margin-bottom:12px}}
.sub-label{{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#9b9a97;margin-bottom:6px;margin-top:12px}}
.ach-list{{list-style:none;display:flex;flex-direction:column;gap:5px}}
.ach-list li{{font-size:13px;color:#37352f;padding-left:2px}}
.ach-list li::before{{content:"✓ ";color:#0f7b55;font-weight:700}}
.next-list{{list-style:none;display:flex;flex-direction:column;gap:5px}}
.next-list li{{font-size:13px;color:#37352f}}
.next-list li::before{{content:"→ ";color:#d9730d}}
.cmd-block{{background:#f7f6f3;border-radius:6px;padding:10px 12px;margin-top:8px;display:flex;flex-direction:column;gap:4px;border:1px solid #e9e9e7}}
.cmd{{font-family:"SF Mono","Fira Code",ui-monospace,monospace;font-size:11px;color:#37352f}}

/* ── 채팅 ── */
.ask-btn{{color:#2383e2;background:#eef3fd;border-color:#c5d8f8;font-weight:600}}
.ask-btn:hover{{background:#ddeafb}}
.fab{{position:fixed;bottom:72px;right:16px;width:48px;height:48px;border-radius:50%;background:#2383e2;color:#fff;font-size:20px;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(35,131,226,.4);display:flex;align-items:center;justify-content:center;z-index:300;transition:transform .15s}}
.fab:hover{{transform:scale(1.08)}}
.modal-backdrop{{display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:400;align-items:flex-end;justify-content:center}}
.modal-backdrop.open{{display:flex}}
.modal{{background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:680px;padding:20px 20px 32px;box-shadow:0 -4px 30px rgba(0,0,0,.12);animation:slideUp .2s ease}}
@keyframes slideUp{{from{{transform:translateY(60px);opacity:0}}to{{transform:none;opacity:1}}}}
.modal-handle{{width:36px;height:4px;background:#e9e9e7;border-radius:2px;margin:0 auto 16px}}
.modal-title{{font-size:15px;font-weight:700;color:#37352f;margin-bottom:3px}}
.modal-context{{font-size:11px;color:#2383e2;background:#eef3fd;padding:5px 10px;border-radius:4px;margin-bottom:10px;display:none}}
.modal-sub{{font-size:12px;color:#9b9a97;margin-bottom:12px}}
.modal textarea{{width:100%;border:1px solid #e9e9e7;border-radius:8px;padding:11px;font-size:14px;font-family:inherit;color:#37352f;resize:none;outline:none;line-height:1.5;min-height:90px;transition:border-color .15s}}
.modal textarea:focus{{border-color:#2383e2}}
.modal-actions{{display:flex;gap:8px;margin-top:10px}}
.btn-ask{{flex:1;background:#2383e2;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer}}
.btn-cancel{{background:#f1f0ef;color:#37352f;border:none;border-radius:8px;padding:12px 16px;font-size:14px;cursor:pointer}}
.toast{{display:none;position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:#37352f;color:#fff;font-size:13px;padding:10px 18px;border-radius:8px;z-index:500;white-space:nowrap}}

/* ── 인용 배지 ── */
.cite-badge{{font-size:10px;padding:2px 7px;border-radius:3px;font-weight:600}}
.cite-none{{background:#f1f0ef;color:#9b9a97}}
.cite-new{{background:#f1f0ef;color:#6b6b6b}}
.cite-watch{{background:#fef3c7;color:#92400e}}
.cite-pop{{background:#dbeafe;color:#1e40af}}
.cite-key{{background:#ede9fe;color:#5b21b6}}
.cite-must{{background:#fce7f3;color:#9d174d}}

/* ── 추천 배지 ── */
.rec-badge{{font-size:10px;padding:2px 7px;border-radius:3px;font-weight:600}}
.rec-hot{{background:#fff3e0;color:#c45100;border:1px solid #ffd8b2}}
.rec-good{{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}}
.rec-ok{{background:#f3f0ff;color:#5b21b6;border:1px solid #d4c5f9}}

/* ── 읽음/좋아요/삭제 버튼 ── */
.like-btn{{color:#9b9a97;background:#f1f0ef;border-color:#e9e9e7}}
.like-btn.liked{{color:#e03e3e;background:#fce8e8;border-color:#f9a8a8;font-weight:700}}
.del-btn{{color:#9b9a97;background:#f1f0ef;border-color:#e9e9e7;padding:5px 9px}}
.del-btn:hover{{background:#fce8e8;color:#e03e3e;border-color:#f9a8a8}}
.del-btn.deleted{{background:#fce8e8;color:#e03e3e;border-color:#f9a8a8}}

/* ── 환경설정 내보내기 모달 ── */
.prefs-json{{background:#f7f6f3;border:1px solid #e9e9e7;border-radius:6px;padding:12px;font-family:"SF Mono","Fira Code",ui-monospace,monospace;font-size:11px;color:#37352f;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;margin-bottom:10px}}
.prefs-guide{{font-size:12px;color:#9b9a97;line-height:1.6;margin-bottom:10px}}
.prefs-guide code{{background:#f1f0ef;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:11px}}

/* ── 주요 논문 요약 칼럼 ── */
.col-card{{border:1px solid #e9e9e7;border-radius:10px;margin-bottom:20px;background:#fff;overflow:hidden;border-left:4px solid #2383e2}}
.col-header{{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 0;flex-wrap:wrap;gap:6px}}
.col-venue{{font-size:11px;font-weight:600;color:#2383e2;background:#eef3fd;padding:2px 9px;border-radius:4px}}
.col-links{{display:flex;gap:6px}}
.col-link{{font-size:11px;color:#6b6b6b;background:#f1f0ef;border:1px solid #e9e9e7;padding:2px 10px;border-radius:4px;text-decoration:none;font-weight:500}}
.col-link:hover{{background:#e9e9e7}}
.col-title{{font-size:15px;font-weight:700;color:#37352f;line-height:1.4;padding:10px 16px 4px}}
.col-headline{{font-size:13px;font-weight:600;color:#0f7b55;background:#f0fdf4;border-left:3px solid #0f7b55;padding:8px 12px;margin:0 16px 8px;border-radius:0 4px 4px 0;line-height:1.5}}
.col-tags{{display:flex;flex-wrap:wrap;gap:4px;padding:0 16px 8px}}
.col-tag{{font-size:10px;padding:1px 7px;border-radius:3px;background:#eef3fd;color:#2383e2;border:1px solid #c5d8f8}}
.col-abstract{{font-size:13px;color:#6b6b6b;line-height:1.7;padding:0 16px 10px}}
.col-tech-list{{list-style:none;background:#f7f6f3;margin:0 16px 10px;border-radius:6px;padding:10px 12px;border-left:3px solid #e9e9e7}}
.col-tech-list li{{font-size:12px;color:#37352f;padding-left:4px;margin-bottom:3px;line-height:1.5}}
.col-tech-list li::before{{content:"· ";color:#9b9a97}}
.col-section{{padding:10px 16px;border-top:1px solid #f1f0ef}}
.col-hbm{{background:#fffbeb}}
.col-sec-label{{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#9b9a97;margin-bottom:6px}}
.col-sec-body{{font-size:13px;color:#37352f;line-height:1.75}}
.col-hbm .col-sec-label{{color:#b45309}}
.col-hbm .col-sec-body{{color:#37352f}}
</style>
</head>
<body>

<div class="top-bar">
  <div class="breadcrumb"><a href="../index.html">🔬 Yong's AI Study</a> / 📄 논문정리</div>
  <div class="top-row">
    <span class="top-title">📄 논문정리</span>
    <div class="top-actions">
      <button class="sync-btn" onclick="openPrefsModal()">📤 동기화</button>
      <span class="updated-pill">Updated {TODAY}</span>
    </div>
  </div>
</div>

<!-- 논문 탭 -->
<div id="page-papers" class="page active">
  <div class="stats-row">
    <div class="stat-card"><div class="stat-num">{len(papers)}</div><div class="stat-label">저장된 논문</div></div>
    <div class="stat-card"><div class="stat-num" id="stat-like">0</div><div class="stat-label">좋아요</div></div>
    <div class="stat-card"><div class="stat-num" id="stat-del">0</div><div class="stat-label">숨김</div></div>
  </div>
  <div class="filter-bar">{filter_btns}</div>
  <div id="paper-list">
{paper_cards}
  </div>
  <a class="deleted-toggle" onclick="toggleShowDeleted()" id="deleted-toggle-btn">🗑 숨긴 논문 보기</a>
</div>

<!-- 논문 정리 탭 -->
<div id="page-columns" class="page">
  <div class="section-header">좋아요 표시한 논문 · Claude 원문 분석</div>
{column_cards}
</div>

<!-- 히스토리 탭 -->
<div id="page-history" class="page">
  <div class="section-header">작업 세션 기록</div>
{session_cards}
</div>

<!-- Bottom Tab Bar -->
<div class="tab-bar">
  <button class="tab-btn active" onclick="switchTab('papers',this)">
    <span class="tab-icon">📄</span>논문 분류
  </button>
  <button class="tab-btn" onclick="switchTab('columns',this)">
    <span class="tab-icon">📝</span>논문 정리
  </button>
  <button class="tab-btn" onclick="switchTab('history',this)">
    <span class="tab-icon">📋</span>히스토리
  </button>
</div>

<script>
/* ── 임베드된 환경설정 (마지막 generate 시점) ── */
const EMBEDDED_PREFS = {{liked:{liked_js},deleted:{deleted_js}}};

function switchTab(name, btn) {{
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');
}}

function toggleAbs(idx) {{
  const rest = document.querySelector('#abs' + idx + ' .abs-rest');
  const btn  = document.querySelector('#abs' + idx + ' .expand-btn');
  if (rest.style.display === 'none') {{
    rest.style.display = 'inline';
    btn.textContent = '접기 ▴';
  }} else {{
    rest.style.display = 'none';
    btn.textContent = '더 보기 ▾';
  }}
}}

function filterTag(tag, btn) {{
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const dels = _getSet('paper_deletes');
  document.querySelectorAll('.paper-card').forEach(card => {{
    const pid = card.dataset.pid;
    const isDeleted = dels.has(pid) && !_showDeleted;
    if (isDeleted) {{ card.style.display = 'none'; return; }}
    if (tag === 'all') {{
      card.style.display = '';
    }} else {{
      const tags = JSON.parse(card.dataset.tags || '[]');
      card.style.display = tags.includes(tag) ? '' : 'none';
    }}
  }});
}}

/* ── localStorage 헬퍼 ── */
function _getSet(key) {{
  try {{ return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }}
  catch {{ return new Set(); }}
}}
function _saveSet(key, s) {{
  localStorage.setItem(key, JSON.stringify([...s]));
}}

/* ── 상태 초기화 (임베드값 → localStorage 시드) ── */
function _initFromEmbedded() {{
  const likes = _getSet('paper_likes');
  const dels  = _getSet('paper_deletes');
  if (likes.size === 0 && EMBEDDED_PREFS.liked.length > 0)
    _saveSet('paper_likes', new Set(EMBEDDED_PREFS.liked));
  if (dels.size === 0 && EMBEDDED_PREFS.deleted.length > 0)
    _saveSet('paper_deletes', new Set(EMBEDDED_PREFS.deleted));
}}

/* ── 통계 갱신 ── */
function _updateStats() {{
  const likes = _getSet('paper_likes');
  const dels  = _getSet('paper_deletes');
  document.getElementById('stat-like').textContent = likes.size;
  document.getElementById('stat-del').textContent  = dels.size;
}}

/* ── 전체 상태 적용 ── */
let _showDeleted = false;

function _applyState() {{
  const likes = _getSet('paper_likes');
  const dels  = _getSet('paper_deletes');
  document.querySelectorAll('.paper-card').forEach(card => {{
    const pid = card.dataset.pid;
    const isDeleted = dels.has(pid);

    // 숨김 처리
    if (isDeleted && !_showDeleted) {{
      card.style.display = 'none';
    }} else {{
      card.style.display = '';
      card.classList.toggle('deleted-card', isDeleted);
    }}

    // 좋아요 버튼
    const lb = document.getElementById('like-' + pid);
    if (lb) {{
      lb.className = 'link-btn like-btn' + (likes.has(pid) ? ' liked' : '');
      lb.textContent = likes.has(pid) ? '♥ 좋아요' : '♡ 좋아요';
    }}
    // 삭제 버튼
    const db = document.getElementById('del-' + pid);
    if (db) {{
      db.className = 'link-btn del-btn' + (isDeleted ? ' deleted' : '');
      db.title = isDeleted ? '숨김 해제' : '목록에서 숨기기';
    }}
  }});
  _updateStats();
  // 토글 버튼 텍스트
  const tb = document.getElementById('deleted-toggle-btn');
  if (tb) {{
    const n = dels.size;
    tb.textContent = n > 0
      ? (_showDeleted ? `🗑 숨긴 논문 숨기기 (${{n}}개)` : `🗑 숨긴 논문 보기 (${{n}}개)`)
      : '';
    tb.style.display = n > 0 ? 'block' : 'none';
  }}
}}

function _syncToServer() {{
  if (location.hostname.endsWith('.netlify.app') || location.protocol === 'file:') return;
  const prefs = {{
    liked:   [..._getSet('paper_likes')],
    deleted: [..._getSet('paper_deletes')],
    last_updated: new Date().toISOString().slice(0,10)
  }};
  fetch('/api/prefs', {{
    method: 'POST',
    headers: {{'Content-Type': 'application/json'}},
    body: JSON.stringify(prefs)
  }}).catch(() => {{}});
}}

function toggleLike(pid) {{
  const s = _getSet('paper_likes');
  if (s.has(pid)) {{ s.delete(pid); }} else {{ s.add(pid); }}
  _saveSet('paper_likes', s);
  _applyState();
  _syncToServer();
}}

function toggleDelete(pid) {{
  const s = _getSet('paper_deletes');
  if (s.has(pid)) {{ s.delete(pid); }} else {{ s.add(pid); }}
  _saveSet('paper_deletes', s);
  _applyState();
  _syncToServer();
  if (!s.has(pid)) return; // 숨김 해제 시 토스트 없음
  showToast('🗑 숨겼습니다 — 하단 버튼으로 다시 볼 수 있어요');
}}

function toggleShowDeleted() {{
  _showDeleted = !_showDeleted;
  _applyState();
}}

document.addEventListener('DOMContentLoaded', () => {{
  _initFromEmbedded();
  _applyState();
}});
</script>

<!-- 채팅 플로팅 버튼 -->
<button class="fab" onclick="openChat(null,null,null)" title="Claude에게 질문하기">💬</button>

<!-- 채팅 모달 -->
<div class="modal-backdrop" id="chatModal" onclick="closeOnBackdrop(event)">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title">💬 Claude에게 질문하기</div>
    <div class="modal-context" id="paperContext"></div>
    <div class="modal-sub">질문을 입력하면 클립보드에 복사 후 claude.ai가 열립니다. 붙여넣기(Ctrl+V)만 하세요.</div>
    <textarea id="chatInput" placeholder="예) 이 논문의 핵심 기여가 뭐야?&#10;예) TSV와 일반 인터커넥트의 차이점은?"></textarea>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeChat()">취소</button>
      <button class="btn-ask" onclick="askClaude()">Claude에게 보내기 →</button>
    </div>
  </div>
</div>

<!-- 환경설정 내보내기 모달 -->
<div class="modal-backdrop" id="prefsModal" onclick="closePrefsOnBackdrop(event)">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title">📤 환경설정 동기화</div>
    <div class="modal-sub" id="prefs-sub"></div>
    <div class="prefs-json" id="prefsJson"></div>
    <div class="prefs-guide" id="prefs-guide"></div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closePrefsModal()">닫기</button>
      <button class="btn-ask" onclick="copyPrefs()">JSON 복사</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
let _paperCtx = null;

function openChat(title, abstract, tech) {{
  _paperCtx = title ? {{title, abstract, tech}} : null;
  const ctx = document.getElementById('paperContext');
  if (_paperCtx) {{
    ctx.textContent = '📄 ' + title.substring(0, 60) + (title.length > 60 ? '...' : '');
    ctx.style.display = 'block';
    document.getElementById('chatInput').placeholder = '이 논문에 대해 질문하세요...\\n예) 핵심 기여가 뭐야? / 어떤 회로 기법을 썼어?';
  }} else {{
    ctx.style.display = 'none';
    document.getElementById('chatInput').placeholder = '예) HBM3 PHY 설계의 주요 과제는?\\n예) TSV와 일반 인터커넥트의 전기적 차이는?';
  }}
  document.getElementById('chatModal').classList.add('open');
  setTimeout(() => document.getElementById('chatInput').focus(), 200);
}}

function askAboutPaper(title, abstract, tech) {{
  openChat(title, abstract, tech);
}}

function closeChat() {{
  document.getElementById('chatModal').classList.remove('open');
}}

function closeOnBackdrop(e) {{
  if (e.target === document.getElementById('chatModal')) closeChat();
}}

function askClaude() {{
  const q = document.getElementById('chatInput').value.trim();
  if (!q) return;

  let prompt = '당신은 반도체 회로설계 및 HBM 메모리 전문가입니다.\\n\\n';

  if (_paperCtx) {{
    prompt += `[논문 컨텍스트]\\n제목: ${{_paperCtx.title}}\\n`;
    if (_paperCtx.abstract) prompt += `초록 요약: ${{_paperCtx.abstract}}\\n`;
    if (_paperCtx.tech) prompt += `주요 기술: ${{_paperCtx.tech}}\\n`;
    prompt += '\\n';
  }}

  prompt += `[질문]\\n${{q}}`;

  navigator.clipboard.writeText(prompt).then(() => {{
    showToast('✅ 클립보드 복사됨 — claude.ai에서 붙여넣기 하세요');
    window.open('https://claude.ai/new', '_blank');
    closeChat();
    document.getElementById('chatInput').value = '';
  }}).catch(() => {{
    window.open('https://claude.ai/new', '_blank');
    closeChat();
  }});
}}

/* ── 환경설정 모달 ── */
function openPrefsModal() {{
  const likes = [..._getSet('paper_likes')];
  const dels  = [..._getSet('paper_deletes')];
  const prefs = {{
    liked: likes,
    deleted: dels,
    last_updated: new Date().toISOString().slice(0,10)
  }};
  document.getElementById('prefsJson').textContent = JSON.stringify(prefs, null, 2);
  const isLocal = !location.hostname.endsWith('.netlify.app') && location.protocol !== 'file:';
  document.getElementById('prefs-sub').textContent = isLocal
    ? '✅ 로컬 서버 실행 중 — 좋아요/삭제 시 자동 저장됩니다.'
    : '좋아요/숨김 데이터를 Python 검색 시스템에 반영하려면:';
  document.getElementById('prefs-guide').innerHTML = isLocal
    ? '아래 JSON은 현재 저장된 상태입니다. <code>python history/generate.py</code> 로 HTML을 재생성하세요.'
    : '1. 위 JSON을 복사<br>2. 터미널에서 <code>python paper_search/sync_prefs.py</code> 실행<br>3. JSON 붙여넣기 후 Enter 두 번<br>4. <code>python history/generate.py</code> 로 HTML 재생성';
  document.getElementById('prefsModal').classList.add('open');
}}

function closePrefsModal() {{
  document.getElementById('prefsModal').classList.remove('open');
}}

function closePrefsOnBackdrop(e) {{
  if (e.target === document.getElementById('prefsModal')) closePrefsModal();
}}

function copyPrefs() {{
  const text = document.getElementById('prefsJson').textContent;
  navigator.clipboard.writeText(text).then(() => {{
    showToast('✅ JSON 복사됨 — sync_prefs.py를 실행하세요');
    closePrefsModal();
  }});
}}

function showToast(msg) {{
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 3500);
}}

document.addEventListener('keydown', e => {{
  if (e.key === 'Escape') {{ closeChat(); closePrefsModal(); }}
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') askClaude();
}});
</script>
</body>
</html>"""


def _update_main_index(paper_count: int, session_count: int,
                       papers: list = None, prefs: dict = None):
    main_index = ROOT / "index.html"
    if not main_index.exists():
        return
    html = main_index.read_text(encoding="utf-8")

    import re as _re

    html = _re.sub(
        r'(<div class="stat-num">)\d+(</div>\s*<div class="stat-label">저장된 논문)',
        rf'\g<1>{paper_count}\g<2>', html,
    )
    html = _re.sub(
        r'(<span class="badge">논문 )\d+(개</span>)',
        rf'\g<1>{paper_count}\g<2>', html,
    )
    html = _re.sub(
        r'(<div class="stat-num">)\d+(</div>\s*<div class="stat-label">프로젝트)',
        r'\g<1>1\g<2>', html,
    )
    html = _re.sub(
        r'(<div class="stat-num">)\d+(</div>\s*<div class="stat-label">작업 세션)',
        rf'\g<1>{session_count}\g<2>', html,
    )
    html = _re.sub(
        r'(<span class="badge-date">)[\d-]+(</span>)',
        rf'\g<1>{TODAY}\g<2>', html,
    )

    main_index.write_text(html, encoding="utf-8")
    print(f"메인 index.html 업데이트: 논문 {paper_count}개 · 세션 {session_count}개")


def main():
    print("논문 파싱 중...")
    papers = load_papers()
    print(f"  {len(papers)}개 논문 로드")

    print("세션 로드 중...")
    sessions = load_sessions()
    print(f"  {len(sessions)}개 세션 로드")

    print("환경설정 로드 중...")
    prefs = load_prefs()
    print(f"  좋아요 {len(prefs.get('liked', []))}개 / 숨김 {len(prefs.get('deleted', []))}개")

    print("HTML 생성 중...")
    html = generate(papers, sessions)
    OUTPUT.write_text(html, encoding="utf-8")

    size_kb = OUTPUT.stat().st_size // 1024
    print(f"\n완료: {OUTPUT}")
    print(f"파일 크기: {size_kb} KB")
    print(f"논문 {len(papers)}개 · 세션 {len(sessions)}개")

    _update_main_index(len(papers), len(sessions), papers, prefs)


if __name__ == "__main__":
    main()
