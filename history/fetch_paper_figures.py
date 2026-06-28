"""
기존 paper-N.html 파일에 arXiv 그림을 소급 삽입.
사용법:
  python history/fetch_paper_figures.py          # 모든 paper-1~paper-N
  python history/fetch_paper_figures.py 12 61   # 특정 범위만
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from create_paper_html import _fetch_arxiv_figures, _build_figure_section

PAPERS_DIR = Path(__file__).parent.parent / "papers"


def _extract_url(html: str) -> str:
    """paper HTML에서 원문 URL 추출."""
    m = re.search(r'<a class="article-link primary"[^>]+href="([^"]+)"', html)
    return m.group(1) if m else ""


def _replace_figure_section(html: str, new_fig_section: str) -> str:
    """
    논문 그림 섹션의 내용을 새 그림 HTML로 교체.
    <h2 class="section-title">Figure 갤러리</h2> 이후 ~ </div> 까지 교체.
    """
    # "Figure 갤러리" h2 찾기
    marker = '<h2 class="section-title">Figure 갤러리</h2>'
    if marker not in html:
        return html

    start = html.index(marker) + len(marker)

    # 해당 section div의 닫힘 </div> 찾기 (section div 내의 마지막 </div>)
    # 섹션 시작: <div class="section"> ... </div>
    # marker 앞에서 section 시작 찾기
    sec_start = html.rfind('<div class="section">', 0, html.index(marker))
    # 이 section의 닫히는 </div> 찾기
    depth = 0
    pos = sec_start
    while pos < len(html):
        open_m  = html.find('<div', pos)
        close_m = html.find('</div>', pos)
        if open_m == -1: open_m = len(html)
        if close_m == -1: break
        if open_m < close_m:
            depth += 1
            pos = open_m + 4
        else:
            depth -= 1
            if depth == 0:
                sec_end = close_m + 6  # </div> 포함
                break
            pos = close_m + 6
    else:
        return html

    # 섹션 전체 재구성
    old_section = html[sec_start:sec_end]
    new_section = f"\n{new_fig_section}\n  </div>"
    return html[:start] + new_section + html[sec_end - 6:]  # </div> 유지


def process_paper(n: int, force: bool = False) -> bool:
    """paper-N.html에 arXiv 그림 삽입. 이미 img 태그 있으면 skip (force=True면 재처리)."""
    path = PAPERS_DIR / f"paper-{n}.html"
    if not path.exists():
        print(f"  paper-{n}.html 없음 - skip")
        return False

    html = path.read_text(encoding="utf-8")

    # 이미 그림 있는지 확인
    if not force and '<div class="fig-item">' in html:
        print(f"  paper-{n}.html 이미 그림 있음 - skip")
        return False

    url = _extract_url(html)
    if not url:
        print(f"  paper-{n}.html URL 없음 - skip")
        return False

    figures = _fetch_arxiv_figures(url)
    if not figures:
        print(f"  paper-{n}.html arXiv 그림 없음 (Semantic Scholar 논문이거나 HTML 버전 없음)")
        return False

    fig_section = _build_figure_section(figures, url)
    new_html = _replace_figure_section(html, fig_section)

    if new_html == html:
        print(f"  paper-{n}.html 섹션 교체 실패 (구조 불일치)")
        return False

    path.write_text(new_html, encoding="utf-8")
    print(f"  paper-{n}.html 그림 {len(figures)}개 삽입 완료")
    return True


def main():
    args = sys.argv[1:]
    if len(args) == 2:
        start, end = int(args[0]), int(args[1])
    elif len(args) == 1:
        start = end = int(args[0])
    else:
        # 전체: 존재하는 모든 paper-N.html
        nums = []
        for p in PAPERS_DIR.glob("paper-*.html"):
            m = re.match(r"paper-(\d+)$", p.stem)
            if m: nums.append(int(m.group(1)))
        if not nums:
            print("paper 파일 없음")
            return
        start, end = min(nums), max(nums)

    print(f"=== arXiv 그림 소급 삽입: paper-{start} ~ paper-{end} ===\n")
    success = 0
    for n in range(start, end + 1):
        print(f"[paper-{n}]")
        if process_paper(n):
            success += 1

    print(f"\n완료: {success}개 파일 그림 삽입됨")


if __name__ == "__main__":
    main()
