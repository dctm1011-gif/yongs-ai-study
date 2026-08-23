#!/usr/bin/env python3
"""
오늘 날짜의 korea_news / korea_herald 기사에서
ko/analysis가 비어있는 sentences를 Claude Haiku로 채움
"""
import json
import os
import re
import urllib.request
from datetime import datetime, timezone, timedelta

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"

TODAY = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")


def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()
    except Exception as e:
        print(f"  [!] {url[:70]} → {e}")
        return None


def put(url: str, data: dict) -> bool:
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="PUT",
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            r.read()
        return True
    except Exception as e:
        print(f"  [!] PUT 실패: {e}")
        return False


def _call_translate_api(client, batch: list[str]) -> list[dict]:
    prompt = (
        "You are a cheerful 20-year-old Korean woman explaining English sentences to your boyfriend in Korean. "
        "Use emojis naturally, be warm and casual (친구한테 말하듯이), and make it fun to read. "
        "Write the analysis as one flowing paragraph — no rigid bullet points, just talk naturally.\n\n"
        "For each English sentence below, return a JSON array where each element has:\n"
        '- "ko": natural Korean translation\n'
        '- "analysis": a friendly Korean explanation that naturally covers:\n'
        "  · 문장 구조나 핵심 표현을 쉽게 설명\n"
        "  · 핵심 단어의 동의어나 다른 표현\n"
        "  · 동사+전치사 조합이나 숙어가 있으면 용법 설명\n"
        "  · 일상 영어에서 어떻게 더 캐주얼하게 말하는지 — 실제 영어 표현을 직접 보여줄 것 "
        "(예: 구어체로는 'It's not a big deal' 이렇게 말해~ 처럼 작은따옴표로 감싸서)\n"
        "  · 기억에 남을 팁이나 재미있는 비유\n\n"
        "Return ONLY valid JSON array, no other text.\n\n"
        + json.dumps(batch, ensure_ascii=False)
    )
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}],
    )
    txt = msg.content[0].text.strip()
    m = re.search(r"\[.*\]", txt, re.DOTALL)
    if not m:
        return []
    raw_json = m.group()
    try:
        result = json.loads(raw_json)
    except json.JSONDecodeError:
        import ast
        try:
            result = ast.literal_eval(raw_json)
        except Exception:
            return []
    if not isinstance(result, list) or len(result) != len(batch):
        return []
    return [{"ko": str(r.get("ko", "")), "analysis": str(r.get("analysis", ""))} for r in result]


def translate_and_analyze(sentences: list[str]) -> list[dict]:
    if not ANTHROPIC_API_KEY or not sentences:
        print("  [!] ANTHROPIC_API_KEY 없음 또는 sentences 비어있음")
        return [{"ko": "", "analysis": ""} for _ in sentences]
    import anthropic as ant
    client = ant.Anthropic(api_key=ANTHROPIC_API_KEY)
    BATCH = 8
    results: list[dict] = []
    for i in range(0, len(sentences), BATCH):
        batch = sentences[i:i + BATCH]
        print(f"  번역 중: batch {i//BATCH+1} ({len(batch)}문장)...")
        batch_result = _call_translate_api(client, batch)
        if not batch_result:
            print(f"  [!] 배치 {i//BATCH+1} 번역 실패 — 빈값으로 대체")
            batch_result = [{"ko": "", "analysis": ""} for _ in batch]
        results.extend(batch_result)
    return results


def patch_path(path_key: str):
    """firebase_path의 오늘 기사를 읽어서 빈 ko/analysis를 채움"""
    url = f"{DB_URL}/english/{path_key}/{TODAY}.json"
    raw = fetch(url)
    if not raw:
        print(f"  데이터 없음: {path_key}/{TODAY}")
        return

    try:
        articles = json.loads(raw)
    except Exception as e:
        print(f"  JSON 파싱 실패: {e}")
        return

    if not articles:
        print(f"  기사 없음: {path_key}/{TODAY}")
        return

    changed = False
    for article in articles:
        sents = article.get("sentences", [])
        if not sents:
            print(f"  sentences 없음: {article.get('title', '?')[:50]}")
            continue

        # ko가 비어있는 문장만 확인
        needs_patch = [s for s in sents if not s.get("ko")]
        if not needs_patch:
            print(f"  이미 완성: {article.get('title', '?')[:50]}")
            continue

        print(f"  패치 대상: {article.get('title', '?')[:50]} ({len(needs_patch)}/{len(sents)}문장 비어있음)")

        # 모든 문장의 en을 추출해서 번역 (전체 재번역)
        sents_en = [s.get("en", "") for s in sents]
        analyzed = translate_and_analyze(sents_en)

        article["sentences"] = [
            {"en": s.get("en", ""), "ko": a["ko"], "analysis": a["analysis"]}
            for s, a in zip(sents, analyzed)
        ]
        changed = True

    if changed:
        if put(url, articles):
            print(f"  ✓ {path_key}/{TODAY} 패치 완료")
        else:
            print(f"  [!] Firebase 저장 실패")
    else:
        print(f"  이미 최신 상태 ({path_key}/{TODAY})")


def main():
    print(f"[*] 뉴스 sentences 패치 — {TODAY}")
    if not ANTHROPIC_API_KEY:
        print("[!] ANTHROPIC_API_KEY 환경변수 없음")
        return

    print("\n[korea_news]")
    patch_path("korea_news")

    print("\n[korea_herald]")
    patch_path("korea_herald")

    print("\n[*] 완료")


if __name__ == "__main__":
    main()
