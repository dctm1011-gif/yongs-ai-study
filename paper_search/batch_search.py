"""
config.json의 interest_queries를 순서대로 검색해서 Obsidian에 저장.

  python paper_search/batch_search.py
  python paper_search/batch_search.py --year 2022   # 연도 필터
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import load_config
from formatter import save_to_obsidian
from sources import arxiv_search, semantic_scholar


def main():
    parser = argparse.ArgumentParser(description="관심 주제 일괄 검색")
    parser.add_argument("--year", type=int, help="최소 발행 연도")
    parser.add_argument("--source", choices=["ss", "arxiv", "all"], default="all")
    args = parser.parse_args()

    config = load_config()
    queries = config.get("interest_queries", [])
    if not queries:
        print("config.json에 interest_queries가 없습니다.")
        sys.exit(1)

    total_new = 0
    total_skip = 0

    for item in queries:
        query = item["query"]
        limit = item.get("limit", 20)
        print(f"\n{'='*60}")
        print(f"[검색] {query}")

        papers = []

        if args.source in ("ss", "all"):
            ss = semantic_scholar.search(query, limit=limit, year_min=args.year)
            print(f"  Semantic Scholar: {len(ss)}개")
            papers.extend(ss)

        if args.source in ("arxiv", "all"):
            ax_limit = limit // 2 if args.source == "all" else limit
            ax = arxiv_search.search(query, limit=ax_limit, year_min=args.year)
            print(f"  arXiv: {len(ax)}개")
            papers.extend(ax)

        new_c = skip_c = 0
        for p in papers:
            if save_to_obsidian(p, config):
                new_c += 1
                title_safe = p['title'][:65].encode('cp949', errors='replace').decode('cp949')
                print(f"  [저장] {title_safe}")
            else:
                skip_c += 1

        print(f"  -> 새로 저장 {new_c}개 / 중복 {skip_c}개")
        total_new  += new_c
        total_skip += skip_c
        time.sleep(1)

    print(f"\n{'='*60}")
    print(f"완료: 총 {total_new}개 새로 저장 / {total_skip}개 중복 건너뜀")
    print(f"저장 위치: {config['vault_path']}\\{config['papers_folder']}")


if __name__ == "__main__":
    main()
