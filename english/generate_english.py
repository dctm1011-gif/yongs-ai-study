"""
영어공부 Netlify 자동 업데이트
lily 대화 JSON → Claude API 분석 → english/index.html 생성 → Netlify 배포
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
ENGLISH_BOT_DATA = Path(r"C:\Users\dctm1\english-bot\data")
OUTPUT_HTML = ROOT / "english" / "index.html"
WORDS_DB_JSON = ROOT / "english" / "words_db.json"
PROFILE_JSON = Path(r"C:\Users\dctm1\english-bot\profile.json")
TOEFL_OUTPUT_HTML = ROOT / "toefl" / "index.html"

sys.path.insert(0, str(ROOT / "history"))
try:
    from discord_utils import notify
except Exception:
    def notify(text): pass

def load_conversations(target_date: date) -> list:
    data_file = ENGLISH_BOT_DATA / f"{target_date}.json"
    if not data_file.exists():
        print(f"[!] 대화 파일 없음: {data_file}")
        return []
    data = json.loads(data_file.read_text(encoding="utf-8-sig"))
    return data.get("lily_conversations", [])

def format_conversations(conversations: list) -> str:
    lines = []
    for c in conversations:
        lines.append(f"User: {c.get('user', '')}")
        lines.append(f"Lily: {c.get('lily', '')}")
        lines.append("")
    return "\n".join(lines)

def get_default_words(target_date: date) -> dict:
    """사전 정의된 기본 영어 단어/표현"""
    return {
        "date": str(target_date),
        "words": [
            {
                "word": "vibe",
                "part_of_speech": "명사",
                "meaning_ko": "분위기, 느낌",
                "explanation": "누군가나 무언가가 주는 느낌이나 분위기를 나타내요.",
                "example_from_convo": "I'm getting a good vibe from this",
                "example_ko": "이거 좋은 느낌이 드는데",
                "tip": "SNS와 일상 대화에서 매우 자주 쓰이는 표현이에요.",
                "emoji": "✨"
            },
            {
                "word": "chill",
                "part_of_speech": "동사/형용사",
                "meaning_ko": "편하게 쉬다, 차분한",
                "explanation": "긴장을 풀고 편하게 시간을 보낼 때 쓰여요.",
                "example_from_convo": "Let's just chill at home",
                "example_ko": "그냥 집에서 편하게 있자",
                "tip": "'chill out'으로도 많이 쓰여요.",
                "emoji": "😎"
            },
            {
                "word": "vibe check",
                "part_of_speech": "명사",
                "meaning_ko": "분위기 확인",
                "explanation": "누군가의 기분이나 상태를 확인하는 것을 말해요.",
                "example_from_convo": "Vibe check: how are you feeling?",
                "example_ko": "기분은 어때? 기분 체크 해볼게.",
                "tip": "현대 영어에서 젊은 세대가 즐겨 쓰는 표현이에요.",
                "emoji": "📊"
            },
            {
                "word": "nail it",
                "part_of_speech": "동사",
                "meaning_ko": "완벽하게 해내다",
                "explanation": "어려운 일을 완벽하게 성공하는 것을 표현해요.",
                "example_from_convo": "You really nailed that presentation",
                "example_ko": "그 발표 완벽하게 해냈어",
                "tip": "칭찬할 때 자주 쓰이는 긍정적인 표현이에요.",
                "emoji": "🎯"
            },
            {
                "word": "hang out",
                "part_of_speech": "동사",
                "meaning_ko": "시간을 보내다, 어울리다",
                "explanation": "친구들과 함께 시간을 보내거나 누군가와 어울리는 것을 의미해요.",
                "example_from_convo": "Wanna hang out this weekend?",
                "example_ko": "이번 주말에 같이 시간 보낼래?",
                "tip": "일상 영어에서 매우 자연스럽고 자주 쓰이는 표현입니다.",
                "emoji": "👋"
            }
        ],
        "quiz": [
            {"type": "meaning", "word": "vibe", "question": "'vibe'는 어떤 의미인가요?", "options": ["기계음", "분위기/느낌", "음악", "색상"], "answer": 1, "explanation": "vibe는 누군가나 무언가가 주는 분위기나 느낌을 나타내요."},
            {"type": "fill_blank", "word": "vibe", "sentence": "I'm getting a really good _____ from this place.", "sentence_ko": "이 장소에서 정말 좋은 분위기가 느껴져.", "answer": "vibe", "hint": "분위기/느낌"},
            {"type": "meaning", "word": "chill", "question": "'Let's chill'은 무엇을 의미하나요?", "options": ["춤을 추자", "편하게 쉬자", "달리자", "먹자"], "answer": 1, "explanation": "chill은 긴장을 풀고 편하게 시간을 보낸다는 뜻이에요."},
            {"type": "fill_blank", "word": "chill", "sentence": "I don't want to go anywhere today, let's just _____ at home.", "sentence_ko": "오늘 어디 가기 싫어, 그냥 집에서 편하게 있자.", "answer": "chill", "hint": "편하게 쉬다"},
            {"type": "meaning", "word": "nail it", "question": "'nail it'의 의미는?", "options": ["못을 박다", "실패하다", "완벽하게 해내다", "느리다"], "answer": 2, "explanation": "nail it은 어려운 일을 완벽하게 성공하는 것을 의미해요."},
            {"type": "situation", "word": "nail it", "question": "친구가 어려운 시험을 잘 봤을 때 뭐라고 말할까요?", "options": ["You failed it", "You nailed it!", "You broke it", "You lost it"], "answer": 1, "explanation": "누군가가 뭔가를 완벽하게 해냈을 때 'You nailed it!'이라고 칭찬해요."},
            {"type": "meaning", "word": "hang out", "question": "'hang out'은 뭘 할 때 쓰나요?", "options": ["공부할 때", "친구들과 시간을 보낼 때", "일할 때", "운동할 때"], "answer": 1, "explanation": "hang out은 친구들과 함께 시간을 보내는 것을 의미해요."},
            {"type": "fill_blank", "word": "hang out", "sentence": "Do you want to _____ together this weekend?", "sentence_ko": "이번 주말에 함께 시간 보낼래?", "answer": "hang out", "hint": "시간을 보내다"}
        ]
    }

def generate_default_words(client: anthropic.Anthropic, target_date: date) -> dict:
    """기본 영어 단어/표현 반환"""
    return get_default_words(target_date)

def analyze_with_claude(convo_text: str, target_date: date, client: anthropic.Anthropic) -> dict:
    print("[*] Claude API 호출 중...")
    prompt = f"""다음은 영어 원어민 AI Lily와의 영어 학습 대화입니다. ({target_date})

대화 기록:
{convo_text}

이 대화에서 배울 수 있는 영어 단어/표현들을 분석하고 아래 JSON 형식으로만 응답해주세요.
JSON 외 다른 텍스트는 절대 포함하지 마세요.

{{
  "date": "{target_date}",
  "words": [
    {{
      "word": "lowkey",
      "part_of_speech": "부사/형용사",
      "meaning_ko": "은근히, 어느 정도",
      "explanation": "일상 영어에서 자주 쓰이는 슬랭으로, 뭔가를 인정하지만 강하지 않게 표현할 때 씁니다. 'kind of'와 비슷한 느낌이에요.",
      "example_from_convo": "I'm lowkey impressed when people actually stick with it",
      "example_ko": "나는 사람들이 실제로 꾸준히 할 때 은근히 감동받아",
      "tip": "SNS나 캐주얼한 대화에서 매우 자주 등장해요. 'I lowkey love this' (이거 은근히 좋아) 처럼 쓸 수 있어요.",
      "emoji": "😏"
    }}
  ],
  "quiz": [
    {{
      "type": "meaning",
      "word": "lowkey",
      "question": "\\"lowkey\\"가 사용된 상황은?",
      "options": ["격식 있게 말할 때", "은근히, 살짝 인정할 때", "매우 강하게 표현할 때", "공식적으로 발표할 때"],
      "answer": 1,
      "explanation": "lowkey는 '은근히', '어느 정도'를 의미하는 캐주얼한 표현이에요."
    }},
    {{
      "type": "fill_blank",
      "word": "lowkey",
      "sentence": "That movie was _____ good, I didn't expect to like it.",
      "sentence_ko": "그 영화 은근히 좋았어, 기대 안 했는데.",
      "answer": "lowkey",
      "hint": "은근히, 어느 정도"
    }},
    {{
      "type": "situation",
      "question": "친구가 생각보다 잘 했을 때 '나 은근히 감동받았어'를 영어로 하면?",
      "options": ["I'm absolutely impressed", "I'm lowkey impressed", "I'm formally impressed", "I'm secretly ashamed"],
      "answer": 1,
      "explanation": "lowkey는 완전하진 않지만 어느 정도 인정하는 느낌을 줘요."
    }}
  ]
}}

위 JSON 구조를 참고해서, 실제 대화에서 배울 수 있는 단어/표현 5-8개만 추출하고 각각 퀴즈 2개씩 만들어주세요. (단어 수를 8개 이하로 제한해서 JSON이 잘리지 않게 해주세요)

emoji 필드에는 그 단어를 가장 잘 표현하는 이모지 1개를 넣어주세요.
예: 'lowkey' → 😏, 'gripping' → 📚, 'clutch' → 🎯, 'parched' → 🏜️, 'grinding' → ⚙️"""

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
            print(f"[!] JSON 없음, 재시도 {attempt+1}")
            continue
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError as e:
            print(f"[!] JSON 파싱 실패 ({e}), 재시도 {attempt+1}")
    raise RuntimeError("Claude API JSON 파싱 2회 실패")


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


def update_profile_topics(conversations: list, target_date) -> None:
    """대화에서 새 토픽을 추출해 profile.json recent_topics에 추가 (최대 10개 유지)"""
    if not PROFILE_JSON.exists() or not conversations:
        return
    try:
        profile = json.loads(PROFILE_JSON.read_text(encoding="utf-8"))
        date_str = str(target_date)

        # 이미 이 날짜 토픽이 있으면 스킵
        existing = profile.get("recent_topics", [])
        if any(date_str in t for t in existing):
            return

        # 대화에서 주제 키워드 간단 추출 (Claude API 안 씀 — 크레딧 절약)
        all_text = " ".join(c.get("user", "") for c in conversations[:5])
        topics = []

        # 패턴 기반 토픽 감지
        import re
        if re.search(r"toefl|토플", all_text, re.I):
            topics.append(f"{date_str}: TOEFL 공부 관련 대화")
        if re.search(r"ut austin|석사|master", all_text, re.I):
            topics.append(f"{date_str}: UT Austin 진학 고민")
        if re.search(r"work|job|career|회사|직장", all_text, re.I):
            topics.append(f"{date_str}: 직장/커리어 관련 대화")
        if re.search(r"coffee|커피", all_text, re.I):
            topics.append(f"{date_str}: 커피/건강 관련 대화")
        if re.search(r"game|게임|tft|팀파이트", all_text, re.I):
            topics.append(f"{date_str}: 게임 관련 대화")

        # 첫 유저 메시지 요약을 토픽으로 추가
        if conversations:
            first_msg = conversations[0].get("user", "").strip()[:60]
            if first_msg:
                topics.append(f"{date_str}: \"{first_msg}...\"")

        if not topics:
            topics.append(f"{date_str}: 일상 영어 대화")

        # 기존 목록에 추가 후 최근 10개만 유지
        profile["recent_topics"] = (existing + topics)[-10:]
        PROFILE_JSON.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[+] profile.json recent_topics 업데이트 완료 ({date_str})")
    except Exception as e:
        print(f"[!] profile.json 업데이트 실패: {e}")


def update_words_db(words: list, target_date) -> None:
    """새 단어를 words_db.json에 추가 (이미 있는 날짜는 스킵)"""
    date_str = str(target_date)
    existing = []
    if WORDS_DB_JSON.exists():
        existing = json.loads(WORDS_DB_JSON.read_text(encoding="utf-8"))

    existing_ids = {w["id"] for w in existing}
    existing_dates = {w.get("date") for w in existing}

    if date_str in existing_dates:
        print(f"[*] words_db.json에 {date_str} 이미 존재 - 스킵")
        return

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
        WORDS_DB_JSON.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[+] words_db.json에 {len(new_entries)}개 단어 추가 ({date_str})")
    else:
        print(f"[*] words_db.json - 추가할 새 단어 없음")


def generate_toefl_content(client: anthropic.Anthropic, target_date) -> dict:
    print("[*] TOEFL 콘텐츠 생성 중...")
    prompt = f"""TOEFL iBT 연습 문제를 JSON 형식으로만 생성해주세요. ({target_date})
JSON 외 다른 텍스트는 절대 포함하지 마세요.

{{
  "date": "{target_date}",
  "reading": {{
    "title": "지문 제목",
    "passage": "TOEFL 수준 영어 지문 80-100 단어. 1단락. 짧지만 정보 밀도 높게. 핵심 개념·사실·주장 압축.",
    "questions": [
      {{"q": "According to the passage, ...", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "한국어 해설"}},
      {{"q": "What can be inferred from the passage about ...?", "options": ["A", "B", "C", "D"], "answer": 1, "explanation": "한국어 해설"}}
    ]
  }},
  "writing": {{
    "prompt": "Do you agree or disagree with the following statement? [구체적인 주장]. Use specific reasons and examples to support your answer.",
    "structure": {{
      "intro": "도입부 작성 가이드 (Restate the prompt + thesis 예시)",
      "body1": "본론 1 아이디어 힌트 (구체적 예시 포함)",
      "body2": "본론 2 아이디어 힌트",
      "conclusion": "결론 작성 가이드 (Restate thesis + summary)"
    }},
    "key_phrases": ["In my opinion,", "Furthermore,", "For instance,", "On the other hand,", "In conclusion,", "It is undeniable that", "This suggests that"]
  }},
  "speaking": {{
    "prompt": "Some people prefer X. Others prefer Y. Which do you prefer and why? Include specific reasons and details.",
    "useful_expressions": ["In my opinion, I prefer...", "One reason is that...", "For example,", "Additionally,", "To sum up,"],
    "sample_points": ["첫 번째 포인트 아이디어", "두 번째 포인트 아이디어", "결론 아이디어"]
  }},
  "listening": {{
    "title": "대화 또는 강의 제목",
    "type": "conversation",
    "script": "영어 스크립트 180-220 단어. 두 학생 대화 OR 교수 강의. 자연스러운 구어체. 화자 표시: Student A: / Student B: 또는 Professor: / Student:",
    "questions": [
      {{"q": "What is the main topic of the conversation?", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "한국어 해설"}},
      {{"q": "What does the speaker suggest?", "options": ["A", "B", "C", "D"], "answer": 1, "explanation": "한국어 해설"}},
      {{"q": "Why does the speaker mention ...?", "options": ["A", "B", "C", "D"], "answer": 2, "explanation": "한국어 해설"}}
    ]
  }}
}}

날짜({target_date})를 시드로 매일 다양한 주제를 선택하세요:
- Reading: 생물/역사/심리/지리/기술 중 하나
- Writing: 사회/교육/기술/환경 의견 주제
- Speaking: 일상/학업 선호도 관련 Task 1
- Listening: 대학 캠퍼스 대화 또는 미니 강의"""

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


def deploy_to_netlify(word_count: int = 0, quiz_count: int = 0, target_date=None):
    GIT = r"C:\Users\dctm1\AppData\Local\GitHubDesktop\app-3.6.1\resources\app\git\cmd\git.exe"
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


def get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        return key
    # fallback: english-bot index.js 에서 읽기
    index_js = Path(r"C:\Users\dctm1\english-bot\index.js")
    if index_js.exists():
        import re
        m = re.search(r"ANTHROPIC_KEY\s*=\s*['\"]([^'\"]+)['\"]", index_js.read_text(encoding="utf-8"))
        if m:
            return m.group(1)
    return ""


def main(target_date: date = None):
    if target_date is None:
        target_date = date.today()

    api_key = get_api_key()
    if not api_key:
        print("[!] ANTHROPIC_API_KEY를 찾을 수 없습니다.")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    conversations = load_conversations(target_date)

    if not conversations:
        print(f"[*] {target_date} 대화 없음. 기본 콘텐츠 생성...")
        data = generate_default_words(client, target_date)
    else:
        print(f"[+] 대화 {len(conversations)}개 로드 ({target_date})")
        convo_text = format_conversations(conversations)
        data = analyze_with_claude(convo_text, target_date, client)

    word_count = len(data.get('words', []))
    quiz_count = len(data.get('quiz', []))
    print(f"[+] 단어 {word_count}개, 퀴즈 {quiz_count}개 추출 완료")

    html = generate_html(data)
    OUTPUT_HTML.parent.mkdir(exist_ok=True)
    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"[+] HTML 저장: {OUTPUT_HTML}")

    update_words_db(data.get("words", []), target_date)
    update_profile_topics(conversations, target_date)

    try:
        toefl_data = generate_toefl_content(client, target_date)
        toefl_html = generate_toefl_html(toefl_data)
        TOEFL_OUTPUT_HTML.parent.mkdir(exist_ok=True)
        TOEFL_OUTPUT_HTML.write_text(toefl_html, encoding="utf-8")
        print(f"[+] TOEFL HTML 저장: {TOEFL_OUTPUT_HTML}")
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
