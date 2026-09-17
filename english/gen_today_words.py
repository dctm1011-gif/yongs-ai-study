"""오늘 단어 생성 스크립트 (도메인 방식)"""
import json, os, re, sys, urllib.request
from pathlib import Path
from datetime import date
import anthropic

ROOT = Path(__file__).parent.parent
WORDS_DB = ROOT / "english" / "words_db.json"
today = date.today()

# 하루 신규 단어 수. 복습 풀 유입이 유출(졸업)보다 많아 풀이 무한히 커지던 문제 때문에
# 2026-09-17에 5 → 3으로 낮춤 (졸업 기준도 10 → 5로 함께 조정).
WORDS_PER_DAY = 3

def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

load_env()

DB_URL = os.environ.get("EXPO_PUBLIC_FIREBASE_DATABASE_URL", "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app")

# ── 멱등성 체크: 오늘 Firebase에 이미 데이터 있으면 words_db만 동기화 후 종료 ──
try:
    with urllib.request.urlopen(f"{DB_URL}/english/words/{today}.json", timeout=10) as _r:
        _existing = json.loads(_r.read())
    if (_existing and isinstance(_existing, dict)
            and _existing.get("words")
            and str(_existing.get("date", "")) == str(today)):
        print(f"[*] 오늘({today}) 이미 업로드됨 ({len(_existing.get('words', []))}개) — words_db 동기화 후 종료")
        _db = json.loads(WORDS_DB.read_text(encoding="utf-8"))
        _db_lower = {e.get("word", "").lower() for e in _db if e.get("word")}
        _added = 0
        for _w in _existing.get("words", []):
            _word = _w.get("word", "")
            if _word and _word.lower() not in _db_lower:
                _db.append({
                    "id": _word, "word": _word,
                    "pos": _w.get("part_of_speech", ""),
                    "date": str(today),
                    "meaning": _w.get("meaning_ko", ""),
                    "example_ko": _w.get("example_ko", ""),
                    "example_en": _w.get("example_from_convo", ""),
                    "explanation": _w.get("explanation", ""),
                    "tip": _w.get("tip", ""),
                    "emoji": _w.get("emoji", ""),
                })
                _db_lower.add(_word.lower())
                _added += 1
        if _added:
            WORDS_DB.write_text(json.dumps(_db, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[*] words_db +{_added}개 동기화")
        sys.exit(0)
except Exception:
    pass  # Firebase 확인 실패 → 정상 진행
# ─────────────────────────────────────────────────────────────────────────────

db = json.loads(WORDS_DB.read_text(encoding="utf-8"))
all_words = [e.get("word","") for e in db if e.get("word")]
used_lower = {w.lower() for w in all_words}
recent_50 = ", ".join(all_words[-20:])
print(f"DB 단어 수: {len(all_words)}")

def _stem(w):
    return w.lower().replace(" ", "").replace("-", "")[:6]
used_stems = {_stem(w) for w in all_words if len(w.replace(" ", "")) >= 6}

def is_stem_dup(word):
    for token in word.lower().split():
        if len(token) >= 6 and token[:6] in used_stems:
            return True
    return False

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# 1단계: 범학문 AWL B2-C1 후보 단어 선정
resp = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=700,
    messages=[{"role": "user", "content": f"""10개의 영어 학술 단어를 선정하세요. 5개 영역에서 각 2개씩:
1. 자연과학/환경  2. 사회/정치  3. 경제/경영  4. 심리/교육  5. 문화/예술

절대 금지: {recent_50}
조건 (반드시 지킬 것):
- CEFR B2~C1 수준 학술 어휘 (Academic Word List 범위)
- 여러 학문 분야에서 두루 쓰이는 단어 (예: scrutinize, prevalent, empirical, tangible, coherent)
- 의학 전공술어·법률 라틴어·철학 전문용어 절대 금지 (예: etiopathogenesis, mens rea, apodictic 금지)
- TOEFL iBT Reading/Writing에 실제 등장하는 수준
- 슬랭·구어 금지

JSON 배열만 반환:
[{{"word":"단어","domain":"도메인","pos":"품사","meaning_ko":"뜻"}}]"""}]
)
raw = resp.content[0].text.strip()
print(f"1단계 응답:\n{raw}\n")

m = re.search(r'\[[\s\S]*\]', raw)
if not m:
    print("[!] 후보 JSON 없음")
    sys.exit(1)
candidates = json.loads(m.group(0))
print(f"후보: {[(c['word'],c.get('domain','')) for c in candidates]}")

valid = [c for c in candidates if c.get("word","").lower() not in used_lower and not is_stem_dup(c["word"])]
print(f"유효: {[c['word'] for c in valid]}")

if len(valid) < WORDS_PER_DAY:
    resp2 = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=700,
        messages=[{"role": "user", "content": f"""이미 선택된 단어: {[c['word'] for c in candidates]}
추가로 금지: {recent_50}

{WORDS_PER_DAY}개 도메인에서 각 1개씩, 위 금지 목록에 없는 단어 {WORDS_PER_DAY}개만:
[{{"word":"단어","domain":"도메인","pos":"품사","meaning_ko":"뜻"}}]"""}]
    )
    raw2 = resp2.content[0].text.strip()
    m2 = re.search(r'\[[\s\S]*\]', raw2)
    if m2:
        extra = json.loads(m2.group(0))
        for c in extra:
            if c.get("word","").lower() not in used_lower and c["word"] not in [v["word"] for v in valid]:
                valid.append(c)
                if len(valid) >= WORDS_PER_DAY:
                    break

final = valid[:WORDS_PER_DAY]
if len(final) < WORDS_PER_DAY:
    print(f"[!] {len(final)}개만 확보 — 중단")
    sys.exit(1)

words_str = ", ".join(c["word"] for c in final)
print(f"\n최종 단어: {words_str}")

# 2단계: 전체 콘텐츠 생성
resp3 = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=4000,
    messages=[{"role": "user", "content": f"""단어 {WORDS_PER_DAY}개: {words_str}
날짜: {today}

아래 JSON 구조로 학습 자료를 생성하세요. JSON만 반환 (마크다운 코드블록 없이):

{{
  "date": "{today}",
  "words": [
    {{
      "word": "단어",
      "part_of_speech": "품사",
      "meaning_ko": "한국어 뜻",
      "explanation": "설명",
      "example_from_convo": "영어 예문",
      "example_ko": "한국어 예문",
      "tip": "동의어/반의어 + TOEFL 출제 영역",
      "emoji": "이모지"
    }}
  ],
  "quiz": [
    {{"type": "meaning", "word": "단어", "question": "Which best defines X?", "options": ["a","b","c","d"], "answer": 0, "explanation": "설명", "option_explanations": [null,"이유","이유","이유"]}},
    {{"type": "fill_blank", "word": "단어", "sentence": "The ___ situation...", "sentence_ko": "한국어", "answer": "단어", "hint": "힌트"}},
    {{"type": "situation", "word": "단어", "question": "Situation description?", "options": ["a","b","c","d"], "answer": 0, "explanation": "설명"}}
  ],
  "sentences": [
    {{"word": "단어", "sentence": "영어 문장", "sentence_ko": "한국어", "nuance": "뉘앙스", "context": "상황", "everyday_usage": "표현 패턴"}}
  ]
}}

규칙: words {WORDS_PER_DAY}개, quiz는 meaning 2개+fill_blank 2개+situation 2개=총 6개, sentences {WORDS_PER_DAY}개
모든 question 필드는 영어로 작성
JSON만 반환 (```없음)"""}]
)
raw3 = resp3.content[0].text.strip()
# 코드블록 제거
raw3 = re.sub(r'^```[a-z]*\n?', '', raw3, flags=re.M)
raw3 = re.sub(r'```$', '', raw3, flags=re.M)
raw3 = raw3.strip()

m3 = re.search(r'\{[\s\S]*\}', raw3)
if not m3:
    print("[!] 콘텐츠 JSON 없음")
    print("응답:", raw3[:300])
    sys.exit(1)

result = json.loads(m3.group(0))
print(f"생성: 단어 {len(result.get('words',[]))}개, 퀴즈 {len(result.get('quiz',[]))}개, 문장 {len(result.get('sentences',[]))}개")

# ── words_db.json 업데이트 (Firebase PUT 이전 — 중단 시 재실행 가능하도록) ──
db_path = ROOT / "english" / "words_db.json"
db_current = json.loads(db_path.read_text(encoding="utf-8"))
db_lower = {e.get("word", "").lower() for e in db_current if e.get("word")}
added_to_db = 0
for w in result.get("words", []):
    word = w.get("word", "")
    if word and word.lower() not in db_lower:
        db_current.append({
            "id": word, "word": word,
            "pos": w.get("part_of_speech", ""),
            "date": str(today),
            "meaning": w.get("meaning_ko", ""),
            "example_ko": w.get("example_ko", ""),
            "example_en": w.get("example_from_convo", ""),
            "explanation": w.get("explanation", ""),
            "tip": w.get("tip", ""),
            "emoji": w.get("emoji", ""),
        })
        db_lower.add(word.lower())
        added_to_db += 1
if added_to_db:
    db_path.write_text(json.dumps(db_current, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"words_db.json +{added_to_db}개 추가 (총 {len(db_current)}개)")
# ─────────────────────────────────────────────────────────────────────────────

# Firebase 업로드 (words_db 기록 완료 후)
payload = json.dumps({**result, "timestamp": str(today), "date": str(today)}, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(
    f"{DB_URL}/english/words/{today}.json",
    data=payload, method="PUT",
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(req, timeout=15) as r:
    print(f"Firebase PUT {r.status}: english/words/{today}")

(ROOT / "english" / "daily.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
)

print(f"\n완료! 오늘 단어: {[w['word'] for w in result.get('words',[])]}")
