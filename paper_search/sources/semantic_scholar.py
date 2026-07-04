import requests
import time

BASE_URL = "https://api.semanticscholar.org/graph/v1"

FIELDS = "paperId,title,abstract,year,authors,venue,publicationVenue,externalIds,citationCount,openAccessPdf,url"

TOP_VENUES = {
    "ISSCC", "JSSC", "IEDM", "VLSI", "CICC", "ESSCIRC",
    "TCAS-I", "TCAS-II", "TCAD", "EDL", "TED",
    "DAC", "ICCAD", "DATE", "MICRO", "ISCA", "HPCA",
}


def search(query: str, limit: int = 20, year_min: int = None, venue_filter: str = None) -> list[dict]:
    params = {
        "query": query,
        "limit": min(limit * 3, 100),
        "fields": FIELDS,
    }
    if year_min:
        params["year"] = f"{year_min}-"

    for attempt in range(3):
        try:
            resp = requests.get(f"{BASE_URL}/paper/search", params=params, timeout=15)
            if resp.status_code == 429:
                wait = 10 * (attempt + 1)
                print(f"[Semantic Scholar] 요청 제한, {wait}초 대기 후 재시도...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.RequestException as e:
            print(f"[Semantic Scholar] 검색 오류: {e}")
            return []
    else:
        print("[Semantic Scholar] 재시도 초과, 건너뜁니다.")
        return []

    papers = []
    for item in data.get("data", []):
        if not item.get("title") or not item.get("abstract"):
            continue

        venue = _extract_venue(item)

        if venue_filter and venue_filter.upper() not in venue.upper():
            continue

        papers.append({
            "id": f"ss:{item['paperId']}",
            "title": item["title"],
            "abstract": item["abstract"],
            "year": item.get("year"),
            "authors": [a["name"] for a in item.get("authors", [])],
            "venue": venue,
            "citation_count": item.get("citationCount", 0),
            "doi": item.get("externalIds", {}).get("DOI"),
            "arxiv_id": item.get("externalIds", {}).get("ArXiv"),
            "pdf_url": (item.get("openAccessPdf") or {}).get("url"),
            "url": item.get("url") or f"https://www.semanticscholar.org/paper/{item['paperId']}",
            "source": "Semantic Scholar",
        })

        if len(papers) >= limit:
            break

    time.sleep(0.5)
    return papers


def _extract_venue(item: dict) -> str:
    pub_venue = item.get("publicationVenue") or {}
    if pub_venue.get("name"):
        return pub_venue["name"]
    return item.get("venue") or "Unknown"
