"""
새 논문을 history/index.html에 증분 주입.
generate.py 전체 재생성 없이 기존 HTML의 커스텀 기능을 보존.

사용법:
  python history/inject_papers.py          # 기본 20개
  python history/inject_papers.py 30       # 최대 30개
  python history/inject_papers.py 0        # 논문 추가 없이 col-card + paper-N.html 동기화만
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# API 키가 환경변수에 없으면 시스템 User 레벨에서 로드
if not os.environ.get("ANTHROPIC_API_KEY"):
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as k:
            val, _ = winreg.QueryValueEx(k, "ANTHROPIC_API_KEY")
            os.environ["ANTHROPIC_API_KEY"] = val
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).parent))
from generate import (
    load_papers, load_prefs, load_column_notes, _paper_id,
    compute_rec_score, render_paper_card, render_column_cards,
)
from create_paper_html import create_paper_html
try:
    from discord_utils import notify
except Exception:
    def notify(text): pass

OUTPUT      = Path(__file__).parent / "index.html"
PREFS_FILE  = Path(__file__).parent.parent / "paper_search" / "user_prefs.json"
PROJECT_ROOT = Path(__file__).parent.parent


def inject_new_papers(html: str, all_papers: list, liked_pids: set,
                      liked_tags: set, max_new: int) -> tuple[str, int]:
    """새 논문 카드를 논문 분류(#paper-list)에 추가."""
    existing_pids = set(re.findall(r'data-pid="([^"]+)"', html))
    print(f"기존 HTML 논문 수: {len(existing_pids)}개")

    new_papers = [p for p in all_papers if p["pid"] not in existing_pids]
    print(f"신규 논문 발견: {len(new_papers)}개")


    if not new_papers or max_new == 0:
        return html, len(existing_pids)

    for p in new_papers:
        p["rec_score"] = compute_rec_score(
            p["tags"], p["citation"], p["pid"], liked_pids, liked_tags
        )
    new_papers.sort(key=lambda p: p["rec_score"], reverse=True)
    selected = new_papers[:max_new]

    print(f"\n추가 선택 ({len(selected)}개):")
    for p in selected:
        print(f"  [점수 {p['rec_score']:>3}] {p['title'][:65]}")

    base_idx   = len(existing_pids)
    cards_html = "\n".join(
        render_paper_card(p, base_idx + i) for i, p in enumerate(selected)
    )

    marker = '<div id="paper-list">'
    if marker not in html:
        print("ERROR: #paper-list 태그를 찾을 수 없어요.")
        return html, len(existing_pids)

    html = html.replace(marker, marker + "\n" + cards_html, 1)

    new_total = len(existing_pids) + len(selected)
    html = re.sub(
        r'(<div class="stat-num">)\d+(</div>\s*<div class="stat-label">저장된 논문)',
        rf'\g<1>{new_total}\g<2>', html,
    )

    existing_tag_btns = set(re.findall(r"filterTag\('([^']+)'", html))
    new_tags = {t for p in selected for t in p["tags"]} - existing_tag_btns
    if new_tags:
        new_btn_html = "".join(
            f'<button class="filter-btn" onclick="filterTag(\'{t}\',this)">{t}</button>'
            for t in sorted(new_tags)
        )
        html = re.sub(
            r'(</div>\s*<div id="paper-list">)',
            new_btn_html + r'\1', html, count=1
        )

    return html, new_total


def inject_col_cards(html: str, all_papers: list, liked_pids: set) -> tuple[str, list]:
    """
    좋아요 논문의 col-card를 논문 정리(#page-columns)에 동기화.
    반환: (updated_html, [(col_idx, paper), ...]) — 새로 추가된 카드 목록
    """
    existing_col_titles = set(re.findall(r'<h2 class="col-title">([^<]+)</h2>', html))
    paper_by_pid = {p["pid"]: p for p in all_papers}
    missing = [
        paper_by_pid[pid]
        for pid in liked_pids
        if pid in paper_by_pid
        and paper_by_pid[pid]["title"] not in existing_col_titles
    ]

    if not missing:
        print("논문 정리: 이미 모두 동기화됨")
        return html, []

    print(f"\n논문 정리에 추가할 논문: {len(missing)}개")
    for p in missing:
        print(f"  {p['title'][:65]}")

    # 현재 col-card 개수 = 새 카드들의 시작 인덱스
    existing_card_count = len(re.findall('<div class="col-card">', html))

    column_notes = load_column_notes()
    new_col_html = render_column_cards(missing, liked_pids, column_notes)

    col_end_marker = '\n\n<!-- 히스토리 탭'
    col_end = html.find(col_end_marker)
    if col_end != -1:
        html = html[:col_end] + "\n" + new_col_html + html[col_end:]
    else:
        print("WARNING: 히스토리 탭 마커를 찾지 못함 — 섹션 헤더 뒤에 삽입")
        header_marker = '<div class="section-header">좋아요 표시한 논문 · Claude 원문 분석</div>'
        if header_marker in html:
            html = html.replace(header_marker, header_marker + "\n" + new_col_html, 1)

    added = [(existing_card_count + i, p) for i, p in enumerate(missing)]
    return html, added


def backfill_paper_htmls(html: str, all_papers: list) -> str:
    """
    기존 col-card 중 PAPER_ANALYSIS_LINKS에 없는 것들에 대해 paper-N.html 자동 생성.
    이미 paper-N.html이 있는 인덱스(0-10)는 건너뜀.
    """
    # 현재 PAPER_ANALYSIS_LINKS 파싱
    marker = "const PAPER_ANALYSIS_LINKS = {"
    if marker not in html:
        return html
    start = html.index(marker)
    end   = html.index("};", start) + 2
    block = html[start:end]
    existing_idxs = set(int(m) for m in re.findall(r'^\s*(\d+):', block, re.MULTILINE))

    # 모든 col-card 제목 추출 (순서 중요)
    card_titles = re.findall(r'<h2 class="col-title">([^<]+)</h2>', html)
    paper_by_title = {p["title"]: p for p in all_papers}

    missing_count = 0
    for idx, title in enumerate(card_titles):
        if idx in existing_idxs:
            continue
        title = title.strip()
        paper = paper_by_title.get(title)
        if not paper:
            continue
        missing_count += 1

    if missing_count == 0:
        print("paper-N.html 백필: 이미 완료됨")
        return html

    print(f"\npaper-N.html 백필: {missing_count}개 생성 시작...")
    for idx, title in enumerate(card_titles):
        if idx in existing_idxs:
            continue
        title = title.strip()
        paper = paper_by_title.get(title)
        if not paper:
            print(f"  [스킵] 인덱스 {idx}: 논문 데이터 없음 ({title[:50]})")
            continue
        _, html = create_paper_html(paper, idx, html)

    return html


def main(max_new: int = 20):
    html = OUTPUT.read_text(encoding="utf-8")

    prefs      = load_prefs()
    liked_pids = set(prefs.get("liked", []))

    all_papers = load_papers()
    for p in all_papers:
        p["pid"] = _paper_id(p["title"])

    liked_tags: set[str] = set()
    for p in all_papers:
        if p["pid"] in liked_pids:
            liked_tags.update(p["tags"])

    html_before = html

    # 1. 논문 분류: 신규 논문 추가
    html, new_total = inject_new_papers(html, all_papers, liked_pids, liked_tags, max_new)

    # 2. 논문 정리: 좋아요 논문 col-card 동기화
    html, newly_added = inject_col_cards(html, all_papers, liked_pids)

    # 3. 기존 col-card 중 paper-N.html 없는 것 백필
    html = backfill_paper_htmls(html, all_papers)

    # 4. 신규 추가된 col-card에 대해 paper-N.html 생성
    if newly_added:
        print(f"\n신규 col-card {len(newly_added)}개에 대해 paper-N.html 생성:")
        for col_idx, paper in newly_added:
            paper_n, html = create_paper_html(paper, col_idx, html)
            # 전문 분석 성공 여부에 따라 data-quality 설정
            paper_path = PROJECT_ROOT / "papers" / f"paper-{paper_n}.html"
            is_full = paper_path.exists() and "auto-note" not in paper_path.read_text(encoding="utf-8")
            if is_full:
                # 논문 제목으로 해당 col-card 찾아서 quality 업그레이드
                title = paper.get("title", "").replace('"', '&quot;')
                # col-title을 포함하는 col-card 블록에서 data-quality 교체
                import re as _re
                # 해당 제목을 가진 col-card의 data-quality="stored" → "full"
                html = _re.sub(
                    r'(<div class="col-card" data-quality=")stored("(?:(?!<div class="col-card").)*?' + _re.escape(title) + r')',
                    r'\g<1>full\g<2>',
                    html, count=1, flags=_re.DOTALL
                )
                print(f"  [quality=full] 업그레이드: {title[:50]}")

    OUTPUT.write_text(html, encoding="utf-8")
    print(f"\n완료: {OUTPUT}")
    print(f"논문 분류: {new_total}개 / 논문 정리: liked {len(liked_pids)}개 동기화")

    # 실제 변경이 있을 때만 배포 (대역폭 절약)
    if html == html_before and not newly_added:
        print("변경 없음 - 배포 생략")
        return

    new_col_count = len(liked_pids)
    print("\nNetlify 배포 중...")
    result = subprocess.run("netlify deploy --prod", cwd=PROJECT_ROOT, shell=True)
    if result.returncode == 0:
        print("배포 완료!")
        notify(
            f"✅ **논문 포털 배포 완료!**\n"
            f"> 논문 분류: {new_total}개\n"
            f"> 논문 정리: liked {new_col_count}개\n"
            f"> https://illustrious-cuchufli-7c4e58.netlify.app/history/"
        )
    else:
        print("배포 실패 - 수동으로 'netlify deploy --prod' 실행하세요")
        notify("❌ **Netlify 배포 실패.** 수동으로 `netlify deploy --prod` 실행 필요.")


if __name__ == "__main__":
    max_new = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    main(max_new)
