"""
특정 제목 키워드로 논문을 강제 inject.
rec_score 무관하게 매칭된 논문을 직접 추가.

사용법:
  python history/inject_targeted.py "power on reset" "brownout" "POR circuit"
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate import load_papers, load_prefs, load_column_notes, _paper_id, render_paper_card, render_column_cards
from create_paper_html import create_paper_html
try:
    from discord_utils import notify
except Exception:
    def notify(t): pass

OUTPUT = Path(__file__).parent / "index.html"
PROJECT_ROOT = Path(__file__).parent.parent
DB_FILE = PROJECT_ROOT / "paper_search" / "paper_db.json"


def _db_to_paper(entry: dict) -> dict:
    """paper_db.json 항목 → render_paper_card 호환 dict."""
    tags_raw = entry.get("tags", [])
    tags = tags_raw if isinstance(tags_raw, list) else []
    return {
        "title":       entry.get("title", ""),
        "authors":     ", ".join(entry.get("authors", [])) if isinstance(entry.get("authors"), list) else entry.get("authors", ""),
        "year":        str(entry.get("year", "")),
        "venue":       entry.get("venue", ""),
        "citation":    str(entry.get("citation_count", entry.get("citation", "0"))),
        "date_added":  "",
        "url":         entry.get("url", ""),
        "pdf":         entry.get("pdf", ""),
        "tags":        tags,
        "abstract_ko": entry.get("abstract", ""),
        "tech_lines":  [],
        "fig_count":   0,
        "cover_b64":   None,
        "captions":    [],
    }


def main(keywords: list[str], force_regen: bool = False):
    if not keywords:
        print("키워드를 하나 이상 입력하세요.")
        sys.exit(1)

    print(f"키워드: {keywords}")
    html = OUTPUT.read_text(encoding="utf-8")
    existing_pids = set(re.findall(r'data-pid="([^"]+)"', html))

    kw_lower = [k.lower() for k in keywords]

    # 1. Obsidian 볼트에서 검색
    vault_papers = load_papers()
    for p in vault_papers:
        p["pid"] = _paper_id(p["title"])

    candidates = []
    seen_titles = set()
    for p in vault_papers:
        if p["pid"] in existing_pids:
            continue
        text = (p.get("title", "") + " " + p.get("abstract_ko", "")).lower()
        if any(k in text for k in kw_lower):
            candidates.append(p)
            seen_titles.add(p["title"].lower().strip())

    # 2. paper_db.json에서 추가 검색 (볼트에 없는 논문 보완)
    if DB_FILE.exists():
        db = json.loads(DB_FILE.read_text(encoding="utf-8"))
        for db_pid, entry in db.items():
            if not isinstance(entry, dict):
                continue
            title = entry.get("title", "")
            if title.lower().strip() in seen_titles:
                continue
            p = _db_to_paper(entry)
            p["pid"] = _paper_id(p["title"])
            if p["pid"] in existing_pids:
                continue
            text = (p.get("title", "") + " " + p.get("abstract_ko", "")).lower()
            if any(k in text for k in kw_lower):
                candidates.append(p)
                seen_titles.add(title.lower().strip())

    if not candidates:
        print("새로 추가할 논문 없음 (이미 모두 추가됐거나 매칭 없음)")
        notify("POR 논문: 새로 추가할 논문 없음 (이미 추가됨)")
        return

    print(f"\n추가할 논문 {len(candidates)}개:")
    for p in candidates:
        print(f"  {p['title'][:75]}")

    # 논문 카드 추가
    base_idx = len(existing_pids)
    cards_html = "\n".join(
        render_paper_card(p, base_idx + i) for i, p in enumerate(candidates)
    )
    marker = '<div id="paper-list">'
    html = html.replace(marker, marker + "\n" + cards_html, 1)

    new_total = len(existing_pids) + len(candidates)
    html = re.sub(
        r'(<div class="stat-num">)\d+(</div>\s*<div class="stat-label">저장된 논문)',
        rf'\g<1>{new_total}\g<2>', html,
    )

    # paper-N.html 생성
    print(f"\npaper-N.html 생성:")
    for i, paper in enumerate(candidates):
        col_idx = base_idx + i
        _, html = create_paper_html(paper, col_idx, html)

    OUTPUT.write_text(html, encoding="utf-8")
    print(f"\n완료: {new_total}개 논문 / {OUTPUT}")

    print("\nNetlify 배포 중...")
    result = subprocess.run("netlify deploy --prod", cwd=PROJECT_ROOT, shell=True)
    if result.returncode == 0:
        print("배포 완료!")
        notify(
            f"✅ POR 논문 {len(candidates)}개 추가 + 배포 완료!\n"
            f"> 총 논문: {new_total}개\n"
            f"> https://illustrious-cuchufli-7c4e58.netlify.app/history/"
        )
    else:
        notify("❌ 배포 실패")


if __name__ == "__main__":
    main(sys.argv[1:])
