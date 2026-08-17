"""
words_db.json의 모든 단어에 대한 문장 복습 데이터를 생성하고
Firebase Realtime Database의 english/sentences/{word_key}에 업로드.

이미 Firebase에 존재하는 단어는 스킵 (중복 생성/비용 방지).
"""
import json
import os
import urllib.request
from pathlib import Path
import anthropic

ROOT = Path(__file__).parent.parent
WORDS_DB_JSON = ROOT / "english" / "words_db.json"
FIREBASE_URL = os.environ.get(
    "EXPO_PUBLIC_FIREBASE_DATABASE_URL",
    "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"
)

def word_to_key(word: str) -> str:
    return word.lower().replace(" ", "_").replace("-", "_")

def firebase_get(path: str) -> dict | None:
    url = f"{FIREBASE_URL}/{path}.json"
    try:
        with urllib.request.urlopen(url) as r:
            data = json.loads(r.read())
            return data
    except Exception:
        return None

def firebase_put(path: str, data: dict):
    url = f"{FIREBASE_URL}/{path}.json"
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="PUT",
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return r.status

def load_words() -> list[str]:
    if not WORDS_DB_JSON.exists():
        return []
    db = json.loads(WORDS_DB_JSON.read_text(encoding="utf-8"))
    words = []
    for item in db:
        if isinstance(item, str):
            words.append(item)
        elif isinstance(item, dict):
            w = item.get("word", "")
            if w:
                words.append(w)
    return words

def generate_sentences_batch(client: anthropic.Anthropic, words: list[str]) -> list[dict]:
    words_str = ", ".join(words)
    prompt = f"""다음 TOEFL 어휘 {len(words)}개 각각에 대해 문장 복습 데이터를 JSON으로만 생성해주세요.
단어: {words_str}

JSON 형식 (배열):
[
  {{
    "word": "exacerbate",
    "sentence": "Skipping sleep only exacerbates the anxiety you already feel before an exam.",
    "sentence_ko": "수면 부족은 시험 전 불안을 더욱 악화시킬 뿐이에요.",
    "nuance": "이미 존재하는 부정적 상황을 능동적으로 더 심화시키는 뉘앙스. 외부 요인이 문제를 증폭시킬 때 씁니다.",
    "context": "건강, 갈등, 환경 문제, 사회 현상이 더 나빠지는 맥락. 뉴스·학술문에서 정책 비판할 때 자주 등장.",
    "everyday_usage": "'This only exacerbates the problem.' / 'Don't exacerbate the situation.' — stress/crisis를 목적어로 자주 씁니다.",
    "examples": [
      {{"en": "Pollution exacerbates respiratory illness.", "ko": "오염은 호흡기 질환을 악화시킨다."}},
      {{"en": "His comment only exacerbated the tension.", "ko": "그의 발언은 긴장을 더욱 고조시켰다."}},
      {{"en": "Drought exacerbated the food shortage.", "ko": "가뭄이 식량 부족을 악화시켰다."}}
    ]
  }}
]

규칙:
- 단어마다 하나의 객체
- sentence: 짧고 자연스러운 일상 영어 문장 (핵심만)
- sentence_ko: 한국어 번역
- nuance: 어떤 뉘앙스인지 (한국어, 2-3문장)
- context: 어떤 상황에서 쓰이는지 (한국어, 2-3문장)
- everyday_usage: 실제 일상 표현 패턴과 예시 (한국어, 2-3문장)
- examples: sentence와 다른 짧은 추가 예문 3개, 각각 12단어 이하 영문(en)과 한국어 번역(ko)
- JSON 배열만 반환, 다른 텍스트 없음"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )
    text = response.content[0].text.strip()
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("JSON 배열 없음")
    return json.loads(text[start:end])


def generate_examples_only(client: anthropic.Anthropic, word_sentence_pairs: list[tuple]) -> list[dict]:
    """기존 단어에 examples 필드만 추가 생성."""
    pairs_str = "\n".join([f'- "{w}": "{s}"' for w, s in word_sentence_pairs])
    prompt = f"""다음 각 영어 단어에 대해 주어진 예문과 다른 짧은 예문 3개를 생성해주세요.

단어 (단어: 기존예문):
{pairs_str}

규칙:
- 각 예문은 12단어 이하
- 기존 예문과 다른 상황/문맥
- 자연스러운 한국어 번역 포함

JSON 배열만 반환:
[
  {{
    "word": "exacerbate",
    "examples": [
      {{"en": "...", "ko": "..."}},
      {{"en": "...", "ko": "..."}},
      {{"en": "...", "ko": "..."}}
    ]
  }}
]"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )
    text = response.content[0].text.strip()
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("JSON 배열 없음")
    return json.loads(text[start:end])


def firebase_patch(path: str, data: dict):
    url = f"{FIREBASE_URL}/{path}.json"
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="PATCH",
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return r.status

def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        # .env 파일에서 로드 시도
        env_file = ROOT / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("ANTHROPIC_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()
                    os.environ["ANTHROPIC_API_KEY"] = api_key
                    break
    if not api_key:
        print("[!] ANTHROPIC_API_KEY 없음")
        return

    client = anthropic.Anthropic(api_key=api_key)
    words = load_words()
    print(f"[*] 총 단어 수: {len(words)}")

    # 이미 Firebase에 있는 단어 확인
    existing = firebase_get("english/sentences") or {}
    skip = set(existing.keys())
    todo = [w for w in words if word_to_key(w) not in skip]
    print(f"[*] 생성 필요: {len(todo)}개 (이미 존재: {len(skip)}개)")

    BATCH = 5
    success = 0

    if not todo:
        print("[+] 신규 단어 없음")
    else:
        for i in range(0, len(todo), BATCH):
            batch = todo[i:i + BATCH]
            print(f"[*] 배치 {i//BATCH + 1}: {batch}")
            try:
                results = generate_sentences_batch(client, batch)
                for item in results:
                    word = item.get("word", "")
                    if not word:
                        continue
                    key = word_to_key(word)
                    status = firebase_put(f"english/sentences/{key}", item)
                    print(f"  [+] {word} → Firebase PUT {status}")
                    success += 1
            except Exception as e:
                print(f"  [!] 배치 실패: {e}")

    # 2단계: 기존 단어 중 examples 없는 것에만 추가
    existing = firebase_get("english/sentences") or {}
    needs_examples = [(key, data) for key, data in existing.items()
                      if isinstance(data, dict) and "examples" not in data]
    print(f"\n[*] examples 없는 기존 단어: {len(needs_examples)}개")

    ex_success = 0
    for i in range(0, len(needs_examples), BATCH):
        batch = needs_examples[i:i + BATCH]
        pairs = [(data.get("word", key), data.get("sentence", "")) for key, data in batch]
        print(f"[*] examples 배치 {i//BATCH + 1}: {[p[0] for p in pairs]}")
        try:
            results = generate_examples_only(client, pairs)
            for item in results:
                word = item.get("word", "")
                if not word:
                    continue
                key = word_to_key(word)
                status = firebase_patch(f"english/sentences/{key}", {"examples": item["examples"]})
                print(f"  [+] {word} examples → PATCH {status}")
                ex_success += 1
        except Exception as e:
            print(f"  [!] examples 배치 실패: {e}")

    print(f"\n[완료] 신규 {success}개 / examples 추가 {ex_success}개")

if __name__ == "__main__":
    main()
