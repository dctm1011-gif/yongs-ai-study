#!/usr/bin/env python3
"""오늘 daily.json의 words + words_db 최근 단어로 sentences 생성 후 Firebase 패치"""
import json, os, re, urllib.request
from pathlib import Path
from datetime import date

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"
TODAY = str(date.today())

ROOT = Path(__file__).parent.parent
DAILY = ROOT / "english" / "daily.json"
WORDS_DB = ROOT / "english" / "words_db.json"

def call_claude(prompt: str, max_tokens=6000) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}]
    )
    return msg.content[0].text.strip()

def generate_sentences(words: list[dict]) -> list[dict]:
    word_list = [{"word": w["word"], "meaning_ko": w.get("meaning_ko", w.get("meaning", ""))} for w in words]
    prompt = (
        "아래 영어 단어 목록 각각에 대해 JSON 배열로 문장 학습 자료를 만들어줘. "
        "단어 하나당 정확히 하나의 항목만 생성 (절대 한 단어에 두 항목 금지).\n\n"
        "각 항목:\n"
        '- "word": 단어\n'
        '- "sentence": 짧고 자연스러운 일상 영어 문장 (단어가 반드시 포함)\n'
        '- "sentence_ko": 한국어 번역\n'
        '- "nuance": 이 단어의 느낌/뉘앙스를 한국어로 1-2문장\n'
        '- "context": 어떤 상황에서 쓰는지 한국어로 1문장\n'
        '- "everyday_usage": 실제 일상 표현 패턴 한국어로 1-2문장\n\n'
        "JSON 배열만 반환, 다른 텍스트 없이.\n\n"
        f"단어 목록:\n{json.dumps(word_list, ensure_ascii=False)}"
    )
    txt = call_claude(prompt)
    m = re.search(r"\[.*\]", txt, re.DOTALL)
    if not m:
        return []
    return json.loads(m.group())

def firebase_patch(path: str, data) -> bool:
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{DB_URL}/{path}.json", data=payload, method="PATCH",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            r.read()
        return True
    except Exception as e:
        print(f"  [!] Firebase 실패: {e}")
        return False

def main():
    daily = json.loads(DAILY.read_text(encoding="utf-8"))
    words_db = json.loads(WORDS_DB.read_text(encoding="utf-8"))

    today_words = daily.get("words", [])
    recent_db = [e for e in words_db if e.get("word") not in {w["word"] for w in today_words}]
    recent_10 = recent_db[-10:]

    all_words = today_words + recent_10
    print(f"문장 생성 대상: {len(all_words)}개 단어")
    print("  오늘 단어:", [w["word"] for w in today_words])
    print("  최근 DB:", [w["word"] for w in recent_10])

    print("\nClaude Haiku로 sentences 생성 중...")
    sentences = generate_sentences(all_words)
    print(f"  생성 완료: {len(sentences)}개")

    # daily.json 업데이트
    daily["sentences"] = sentences
    DAILY.write_text(json.dumps(daily, ensure_ascii=False, indent=2), encoding="utf-8")
    print("  daily.json 저장 완료")

    # Firebase 패치
    if firebase_patch(f"english/words/{TODAY}", {"sentences": sentences}):
        print(f"  ✓ Firebase english/words/{TODAY} sentences 패치 완료")
    else:
        print("  [!] Firebase 패치 실패")

if __name__ == "__main__":
    main()
