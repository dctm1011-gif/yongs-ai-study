import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)"}


def extract_arxiv_figures(arxiv_id: str, attachments_dir: Path) -> list[dict]:
    """arXiv HTML 버전에서 그림과 캡션을 추출해 로컬에 저장."""
    if not arxiv_id:
        return []

    clean_id = arxiv_id.strip().split("v")[0]
    html_url = f"https://arxiv.org/html/{clean_id}"

    try:
        resp = requests.get(html_url, headers=HEADERS, timeout=20)
        if resp.status_code != 200:
            return []
    except requests.RequestException:
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    attachments_dir.mkdir(parents=True, exist_ok=True)

    figures = []
    safe_id = re.sub(r"[^\w.-]", "_", clean_id)

    for i, fig_el in enumerate(soup.find_all("figure"), 1):
        img_el = fig_el.find("img")
        caption_el = fig_el.find("figcaption")

        caption_text = ""
        if caption_el:
            caption_text = caption_el.get_text(" ", strip=True)
            caption_text = re.sub(r"\s+", " ", caption_text)

        if not img_el or not img_el.get("src"):
            continue

        src = img_el["src"]
        if src.startswith("data:"):
            ext, b64 = _parse_data_uri(src)
            if b64:
                filename = f"{safe_id}_fig{i}.{ext}"
                (attachments_dir / filename).write_bytes(b64)
                figures.append({"filename": filename, "caption": caption_text, "index": i})
            continue

        if src.startswith("http"):
            img_url = src
        elif src.startswith("/"):
            img_url = f"https://arxiv.org{src}"
        else:
            img_url = f"https://arxiv.org/html/{clean_id}/{src}"
        ext = img_url.split(".")[-1].split("?")[0][:4].lower() or "png"
        if ext not in ("png", "jpg", "jpeg", "gif", "svg", "webp"):
            ext = "png"
        filename = f"{safe_id}_fig{i}.{ext}"

        try:
            ir = requests.get(img_url, headers=HEADERS, timeout=10)
            if ir.status_code == 200:
                (attachments_dir / filename).write_bytes(ir.content)
                figures.append({"filename": filename, "caption": caption_text, "index": i})
        except requests.RequestException:
            pass

        time.sleep(0.15)

    return figures


def _parse_data_uri(src: str):
    m = re.match(r"data:image/(\w+);base64,(.+)", src)
    if not m:
        return "png", None
    import base64
    try:
        return m.group(1), base64.b64decode(m.group(2))
    except Exception:
        return "png", None
