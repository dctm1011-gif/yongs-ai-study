"""기존에 저장된 논문 파일을 새 포맷(한국어 번역 + 주요 기술)으로 업데이트."""
import json
import sys
from pathlib import Path

from config import load_config
from tagger import auto_tag
from summarizer import translate_to_korean, extract_key_info
from formatter import _render, _safe_filename, _load_db, _save_db


def update_all():
    config = load_config()
    db_path = Path(config["db_file"])
    db = _load_db(db_path)
    papers_dir = Path(config["vault_path"]) / config["papers_folder"]

    md_files = list(papers_dir.glob("*.md"))
    if not md_files:
        print("업데이트할 논문 파일이 없습니다.")
        return

    print(f"총 {len(md_files)}개 파일 업데이트 시작...\n")

    for i, md_file in enumerate(md_files, 1):
        content = md_file.read_text(encoding="utf-8")
        paper = _parse_existing(content)

        if not paper:
            print(f"[{i}/{len(md_files)}] 건너뜀 (파싱 실패): {md_file.name}")
            continue

        print(f"[{i}/{len(md_files)}] {paper['title'][:60]}")
        tags = auto_tag(paper["title"], paper.get("abstract", ""))
        abstract_en = paper.get("abstract", "")
        print(f"    번역 중...", end="", flush=True)
        abstract_ko = translate_to_korean(abstract_en) if abstract_en else ""
        key_info = extract_key_info(paper["title"], abstract_en)
        print(" 완료")

        new_md = _render(paper, tags, abstract_en, abstract_ko, key_info)
        md_file.write_text(new_md, encoding="utf-8")

    print(f"\n완료: {len(md_files)}개 파일 업데이트됨")


def _parse_existing(content: str) -> dict | None:
    import re

    def fm(key):
        m = re.search(rf'^{key}:\s*"?(.+?)"?\s*$', content, re.MULTILINE)
        return m.group(1).strip('"') if m else ""

    def fm_int(key):
        m = re.search(rf'^{key}:\s*(\d+)', content, re.MULTILINE)
        return int(m.group(1)) if m else None

    title = fm("title")
    if not title:
        return None

    abstract_match = re.search(r'## 초록 \(원문\)\n\n(.+?)(?=\n---|\n##|\Z)', content, re.DOTALL)
    if not abstract_match:
        abstract_match = re.search(r'## 초록\n\n(.+?)(?=\n---|\n##|\Z)', content, re.DOTALL)

    abstract = abstract_match.group(1).strip() if abstract_match else ""

    authors_raw = fm("authors")
    authors = [a.strip() for a in authors_raw.split(",")] if authors_raw else []

    year_m = re.search(r'^year:\s*(\d+)', content, re.MULTILINE)
    year = int(year_m.group(1)) if year_m else None

    return {
        "id": f"update:{title[:30]}",
        "title": title,
        "abstract": abstract,
        "year": year,
        "authors": authors,
        "venue": fm("venue"),
        "citation_count": fm_int("citation_count"),
        "doi": fm("doi") or None,
        "pdf_url": fm("pdf") or None,
        "url": fm("url"),
        "source": fm("source"),
    }


if __name__ == "__main__":
    update_all()
