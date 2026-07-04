import json
import re
from datetime import date
from pathlib import Path

from tagger import auto_tag
from summarizer import translate_to_korean, extract_key_info
from figure_extractor import extract_arxiv_figures


def save_to_obsidian(paper: dict, config: dict) -> bool:
    db_path = Path(config["db_file"])
    db = _load_db(db_path)

    if paper["id"] in db:
        return False

    tags = auto_tag(paper["title"], paper["abstract"] or "")
    abstract_en = (paper.get("abstract") or "").strip()

    print(f"    번역 중...", end="", flush=True)
    abstract_ko = translate_to_korean(abstract_en) if abstract_en else ""
    key_info = extract_key_info(paper["title"], abstract_en)
    print(" 완료", end="")

    figures = []
    if paper.get("arxiv_id"):
        print(f" / 그림 추출 중...", end="", flush=True)
        attachments_dir = Path(config["vault_path"]) / config["papers_folder"] / "attachments"
        figures = extract_arxiv_figures(paper["arxiv_id"], attachments_dir)
        print(f" {len(figures)}개")
    else:
        print()

    md = _render(paper, tags, abstract_en, abstract_ko, key_info, figures)
    filename = _safe_filename(paper["title"], paper.get("year"))

    papers_dir = Path(config["vault_path"]) / config["papers_folder"]
    papers_dir.mkdir(parents=True, exist_ok=True)
    (papers_dir / filename).write_text(md, encoding="utf-8")

    db[paper["id"]] = {"title": paper["title"], "file": filename, "saved": str(date.today())}
    _save_db(db_path, db)
    return True


def _render(paper: dict, tags: list[str], abstract_en: str, abstract_ko: str,
            key_info: dict, figures: list[dict]) -> str:
    authors_str = ", ".join(paper.get("authors", [])[:6])
    if len(paper.get("authors", [])) > 6:
        authors_str += " et al."

    tag_yaml = "\n".join(f'  - "{t}"' for t in tags)
    doi_line = f'doi: "{paper["doi"]}"' if paper.get("doi") else 'doi: ""'
    citation_line = (
        f'citation_count: {paper["citation_count"]}'
        if paper.get("citation_count") is not None
        else "citation_count: null"
    )
    pdf_line = f'pdf: "{paper["pdf_url"]}"' if paper.get("pdf_url") else 'pdf: ""'
    citation_display = paper.get("citation_count") if paper.get("citation_count") is not None else "-"
    tags_display = " ".join("#" + t for t in tags)

    key_tech_md = _render_key_tech(key_info)
    figures_md = _render_figures(figures)

    links = [f"- [원문 보기]({paper.get('url', '')})"]
    if paper.get("pdf_url"):
        links.append(f"- [PDF]({paper['pdf_url']})")
    if paper.get("doi"):
        links.append(f"- [DOI](https://doi.org/{paper['doi']})")
    links_md = "\n".join(links)

    return (
        f'---\n'
        f'title: "{_escape_yaml(paper["title"])}"\n'
        f'authors: "{authors_str}"\n'
        f'year: {paper.get("year") or "null"}\n'
        f'venue: "{paper.get("venue") or "Unknown"}"\n'
        f'{doi_line}\n'
        f'{citation_line}\n'
        f'{pdf_line}\n'
        f'url: "{paper.get("url", "")}"\n'
        f'source: "{paper.get("source", "")}"\n'
        f'date_added: "{date.today()}"\n'
        f'tags:\n{tag_yaml}\n'
        f'---\n\n'
        f'# {paper["title"]}\n\n'
        f'| 저자 | {authors_str} |\n'
        f'|------|------|\n'
        f'| 발행 | {paper.get("venue") or "Unknown"} {paper.get("year") or ""} |\n'
        f'| 인용수 | {citation_display} |\n'
        f'| 태그 | {tags_display} |\n\n'
        f'---\n\n'
        f'## 초록 (한국어)\n\n'
        f'{abstract_ko or "번역 실패 — 아래 원문 참조"}\n\n'
        f'## 초록 (원문)\n\n'
        f'{abstract_en or "초록 없음"}\n\n'
        f'---\n\n'
        f'{key_tech_md}'
        f'{figures_md}'
        f'## 링크\n\n'
        f'{links_md}\n\n'
        f'---\n\n'
        f'## 개인 메모\n\n'
        f'<!-- 읽으면서 추가 정리 -->\n'
    )


def _render_key_tech(info: dict) -> str:
    lines = ["## 주요 기술 분석\n"]

    if info.get("process"):
        lines.append("**공정 기술:**")
        for p in info["process"]:
            lines.append(f"- {p}")
        lines.append("")

    if info.get("techniques"):
        lines.append("**핵심 회로/기술:**")
        for t in info["techniques"]:
            lines.append(f"- {t}")
        lines.append("")

    if info.get("metrics"):
        lines.append("**성능 지표 (초록 추출):**")
        for label, val in info["metrics"]:
            lines.append(f"- {label}: `{val}`")
        lines.append("")

    if len(lines) == 1:
        lines.append("*초록에서 자동 추출된 기술 정보 없음*\n")

    lines.append("---\n")
    return "\n".join(lines) + "\n"


def _render_figures(figures: list[dict]) -> str:
    if not figures:
        return ""

    lines = [f"## 논문 그림 ({len(figures)}개)\n"]
    for fig in figures:
        lines.append(f"### Figure {fig['index']}")
        lines.append(f"![[attachments/{fig['filename']}]]")
        if fig.get("caption"):
            lines.append(f"> {fig['caption']}")
        lines.append("")

    lines.append("---\n")
    return "\n".join(lines) + "\n"


def _safe_filename(title: str, year) -> str:
    clean = re.sub(r'[\\/:*?"<>|]', "", title)
    clean = re.sub(r"\s+", " ", clean).strip()[:80]
    prefix = f"{year}_" if year else ""
    return f"{prefix}{clean}.md"


def _escape_yaml(s: str) -> str:
    return s.replace('"', '\\"')


def _load_db(path: Path) -> dict:
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_db(path: Path, db: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
