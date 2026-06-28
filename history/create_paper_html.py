"""
새 논문 추가 시 papers/paper-N.html 자동 생성 + PAPER_ANALYSIS_LINKS 패치.
inject_papers.py에서 자동 호출됨. 직접 실행하지 않음.

Claude API를 이용해 신규 논문마다 전체 한국어 분석을 자동 생성해요.
API 오류 시 placeholder로 fallback.

Figure 추출 우선순위:
  1. arXiv HTML → 이미지 URL 추출 → 로컬 저장
  2. PDF 직접 다운로드 → PyMuPDF 추출 → 로컬 저장
  3. 실패 시 원문 링크 fallback
"""
import re
import ssl
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate import load_column_notes, _paper_id

PAPERS_DIR   = Path(__file__).parent.parent / "papers"
FIGURES_DIR  = PAPERS_DIR / "figures"
HISTORY_HTML = Path(__file__).parent / "index.html"

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode    = ssl.CERT_NONE

_UA = {"User-Agent": "Mozilla/5.0 (compatible; paper-portal/1.0)"}


# ── 유틸 ──────────────────────────────────────────────────────

def _next_paper_number() -> int:
    nums = [int(m.group(1)) for p in PAPERS_DIR.glob("paper-*.html")
            if (m := re.match(r"paper-(\d+)$", p.stem))]
    return max(nums, default=0) + 1


def _patch_analysis_links(col_idx: int, rel_path: str, html_text: str) -> str:
    marker = "const PAPER_ANALYSIS_LINKS = {"
    if marker not in html_text:
        return html_text
    start = html_text.index(marker)
    end   = html_text.index("};", start) + 2
    block = html_text[start:end]
    if f"  {col_idx}:" in block or f" {col_idx}:" in block:
        return html_text
    new_entry = f"  {col_idx}: '{rel_path}',"
    new_block = block[:-2].rstrip() + f"\n{new_entry}\n}};"
    return html_text[:start] + new_block + html_text[end:]


def _arxiv_id_from_url(url: str) -> str | None:
    m = re.search(r'arxiv\.org/(?:abs|pdf|html)/([0-9]+\.[0-9]+(?:v\d+)?)', url or "", re.I)
    return m.group(1) if m else None


def _http_get(url: str, timeout: int = 20) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers=_UA)
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as r:
            return r.read()
    except Exception as e:
        print(f"    [GET] {url[:60]}... 실패: {e}")
        return None


# ── Figure 추출 ───────────────────────────────────────────────

def _best_pdf_url(paper: dict) -> str | None:
    """arXiv PDF > 직접 PDF > None"""
    pdf = paper.get("pdf", "") or ""
    url = paper.get("url", "") or ""
    if "arxiv.org" in pdf:
        return pdf
    if "arxiv.org" in url:
        aid = _arxiv_id_from_url(url)
        if aid:
            return f"https://arxiv.org/pdf/{aid}"
    # 직접 PDF URL (figshare, 대학 저장소, IEEE direct 등)
    if pdf.startswith("http") and "doi.org" not in pdf and pdf.endswith(".pdf"):
        return pdf
    # .pdf 확장자 없어도 PDF URL인 경우 시도
    if pdf.startswith("http") and "doi.org" not in pdf:
        return pdf
    return None


def _fetch_arxiv_figures(paper: dict) -> list[dict]:
    """
    arXiv HTML 버전에서 figure URL 추출 후 로컬 저장.
    반환: [{"local_path": "figures/paper-N-figK.png", "caption": "...", "img_bytes": b"..."}]
    """
    FIGURES_DIR.mkdir(exist_ok=True)

    # arXiv ID 찾기: pdf 필드 우선, url 필드 fallback
    pdf_url = paper.get("pdf", "") or ""
    url     = paper.get("url", "") or ""
    arxiv_id = _arxiv_id_from_url(pdf_url) or _arxiv_id_from_url(url)
    if not arxiv_id:
        return []

    html_url = f"https://arxiv.org/html/{arxiv_id}"
    data = _http_get(html_url, timeout=15)
    if not data:
        return []
    html = data.decode("utf-8", errors="ignore")

    figures = []
    for fig_match in re.finditer(r'<figure[^>]*>(.*?)</figure>', html, re.DOTALL | re.IGNORECASE):
        fig_html = fig_match.group(1)
        img_m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', fig_html, re.IGNORECASE)
        if not img_m:
            continue
        src = img_m.group(1)
        if src.startswith("http"):
            img_url = src
        elif src.startswith("//"):
            img_url = "https:" + src
        elif src.startswith("/"):
            img_url = "https://arxiv.org" + src
        else:
            img_url = f"https://arxiv.org/html/{arxiv_id}/{src}"

        if any(x in img_url.lower() for x in (".svg", "equation", "formula")):
            continue

        cap_m = re.search(r'<figcaption[^>]*>(.*?)</figcaption>', fig_html, re.DOTALL | re.IGNORECASE)
        caption = ""
        if cap_m:
            caption = re.sub(r'<[^>]+>', ' ', cap_m.group(1)).strip()
            caption = re.sub(r'\s+', ' ', caption)[:400]

        img_bytes = _http_get(img_url, timeout=10)
        if not img_bytes or len(img_bytes) < 500:
            continue

        figures.append({"img_bytes": img_bytes, "caption": caption, "_src_url": img_url})
        if len(figures) >= 5:
            break

    print(f"    [arXiv HTML] {len(figures)}개 그림 추출 ({arxiv_id})")
    return figures


def _fetch_pdf_figures(paper: dict) -> list[dict]:
    """PyMuPDF로 PDF에서 figure 추출."""
    try:
        import fitz
    except ImportError:
        print("  [WARNING] PyMuPDF 없음 - pip install pymupdf")
        return []

    pdf_url = _best_pdf_url(paper)
    if not pdf_url:
        return []

    pdf_data = _http_get(pdf_url, timeout=30)
    if not pdf_data:
        return []

    try:
        doc = fitz.open(stream=pdf_data, filetype="pdf")
    except Exception as e:
        print(f"    [PDF open] 실패: {e}")
        return []

    figures = []
    seen = set()

    for page_num in range(min(len(doc), 25)):
        page = doc[page_num]
        for img in page.get_images(full=True):
            if len(figures) >= 5:
                break
            try:
                xref = img[0]
                pix  = fitz.Pixmap(doc, xref)
                if pix.width < 120 or pix.height < 120:
                    pix = None; continue
                key = (pix.width, pix.height)
                if key in seen:
                    pix = None; continue
                seen.add(key)
                if pix.n - pix.alpha > 3:  # CMYK → RGB
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                img_bytes = pix.tobytes("png")
                pix = None
                figures.append({"img_bytes": img_bytes, "caption": ""})
            except Exception:
                continue
        if len(figures) >= 5:
            break

    doc.close()
    print(f"    [PDF extract] {len(figures)}개 그림 추출")
    return figures


def _save_figures(figures: list[dict], paper_n: int) -> list[dict]:
    """img_bytes → papers/figures/paper-N-figK.png 저장. local_path 추가."""
    FIGURES_DIR.mkdir(exist_ok=True)
    saved = []
    for k, fig in enumerate(figures, 1):
        img_bytes = fig.get("img_bytes")
        if not img_bytes:
            continue
        fname = f"paper-{paper_n}-fig{k}.png"
        # PNG가 아닌 경우 (jpg, webp 등) 그대로 저장 시도
        ext = "png"
        if img_bytes[:3] == b'\xff\xd8\xff':
            ext = "jpg"
            fname = f"paper-{paper_n}-fig{k}.jpg"
        out_path = FIGURES_DIR / fname
        out_path.write_bytes(img_bytes)
        saved.append({
            "local_path": f"figures/{fname}",
            "caption":    fig.get("caption", ""),
            "vision_desc": "",
        })
    return saved


def _describe_figures_with_content(figures: list[dict], paper: dict, fulltext: str) -> list[dict]:
    """논문 내용(caption + 본문)을 기반으로 각 그림에 한국어 설명 생성 (Vision API 미사용)."""
    if not figures or not fulltext:
        return figures
    
    try:
        import anthropic
    except ImportError:
        return figures

    title = paper.get("title", "")
    tags  = ", ".join(paper.get("tags", []))

    try:
        client = anthropic.Anthropic()
    except Exception:
        return figures

    result = []
    for fig_idx, fig in enumerate(figures):
        caption = fig.get("caption", "")
        if not caption:
            result.append(fig)
            continue
        
        try:
            # Caption과 논문 본문을 조합하여 그림 설명 생성
            prompt = f"""당신은 HBM/DRAM 반도체 회로설계 엔지니어입니다.

논문: {title}
태그: {tags}

그림 캡션: {caption}

=== 논문 본문 일부 (컨텍스트) ===
{fulltext[:3000]}

위 그림 캡션과 논문 본문을 바탕으로, 이 그림이 논문에서 어떤 역할을 하는지 
HBM/DRAM 설계자 관점에서 3-4문장으로 설명해주세요. 
무엇을 보여주는 그림인지, 핵심 데이터나 회로 구조가 뭔지 간결하게.
~에요 체로 한국어로. 마크다운 없이 순수 텍스트만 작성하세요."""

            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=250,
                messages=[{"role": "user", "content": prompt}]
            )
            desc = msg.content[0].text.strip()
            result.append({**fig, "vision_desc": desc})
            print(f"    [Content-based] {fig_idx+1}번 그림 설명 생성 완료")
        except Exception as e:
            print(f"    [Content-based] 그림 {fig_idx+1} 실패: {e}")
            result.append(fig)

    return result


def _get_figures(paper: dict, paper_n: int, fulltext: str = "") -> list[dict]:
    """arXiv HTML → PDF → 없으면 [] 순으로 그림 수집, 저장, 논문 내용 기반 설명 생성."""
    raw = _fetch_arxiv_figures(paper)
    if not raw:
        raw = _fetch_pdf_figures(paper)
    if not raw:
        return []
    saved = _save_figures(raw, paper_n)
    # Vision API 대신 논문 본문을 바탕으로 설명 생성 (훨씬 저렴)
    saved = _describe_figures_with_content(saved, paper, fulltext)
    return saved


# ── 논문 전문 수집 ────────────────────────────────────────────

def _fetch_arxiv_fulltext(paper: dict) -> str:
    """arXiv HTML에서 본문 텍스트 추출 (Abstract~Conclusion, 최대 14000자)."""
    arxiv_id = (_arxiv_id_from_url(paper.get("pdf", "") or "") or
                _arxiv_id_from_url(paper.get("url", "") or ""))
    if not arxiv_id:
        return ""

    data = _http_get(f"https://arxiv.org/html/{arxiv_id}", timeout=25)
    if not data:
        return ""

    html = data.decode("utf-8", errors="ignore")

    # 불필요한 요소 제거
    for tag in ("script", "style", "nav", "header", "footer"):
        html = re.sub(rf'<{tag}[^>]*>.*?</{tag}>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<math[^>]*>.*?</math>', '[수식]', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<figure[^>]*>.*?</figure>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<table[^>]*>.*?</table>', '[표]', html, flags=re.DOTALL | re.IGNORECASE)

    # 섹션 헤딩 보존
    html = re.sub(r'<h[1-4][^>]*>(.*?)</h[1-4]>', r'\n\n=== \1 ===\n', html, flags=re.DOTALL | re.IGNORECASE)

    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'&[a-zA-Z]+;', ' ', text)
    text = re.sub(r'&#\d+;', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()

    # Abstract 이후부터 References 직전까지만 사용
    low = text.lower()
    start = max(low.find('abstract'), 0)
    ref_idx = low.rfind('references')
    if ref_idx > start + 2000:
        text = text[start:ref_idx]
    else:
        text = text[start:]

    result = text[:14000]
    print(f"    [arXiv fulltext] {len(result)}자 추출 ({arxiv_id})")
    return result


def _fetch_semantic_scholar(paper: dict) -> dict:
    """Semantic Scholar 공개 API로 TLDR·영문초록·openAccessPdf 보완."""
    import urllib.parse, json as _json
    title = paper.get("title", "")
    if not title:
        return {}
    q = urllib.parse.quote(title[:120])
    url = (f"https://api.semanticscholar.org/graph/v1/paper/search"
           f"?query={q}&limit=1&fields=title,abstract,tldr,openAccessPdf,externalIds")
    data = _http_get(url, timeout=12)
    if not data:
        return {}
    try:
        items = _json.loads(data.decode("utf-8")).get("data", [])
        if items:
            print(f"    [S2] 논문 정보 확보")
            return items[0]
    except Exception:
        pass
    return {}


# ── Claude 텍스트 분석 ────────────────────────────────────────

def _generate_analysis_with_claude(paper: dict) -> dict | None:
    try:
        import anthropic
    except ImportError:
        print("  [WARNING] anthropic 패키지 없음 - pip install anthropic")
        return None

    title       = paper.get("title", "")
    venue_year  = f"{paper.get('venue', '')} {paper.get('year', '')}".strip()
    abstract_ko = (paper.get("abstract_ko") or "").strip()
    tags        = paper.get("tags", [])
    url         = paper.get("url", "")

    # 1. arXiv 전문 시도
    fulltext = _fetch_arxiv_fulltext(paper)

    # 2. 전문 없으면 Semantic Scholar로 보완
    s2_extra = ""
    if not fulltext:
        s2 = _fetch_semantic_scholar(paper)
        if s2.get("tldr"):
            s2_extra += f"TLDR: {s2['tldr'].get('text', '')}\n"
        if s2.get("abstract"):
            s2_extra += f"영문 초록: {s2['abstract'][:1200]}\n"
        # open-access PDF가 있으면 arXiv처럼 전문 시도
        oa_pdf = (s2.get("openAccessPdf") or {}).get("url", "")
        if oa_pdf and "arxiv" in oa_pdf.lower():
            paper2 = {**paper, "pdf": oa_pdf, "url": oa_pdf}
            fulltext = _fetch_arxiv_fulltext(paper2)

    if fulltext:
        content_block = f"=== 논문 본문 (arXiv 전문, 앞부분 발췌) ===\n{fulltext}"
        source_note   = "논문 전문을 바탕으로 작성"
    elif s2_extra:
        content_block = f"=== Semantic Scholar 보완 정보 ===\n{s2_extra}"
        source_note   = "초록·TLDR 바탕으로 작성"
    else:
        content_block = f"=== 한국어 초록 ===\n{abstract_ko[:1200] if abstract_ko else '없음'}"
        source_note   = "한국어 초록 바탕으로 작성"

    prompt = f"""당신은 HBM/DRAM/반도체 회로설계 논문 분석 전문가입니다.
아래 논문의 {source_note} 상세한 한국어 분석을 JSON으로 작성하세요.

논문 제목: {title}
학회/년도: {venue_year}
태그: {', '.join(tags)}
원문 URL: {url}

{content_block}

요구사항:
- 논문에서 실제로 나온 수치·회로 구조·실험 결과를 정확히 인용하세요
- "~에요" 체 한국어, 에세이 스타일 (딱딱하지 않게)
- 모호한 일반론 금지: 논문 고유의 specific한 내용만
- HBM/DRAM 회로설계 엔지니어 관점에서 실무적으로 해석

다음 JSON 형식으로만 출력하세요 (마크다운 코드블록 없이):
{{
  "opener": "이 논문의 핵심 기여를 담은 한 문장 (구체적 수치 포함 가능)",
  "intro_title": "질문형 소제목",
  "intro_para1": "배경/문제 상황 (논문 특유의 동기·컨텍스트, 4-5문장)",
  "intro_para2": "기존 방식의 구체적 한계 (어떤 오버헤드? 어떤 병목? 수치 포함, 3-4문장)",
  "intro_insight_label": "핵심 문제 정의",
  "intro_insight": "이 논문이 공략하는 정확한 문제 (2-3문장, 논문 표현 직접 인용 가능)",
  "method_title": "방법론 질문형 소제목",
  "method_para1": "핵심 아키텍처·알고리즘 설명 (회로 구조, 동작 원리, 4-5문장)",
  "method_para2": "구현 세부사항·설계 결정 (파라미터, 트레이드오프, 4-5문장)",
  "method_insight_label": "혁신 포인트",
  "method_insight": "기존 대비 무엇이 근본적으로 다른가 (2-3문장)",
  "results_title": "결과 질문형 소제목",
  "results_para1": "실험 셋업 및 주요 결과 서술 (벤치마크, 비교 대상, 4-5문장)",
  "stats": [
    {{"num": "논문의 실제 측정값", "desc": "무엇을 측정한 수치인지"}},
    {{"num": "논문의 실제 측정값", "desc": "무엇을 측정한 수치인지"}},
    {{"num": "논문의 실제 측정값", "desc": "무엇을 측정한 수치인지"}}
  ],
  "design_para1": "HBM/DRAM 설계자가 이 논문에서 빌릴 수 있는 아이디어 (4-5문장)",
  "design_para2": "실제 테이프아웃·시스템 통합 시 고려해야 할 점 (4-5문장)",
  "design_caution": "논문의 한계·가정·현실 적용 시 주의사항 (2-3문장)"
}}"""

    try:
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=5000,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        import json
        data = json.loads(raw)
        print(f"  [Claude API] 분석 생성 완료 ({source_note})")
        return data
    except Exception as e:
        print(f"  [WARNING] Claude API 오류: {e}")
        return None


# ── HTML 빌더 ────────────────────────────────────────────────

def _build_figure_section(figures: list[dict], fallback_url: str) -> str:
    """figures → 논문 그림 섹션 HTML."""
    link_html = f'    <div class="figure-outer"><a class="figure-open-link" href="{fallback_url}" target="_blank">↗ 원문에서 그림 보기</a></div>'
    if not figures:
        return link_html

    items = ""
    for i, fig in enumerate(figures):
        local = fig.get("local_path", "")
        src   = local if local else fig.get("_src_url", "")
        if not src:
            continue
        cap       = fig.get("caption", "")
        vision    = fig.get("vision_desc", "")
        desc_html = ""
        if vision:
            desc_html = f'      <div class="fig-vision">{vision}</div>\n'
        elif cap:
            desc_html = f'      <div class="fig-cap">{cap}</div>\n'
        items += (
            f'    <div class="fig-item">\n'
            f'      <img src="{src}" alt="Figure {i+1}" loading="lazy" onerror="this.parentElement.style.display=\'none\'">\n'
            f'{desc_html}'
            f'    </div>\n'
        )

    return items + link_html


def _build_html_body(paper: dict, analysis: dict | None, n: int, figures: list[dict]) -> str:
    title       = paper.get("title", "")
    venue_year  = f"{paper.get('venue', '')} {paper.get('year', '')}".strip()
    abstract_ko = (paper.get("abstract_ko") or "").strip()
    url         = paper.get("url", "")
    pdf         = paper.get("pdf", "")
    tags        = paper.get("tags", [])

    pid      = _paper_id(title)
    notes    = load_column_notes().get(pid, {})
    headline = notes.get("headline", "")

    tags_html  = "".join(f'<span class="tag">{t}</span>' for t in tags[:6])
    links_html = ""
    if url:
        links_html += f'<a class="article-link primary" href="{url}" target="_blank">원문 보기 →</a>\n  '
    if pdf:
        links_html += f'<a class="article-link" href="{pdf}" target="_blank">PDF →</a>'

    short_title  = title[:50] + ("..." if len(title) > 50 else "")
    fig_section  = _build_figure_section(figures, url or "#")

    if analysis:
        opener       = analysis.get("opener", headline or abstract_ko[:200] or "원문을 참조하세요.")
        intro_title  = analysis.get("intro_title", "이 논문은 무엇을 다루나요?")
        intro_body   = "".join(
            f"    <p>{analysis.get(k, '')}</p>\n"
            for k in ("intro_para1", "intro_para2") if analysis.get(k)
        )
        intro_il     = analysis.get("intro_insight_label", "논문의 출발점")
        intro_ip     = analysis.get("intro_insight", "")
        intro_insight = (
            f'    <div class="insight blue"><div class="insight-label">{intro_il}</div>'
            f'<p>{intro_ip}</p></div>'
        ) if intro_ip else ""

        method_title  = analysis.get("method_title", "핵심 방법론")
        method_body   = "".join(
            f"    <p>{analysis.get(k, '')}</p>\n"
            for k in ("method_para1", "method_para2") if analysis.get(k)
        )
        method_il     = analysis.get("method_insight_label", "핵심 아이디어")
        method_ip     = analysis.get("method_insight", "")
        method_insight = (
            f'    <div class="insight green"><div class="insight-label">{method_il}</div>'
            f'<p>{method_ip}</p></div>'
        ) if method_ip else ""

        results_title = analysis.get("results_title", "주요 결과")
        results_body  = f"    <p>{analysis.get('results_para1', '')}</p>" if analysis.get("results_para1") else ""
        stats_html    = "".join(
            f'      <div class="stat-box"><div class="stat-num">{s.get("num","")}</div>'
            f'<div class="stat-desc">{s.get("desc","")}</div></div>\n'
            for s in analysis.get("stats", [])
        )
        stat_row     = f'    <div class="stat-row">\n{stats_html}    </div>' if stats_html else ""

        design_body   = "".join(
            f"    <p>{analysis.get(k, '')}</p>\n"
            for k in ("design_para1", "design_para2") if analysis.get(k)
        )
        design_caution = analysis.get("design_caution", "")
        design_insight = (
            f'    <div class="insight yellow"><div class="insight-label">주의할 점</div>'
            f'<p>{design_caution}</p></div>'
        ) if design_caution else ""

        body = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{short_title} · Yong's AI Study</title>
<link rel="stylesheet" href="paper.css">
<script src="tooltip.js" defer></script>
</head>
<body>
<div class="top-bar">
  <a class="back-link" href="../history/index.html#columns">← 논문 정리</a>
  <span class="breadcrumb-sep">/</span>
  <span class="breadcrumb-cur">{short_title}</span>
</div>
<div class="article">
  <div class="article-venue">{venue_year}</div>
  <h1 class="article-title">{title}</h1>
  <div class="article-tags">{tags_html}</div>
  <div class="article-links">{links_html}</div>
  <p class="opener">{opener}</p>

  <div class="section">
    <div class="section-label">Introduction</div>
    <h2 class="section-title">{intro_title}</h2>
{intro_body}
{intro_insight}
  </div>

  <hr>

  <div class="section">
    <div class="section-label">Proposed Method</div>
    <h2 class="section-title">{method_title}</h2>
{method_body}
{method_insight}
  </div>

  <hr>

  <div class="section">
    <div class="section-label">Results</div>
    <h2 class="section-title">{results_title}</h2>
{results_body}
{stat_row}
  </div>

  <hr>

  <div class="section">
    <div class="section-label">설계 관점에서 보면요</div>
    <h2 class="section-title">HBM 설계에 어떻게 적용할 수 있나요?</h2>
{design_body}
{design_insight}
  </div>

  <hr>

  <div class="section">
    <div class="section-label">논문 그림</div>
    <h2 class="section-title">Figure 갤러리</h2>
{fig_section}
  </div>

</div>
</body>
</html>"""

    else:
        # fallback placeholder
        opener  = headline or (abstract_ko[:200] + "..." if len(abstract_ko) > 200 else abstract_ko) or "원문을 참조하세요."
        hbm_note = notes.get("hbm_perspective", "")
        hbm_body = f"<p>{hbm_note}</p>" if hbm_note else '<p class="auto-note">⚙ "이 논문 상세 분석해줘"라고 하면 Claude가 채워드립니다.</p>'

        body = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{short_title} · Yong's AI Study</title>
<link rel="stylesheet" href="paper.css">
<script src="tooltip.js" defer></script>
</head>
<body>
<div class="top-bar">
  <a class="back-link" href="../history/index.html#columns">← 논문 정리</a>
  <span class="breadcrumb-sep">/</span>
  <span class="breadcrumb-cur">{short_title}</span>
</div>
<div class="article">
  <div class="article-venue">{venue_year}</div>
  <h1 class="article-title">{title}</h1>
  <div class="article-tags">{tags_html}</div>
  <div class="article-links">{links_html}</div>
  <p class="opener">{opener}</p>

  <div class="section">
    <div class="section-label">Introduction</div>
    <h2 class="section-title">이 논문은 무엇을 다루나요?</h2>
    <p>{abstract_ko or "원문을 참조하세요."}</p>
  </div>

  <hr>

  <div class="section">
    <div class="section-label">Proposed Method</div>
    <h2 class="section-title">핵심 방법론</h2>
    <p class="auto-note">⚙ "이 논문 상세 분석해줘"라고 하면 Claude가 채워드립니다.</p>
    <div class="article-links" style="margin-top:12px">{links_html}</div>
  </div>

  <hr>

  <div class="section">
    <div class="section-label">Results</div>
    <h2 class="section-title">주요 결과</h2>
    <p class="auto-note">⚙ "이 논문 상세 분석해줘"라고 하면 Claude가 채워드립니다.</p>
  </div>

  <hr>

  <div class="section">
    <div class="section-label">설계 관점에서 보면요</div>
    <h2 class="section-title">HBM 설계에 어떻게 적용할 수 있나요?</h2>
    {hbm_body}
  </div>

  <hr>

  <div class="section">
    <div class="section-label">논문 그림</div>
    <h2 class="section-title">Figure 갤러리</h2>
{fig_section}
  </div>

</div>
</body>
</html>"""

    return body


# ── 진입점 ───────────────────────────────────────────────────

def create_paper_html(paper: dict, col_idx: int, html_text: str) -> tuple[int, str]:
    """
    paper dict → papers/paper-N.html 생성.
    반환: (paper_number, updated_html_text)
    """
    n = _next_paper_number()
    print(f"  paper-{n}.html 생성 중 (인덱스: {col_idx})...")

    # 1. 논문 본문 먼저 추출 (그림 설명에 사용)
    fulltext = _fetch_arxiv_fulltext(paper)
    
    # 2. 전체 분석 생성
    analysis = _generate_analysis_with_claude(paper)
    
    # 3. 그림 추출 및 논문 내용 기반 설명 생성
    figures  = _get_figures(paper, n, fulltext)

    body = _build_html_body(paper, analysis, n, figures)
    (PAPERS_DIR / f"paper-{n}.html").write_text(body, encoding="utf-8")

    updated_html = _patch_analysis_links(col_idx, f"../papers/paper-{n}.html", html_text)
    fig_str = f"그림 {len(figures)}개" if figures else "그림 없음"
    status  = f"전체 분석 + {fig_str}" if analysis else f"placeholder + {fig_str}"
    print(f"  paper-{n}.html 완료 [{status}]")
    return n, updated_html
