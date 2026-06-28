import requests
import xml.etree.ElementTree as ET
import time
import re

BASE_URL = "http://export.arxiv.org/api/query"
NS = "http://www.w3.org/2005/Atom"

CIRCUIT_CATEGORIES = ["cs.AR", "eess.SP", "eess.SY", "cs.ET", "cond-mat.mes-hall"]


def search(query: str, limit: int = 10, year_min: int = None) -> list[dict]:
    cat_filter = " OR ".join(f"cat:{c}" for c in CIRCUIT_CATEGORIES)
    full_query = f"({query}) AND ({cat_filter})"

    params = {
        "search_query": f"all:{full_query}",
        "start": 0,
        "max_results": limit,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    try:
        resp = requests.get(BASE_URL, params=params, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[arXiv] 검색 오류: {e}")
        return []

    papers = []
    root = ET.fromstring(resp.content)

    for entry in root.findall(f"{{{NS}}}entry"):
        title = _text(entry, f"{{{NS}}}title")
        abstract = _text(entry, f"{{{NS}}}summary")
        if not title or not abstract:
            continue

        published = _text(entry, f"{{{NS}}}published") or ""
        year = int(published[:4]) if published else None

        if year_min and year and year < year_min:
            continue

        arxiv_id = _text(entry, f"{{{NS}}}id") or ""
        arxiv_id = arxiv_id.split("/abs/")[-1].strip()

        authors = [
            _text(a, f"{{{NS}}}name") or ""
            for a in entry.findall(f"{{{NS}}}author")
        ]

        categories = [
            c.get("term", "")
            for c in entry.findall("{http://arxiv.org/schemas/atom}primary_category")
        ] + [
            c.get("term", "")
            for c in entry.findall("{http://www.w3.org/2005/Atom}category")
        ]

        papers.append({
            "id": f"arxiv:{arxiv_id}",
            "title": re.sub(r"\s+", " ", title).strip(),
            "abstract": re.sub(r"\s+", " ", abstract).strip(),
            "year": year,
            "authors": [a for a in authors if a],
            "venue": "arXiv",
            "citation_count": None,
            "doi": None,
            "arxiv_id": arxiv_id,
            "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}",
            "url": f"https://arxiv.org/abs/{arxiv_id}",
            "source": "arXiv",
        })

    time.sleep(0.3)
    return papers


def _text(elem, tag: str) -> str | None:
    child = elem.find(tag)
    return child.text.strip() if child is not None and child.text else None
