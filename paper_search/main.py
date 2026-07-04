import argparse
import re
import sys
import time
from pathlib import Path

import requests

from config import load_config
from formatter import save_to_obsidian
from sources import semantic_scholar, arxiv_search


def _enrich_citations(papers: list[dict]) -> list[dict]:
    """arXiv 논문 인용수를 Semantic Scholar 배치 API로 보완."""
    targets = [p for p in papers if p.get("arxiv_id") and p.get("citation_count") is None]
    if not targets:
        return papers
    ids = ["arXiv:" + p["arxiv_id"].split("v")[0] for p in targets]
    try:
        resp = requests.post(
            "https://api.semanticscholar.org/graph/v1/paper/batch",
            params={"fields": "citationCount"},
            json={"ids": ids},
            timeout=15,
        )
        if resp.status_code == 200:
            for item, paper in zip(resp.json(), targets):
                if item and item.get("citationCount") is not None:
                    paper["citation_count"] = item["citationCount"]
        time.sleep(1)
    except Exception:
        pass
    return papers


def _load_user_prefs(config: dict) -> dict:
    """user_prefs.json 로드."""
    import json
    prefs_path = Path(config.get("db_file", "")).parent / "user_prefs.json"
    if prefs_path.exists():
        with open(prefs_path, encoding="utf-8") as f:
            return json.load(f)
    return {"liked": [], "deleted": []}


def _get_liked_tags(liked_pids: set, config: dict) -> dict[str, int]:
    """좋아요한 논문들의 태그 빈도 맵 반환."""
    vault_path = Path(config["vault_path"]) / config["papers_folder"]
    tag_freq: dict[str, int] = {}
    if not vault_path.exists() or not liked_pids:
        return tag_freq
    for md in vault_path.glob("*.md"):
        try:
            text = md.read_text(encoding="utf-8")
        except Exception:
            continue
        m = re.search(r'^title: "(.+?)"', text, re.MULTILINE)
        if not m:
            continue
        title = m.group(1)
        pid = re.sub(r"[^a-zA-Z0-9가-힣]", "_", title)[:40]
        if pid not in liked_pids:
            continue
        tags = re.findall(r'  - "(.+?)"', text)
        for t in tags:
            tag_freq[t] = tag_freq.get(t, 0) + 1
    return tag_freq


def _smart_rank(papers: list[dict], config: dict) -> list[dict]:
    """좋아요 데이터 기반으로 검색 결과 재정렬."""
    from tagger import auto_tag

    prefs = _load_user_prefs(config)
    liked_pids = set(prefs.get("liked", []))
    deleted_pids = set(prefs.get("deleted", []))

    if not liked_pids and not deleted_pids:
        return papers

    tag_freq = _get_liked_tags(liked_pids, config)
    if not tag_freq:
        return papers

    liked_tags = set(tag_freq.keys())
    print(f"  [스마트 랭킹] 좋아요 태그 {len(liked_tags)}개 기반 재정렬")

    for p in papers:
        paper_tags = set(auto_tag(p["title"], p.get("abstract", "")))
        # 좋아요 태그와 겹치는 수 × 빈도 가중치
        boost = sum(tag_freq.get(t, 0) for t in paper_tags & liked_tags)
        p["_smart_boost"] = boost

    papers.sort(key=lambda p: p.get("_smart_boost", 0), reverse=True)
    return papers


def main():
    parser = argparse.ArgumentParser(
        description="회로 설계 논문 검색 → Obsidian 저장",
        formatter_class=argparse.RawTextHelpFormatter,
        epilog="""
사용 예시:
  python main.py "HBM bandwidth"
  python main.py "TSV 3D stacking" --year 2020 --limit 30
  python main.py "sense amplifier DRAM" --venue ISSCC
  python main.py "power delivery" --source arxiv
  python main.py "PLL clock" --source ss --limit 15 --smart
        """,
    )
    parser.add_argument("query", help="검색 키워드 (영문 권장)")
    parser.add_argument("--limit", type=int, default=20, help="최대 결과 수 (기본: 20)")
    parser.add_argument("--year", type=int, help="최소 발행 연도 (예: 2020)")
    parser.add_argument("--venue", help="학회/저널 필터 (예: ISSCC, JSSC, IEDM)")
    parser.add_argument(
        "--source",
        choices=["ss", "arxiv", "all"],
        default="all",
        help="검색 소스: ss=Semantic Scholar, arxiv=arXiv, all=전체 (기본)",
    )
    parser.add_argument(
        "--smart",
        action="store_true",
        help="좋아요 데이터 기반 스마트 랭킹 적용",
    )
    args = parser.parse_args()

    config = load_config()

    papers = []

    if args.source in ("ss", "all"):
        print(f"[Semantic Scholar] '{args.query}' 검색 중...")
        ss_papers = semantic_scholar.search(
            args.query,
            limit=args.limit,
            year_min=args.year,
            venue_filter=args.venue,
        )
        print(f"  → {len(ss_papers)}개 발견")
        papers.extend(ss_papers)

    if args.source in ("arxiv", "all"):
        arxiv_limit = args.limit // 2 if args.source == "all" else args.limit
        print(f"[arXiv] '{args.query}' 검색 중...")
        ax_papers = arxiv_search.search(
            args.query,
            limit=arxiv_limit,
            year_min=args.year,
        )
        print(f"  → {len(ax_papers)}개 발견")
        papers.extend(ax_papers)

    if not papers:
        print("\n검색 결과가 없습니다. 키워드를 변경해보세요.")
        sys.exit(0)

    # 스마트 랭킹 (--smart 플래그 또는 user_prefs.json 존재 시 자동)
    prefs_path = Path(config.get("db_file", "")).parent / "user_prefs.json"
    if args.smart or prefs_path.exists():
        papers = _smart_rank(papers, config)

    print(f"\n총 {len(papers)}개 논문 처리 중...")
    new_count = 0
    skip_count = 0

    for paper in papers:
        if save_to_obsidian(paper, config):
            new_count += 1
            print(f"  [저장] {paper['title'][:70]}")
        else:
            skip_count += 1

    print(f"\n완료: {new_count}개 새로 저장 / {skip_count}개 중복 건너뜀")
    print(f"저장 위치: {config['vault_path']}\\{config['papers_folder']}")


if __name__ == "__main__":
    main()
