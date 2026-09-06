"""
매일 reviewPool에서 단어 10개 선택 → Claude로 문장복습 스토리 생성 → Firebase 저장
Task Scheduler: 매일 06:30 KST 실행 (단어 생성 후)
"""
import json
import os
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent

# .env 로드
env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

DB_URL    = os.environ["FIREBASE_DATABASE_URL"].rstrip("/")
DB_SECRET = os.environ["FIREBASE_DATABASE_SECRET"]   # Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 데이터베이스 보안 비밀
USER_UID  = os.environ["FIREBASE_USER_UID"]           # Firebase 콘솔 → Authentication → 사용자 UID
API_KEY   = os.environ["ANTHROPIC_API_KEY"]


def get_kst_date() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d")


def fb_get(path: str) -> dict | None:
    url = f"{DB_URL}/{path}.json?auth={DB_SECRET}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read().decode())
            return data
    except urllib.error.HTTPError as e:
        print(f"[!] Firebase GET 실패 {path}: {e.code}")
        return None


def fb_put(path: str, data: dict) -> bool:
    url = f"{DB_URL}/{path}.json?auth={DB_SECRET}"
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="PUT",
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
            return True
    except urllib.error.HTTPError as e:
        print(f"[!] Firebase PUT 실패 {path}: {e.code} {e.read().decode()}")
        return False


def call_claude(prompt: str) -> str:
    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        method="POST",
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())["content"][0]["text"]


def main():
    today = get_kst_date()
    print(f"[*] review story 생성 시작: {today}")

    # 이미 오늘치 있으면 스킵
    existing = fb_get(f"users/{USER_UID}/english/reviewStory/{today}")
    if existing:
        print("[+] 오늘치 스토리 이미 존재. 스킵.")
        return

    # reviewPool 읽기
    pool = fb_get(f"users/{USER_UID}/english/reviewPool")
    if not pool:
        print("[!] reviewPool 비어있음. 종료.")
        return

    candidates = sorted(
        [(wid, v) for wid, v in pool.items() if (v.get("count") or 0) < 10],
        key=lambda x: x[1].get("count") or 0
    )[:10]

    if not candidates:
        print("[!] 활성 단어 없음 (전부 졸업). 종료.")
        return

    words = [{"word": v["word"], "meaning": v.get("meaning", ""), "pos": v.get("pos", "")}
             for _, v in candidates]
    word_list = ", ".join(f"{w['word']} ({w['meaning']})" for w in words)
    print(f"[*] 단어 {len(words)}개: {word_list}")

    prompt = f"""You have these English vocabulary words to review: {word_list}

Create a review in two sections:

1. STORY: Write 3-4 sentences forming a coherent, natural story. Use as many words as fit naturally — do NOT force words that feel out of place. Bold each used word with **word**. Add Korean translation after each sentence.

2. EXTRA: For any words that did not fit the story, write one natural standalone example sentence each. Bold the word. Add Korean translation.

Return ONLY JSON (no markdown):
{{"sentences":[{{"en":"Story sentence with **vocab**.","ko":"한국어 번역."}}],"extra":[{{"en":"Standalone sentence with **word**.","ko":"한국어 번역."}}],"wordNuances":[{{"word":"word1","meaning":"뜻","nuance":"뉘앙스 1~2문장"}}]}}"""

    print("[*] Claude 호출 중...")
    try:
        text = call_claude(prompt)
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            print(f"[!] JSON 파싱 실패. 응답:\n{text[:200]}")
            return
        story = json.loads(m.group())
    except Exception as e:
        print(f"[!] Claude 호출 실패: {e}")
        return

    print(f"[+] 스토리 생성 완료: {len(story.get('sentences', []))}문장")

    if fb_put(f"users/{USER_UID}/english/reviewStory/{today}", story):
        print(f"[+] Firebase 저장 성공: users/{USER_UID}/english/reviewStory/{today}")
    else:
        print("[!] Firebase 저장 실패")


if __name__ == "__main__":
    main()
