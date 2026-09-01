"""
영어공부 Netlify 자동 업데이트
TOEFL 빈출 어휘 생성 → english/index.html + daily.json → Netlify 배포
매일 Task Scheduler로 자동 실행
"""
import json
import sys
import os
import subprocess
from pathlib import Path
from datetime import date

import anthropic

ROOT = Path(__file__).parent.parent
OUTPUT_HTML = ROOT / "english" / "index.html"
WORDS_DB_JSON = ROOT / "english" / "words_db.json"
TOEFL_OUTPUT_HTML = ROOT / "toefl" / "index.html"

sys.path.insert(0, str(ROOT / "history"))
try:
    from discord_utils import notify
except Exception:
    def notify(text): pass

def load_used_words() -> list:
    """words_db.json에 이미 등록된 단어 목록 (중복 생성 방지용)."""
    if not WORDS_DB_JSON.exists():
        return []
    try:
        entries = json.loads(WORDS_DB_JSON.read_text(encoding="utf-8"))
        return sorted({e.get("word", "") for e in entries if e.get("word")})
    except (json.JSONDecodeError, OSError):
        return []


def load_skip_list() -> list:
    """Firebase english/globalSkipList에서 skip된 단어 목록 로드."""
    db_url = os.environ.get(
        "EXPO_PUBLIC_FIREBASE_DATABASE_URL",
        "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"
    )
    try:
        import urllib.request as ur
        req = ur.Request(f"{db_url}/english/globalSkipList.json",
                         headers={"User-Agent": "Mozilla/5.0"})
        with ur.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            if not data or not isinstance(data, dict):
                return []
            return [v.get("word", k) for k, v in data.items() if isinstance(v, dict)]
    except Exception as e:
        print(f"[skip] globalSkipList 로드 실패 (무시): {e}")
        return []


def get_default_words(target_date: date) -> dict:
    """API 최대 실패 시 비상 fallback — words_db에 없는 단어를 동적으로 선택"""
    used_lower = {w.lower() for w in load_used_words()}

    # 충분히 큰 후보 풀에서 미사용 단어를 골라 fallback 구성
    candidate_pool = [
        {
            "word": "mitigate", "part_of_speech": "동사",
            "meaning_ko": "완화하다, 경감하다",
            "explanation": "부정적인 영향이나 심각성을 줄이는 것. TOEFL 환경·정책 지문 최빈출 동사예요.",
            "example_from_convo": "Building seawalls can help mitigate the effects of rising sea levels.",
            "example_ko": "방파제 건설은 해수면 상승의 영향을 완화하는 데 도움이 돼요.",
            "tip": "동의어: alleviate, reduce, lessen. 반의어: exacerbate, worsen. TOEFL Reading·Writing 필수.",
            "emoji": "🛡️"
        },
        {
            "word": "proliferate", "part_of_speech": "동사",
            "meaning_ko": "급속히 늘어나다, 확산되다",
            "explanation": "수나 양이 빠르게 증가하는 것. TOEFL 과학·기술·사회 지문에 자주 나와요.",
            "example_from_convo": "Social media platforms have proliferated over the past decade.",
            "example_ko": "소셜 미디어 플랫폼은 지난 10년간 급속히 늘어났어요.",
            "tip": "동의어: multiply, expand, spread. 반의어: diminish, decline. 명사형: proliferation.",
            "emoji": "📈"
        },
        {
            "word": "sustain", "part_of_speech": "동사",
            "meaning_ko": "유지하다, 지속하다",
            "explanation": "상태·노력을 계속 유지하는 것. TOEFL 전 영역 최빈출 동사 중 하나예요.",
            "example_from_convo": "The ecosystem requires clean water to sustain biodiversity.",
            "example_ko": "생태계는 생물 다양성을 유지하기 위해 깨끗한 물이 필요해요.",
            "tip": "동의어: maintain, support, preserve. 형용사형: sustainable(지속 가능한). TOEFL 핵심 어휘.",
            "emoji": "♻️"
        },
        {
            "word": "undermine", "part_of_speech": "동사",
            "meaning_ko": "약화시키다, 훼손하다",
            "explanation": "기반이나 신뢰를 서서히 약하게 만드는 것. TOEFL 사회·정치 지문에 매우 자주 나와요.",
            "example_from_convo": "Corruption can severely undermine public trust in government.",
            "example_ko": "부패는 정부에 대한 국민의 신뢰를 심각하게 약화시킬 수 있어요.",
            "tip": "동의어: weaken, erode, sabotage. 반의어: strengthen, bolster. 비유적 표현으로 자주 써요.",
            "emoji": "⚠️"
        },
        {
            "word": "inherent", "part_of_speech": "형용사",
            "meaning_ko": "고유한, 내재된",
            "explanation": "어떤 것의 본질적인 특성으로 처음부터 존재하는 것. TOEFL 학술 지문 전반에 등장해요.",
            "example_from_convo": "There are inherent risks in any scientific experiment.",
            "example_ko": "모든 과학 실험에는 내재된 위험이 있어요.",
            "tip": "동의어: intrinsic, innate, built-in. 부사형: inherently. 'inherent in/to ~'로 자주 써요.",
            "emoji": "🧬"
        },
        {
            "word": "ambiguous", "part_of_speech": "형용사",
            "meaning_ko": "모호한, 불분명한",
            "explanation": "두 가지 이상의 의미로 해석될 수 있는 것. TOEFL Reading·Writing 논리 전개에 핵심이에요.",
            "example_from_convo": "The contract's wording was ambiguous and led to misunderstandings.",
            "example_ko": "계약서 문구가 모호해서 오해가 생겼어요.",
            "tip": "동의어: vague, unclear, equivocal. 반의어: clear, explicit. 명사: ambiguity.",
            "emoji": "❓"
        },
        {
            "word": "subsequent", "part_of_speech": "형용사",
            "meaning_ko": "그 후의, 뒤이은",
            "explanation": "어떤 사건 뒤에 일어나는 것. TOEFL Reading 지문 흐름 파악에 필수 어휘예요.",
            "example_from_convo": "The initial study was flawed, but subsequent research corrected the errors.",
            "example_ko": "초기 연구는 결함이 있었지만, 이후 연구가 오류를 수정했어요.",
            "tip": "동의어: following, ensuing, later. 부사형: subsequently(이후에). TOEFL 시간 흐름 표현.",
            "emoji": "➡️"
        },
        {
            "word": "advocate", "part_of_speech": "동사/명사",
            "meaning_ko": "지지하다, 옹호하다 / 지지자",
            "explanation": "어떤 원인·정책·사람을 공개적으로 지지하는 것. TOEFL Writing·Speaking 핵심 어휘예요.",
            "example_from_convo": "Scientists advocate for stronger measures to address climate change.",
            "example_ko": "과학자들은 기후변화 대응을 위한 더 강력한 조치를 지지해요.",
            "tip": "동의어: support, promote, champion. 명사: advocacy(지지 활동). 'advocate for ~'가 일반적.",
            "emoji": "📢"
        },
        {
            "word": "deteriorate", "part_of_speech": "동사",
            "meaning_ko": "악화되다, 나빠지다",
            "explanation": "상태나 품질이 점점 나빠지는 것. TOEFL 환경·건강·경제 지문에 빈출해요.",
            "example_from_convo": "Air quality tends to deteriorate during hot summer months.",
            "example_ko": "대기 질은 더운 여름철에 악화되는 경향이 있어요.",
            "tip": "동의어: worsen, decline, degrade. 반의어: improve, recover. 명사: deterioration.",
            "emoji": "📉"
        },
        {
            "word": "constitute", "part_of_speech": "동사",
            "meaning_ko": "구성하다, ~에 해당하다",
            "explanation": "전체의 일부를 이루거나 어떤 것으로 간주되는 것. TOEFL 학술 지문 전반에 등장해요.",
            "example_from_convo": "Women constitute over half of the university's student population.",
            "example_ko": "여성이 대학 학생의 절반 이상을 구성해요.",
            "tip": "동의어: make up, comprise, form. '~% constitute ...' 또는 '... constitutes ~%' 패턴 기억.",
            "emoji": "🧩"
        },
        {
            "word": "compelling", "part_of_speech": "형용사",
            "meaning_ko": "설득력 있는, 강렬한",
            "explanation": "강한 관심이나 확신을 불러일으키는 것. TOEFL Writing 고득점 표현으로 자주 써요.",
            "example_from_convo": "The documentary presented a compelling argument for renewable energy.",
            "example_ko": "그 다큐멘터리는 재생에너지에 대한 설득력 있는 주장을 제시했어요.",
            "tip": "동의어: convincing, persuasive, powerful. 반의어: weak, unconvincing. 'compelling evidence/reason'으로 자주 써요.",
            "emoji": "💡"
        },
        {
            "word": "facilitate", "part_of_speech": "동사",
            "meaning_ko": "촉진하다, 용이하게 하다",
            "explanation": "어떤 과정이나 행동을 더 쉽게 만드는 것. TOEFL 학술·비즈니스 지문 핵심 동사예요.",
            "example_from_convo": "Technology can facilitate communication across different time zones.",
            "example_ko": "기술은 서로 다른 시간대 간의 소통을 촉진할 수 있어요.",
            "tip": "동의어: enable, promote, aid. 명사: facilitation. 'facilitate + 명사' 패턴으로 자주 써요.",
            "emoji": "🤝"
        },
        {
            "word": "inevitable", "part_of_speech": "형용사",
            "meaning_ko": "불가피한, 피할 수 없는",
            "explanation": "막을 수 없거나 반드시 일어날 수밖에 없는 것. TOEFL 논증 지문에 자주 등장해요.",
            "example_from_convo": "Technological change is inevitable in a globalized economy.",
            "example_ko": "세계화된 경제에서 기술 변화는 불가피해요.",
            "tip": "동의어: unavoidable, certain, inescapable. 부사: inevitably. 반의어: avoidable, preventable.",
            "emoji": "⚡"
        },
        {
            "word": "predominant", "part_of_speech": "형용사",
            "meaning_ko": "지배적인, 가장 두드러진",
            "explanation": "특정 집단이나 상황에서 가장 중요하거나 눈에 띄는 것. TOEFL 학술 지문 핵심 어휘예요.",
            "example_from_convo": "Agriculture remains the predominant industry in many rural regions.",
            "example_ko": "농업은 많은 농촌 지역에서 여전히 지배적인 산업으로 남아있어요.",
            "tip": "동의어: dominant, primary, leading. 부사: predominantly(주로). 'predominantly' 형태가 더 자주 나와요.",
            "emoji": "🏆"
        },
        {
            "word": "exacerbate", "part_of_speech": "동사",
            "meaning_ko": "악화시키다, 심화시키다",
            "explanation": "이미 나쁜 상황을 더욱 심각하게 만드는 것. TOEFL Reading 환경·사회 지문에서 자주 등장해요.",
            "example_from_convo": "Deforestation exacerbates climate change by reducing carbon absorption.",
            "example_ko": "삼림 벌채는 탄소 흡수를 줄여 기후변화를 악화시켜요.",
            "tip": "동의어: aggravate, worsen. 반의어: alleviate, mitigate. Reading·Writing 고빈출.",
            "emoji": "🔥"
        },
    ]

    used_lower_set = {w.lower() for w in load_used_words()}
    available = [c for c in candidate_pool if c["word"].lower() not in used_lower_set]

    # 미사용 단어가 5개 미만이면 전체 풀에서 선택
    if len(available) < 5:
        available = candidate_pool

    selected = available[:5]
    words = selected

    quiz = []
    for w in words:
        quiz.append({
            "type": "meaning", "word": w["word"],
            "question": f"'{w['word']}'의 의미로 가장 적절한 것은?",
            "options": [w["meaning_ko"], "강하게 반발하다", "무관심한", "일시적인"],
            "answer": 0,
            "explanation": f"{w['word']} = {w['meaning_ko']}."
        })
        quiz.append({
            "type": "fill_blank", "word": w["word"],
            "sentence": w["example_from_convo"].replace(w["word"], "_____"),
            "sentence_ko": w["example_ko"],
            "answer": w["word"],
            "hint": w["meaning_ko"]
        })

    return {"date": str(target_date), "words": words, "quiz": quiz}

def load_toefl_words(toefl_path: Path = None) -> list:
    """TOEFL 단어 로드 (API 또는 로컬 파일)"""
    # 1. API에서 가져오기 시도
    try:
        import urllib.request
        url = "https://illustrious-cuchufli-7c4e58.netlify.app/api/get-toefl-words"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            words = data.get("words", [])
            if words:
                print(f"[+] Netlify에서 TOEFL 단어 {len(words)}개 로드됨")
                return words
    except Exception as e:
        print(f"[*] Netlify API 실패: {e}")

    # 2. 로컬 파일에서 가져오기
    if toefl_path and toefl_path.exists():
        try:
            content = json.loads(toefl_path.read_text(encoding="utf-8-sig"))
            words = content.get("words", [])
            if words:
                print(f"[+] 로컬 TOEFL 단어 {len(words)}개 로드됨")
                return words
        except Exception as e:
            print(f"[!] 로컬 파일 로드 실패: {e}")

    print("[*] TOEFL 단어 없음 - 기본값으로 생성")
    return []


def generate_default_words(client: anthropic.Anthropic, target_date: date, toefl_words: list = None) -> dict:
    """도메인별 2단계로 학술 어휘 생성 (exclusion 리스트 대신 도메인 지정으로 중복 방지)"""
    import re as _re
    print("[*] 학술 어휘 생성 중 (도메인 방식)...")

    all_used_words = load_used_words()
    used_lower = {w.lower() for w in all_used_words}
    recent_50 = ", ".join(all_used_words[-50:])

    # 1단계: 도메인별 후보 단어 선정 (최근 50개만 금지 — 짧아야 Haiku가 지킴)
    step1_prompt = (
        f"10개의 고급 영어 학술 단어를 선정하세요. 5개 도메인에서 각 2개씩:\n"
        "1. 의학/생물학  2. 법학/법률  3. 철학/논리학  4. 경제학/금융  5. 언어학/수사학\n\n"
        f"절대 금지: {recent_50}\n"
        "조건: GRE/TOEFL 고득점 수준 전문 학술어, 슬랭 금지\n\n"
        'JSON 배열만 반환:\n'
        '[{"word":"단어","domain":"도메인","pos":"품사","meaning_ko":"뜻"}]'
    )

    candidates = []
    for attempt in range(3):
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=700,
            messages=[{"role": "user", "content": step1_prompt if attempt == 0
                       else step1_prompt + f"\n이미 선택됨(금지): {[c['word'] for c in candidates]}"}]
        )
        raw = resp.content[0].text.strip()
        raw = _re.sub(r'^```[a-z]*\n?', '', raw, flags=_re.M).strip().rstrip('`').strip()
        m = _re.search(r'\[[\s\S]*\]', raw)
        if not m:
            continue
        try:
            batch = json.loads(m.group(0))
        except json.JSONDecodeError:
            continue
        for c in batch:
            if c.get("word","").lower() not in used_lower and c["word"] not in [x["word"] for x in candidates]:
                candidates.append(c)
        if len(candidates) >= 5:
            break

    if len(candidates) < 5:
        print(f"[!] 후보 {len(candidates)}개만 확보 — 기본값 사용")
        return get_default_words(target_date)

    final_words = candidates[:5]
    words_str = ", ".join(c["word"] for c in final_words)
    print(f"[+] 선정: {words_str}")

    # 2단계: 선정된 단어로 전체 콘텐츠 생성 (예시 단어 없음)
    step2_prompt = (
        f"단어 5개: {words_str}\n날짜: {target_date}\n\n"
        "아래 JSON 구조로 학습 자료를 생성하세요. JSON만 반환 (마크다운 블록 없이):\n\n"
        '{"date":"' + str(target_date) + '",'
        '"words":[{"word":"","part_of_speech":"","meaning_ko":"","explanation":"","example_from_convo":"","example_ko":"","tip":"동의어/반의어+출제영역","emoji":""}],'
        '"quiz":['
        '{"type":"meaning","word":"","question":"영어질문","options":["","","",""],"answer":0,"explanation":"","option_explanations":[null,"","",""]},'
        '{"type":"fill_blank","word":"","sentence":"영어 ___ 문장","sentence_ko":"","answer":"","hint":""},'
        '{"type":"situation","word":"","question":"영어상황질문","options":["","","",""],"answer":0,"explanation":""}],'
        '"sentences":[{"word":"","sentence":"","sentence_ko":"","nuance":"","context":"","everyday_usage":""}]}\n\n'
        "규칙: words 5개, quiz는 meaning 3+fill_blank 3+situation 2=8개, sentences 5개\n"
        "모든 question은 영어로. JSON만 반환."
    )

    for attempt in range(3):
        resp2 = client.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=8000,
            messages=[{"role": "user", "content": step2_prompt}]
        )
        raw2 = resp2.content[0].text.strip()
        raw2 = _re.sub(r'^```[a-z]*\n?', '', raw2, flags=_re.M).strip().rstrip('`').strip()
        m2 = _re.search(r'\{[\s\S]*\}', raw2)
        if not m2:
            print(f"[!] 콘텐츠 JSON 없음 (시도 {attempt+1})")
            continue
        try:
            data = json.loads(m2.group(0))
        except json.JSONDecodeError as e:
            print(f"[!] JSON 파싱 실패 (시도 {attempt+1}): {e}")
            continue
        if len(data.get("words",[])) >= 5 and len(data.get("quiz",[])) >= 8:
            print(f"[+] 콘텐츠 생성 완료: {[w['word'] for w in data['words']]}")
            return data

    print("[!] 콘텐츠 생성 실패, 기본값 사용")
    return get_default_words(target_date)


def fetch_replacement_words(client: anthropic.Anthropic, target_date: date, exclude_lower: set, count: int) -> dict | None:
    """부족분 보충용 TOEFL 학술 어휘 N개 생성 (실패하면 None)."""
    prompt = f"""TOEFL iBT 빈출 학술 어휘 {count}개와 퀴즈를 JSON으로만 생성해주세요.

⚠️ 아래 단어는 제외해주세요: {', '.join(sorted(exclude_lower))}
슬랭·구어체·일상 표현 금지. TOEFL C1~C2 이상 고급 학술 어휘 우선 선정해주세요.

JSON 형식:
{{"words": [{{"word": "단어", "part_of_speech": "품사", "meaning_ko": "뜻", "explanation": "설명", "example_from_convo": "학술 예문", "example_ko": "한국어 예문", "tip": "동의어/반의어/TOEFL 출제 영역", "emoji": "😊"}}], "quiz": [{{"type": "meaning", "word": "단어", "question": "문제?", "options": ["정답", "오답1", "오답2", "오답3"], "answer": 0, "explanation": "설명"}}]}}

규칙:
- 정확히 {count}개 단어, 퀴즈 {count * 2}개
- JSON만 반환"""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.content[0].text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            return None
        data = json.loads(text[start:end])
        words = data.get("words", [])
        if not words or any(w.get("word", "").lower() in exclude_lower for w in words):
            return None
        return data
    except (json.JSONDecodeError, anthropic.APIError):
        return None

def generate_html(data: dict) -> str:
    words_json = json.dumps(data.get("words", []), ensure_ascii=False)
    quiz_json = json.dumps(data.get("quiz", []), ensure_ascii=False)
    date_str = data.get("date", str(date.today()))

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>영어공부 — {date_str}</title>
<style>
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #fff;
  color: #37352f;
  font-size: 15px;
  line-height: 1.6;
}}
.cover {{
  height: 8px;
  background: linear-gradient(90deg, #0ea5e9 0%, #6366f1 100%);
}}
.page {{
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}}
.back-link {{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #9b9a97;
  text-decoration: none;
  margin-bottom: 24px;
}}
.back-link:hover {{ color: #37352f; }}
.page-icon {{ font-size: 48px; margin-bottom: 10px; display: block; }}
.page-title {{ font-size: 30px; font-weight: 700; letter-spacing: -0.4px; margin-bottom: 4px; }}
.page-desc {{ font-size: 13px; color: #9b9a97; margin-bottom: 28px; }}
.date-badge {{
  display: inline-block;
  font-size: 11px;
  background: #eff6ff;
  color: #3b82f6;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 600;
  margin-bottom: 28px;
}}
/* 탭 */
.tab-bar {{
  display: flex;
  gap: 4px;
  border-bottom: 2px solid #e9e9e7;
  margin-bottom: 28px;
}}
.tab-btn {{
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  color: #9b9a97;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color .15s;
}}
.tab-btn.active {{ color: #37352f; border-bottom-color: #37352f; }}
.tab-btn:hover:not(.active) {{ color: #37352f; }}
.tab-btn {{ transition: color .15s; }}
.tab-panel {{ display: none; }}
.tab-panel.active {{ display: block; animation: tabIn .2s ease; }}
@keyframes tabIn {{ from {{ opacity: 0; transform: translateY(8px); }} to {{ opacity: 1; transform: none; }} }}
/* 단어 카드 */
.word-list {{ display: flex; flex-direction: column; gap: 16px; }}
.word-card {{
  border: 1px solid #e9e9e7;
  border-radius: 10px;
  padding: 20px;
  transition: box-shadow .15s;
}}
.word-card:hover {{ box-shadow: 0 2px 12px rgba(0,0,0,.08); }}
.word-header {{ display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }}
.word-text {{
  font-size: 22px;
  font-weight: 700;
  color: #37352f;
}}
.word-pos {{
  font-size: 11px;
  background: #f1f0ef;
  color: #9b9a97;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}}
.word-meaning {{
  font-size: 17px;
  font-weight: 600;
  color: #0ea5e9;
  margin-bottom: 8px;
}}
.word-explanation {{ font-size: 14px; color: #37352f; margin-bottom: 12px; line-height: 1.6; }}
.example-box {{
  background: #f7f6f3;
  border-left: 3px solid #0ea5e9;
  border-radius: 0 6px 6px 0;
  padding: 10px 14px;
  margin-bottom: 10px;
}}
.example-en {{ font-size: 14px; font-style: italic; color: #37352f; margin-bottom: 3px; }}
.example-ko {{ font-size: 12px; color: #9b9a97; }}
.tip-box {{
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: #92400e;
  margin-bottom: 12px;
}}
.tip-label {{ font-weight: 700; margin-right: 4px; }}
.word-illus {{
  border-radius: 14px;
  padding: 24px 20px;
  text-align: center;
  margin-top: 14px;
}}
.word-illus-emoji {{
  font-size: 54px;
  display: block;
  margin-bottom: 8px;
}}
.word-illus-en {{
  font-size: 20px;
  font-weight: 800;
  color: white;
  margin-bottom: 4px;
  text-shadow: 0 1px 4px rgba(0,0,0,.25);
}}
.word-illus-ko {{
  font-size: 13px;
  color: rgba(255,255,255,.88);
  font-weight: 500;
}}
.quiz-illus {{
  border-radius: 10px;
  padding: 14px 16px;
  text-align: center;
  margin-bottom: 10px;
}}
.finish-stats {{
  display: flex;
  gap: 16px;
  justify-content: center;
  margin: 14px 0;
}}
.finish-stat {{ text-align: center; }}
.finish-stat-num {{ font-size: 26px; font-weight: 700; color: #166534; }}
.finish-stat-label {{ font-size: 11px; color: #9b9a97; }}
.finish-actions {{
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 16px;
  flex-wrap: wrap;
}}
.finish-btn-review {{
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 700;
  background: linear-gradient(135deg, #8b5cf6, #06b6d4);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}}
.finish-btn-retry {{
  padding: 10px 20px;
  font-size: 14px;
  color: #9b9a97;
  background: #f7f6f3;
  border: 1px solid #e9e9e7;
  border-radius: 8px;
  cursor: pointer;
}}
/* 퀴즈 */
.quiz-meta {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}}
.quiz-score {{
  font-size: 13px;
  color: #9b9a97;
}}
.score-num {{ font-weight: 700; color: #37352f; font-size: 16px; }}
.btn-reset {{
  font-size: 13px;
  color: #9b9a97;
  background: #f7f6f3;
  border: 1px solid #e9e9e7;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
}}
.btn-reset:hover {{ background: #e9e9e7; }}
.quiz-list {{ display: flex; flex-direction: column; gap: 20px; }}
.quiz-card {{
  border: 1px solid #e9e9e7;
  border-radius: 10px;
  padding: 20px;
}}
.quiz-card.answered {{ background: #fafaf9; }}
.quiz-type-badge {{
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: #9b9a97;
  margin-bottom: 8px;
}}
.quiz-word-badge {{
  display: inline-block;
  font-size: 11px;
  background: #eff6ff;
  color: #3b82f6;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  margin-bottom: 10px;
}}
.quiz-question {{ font-size: 15px; font-weight: 600; color: #37352f; margin-bottom: 14px; }}
.quiz-options {{ display: flex; flex-direction: column; gap: 8px; }}
.opt-btn {{
  text-align: left;
  background: #f7f6f3;
  border: 1px solid #e9e9e7;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
  transition: background .1s, border-color .1s;
  color: #37352f;
}}
.opt-btn:hover:not(:disabled) {{ background: #eff6ff; border-color: #93c5fd; }}
.opt-btn.correct {{ background: #f0fdf4; border-color: #86efac; color: #166534; }}
.opt-btn.wrong {{ background: #fef2f2; border-color: #fca5a5; color: #991b1b; }}
.fill-input {{
  width: 100%;
  border: 1px solid #e9e9e7;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  color: #37352f;
  outline: none;
  transition: border-color .15s;
  margin-bottom: 8px;
}}
.fill-input:focus {{ border-color: #0ea5e9; }}
.fill-input.correct {{ border-color: #86efac; background: #f0fdf4; }}
.fill-input.wrong {{ border-color: #fca5a5; background: #fef2f2; }}
.btn-submit {{
  background: #0ea5e9;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s;
}}
.btn-submit:hover {{ background: #0284c7; }}
.btn-submit:disabled {{ background: #e9e9e7; color: #9b9a97; cursor: default; }}
.quiz-explanation {{
  display: none;
  margin-top: 12px;
  padding: 10px 14px;
  background: #f7f6f3;
  border-radius: 6px;
  font-size: 13px;
  color: #37352f;
  line-height: 1.6;
}}
.quiz-explanation.show {{ display: block; }}
.expl-label {{ font-weight: 700; color: #0ea5e9; }}
.hint-text {{ font-size: 12px; color: #9b9a97; margin-bottom: 6px; }}
.progress-bar-wrap {{
  background: #f1f0ef;
  border-radius: 4px;
  height: 6px;
  margin-bottom: 24px;
  overflow: hidden;
}}
.progress-bar {{
  height: 100%;
  background: linear-gradient(90deg, #0ea5e9, #6366f1);
  border-radius: 4px;
  transition: width .4s ease;
}}
.finish-banner {{
  display: none;
  text-align: center;
  padding: 28px;
  border: 2px solid #86efac;
  border-radius: 12px;
  background: #f0fdf4;
  margin-bottom: 24px;
}}
.finish-banner.show {{ display: block; }}
.finish-emoji {{ font-size: 40px; margin-bottom: 8px; }}
.finish-title {{ font-size: 18px; font-weight: 700; color: #166534; margin-bottom: 4px; }}
.finish-sub {{ font-size: 14px; color: #4ade80; }}
.vocab-done-wrap {{
  text-align: center;
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid #e9e9e7;
}}
.btn-vocab-done {{
  padding: 12px 36px;
  font-size: 15px;
  font-weight: 700;
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: #fff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity .15s;
}}
.btn-vocab-done:hover {{ opacity: .9; }}
.btn-vocab-done.done {{
  background: #f0fdf4;
  color: #166534;
  border: 2px solid #86efac;
  cursor: default;
}}
@media (max-width: 500px) {{
  .page {{ padding: 32px 16px 60px; }}
  .page-title {{ font-size: 24px; }}
}}
</style>
</head>
<body>
<div class="cover"></div>
<div class="page">

  <a class="back-link" href="../index.html">← Yong's AI Study</a>
  <span class="page-icon">📖</span>
  <h1 class="page-title">오늘의 영어공부</h1>
  <p class="page-desc">Lily와의 대화에서 배운 표현 정리 · 퀴즈</p>
  <span class="date-badge">📅 {date_str}</span>

  <div class="tab-bar">
    <button class="tab-btn active" onclick="switchTab('vocab', this)">📚 배운 표현</button>
    <button class="tab-btn" onclick="switchTab('quiz', this)">✏️ 퀴즈</button>
  </div>

  <!-- 단어 탭 -->
  <div class="tab-panel active" id="tab-vocab">
    <div class="word-list" id="wordList"></div>
    <div class="vocab-done-wrap">
      <button class="btn-vocab-done" id="btnVocabDone" onclick="markVocabDone()">✅ 읽었음</button>
    </div>
  </div>

  <!-- 퀴즈 탭 -->
  <div class="tab-panel" id="tab-quiz">
    <div class="finish-banner" id="finishBanner">
      <div class="finish-emoji" id="finishEmoji">🎉</div>
      <div class="finish-title" id="finishTitle"></div>
      <div class="finish-sub" id="finishSub"></div>
      <div class="finish-stats">
        <div class="finish-stat"><div class="finish-stat-num" id="finishCorrect">0</div><div class="finish-stat-label">정답</div></div>
        <div class="finish-stat"><div class="finish-stat-num" id="finishWrong">0</div><div class="finish-stat-label">오답</div></div>
        <div class="finish-stat"><div class="finish-stat-num" id="finishAccuracy">0%</div><div class="finish-stat-label">정확도</div></div>
      </div>
      <div class="finish-actions">
        <a class="finish-btn-review" href="review.html">🧠 복습하러 가기</a>
        <button class="finish-btn-retry" onclick="resetQuiz()">다시 풀기</button>
      </div>
    </div>
    <div class="quiz-meta">
      <div class="quiz-score">점수: <span class="score-num" id="scoreDisplay">0</span> / <span id="totalDisplay">0</span></div>
      <button class="btn-reset" onclick="resetQuiz()">다시하기</button>
    </div>
    <div class="progress-bar-wrap"><div class="progress-bar" id="progressBar" style="width:0%"></div></div>
    <div class="quiz-list" id="quizList"></div>
  </div>

</div>

<script>
const WORDS = {words_json};
const QUIZ  = {quiz_json};

/* ── 탭 전환 ── */
function switchTab(name, btn) {{
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}}

/* ── 단어 카드 그라디언트 ── */
function wordGradient(pos) {{
  const p = (pos || '').toLowerCase();
  if (p.includes('슬랭') || p.includes('slang') || p.includes('구동사'))
    return 'linear-gradient(135deg,#7c3aed,#4f46e5)';
  if (p.includes('동사') || p.includes('verb'))
    return 'linear-gradient(135deg,#0ea5e9,#2563eb)';
  if (p.includes('형용사') || p.includes('adj'))
    return 'linear-gradient(135deg,#10b981,#059669)';
  if (p.includes('명사') || p.includes('noun'))
    return 'linear-gradient(135deg,#f59e0b,#dc2626)';
  if (p.includes('관용') || p.includes('idiom') || p.includes('표현'))
    return 'linear-gradient(135deg,#ec4899,#8b5cf6)';
  if (p.includes('부사'))
    return 'linear-gradient(135deg,#06b6d4,#0284c7)';
  return 'linear-gradient(135deg,#6366f1,#8b5cf6)';
}}

/* ── 단어 탭 렌더 ── */
function renderWords() {{
  const list = document.getElementById('wordList');
  list.innerHTML = WORDS.map((w, i) => `
    <div class="word-card">
      <div class="word-header">
        <span class="word-text">${{w.word}}</span>
        <span class="word-pos">${{w.part_of_speech}}</span>
      </div>
      <div class="word-meaning">${{w.meaning_ko}}</div>
      <div class="word-explanation">${{w.explanation}}</div>
      ${{w.example_from_convo ? `
      <div class="example-box">
        <div class="example-en">"${{w.example_from_convo}}"</div>
        <div class="example-ko">${{w.example_ko}}</div>
      </div>` : ''}}
      ${{w.tip ? `
      <div class="tip-box">
        <span class="tip-label">💡 Tip</span>${{w.tip}}
      </div>` : ''}}
      ${{w.emoji ? `
      <div class="word-illus" style="background:${{wordGradient(w.part_of_speech)}}">
        <span class="word-illus-emoji">${{w.emoji}}</span>
        <div class="word-illus-en">${{w.word}}</div>
        <div class="word-illus-ko">${{w.meaning_ko}}</div>
      </div>` : ''}}
    </div>
  `).join('');
}}

/* ── 퀴즈 탭 렌더 ── */
let score = 0;
let answered = 0;

function renderQuiz() {{
  document.getElementById('totalDisplay').textContent = QUIZ.length;
  const list = document.getElementById('quizList');
  list.innerHTML = QUIZ.map((q, i) => buildQuizCard(q, i)).join('');
}}

function buildQuizCard(q, i) {{
  const typeLabel = {{ meaning: '의미 퀴즈', fill_blank: '빈칸 채우기', situation: '상황 퀴즈' }}[q.type] || q.type;
  const wordBadge = q.word ? `<span class="quiz-word-badge">${{q.word}}</span><br>` : '';
  const wd = WORDS.find(w => w.word === q.word);
  const illustHtml = (wd && wd.emoji) ? `
    <div class="quiz-illus" style="background:${{wordGradient(wd.part_of_speech)}};margin-bottom:10px">
      <span style="font-size:36px">${{wd.emoji}}</span>
      <div style="font-size:15px;font-weight:800;color:white;margin-top:5px;text-shadow:0 1px 3px rgba(0,0,0,.2)">${{wd.word}}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.85)">${{wd.meaning_ko}}</div>
    </div>` : '';

  if (q.type === 'fill_blank') {{
    return `
    <div class="quiz-card" id="qcard-${{i}}">
      <div class="quiz-type-badge">${{typeLabel}}</div>
      ${{wordBadge}}
      <div class="quiz-question">${{q.sentence}}</div>
      ${{q.sentence_ko ? `<div class="hint-text">${{q.sentence_ko}}</div>` : ''}}
      <div class="hint-text">힌트: ${{q.hint}}</div>
      <input class="fill-input" id="fill-${{i}}" placeholder="답을 입력하세요" onkeydown="if(event.key==='Enter') submitFill(${{i}})">
      <button class="btn-submit" id="fill-btn-${{i}}" onclick="submitFill(${{i}})">제출</button>
      <div class="quiz-explanation" id="expl-${{i}}">
        ${{illustHtml}}
        <span class="expl-label">정답: </span>${{q.answer}}
      </div>
    </div>`;
  }}

  const opts = (q.options || []).map((opt, j) =>
    `<button class="opt-btn" id="opt-${{i}}-${{j}}" onclick="selectOpt(${{i}}, ${{j}}, ${{q.answer}})">${{String.fromCharCode(65+j)}}. ${{opt}}</button>`
  ).join('');

  return `
  <div class="quiz-card" id="qcard-${{i}}">
    <div class="quiz-type-badge">${{typeLabel}}</div>
    ${{wordBadge}}
    <div class="quiz-question">${{q.question}}</div>
    <div class="quiz-options">${{opts}}</div>
    <div class="quiz-explanation" id="expl-${{i}}">
      ${{illustHtml}}
      <span class="expl-label">💬 </span>${{q.explanation || ''}}
    </div>
  </div>`;
}}

function selectOpt(qi, chosen, correct) {{
  const card = document.getElementById('qcard-' + qi);
  if (card.classList.contains('answered')) return;
  card.classList.add('answered');
  answered++;

  const opts = card.querySelectorAll('.opt-btn');
  opts.forEach(b => b.disabled = true);
  opts[correct].classList.add('correct');
  if (chosen !== correct) opts[chosen].classList.add('wrong');
  else {{ score++; document.getElementById('scoreDisplay').textContent = score; }}

  document.getElementById('expl-' + qi).classList.add('show');
  updateProgress();
}}

function submitFill(qi) {{
  const inp = document.getElementById('fill-' + qi);
  const btn = document.getElementById('fill-btn-' + qi);
  const card = document.getElementById('qcard-' + qi);
  if (card.classList.contains('answered')) return;

  const userAns = inp.value.trim().toLowerCase();
  const correct = QUIZ[qi].answer.toLowerCase();
  card.classList.add('answered');
  answered++;
  inp.disabled = true;
  btn.disabled = true;

  if (userAns === correct) {{ inp.classList.add('correct'); score++; document.getElementById('scoreDisplay').textContent = score; }}
  else {{ inp.classList.add('wrong'); }}

  document.getElementById('expl-' + qi).classList.add('show');
  updateProgress();
}}

function updateProgress() {{
  const pct = QUIZ.length ? (answered / QUIZ.length * 100) : 0;
  document.getElementById('progressBar').style.width = pct + '%';
  if (answered === QUIZ.length) showFinish();
}}

function showFinish() {{
  const banner = document.getElementById('finishBanner');
  const wrong = answered - score;
  const pct = Math.round(score / QUIZ.length * 100);
  document.getElementById('finishEmoji').textContent = pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📖';
  document.getElementById('finishTitle').textContent = pct >= 80 ? '완벽해요!' : pct >= 50 ? '잘하고 있어요!' : '계속 연습하면 돼요!';
  document.getElementById('finishSub').textContent = '오늘 배운 표현들 퀴즈 완료!';
  document.getElementById('finishCorrect').textContent = score;
  document.getElementById('finishWrong').textContent = wrong;
  document.getElementById('finishAccuracy').textContent = pct + '%';
  banner.classList.add('show');
  banner.scrollIntoView({{ behavior: 'smooth', block: 'start' }});
  localStorage.setItem('english_quiz_done', TODAY_DATE);
}}

function resetQuiz() {{
  score = 0;
  answered = 0;
  document.getElementById('scoreDisplay').textContent = 0;
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('finishBanner').classList.remove('show');
  renderQuiz();
}}

renderWords();
renderQuiz();

const TODAY_DATE = (()=>{{ const d=new Date(); return `${{d.getFullYear()}}-${{String(d.getMonth()+1).padStart(2,'0')}}-${{String(d.getDate()).padStart(2,'0')}}`; }})();
function markVocabDone() {{
  localStorage.setItem('english_vocab_read', TODAY_DATE);
  const btn = document.getElementById('btnVocabDone');
  btn.textContent = '✅ 오늘 완료!';
  btn.className = 'btn-vocab-done done';
  btn.disabled = true;
}}
(function() {{
  if (localStorage.getItem('english_vocab_read') === TODAY_DATE) {{
    const btn = document.getElementById('btnVocabDone');
    btn.textContent = '✅ 오늘 완료!';
    btn.className = 'btn-vocab-done done';
    btn.disabled = true;
  }}
}})();
</script>
</body>
</html>
"""


def fetch_toefl_words_from_netlify() -> list:
    """Netlify Blobs에서 TOEFL 어려운 단어 가져오기"""
    try:
        import urllib.request
        url = "https://illustrious-cuchufli-7c4e58.netlify.app/api/toefl-words"
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            toefl_words = data.get("words", [])
            print(f"[+] Netlify에서 TOEFL 단어 {len(toefl_words)}개 가져옴")
            return toefl_words
    except Exception as e:
        print(f"[!] TOEFL 단어 fetch 실패: {e}")
        return []


def update_words_db(words: list, target_date) -> None:
    """새 단어를 words_db.json에 추가 (이미 있는 날짜는 스킵)"""
    date_str = str(target_date)
    existing = []
    if WORDS_DB_JSON.exists():
        existing = json.loads(WORDS_DB_JSON.read_text(encoding="utf-8"))

    existing_ids = {w["id"] for w in existing}
    existing_dates = {w.get("date") for w in existing}
    new_entries = []  # date_str이 이미 존재해 스킵되는 경우에도 아래에서 참조되므로 미리 초기화

    if date_str in existing_dates:
        print(f"[*] words_db.json에 {date_str} 이미 존재 - 스킵")
    else:
        new_entries = []
        for w in words:
            raw_id = w.get("word", "").lower()
            word_id = raw_id.replace(" ", "-").replace("/", "-").replace("'", "").replace("'", "")
            if word_id in existing_ids:
                continue
            new_entries.append({
                "id": word_id,
                "word": w.get("word", ""),
                "pos": w.get("part_of_speech", ""),
                "date": date_str,
                "meaning": w.get("meaning_ko", ""),
                "example_ko": w.get("example_ko", ""),
                "example_en": w.get("example_from_convo", ""),
                "explanation": w.get("explanation", ""),
                "tip": w.get("tip", ""),
                "emoji": w.get("emoji", ""),
            })

        if new_entries:
            existing.extend(new_entries)
            print(f"[+] words_db.json에 {len(new_entries)}개 단어 추가 ({date_str})")
        else:
            print(f"[*] words_db.json - Discord 단어 추가 없음")

    # TOEFL 단어 병합
    toefl_words = fetch_toefl_words_from_netlify()
    toefl_added = 0
    for tw in toefl_words:
        raw_id = tw.get("word", "").lower()
        word_id = raw_id.replace(" ", "-").replace("/", "-").replace("'", "").replace("'", "")
        if word_id not in existing_ids:
            existing.append({
                "id": word_id,
                "word": tw.get("word", ""),
                "pos": "TOEFL",
                "date": tw.get("added_date", date_str),
                "meaning": tw.get("meaning_ko", ""),
                "example_ko": tw.get("meaning_ko", ""),  # TOEFL은 example_ko 없음
                "example_en": "",
                "explanation": tw.get("explanation", ""),
                "tip": f"[{tw.get('section', 'TOEFL').upper()}] {tw.get('meaning_ko', '')}",
                "emoji": tw.get("emoji", "📚"),
            })
            toefl_added += 1
            existing_ids.add(word_id)

    if toefl_added > 0 or new_entries:
        WORDS_DB_JSON.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[+] TOEFL 단어 {toefl_added}개 병합 완료, 총 {len(existing)}개 단어")
    else:
        print(f"[*] 새로운 단어 없음")


READING_TOPICS = [
    "해양생물학", "고대 문명사", "인지심리학", "지질학", "천문학",
    "환경과학", "경제사", "고고학", "신경과학", "식물학",
    "기후변화", "미생물학", "건축사", "언어학", "동물행동학",
]
WRITING_TOPICS = [
    "원격근무 확산", "SNS와 청소년", "대학 등록금 정책", "재생에너지 투자",
    "인공지능 규제", "도시 대중교통 확충", "온라인 교육 확대", "이민 정책",
    "동물실험 규제", "육식 소비 감소", "우주 개발 예산", "저출산 대응 정책",
]
SPEAKING_TOPICS = [
    "혼자 공부 vs 그룹 스터디", "도시 생활 vs 시골 생활", "책 vs 영화",
    "온라인 쇼핑 vs 매장 쇼핑", "아침형 vs 저녁형 인간", "여행 vs 저축",
    "전공 선택 자유 vs 취업 유망 전공", "친구 vs 가족과의 시간",
]
LISTENING_TOPICS = [
    "수강신청 문제로 교수 상담", "동아리 예산 관련 학생 대화", "논문 주제 관련 지도교수 미팅",
    "기숙사 배정 문의", "생물학 강의 - 광합성", "역사학 강의 - 산업혁명",
    "심리학 강의 - 기억의 형성", "경제학 강의 - 공급과 수요",
]


def generate_toefl_content(client: anthropic.Anthropic, target_date) -> dict:
    print("[*] TOEFL 콘텐츠 생성 중...")
    # 날짜를 결정적 시드로 써서 각 섹션 주제를 실제로 강제 선택
    # (모델에게 "날짜를 시드로 다양하게 선택하라"고만 하면 매번 비슷한 "안전한" 주제로 회귀함)
    day_index = target_date.toordinal()
    reading_topic = READING_TOPICS[day_index % len(READING_TOPICS)]
    writing_topic = WRITING_TOPICS[day_index % len(WRITING_TOPICS)]
    speaking_topic = SPEAKING_TOPICS[day_index % len(SPEAKING_TOPICS)]
    listening_topic = LISTENING_TOPICS[day_index % len(LISTENING_TOPICS)]

    prompt = f"""TOEFL iBT 연습 문제를 JSON 형식으로만 생성해주세요. ({target_date})
JSON 외 다른 텍스트는 절대 포함하지 마세요.

오늘의 주제는 반드시 아래를 사용하세요 (다른 주제로 바꾸지 마세요):
- Reading 지문 주제: {reading_topic}
- Writing 주제: {writing_topic}
- Speaking 주제: {speaking_topic}
- Listening 상황: {listening_topic}

{{
  "date": "{target_date}",
  "reading": {{
    "title": "지문 제목",
    "passage": "TOEFL iBT Academic 수준 영어 지문. 200-250 단어. 2-3단락. 학술적·전문적 어휘 사용(고급 어휘, 복잡한 문장 구조). 각 단락은 주제문으로 시작하며 구체적 근거·예시·수치 포함. 단락 간 논리적 흐름 유지. 난이도: TOEFL iBT Reading 실전 수준.",
    "vocabulary": [
      {{"word": "passage에 실제로 등장하는 단어", "meaning_ko": "한국어 뜻"}}
    ],
    "questions": [
      {{"q": "According to the passage, ...", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "한국어 해설"}},
      {{"q": "What can be inferred from the passage about ...?", "options": ["A", "B", "C", "D"], "answer": 1, "explanation": "한국어 해설"}},
      {{"q": "The word '...' in paragraph X is closest in meaning to ...", "options": ["A", "B", "C", "D"], "answer": 2, "explanation": "한국어 해설"}},
      {{"q": "Why does the author mention ...?", "options": ["A", "B", "C", "D"], "answer": 3, "explanation": "한국어 해설"}}
    ]
  }},
  "writing": {{
    "sentences": [
      {{
        "original": "reading.passage에서 그대로 가져온 핵심 문장 (복잡한 구조 또는 고급 어휘 포함)",
        "paraphrase": "동의어 치환·구조 변환·능동↔수동 등을 활용한 모범 패러프레이즈 (의미 동일, 표현 다르게)",
        "tip": "사용한 기법 한 줄 설명 (예: 능동→수동 변환, 명사구→동사구, synonyms 사용 등)"
      }},
      {{
        "original": "reading.passage에서 그대로 가져온 다른 핵심 문장",
        "paraphrase": "모범 패러프레이즈",
        "tip": "기법 설명"
      }},
      {{
        "original": "reading.passage에서 그대로 가져온 또 다른 핵심 문장",
        "paraphrase": "모범 패러프레이즈",
        "tip": "기법 설명"
      }}
    ]
  }},
  "speaking": {{
    "prompt": "Some people prefer X. Others prefer Y. Which do you prefer and why? Include specific reasons and details.",
    "model_sentences": [
      "도입 문장",
      "이유/근거 문장",
      "예시 문장",
      "결론 문장"
    ]
  }},
  "listening": {{
    "title": "대화 또는 강의 제목",
    "type": "conversation",
    "script": "영어 스크립트 180-220 단어. 두 학생 대화 OR 교수 강의. 자연스러운 구어체. 화자 표시: Student A: / Student B: 또는 Professor: / Student:",
    "vocabulary": [
      {{"word": "script에 실제로 등장하는, 듣기에서 헷갈리기 쉬운 단어", "meaning_ko": "한국어 뜻"}}
    ],
    "questions": [
      {{"q": "What is the main topic of the conversation?", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "한국어 해설"}},
      {{"q": "What does the speaker suggest?", "options": ["A", "B", "C", "D"], "answer": 1, "explanation": "한국어 해설"}},
      {{"q": "Why does the speaker mention ...?", "options": ["A", "B", "C", "D"], "answer": 2, "explanation": "한국어 해설"}}
    ]
  }}
}}

- reading.vocabulary / listening.vocabulary: 5~8개, 반드시 해당 passage/script에 실제로 등장하는 단어만
- writing.model_sentences: 5~7문장. 전부 이어 읽으면 도입→본론→예시→결론으로 자연스럽게 이어지는 하나의 TOEFL 에세이 문단이 되도록. 각 문장은 따라 쓰기 연습용이라 너무 길지 않게(1문장씩)
- speaking.model_sentences: 4~6문장. 전부 이어 말하면 도입→이유→예시→결론으로 자연스럽게 이어지는 하나의 스피킹 답변이 되도록. 자연스러운 구어체로."""

    for attempt in range(2):
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.content[0].text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            print(f"[!] TOEFL JSON 없음, 재시도 {attempt+1}")
            continue
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError as e:
            print(f"[!] TOEFL JSON 파싱 실패 ({e}), 재시도 {attempt+1}")
    raise RuntimeError("TOEFL Claude API JSON 파싱 2회 실패")


def generate_toefl_html(data: dict) -> str:
    date_str = data.get("date", str(date.today()))
    reading_json = json.dumps(data.get("reading", {}), ensure_ascii=False)
    writing_json = json.dumps(data.get("writing", {}), ensure_ascii=False)
    speaking_json = json.dumps(data.get("speaking", {}), ensure_ascii=False)
    listening_json = json.dumps(data.get("listening", {}), ensure_ascii=False)

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TOEFL 연습 — {date_str}</title>
<style>
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #fff; color: #37352f; font-size: 15px; line-height: 1.6;
}}
.cover {{ height: 8px; background: linear-gradient(90deg, #f59e0b 0%, #ef4444 100%); }}
.page {{ max-width: 720px; margin: 0 auto; padding: 48px 24px 80px; }}
.back-link {{
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; color: #9b9a97; text-decoration: none; margin-bottom: 24px;
}}
.back-link:hover {{ color: #37352f; }}
.page-icon {{ font-size: 48px; margin-bottom: 10px; display: block; }}
.page-title {{ font-size: 30px; font-weight: 700; letter-spacing: -0.4px; margin-bottom: 4px; }}
.page-desc {{ font-size: 13px; color: #9b9a97; margin-bottom: 28px; }}
.date-badge {{
  display: inline-block; font-size: 11px; background: #fff7ed; color: #c2410c;
  padding: 3px 10px; border-radius: 20px; font-weight: 600; margin-bottom: 28px;
}}
.tab-bar {{
  display: flex; gap: 4px; border-bottom: 2px solid #e9e9e7; margin-bottom: 28px; overflow-x: auto;
}}
.tab-btn {{
  padding: 10px 18px; font-size: 14px; font-weight: 600; color: #9b9a97;
  border: none; background: none; cursor: pointer; border-bottom: 2px solid transparent;
  margin-bottom: -2px; transition: color .15s; white-space: nowrap;
}}
.tab-btn.active {{ color: #37352f; border-bottom-color: #f59e0b; }}
.tab-btn:hover:not(.active) {{ color: #37352f; }}
.tab-btn {{ transition: color .15s; }}
.tab-panel {{ display: none; }}
.tab-panel.active {{ display: block; animation: tabIn .2s ease; }}
@keyframes tabIn {{ from {{ opacity: 0; transform: translateY(8px); }} to {{ opacity: 1; transform: none; }} }}
.section-title {{
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .8px; color: #9b9a97; margin-bottom: 14px;
}}
/* Reading */
.reading-title {{ font-size: 18px; font-weight: 700; margin-bottom: 14px; }}
.reading-passage {{
  font-size: 15px; line-height: 1.85; color: #37352f;
  background: #fafaf9; border: 1px solid #e9e9e7; border-radius: 10px;
  padding: 20px 22px; margin-bottom: 24px; white-space: pre-wrap;
}}
.questions-list {{ display: flex; flex-direction: column; gap: 20px; }}
.q-card {{ border: 1px solid #e9e9e7; border-radius: 10px; padding: 18px; }}
.q-card.answered {{ background: #fafaf9; }}
.q-num {{ font-size: 10px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }}
.q-text {{ font-size: 15px; font-weight: 600; margin-bottom: 14px; line-height: 1.5; }}
.q-options {{ display: flex; flex-direction: column; gap: 8px; }}
.opt-btn {{
  text-align: left; background: #f7f6f3; border: 1px solid #e9e9e7;
  border-radius: 8px; padding: 10px 14px; font-size: 14px; cursor: pointer;
  transition: background .1s; color: #37352f;
}}
.opt-btn:hover:not(:disabled) {{ background: #fff7ed; border-color: #fcd34d; }}
.opt-btn.correct {{ background: #f0fdf4; border-color: #86efac; color: #166534; }}
.opt-btn.wrong {{ background: #fef2f2; border-color: #fca5a5; color: #991b1b; }}
.q-explanation {{
  display: none; margin-top: 12px; padding: 10px 14px;
  background: #f7f6f3; border-radius: 6px; font-size: 13px; line-height: 1.6;
}}
.q-explanation.show {{ display: block; }}
.expl-label {{ font-weight: 700; color: #f59e0b; }}
/* Writing */
.prompt-box {{
  background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px;
  padding: 18px 20px; font-size: 15px; line-height: 1.7; margin-bottom: 20px;
}}
.structure-box {{ border: 1px solid #e9e9e7; border-radius: 10px; overflow: hidden; margin-bottom: 16px; }}
.structure-toggle {{
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
  background: #f7f6f3; border: none; width: 100%; text-align: left; color: #37352f;
}}
.structure-body {{ display: none; padding: 14px 16px; font-size: 13px; line-height: 1.7; }}
.structure-body.open {{ display: block; }}
.structure-row {{ margin-bottom: 10px; }}
.structure-label {{ font-weight: 700; color: #f59e0b; margin-right: 6px; }}
.phrase-list {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }}
.phrase-chip {{
  font-size: 13px; padding: 5px 12px; background: #fff7ed; border: 1px solid #fed7aa;
  border-radius: 20px; color: #c2410c; cursor: pointer; font-weight: 500; transition: background .1s;
}}
.phrase-chip:hover {{ background: #fed7aa; }}
.phrase-chip.copied {{ background: #f0fdf4; border-color: #86efac; color: #166534; }}
.writing-area {{
  width: 100%; border: 1px solid #e9e9e7; border-radius: 10px; padding: 14px 16px;
  font-size: 14px; font-family: inherit; color: #37352f; resize: vertical;
  min-height: 200px; outline: none; line-height: 1.7; transition: border-color .15s; margin-bottom: 10px;
}}
.writing-area:focus {{ border-color: #f59e0b; }}
.writing-meta {{
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; color: #9b9a97; margin-bottom: 12px;
}}
.word-count {{ font-weight: 700; color: #37352f; }}
.timer-row {{ display: flex; align-items: center; gap: 10px; }}
.timer-display {{ font-size: 20px; font-weight: 700; color: #37352f; font-variant-numeric: tabular-nums; min-width: 60px; }}
.timer-display.warning {{ color: #ef4444; }}
.btn-timer {{
  padding: 8px 18px; font-size: 13px; font-weight: 600; border: none;
  border-radius: 8px; cursor: pointer; background: #f59e0b; color: #fff; transition: background .15s;
}}
.btn-timer:hover {{ background: #d97706; }}
.btn-timer.running {{ background: #ef4444; }}
/* Speaking */
.speaking-prompt {{
  background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px;
  padding: 18px 20px; font-size: 15px; line-height: 1.7; margin-bottom: 20px;
}}
.speak-timer-box {{
  border: 1px solid #e9e9e7; border-radius: 12px; padding: 20px;
  text-align: center; margin-bottom: 20px;
}}
.speak-phase-label {{
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .8px; color: #9b9a97; margin-bottom: 8px;
}}
.speak-phase-label.prep {{ color: #0ea5e9; }}
.speak-phase-label.speak {{ color: #10b981; }}
.speak-phase-label.done {{ color: #8b5cf6; }}
.speak-countdown {{
  font-size: 52px; font-weight: 700; color: #37352f;
  font-variant-numeric: tabular-nums; margin-bottom: 10px; line-height: 1;
}}
.speak-countdown.warning {{ color: #ef4444; }}
.speak-bar-wrap {{ background: #f1f0ef; border-radius: 4px; height: 6px; margin-bottom: 16px; overflow: hidden; }}
.speak-bar {{ height: 100%; border-radius: 4px; transition: width .9s linear; }}
.speak-bar.prep {{ background: #0ea5e9; }}
.speak-bar.speak {{ background: #10b981; }}
.btn-speak {{
  width: 100%; padding: 14px; font-size: 16px; font-weight: 700;
  background: linear-gradient(135deg, #10b981, #0ea5e9);
  color: #fff; border: none; border-radius: 10px; cursor: pointer; transition: opacity .15s;
}}
.btn-speak:hover {{ opacity: .9; }}
.btn-speak:disabled {{ background: #e9e9e7; color: #9b9a97; cursor: default; }}
.expr-list {{ border: 1px solid #e9e9e7; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }}
.expr-item {{ font-size: 14px; padding: 6px 0; border-bottom: 1px solid #f1f0ef; }}
.expr-item:last-child {{ border-bottom: none; }}
.sample-points {{
  display: none; background: #f0fdf4; border: 1px solid #86efac;
  border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
}}
.sample-points.show {{ display: block; }}
.sample-point {{ font-size: 14px; padding: 6px 0; border-bottom: 1px solid #dcfce7; color: #166534; }}
.sample-point:last-child {{ border-bottom: none; }}
.btn-secondary {{
  width: 100%; padding: 12px; font-size: 14px; font-weight: 600;
  background: #f7f6f3; border: 1px solid #e9e9e7; color: #37352f;
  border-radius: 10px; cursor: pointer; transition: background .15s;
}}
.btn-secondary:hover {{ background: #e9e9e7; }}
/* Feedback */
.btn-feedback {{
  width: 100%; padding: 12px; font-size: 14px; font-weight: 700; margin-top: 12px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;
  border: none; border-radius: 10px; cursor: pointer; transition: opacity .15s;
}}
.btn-feedback:hover {{ opacity: .9; }}
.btn-feedback:disabled {{ background: #e9e9e7; color: #9b9a97; cursor: not-allowed; }}
.feedback-box {{
  display: none; margin-top: 14px; background: #fafaf9;
  border: 1px solid #e9e9e7; border-radius: 12px; padding: 16px;
}}
.feedback-box.show {{ display: block; }}
.feedback-box h3 {{ font-size: 13px; font-weight: 700; color: #6366f1; margin: 0 0 10px; }}
.feedback-content {{ font-size: 13px; line-height: 1.75; color: #37352f; white-space: pre-wrap; }}
.transcript-area {{
  width: 100%; box-sizing: border-box; margin-top: 10px; padding: 10px 12px;
  border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px;
  min-height: 80px; resize: vertical; font-family: inherit; line-height: 1.6;
}}
.rec-status {{ font-size: 12px; color: #9b9a97; margin-top: 5px; min-height: 18px; }}
/* Listening */
.listen-badge {{
  display: inline-block; font-size: 11px; background: #eff6ff; color: #3b82f6;
  padding: 3px 10px; border-radius: 20px; font-weight: 600; margin-bottom: 14px;
}}
.listen-player {{ border: 1px solid #e9e9e7; border-radius: 12px; padding: 20px; margin-bottom: 20px; }}
.listen-controls {{ display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }}
.btn-play {{
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #8b5cf6, #06b6d4);
  color: #fff; border: none; font-size: 22px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: opacity .15s; flex-shrink: 0;
}}
.btn-play:hover {{ opacity: .9; }}
.listen-status {{ font-size: 14px; color: #9b9a97; }}
.listen-status.playing {{ color: #8b5cf6; font-weight: 600; }}
.listen-status.done {{ color: #166534; font-weight: 600; }}
.speed-select {{
  font-size: 13px; padding: 6px 10px; border: 1px solid #e9e9e7;
  border-radius: 6px; color: #37352f; background: #fff; cursor: pointer; margin-left: auto;
}}
.listen-tip {{ font-size: 12px; color: #9b9a97; margin-bottom: 10px; }}
.btn-show-script {{
  font-size: 13px; color: #9b9a97; background: #f7f6f3;
  border: 1px solid #e9e9e7; border-radius: 6px; padding: 6px 14px; cursor: pointer;
}}
.listen-script {{
  display: none; background: #f7f6f3; border-radius: 8px; padding: 14px 16px;
  font-size: 14px; line-height: 1.8; color: #37352f; white-space: pre-wrap; margin-top: 12px;
}}
.listen-script.show {{ display: block; }}
.listen-questions {{ display: none; }}
.listen-questions.show {{ display: flex; flex-direction: column; gap: 20px; }}
.btn-done-listen {{
  width: 100%; padding: 12px; font-size: 14px; font-weight: 700;
  background: linear-gradient(135deg, #8b5cf6, #06b6d4);
  color: #fff; border: none; border-radius: 10px; cursor: pointer;
  margin-bottom: 20px; display: none;
}}
.btn-done-listen.show {{ display: block; }}
@media (max-width: 500px) {{
  .page {{ padding: 32px 16px 60px; }}
  .page-title {{ font-size: 24px; }}
  .tab-btn {{ padding: 8px 12px; font-size: 13px; }}
}}
</style>
</head>
<body>
<div class="cover"></div>
<div class="page">
  <a class="back-link" href="../index.html">← Yong's AI Study</a>
  <span class="page-icon">📝</span>
  <h1 class="page-title">TOEFL 오늘의 연습</h1>
  <p class="page-desc">Reading · Writing · Speaking · Listening — 하루 1세트</p>
  <span class="date-badge">📅 {date_str}</span>

  <div class="tab-bar">
    <button class="tab-btn active" onclick="switchTab('reading',this)">📖 Reading</button>
    <button class="tab-btn" onclick="switchTab('writing',this)">✍️ Writing</button>
    <button class="tab-btn" onclick="switchTab('speaking',this)">🎤 Speaking</button>
    <button class="tab-btn" onclick="switchTab('listening',this)">🎧 Listening</button>
  </div>

  <!-- Reading -->
  <div class="tab-panel active" id="tab-reading">
    <div class="section-title">Reading Comprehension</div>
    <div class="reading-title" id="readingTitle"></div>
    <div class="reading-passage" id="readingPassage"></div>
    <div class="section-title">Questions</div>
    <div class="questions-list" id="readingQs"></div>
  </div>

  <!-- Writing -->
  <div class="tab-panel" id="tab-writing">
    <div class="section-title">Writing — Independent Task (30분)</div>
    <div class="prompt-box" id="writingPrompt"></div>
    <div class="structure-box">
      <button class="structure-toggle" onclick="toggleStructure()">
        📋 구조 가이드 <span id="structArrow">▼</span>
      </button>
      <div class="structure-body" id="structBody"></div>
    </div>
    <div class="section-title">핵심 표현 (클릭 → 텍스트에 삽입)</div>
    <div class="phrase-list" id="phraseList"></div>
    <textarea class="writing-area" id="writingArea" placeholder="여기에 답안을 작성하세요..."></textarea>
    <button class="btn-feedback" id="btnWritingFeedback" onclick="requestWritingFeedback()">✨ AI 피드백 받기</button>
    <div class="feedback-box" id="writingFeedbackBox">
      <h3>📝 Writing 피드백</h3>
      <div class="feedback-content" id="writingFeedbackContent"></div>
    </div>
    <div class="writing-meta">
      <span>단어 수: <span class="word-count" id="wordCount">0</span></span>
      <div class="timer-row">
        <span class="timer-display" id="wTimerDisp">30:00</span>
        <button class="btn-timer" id="wTimerBtn" onclick="toggleWTimer()">타이머 시작</button>
      </div>
    </div>
  </div>

  <!-- Speaking -->
  <div class="tab-panel" id="tab-speaking">
    <div class="section-title">Speaking — Independent Task 1 (준비 15초 · 답변 45초)</div>
    <div class="speaking-prompt" id="speakingPrompt"></div>
    <div class="speak-timer-box">
      <div class="speak-phase-label" id="speakLabel">시작 준비</div>
      <div class="speak-countdown" id="speakCount">15</div>
      <div class="speak-bar-wrap"><div class="speak-bar prep" id="speakBar" style="width:100%"></div></div>
      <button class="btn-speak" id="speakBtn" onclick="startSpeaking()">▶ 시작 (준비 15초 → 답변 45초)</button>
    </div>
    <div class="section-title">유용한 표현</div>
    <div class="expr-list" id="exprList"></div>
    <div class="sample-points" id="samplePts"></div>
    <button class="btn-secondary" onclick="showSamplePts()">샘플 포인트 보기</button>
    <div id="speakFeedbackWrap" style="display:none;margin-top:20px">
      <div class="section-title">AI 피드백 받기</div>
      <p style="font-size:13px;color:#9b9a97;margin-bottom:8px">Chrome/Edge에서는 음성 인식이 자동으로 채워집니다. 직접 수정하거나 입력도 가능해요.</p>
      <textarea class="transcript-area" id="speakTranscript" placeholder="말한 내용이 여기에 채워집니다. 직접 입력도 가능해요..."></textarea>
      <p class="rec-status" id="recStatus"></p>
      <button class="btn-feedback" id="btnSpeakFeedback" onclick="requestSpeakFeedback()">✨ AI 피드백 받기</button>
      <div class="feedback-box" id="speakFeedbackBox">
        <h3>🎤 Speaking 피드백</h3>
        <div class="feedback-content" id="speakFeedbackContent"></div>
      </div>
    </div>
  </div>

  <!-- Listening -->
  <div class="tab-panel" id="tab-listening">
    <div class="section-title">Listening Comprehension</div>
    <div class="listen-badge" id="listenBadge">대화</div>
    <p style="font-size:14px;color:#9b9a97;margin-bottom:16px">스크립트를 숨기고 TTS로 들은 후 문제를 풀어보세요.</p>
    <div class="listen-player">
      <div class="listen-controls">
        <button class="btn-play" id="playBtn" onclick="playListen()">▶</button>
        <span class="listen-status" id="listenSt">재생 준비됨</span>
        <select class="speed-select" id="speedSel">
          <option value="0.75">0.75x</option>
          <option value="0.9">0.9x</option>
          <option value="1.0" selected>1.0x</option>
          <option value="1.1">1.1x</option>
        </select>
      </div>
      <div class="listen-tip">💡 스크립트 없이 듣는 게 효과적이에요. 어려우면 스크립트를 참고하세요.</div>
      <button class="btn-show-script" onclick="toggleScript(this)">스크립트 보기</button>
      <div class="listen-script" id="listenScript"></div>
    </div>
    <button class="btn-done-listen" id="doneListen" onclick="showListenQs()">✅ 다 들었어요 — 문제 풀기</button>
    <div class="listen-questions" id="listenQs"></div>
  </div>
</div>

<script>
const READING  = {reading_json};
const WRITING  = {writing_json};
const SPEAKING = {speaking_json};
const LISTENING = {listening_json};
const TOEFL_DATE = (()=>{{ const d=new Date(); return `${{d.getFullYear()}}-${{String(d.getMonth()+1).padStart(2,'0')}}-${{String(d.getDate()).padStart(2,'0')}}`; }})();

/* ── 탭 ── */
function switchTab(name, btn) {{
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}}
function goTab(name) {{
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  const btn = document.querySelector(`.tab-btn[onclick*="'${{name}}'"]`);
  if (btn) btn.classList.add('active');
}}

/* ══ READING ══ */
function initReading() {{
  document.getElementById('readingTitle').textContent = READING.title || '';
  document.getElementById('readingPassage').textContent = READING.passage || '';
  document.getElementById('readingQs').innerHTML = (READING.questions || []).map((q, i) => `
    <div class="q-card" id="rq-${{i}}">
      <div class="q-num">Q${{i+1}}</div>
      <div class="q-text">${{q.q}}</div>
      <div class="q-options">
        ${{(q.options||[]).map((o,j)=>`<button class="opt-btn" id="ro-${{i}}-${{j}}" onclick="ansR(${{i}},${{j}},${{q.answer}})">${{String.fromCharCode(65+j)}}. ${{o}}</button>`).join('')}}
      </div>
      <div class="q-explanation" id="re-${{i}}"><span class="expl-label">💬 </span>${{q.explanation||''}}</div>
    </div>`).join('');
}}
function ansR(qi, chosen, correct) {{
  const card = document.getElementById('rq-'+qi);
  if (card.classList.contains('answered')) return;
  card.classList.add('answered');
  card.querySelectorAll('.opt-btn').forEach(b => b.disabled=true);
  document.getElementById('ro-'+qi+'-'+correct).classList.add('correct');
  if (chosen!==correct) document.getElementById('ro-'+qi+'-'+chosen).classList.add('wrong');
  document.getElementById('re-'+qi).classList.add('show');
  if (document.querySelectorAll('#readingQs .q-card.answered').length >= (READING.questions||[]).length) {{
    localStorage.setItem('toefl_reading_' + TOEFL_DATE, '1');
  }}
}}

/* ══ WRITING ══ */
let wSecs = 30*60, wRunning = false, wInterval = null;

function initWriting() {{
  document.getElementById('writingPrompt').textContent = WRITING.prompt || '';
  const s = WRITING.structure || {{}};
  document.getElementById('structBody').innerHTML = [
    s.intro      ? `<div class="structure-row"><span class="structure-label">Intro:</span>${{s.intro}}</div>` : '',
    s.body1      ? `<div class="structure-row"><span class="structure-label">Body 1:</span>${{s.body1}}</div>` : '',
    s.body2      ? `<div class="structure-row"><span class="structure-label">Body 2:</span>${{s.body2}}</div>` : '',
    s.conclusion ? `<div class="structure-row"><span class="structure-label">Conclusion:</span>${{s.conclusion}}</div>` : '',
  ].join('');
  document.getElementById('phraseList').innerHTML = (WRITING.key_phrases||[]).map(p=>
    `<span class="phrase-chip" onclick="insertPhrase(this,'${{p}}')">${{p}}</span>`).join('');
  document.getElementById('writingArea').addEventListener('input', () => {{
    const w = document.getElementById('writingArea').value.trim().split(/[ \\t\\n]+/).filter(Boolean).length;
    document.getElementById('wordCount').textContent = w;
  }});
}}
function toggleStructure() {{
  document.getElementById('structBody').classList.toggle('open');
  document.getElementById('structArrow').textContent = document.getElementById('structBody').classList.contains('open') ? '▲' : '▼';
}}
function insertPhrase(el, phrase) {{
  const ta = document.getElementById('writingArea');
  const pos = ta.selectionStart;
  ta.value = ta.value.slice(0,pos) + phrase + ' ' + ta.value.slice(pos);
  ta.focus(); ta.selectionStart = ta.selectionEnd = pos + phrase.length + 1;
  el.classList.add('copied'); setTimeout(()=>el.classList.remove('copied'), 600);
}}
function toggleWTimer() {{
  const btn = document.getElementById('wTimerBtn');
  if (!wRunning) {{
    wRunning = true; btn.textContent = '정지'; btn.classList.add('running');
    wInterval = setInterval(() => {{
      wSecs--;
      if (wSecs <= 0) {{ clearInterval(wInterval); wRunning = false;
        document.getElementById('wTimerDisp').textContent = '00:00';
        document.getElementById('wTimerDisp').classList.add('warning');
        btn.textContent = '종료'; btn.disabled = true; return; }}
      const m = Math.floor(wSecs/60).toString().padStart(2,'0');
      const s = (wSecs%60).toString().padStart(2,'0');
      document.getElementById('wTimerDisp').textContent = `${{m}}:${{s}}`;
      if (wSecs <= 120) document.getElementById('wTimerDisp').classList.add('warning');
    }}, 1000);
  }} else {{
    clearInterval(wInterval); wRunning = false;
    btn.textContent = '재개'; btn.classList.remove('running');
  }}
}}

/* ══ SPEAKING ══ */
let spPhase = 'idle', spTimer = null;
const PREP = 15, SPEAK = 45;

let mediaRecorder = null;
let audioChunks = [];

function initSpeaking() {{
  document.getElementById('speakingPrompt').textContent = SPEAKING.prompt || '';
  document.getElementById('exprList').innerHTML = (SPEAKING.useful_expressions||[]).map(e=>
    `<div class="expr-item">💬 ${{e}}</div>`).join('');
  document.getElementById('samplePts').innerHTML = (SPEAKING.sample_points||[]).map((p,i)=>
    `<div class="sample-point">${{i+1}}. ${{p}}</div>`).join('');
}}

async function startSpeaking() {{
  if (spPhase!=='idle') return;
  document.getElementById('speakBtn').disabled = true;
  spPhase = 'prep';

  let stream = null;
  try {{
    stream = await navigator.mediaDevices.getUserMedia({{ audio: true }});
  }} catch(e) {{
    document.getElementById('recStatus').textContent = '⚠️ 마이크 권한이 필요합니다. 직접 입력해주세요.';
  }}

  runPhase('prep', PREP, ()=>{{
    audioChunks = [];
    if (stream) {{
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => {{ if (e.data.size > 0) audioChunks.push(e.data); }};
      mediaRecorder.start();
      document.getElementById('recStatus').textContent = '🎙 녹음 중...';
    }}
    runPhase('speak', SPEAK, async ()=>{{
      spPhase = 'done';
      document.getElementById('speakLabel').className = 'speak-phase-label done';
      document.getElementById('speakLabel').textContent = '완료!';
      document.getElementById('speakCount').textContent = '✓';
      document.getElementById('speakBar').style.width = '0%';
      document.getElementById('samplePts').classList.add('show');
      document.getElementById('speakFeedbackWrap').style.display = 'block';
      localStorage.setItem('toefl_speaking_' + TOEFL_DATE, '1');

      if (mediaRecorder && mediaRecorder.state !== 'inactive') {{
        mediaRecorder.stop();
        stream.getTracks().forEach(t => t.stop());
        document.getElementById('recStatus').textContent = '변환 중...';
        await new Promise(r => setTimeout(r, 300));
        try {{
          const blob = new Blob(audioChunks, {{ type: 'audio/webm' }});
          const fd = new FormData();
          fd.append('audio', blob, 'speech.webm');
          const res = await fetch('/api/transcribe', {{ method: 'POST', body: fd }});
          const data = await res.json();
          if (data.text) {{
            document.getElementById('speakTranscript').value = data.text;
            document.getElementById('recStatus').textContent = '✅ 변환 완료 — 확인 후 피드백 받기';
          }} else {{
            document.getElementById('recStatus').textContent = '⚠️ 변환 실패 — 직접 입력해주세요';
          }}
        }} catch(e) {{
          document.getElementById('recStatus').textContent = '⚠️ 변환 실패 — 직접 입력해주세요';
        }}
      }}
    }});
  }});
}}
function runPhase(phase, total, onDone) {{
  let rem = total;
  const lbl = document.getElementById('speakLabel');
  const cnt = document.getElementById('speakCount');
  const bar = document.getElementById('speakBar');
  lbl.className = 'speak-phase-label ' + phase;
  lbl.textContent = phase==='prep' ? '준비 중 (메모하세요)' : '답변 중 (말하세요!)';
  bar.className = 'speak-bar ' + phase;
  bar.style.width = '100%'; cnt.classList.remove('warning'); cnt.textContent = rem;
  spTimer = setInterval(()=>{{
    rem--;
    cnt.textContent = rem;
    bar.style.width = (rem/total*100)+'%';
    if (rem<=5) cnt.classList.add('warning');
    if (rem<=0) {{ clearInterval(spTimer); onDone(); }}
  }}, 1000);
}}
function showSamplePts() {{ document.getElementById('samplePts').classList.add('show'); }}

async function requestWritingFeedback() {{
  const text = document.getElementById('writingArea').value.trim();
  if (!text || text.split(/[ \\t\\n]+/).filter(Boolean).length < 20) {{
    alert('최소 20단어 이상 작성 후 피드백을 받아주세요.'); return;
  }}
  const btn = document.getElementById('btnWritingFeedback');
  btn.disabled = true; btn.textContent = '분석 중...';
  try {{
    const res = await fetch('/api/feedback', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{ text, type: 'writing', prompt: WRITING.prompt, structure: WRITING.structure }})
    }});
    const data = await res.json();
    document.getElementById('writingFeedbackContent').textContent = data.feedback || data.error || '오류가 발생했습니다.';
    document.getElementById('writingFeedbackBox').classList.add('show');
    document.getElementById('writingFeedbackBox').scrollIntoView({{ behavior: 'smooth', block: 'nearest' }});
    if (data.feedback) localStorage.setItem('toefl_writing_' + TOEFL_DATE, '1');
  }} catch(e) {{
    alert('피드백 요청 실패. 네트워크를 확인해주세요.');
  }}
  btn.disabled = false; btn.textContent = '✨ AI 피드백 다시 받기';
}}

async function requestSpeakFeedback() {{
  const text = document.getElementById('speakTranscript').value.trim();
  if (!text || text.split(/[ \\t\\n]+/).filter(Boolean).length < 5) {{
    alert('말한 내용을 5단어 이상 입력해주세요.'); return;
  }}
  const btn = document.getElementById('btnSpeakFeedback');
  btn.disabled = true; btn.textContent = '분석 중...';
  try {{
    const res = await fetch('/api/feedback', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{ text, type: 'speaking', prompt: SPEAKING.prompt }})
    }});
    const data = await res.json();
    document.getElementById('speakFeedbackContent').textContent = data.feedback || data.error || '오류가 발생했습니다.';
    document.getElementById('speakFeedbackBox').classList.add('show');
    document.getElementById('speakFeedbackBox').scrollIntoView({{ behavior: 'smooth', block: 'nearest' }});
  }} catch(e) {{
    alert('피드백 요청 실패. 네트워크를 확인해주세요.');
  }}
  btn.disabled = false; btn.textContent = '✨ AI 피드백 다시 받기';
}}

/* ══ LISTENING ══ */
let isPlaying = false;
let cancelListen = false;
let currentAudio = null;
const VOICES = ['alloy', 'onyx', 'nova', 'echo', 'fable', 'shimmer'];

function parseScript(script) {{
  const segs = [];
  const lines = (script || '').split('\\n');
  for (const line of lines) {{
    const m = line.match(/^([A-Za-z][^:]{{0,25}}):\\s*(.+)/);
    if (m) {{
      segs.push({{ speaker: m[1].trim(), text: m[2].trim() }});
    }} else if (line.trim()) {{
      if (segs.length) segs[segs.length-1].text += ' ' + line.trim();
      else segs.push({{ speaker: 'narrator', text: line.trim() }});
    }}
  }}
  return segs;
}}

function initListening() {{
  const typeMap = {{ conversation:'대화', lecture:'강의', discussion:'토론' }};
  document.getElementById('listenBadge').textContent = typeMap[LISTENING.type] || '대화';
  document.getElementById('listenScript').textContent = LISTENING.script || '';
}}

async function playListen() {{
  if (isPlaying) {{
    cancelListen = true;
    if (currentAudio) {{ currentAudio.pause(); currentAudio = null; }}
    isPlaying = false;
    document.getElementById('playBtn').textContent = '▶';
    document.getElementById('listenSt').className = 'listen-status';
    document.getElementById('listenSt').textContent = '정지됨';
    return;
  }}
  cancelListen = false;
  const segs = parseScript(LISTENING.script);
  if (!segs.length) return;

  const speed = parseFloat(document.getElementById('speedSel').value);
  const speakers = [...new Set(segs.map(s => s.speaker))];
  const voiceMap = {{}};
  speakers.forEach((sp, i) => {{ voiceMap[sp] = VOICES[i % VOICES.length]; }});

  isPlaying = true;
  document.getElementById('playBtn').textContent = '⏸';
  document.getElementById('listenSt').className = 'listen-status playing';
  document.getElementById('listenSt').textContent = `오디오 로딩 중 (0/${{segs.length}})...`;
  document.getElementById('doneListen').classList.add('show');

  // 모든 세그먼트 병렬로 미리 fetch
  async function fetchSeg(seg) {{
    const res = await fetch('/api/tts', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{ text: seg.text, voice: voiceMap[seg.speaker] }})
    }});
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }}

  let loaded = 0;
  const urls = await Promise.all(segs.map(async seg => {{
    const url = await fetchSeg(seg).catch(() => null);
    loaded++;
    if (!cancelListen) document.getElementById('listenSt').textContent = `오디오 로딩 중 (${{loaded}}/${{segs.length}})...`;
    return url;
  }}));

  if (cancelListen) {{ urls.forEach(u => u && URL.revokeObjectURL(u)); return; }}

  document.getElementById('listenSt').textContent = '재생 중...';
  let idx = 0;
  function playNext() {{
    if (cancelListen || idx >= urls.length) {{
      urls.forEach(u => u && URL.revokeObjectURL(u));
      if (!cancelListen) {{
        isPlaying = false;
        document.getElementById('playBtn').textContent = '▶';
        document.getElementById('listenSt').className = 'listen-status done';
        document.getElementById('listenSt').textContent = '재생 완료 ✓';
        showListenQs();
      }}
      return;
    }}
    const url = urls[idx++];
    if (!url) {{ playNext(); return; }}
    currentAudio = new Audio(url);
    currentAudio.playbackRate = speed;
    currentAudio.onended = () => setTimeout(playNext, 200);
    currentAudio.onerror = () => setTimeout(playNext, 100);
    currentAudio.play();
  }}
  playNext();
}}
function toggleScript(btn) {{
  const el = document.getElementById('listenScript');
  el.classList.toggle('show');
  btn.textContent = el.classList.contains('show') ? '스크립트 숨기기' : '스크립트 보기';
}}
function showListenQs() {{
  document.getElementById('doneListen').classList.remove('show');
  const el = document.getElementById('listenQs');
  if (el.classList.contains('show')) return;
  el.innerHTML = (LISTENING.questions||[]).map((q,i)=>`
    <div class="q-card" id="lq-${{i}}">
      <div class="q-num">Q${{i+1}}</div>
      <div class="q-text">${{q.q}}</div>
      <div class="q-options">
        ${{(q.options||[]).map((o,j)=>`<button class="opt-btn" id="lo-${{i}}-${{j}}" onclick="ansL(${{i}},${{j}},${{q.answer}})">${{String.fromCharCode(65+j)}}. ${{o}}</button>`).join('')}}
      </div>
      <div class="q-explanation" id="le-${{i}}"><span class="expl-label">💬 </span>${{q.explanation||''}}</div>
    </div>`).join('');
  el.classList.add('show');
}}
function ansL(qi, chosen, correct) {{
  const card = document.getElementById('lq-'+qi);
  if (card.classList.contains('answered')) return;
  card.classList.add('answered');
  card.querySelectorAll('.opt-btn').forEach(b=>b.disabled=true);
  document.getElementById('lo-'+qi+'-'+correct).classList.add('correct');
  if (chosen!==correct) document.getElementById('lo-'+qi+'-'+chosen).classList.add('wrong');
  document.getElementById('le-'+qi).classList.add('show');
  if (document.querySelectorAll('#listenQs .q-card.answered').length >= (LISTENING.questions||[]).length) {{
    localStorage.setItem('toefl_listening_' + TOEFL_DATE, '1');
  }}
}}

initReading(); initWriting(); initSpeaking(); initListening();
if (typeof speechSynthesis!=='undefined' && speechSynthesis.onvoiceschanged!==undefined) {{
  speechSynthesis.onvoiceschanged = () => {{}};
}}
(function() {{
  const hash = location.hash.replace('#','');
  if (['reading','writing','speaking','listening'].includes(hash)) goTab(hash);
}})();
localStorage.setItem('toefl_visited_' + new Date().toISOString().slice(0,10), '1');
</script>
</body>
</html>
"""


def _trigger_firebase_functions(date_str: str):
    import urllib.request as _ur
    endpoints = [
        "https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/english-daily",
        "https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/toefl-daily",
    ]
    for url in endpoints:
        try:
            req = _ur.Request(url, data=b'{}', method='POST')
            req.add_header('Content-Type', 'application/json')
            with _ur.urlopen(req, timeout=30) as r:
                body = r.read().decode()
                print(f"[+] 함수 트리거 완료 ({url.split('/')[-1]}): {body}")
        except Exception as e:
            print(f"[!] 함수 트리거 실패 ({url.split('/')[-1]}): {e}")
            notify(f"⚠️ Firebase 함수 트리거 실패 ({date_str}): {e}")


def deploy_to_netlify(word_count: int = 0, quiz_count: int = 0, target_date=None):
    GIT = "git"  # PATH의 git 사용
    print("[*] GitHub Pages 배포 중...")
    subprocess.run([GIT, "pull", "--rebase", "origin", "main"], cwd=str(ROOT))
    subprocess.run([GIT, "add", "-A"], cwd=str(ROOT))
    date_str = str(target_date) if target_date else str(date.today())
    msg = f"auto: update english {date_str} words={word_count} quiz={quiz_count}"
    r1 = subprocess.run([GIT, "commit", "-m", msg], cwd=str(ROOT))
    if r1.returncode != 0:
        print("[*] 커밋할 변경 없음 - 배포 생략")
        return
    result = subprocess.run([GIT, "push"], cwd=str(ROOT))
    if result.returncode == 0:
        print("[+] GitHub Pages 배포 완료")
        notify(
            f"📚 **영어공부 + TOEFL 업데이트 완료** ({date_str})\n"
            f"> 단어 {word_count}개 · 퀴즈 {quiz_count}개\n"
            f"> https://dctm1011-gif.github.io/yongs-ai-study/english/"
        )
    else:
        print("[!] GitHub 배포 실패 (returncode:", result.returncode, ")")
        notify("❌ **영어공부 배포 실패.** git push 오류 확인 필요.")

    # Netlify CLI로 직접 배포 (CI 실패 우회) 후 Firebase 함수 즉시 트리거
    # 절대 경로 사용: Task Scheduler 환경에서 PATH에 npm global이 없을 수 있음
    NETLIFY_CMD = Path(r"C:\Users\dctm1\AppData\Roaming\npm\netlify.cmd")
    netlify_exe = str(NETLIFY_CMD) if NETLIFY_CMD.exists() else "netlify"
    print("[*] Netlify 직접 배포 중...")
    nr = subprocess.run(
        [netlify_exe, "deploy", "--prod", "--no-build", "--message", f"auto: {date_str}"],
        cwd=str(ROOT),
        shell=False,
    )
    if nr.returncode == 0:
        print("[+] Netlify 배포 성공, Firebase 함수 트리거 중...")
    else:
        print("[!] Netlify 배포 실패 — GitHub auto-deploy 완료 대기 후 트리거 시도...")
        import time
        time.sleep(180)
    _trigger_firebase_functions(date_str)


def get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        return key
    # fallback: .env 파일에서 로드 (YongStudyApp/.env)
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                key = line.split("=", 1)[1].strip()
                os.environ["ANTHROPIC_API_KEY"] = key
                return key
    return ""


def main(target_date: date = None):
    if target_date is None:
        target_date = date.today()

    api_key = get_api_key()
    if not api_key:
        print("[!] ANTHROPIC_API_KEY를 찾을 수 없습니다.")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # TOEFL 단어 로드
    toefl_words_path = ROOT / "public" / "toefl" / "words_db.json"
    toefl_words = load_toefl_words(toefl_words_path)

    data = generate_default_words(client, target_date, toefl_words)

    word_count = len(data.get('words', []))
    quiz_count = len(data.get('quiz', []))
    print(f"[+] 단어 {word_count}개, 퀴즈 {quiz_count}개 추출 완료")

    html = generate_html(data)
    OUTPUT_HTML.parent.mkdir(exist_ok=True)
    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"[+] HTML 저장: {OUTPUT_HTML}")

    # netlify/functions/english-daily.mjs가 읽어서 Firebase에 올리는 파일
    english_daily_json = ROOT / "english" / "daily.json"
    english_daily_json.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[+] daily.json 저장: {english_daily_json}")

    update_words_db(data.get("words", []), target_date)

    try:
        toefl_data = generate_toefl_content(client, target_date)
        toefl_html = generate_toefl_html(toefl_data)
        TOEFL_OUTPUT_HTML.parent.mkdir(exist_ok=True)
        TOEFL_OUTPUT_HTML.write_text(toefl_html, encoding="utf-8")
        print(f"[+] TOEFL HTML 저장: {TOEFL_OUTPUT_HTML}")

        # netlify/functions/toefl-daily.mjs가 읽어서 Firebase에 올리는 파일
        toefl_daily_json = ROOT / "toefl" / "daily.json"
        toefl_daily_json.write_text(
            json.dumps(toefl_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"[+] TOEFL daily.json 저장: {toefl_daily_json}")
    except Exception as e:
        print(f"[!] TOEFL 생성 실패: {e}")
        notify(f"⚠️ **TOEFL 생성 실패**: {e}")

    deploy_to_netlify(word_count=word_count, quiz_count=quiz_count, target_date=target_date)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        from datetime import datetime
        d = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
        main(d)
    else:
        main()
