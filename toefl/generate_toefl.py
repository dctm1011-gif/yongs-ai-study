"""
TOEFL 매일 자동 업데이트 (Reading/Writing/Speaking/Listening)
Claude API로 생성 → toefl/index.html 데이터 업데이트 → Netlify 배포
매일 Task Scheduler로 자동 실행 (generate_english.py 내부에서도 호출됨)
"""
import json
import sys
import os

# UTF-8 인코딩 설정
sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr:
    sys.stderr.reconfigure(encoding='utf-8')
import subprocess
import re
from pathlib import Path
from datetime import date

import anthropic

ROOT = Path(__file__).parent.parent
TOEFL_HTML = ROOT / "toefl" / "index.html"
TOEFL_DATE = date.today().isoformat()

sys.path.insert(0, str(ROOT / "history"))
try:
    from discord_utils import notify
except Exception:
    def notify(text): pass


def generate_toefl_with_claude(client: anthropic.Anthropic) -> dict:
    """Claude API로 하루치 TOEFL 문제 생성"""
    print("[*] Claude API로 TOEFL 생성 중...")

    prompt = f"""JSON 형식으로만 응답. 설명 없음.
{{
  "reading": {{
    "title": "title",
    "passage": "TOEFL iBT 최고난이도 학술 지문. 380-450단어. 3단락(\\n\\n으로 구분). 좁고 전문적인 학문 분야(고고학·신경과학·지질학·경제사학·언어학 중 하나). 대학원 논문 수준 어휘·복잡한 복합-복문 구조·인과·대조·반박 논리 병행. 단락마다 핵심 주장+복수 근거+반증 또는 한계 제시. 지문에서만 답을 찾을 수 있는 정보 밀도.",
    "vocabulary": [{{"word":"어휘1","meaning_ko":"뜻"}},{{"word":"어휘2","meaning_ko":"뜻"}},{{"word":"어휘3","meaning_ko":"뜻"}},{{"word":"어휘4","meaning_ko":"뜻"}},{{"word":"어휘5","meaning_ko":"뜻"}},{{"word":"어휘6","meaning_ko":"뜻"}},{{"word":"어휘7","meaning_ko":"뜻"}},{{"word":"어휘8","meaning_ko":"뜻"}}],
    "questions": [
      {{"q": "According to paragraph 2, which of the following is true about ...?", "options": ["A 지문과 일치하는 정답","B 그럴싸하지만 지문에 없는 내용","C 지문의 일부만 반영한 오답","D 반대 방향으로 서술된 오답"], "answer": 0, "explanation": "해설"}},
      {{"q": "Which of the following is NOT mentioned in the passage as a reason for ...?", "options": ["A 지문에 없는 이유(정답)","B 지문에 명시된 이유","C 지문에 명시된 이유","D 지문에 명시된 이유"], "answer": 0, "explanation": "해설"}},
      {{"q": "The word '실제지문단어' in paragraph X is closest in meaning to ...", "options": ["A 정답 동의어","B 혼동하기 쉬운 유사어","C 반의어","D 무관한 어휘"], "answer": 0, "explanation": "해설"}},
      {{"q": "Which of the following sentences best expresses the essential information in this sentence from the passage: \\"지문에서 가장 복잡한 문장 그대로 삽입\\"?", "options": ["A 핵심만 정확히 담은 정답","B 핵심 정보 누락 오답","C 지문에 없는 내용 추가 오답","D 인과관계 뒤바꾼 오답"], "answer": 0, "explanation": "해설"}},
      {{"q": "What does the author imply about ... in paragraph 3?", "options": ["A 지문 근거로 추론 가능한 정답","B 지문 내용 초과 추론 오답","C 반대 함의 오답","D 무관한 추론 오답"], "answer": 0, "explanation": "해설"}}
    ]
  }},
  "writing": {{"sentences": [{{"original": "reading passage 핵심 문장1(그대로)", "paraphrase": "모범 패러프레이즈", "tip": "기법"}}, {{"original": "핵심 문장2(그대로)", "paraphrase": "모범 패러프레이즈", "tip": "기법"}}, {{"original": "핵심 문장3(그대로)", "paraphrase": "모범 패러프레이즈", "tip": "기법"}}]}},
  "speaking": {{"prompt": "Describe X", "useful_expressions": ["e1", "e2"], "sample_points": ["s1", "s2"]}},
  "listening": {{"script": "30단어 영어 대화", "questions": [{{"q": "Q1", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "exp"}}]}}
}}

규칙: 1)모든 오답 보기는 지문의 일부 내용을 이용해 그럴싸하게 보이지만 틀린 내용이어야 함. 2)vocabulary는 지문에 실제 등장한 단어만. 3)question 3의 '실제지문단어'와 문장은 지문에서 실제로 사용된 것으로 교체."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2400,
        messages=[{"role": "user", "content": prompt}]
    )

    text = response.content[0].text.strip()
    # JSON 추출
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("Claude 응답에서 JSON을 찾을 수 없음")

    json_str = text[start:end]
    # 특수 문자 제거 (체크마크, 불릿 등)
    json_str = json_str.encode('utf-8', 'ignore').decode('utf-8')
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"[!] Claude 응답 (처음 500자):\n{text[:500]}")
        raise ValueError(f"JSON 파싱 실패: {e}")
    print(f"[✓] TOEFL 생성 완료")
    return data


def inject_data_to_html(data: dict) -> bool:
    """toefl/index.html에 데이터 주입"""
    print("[*] HTML 업데이트 중...")

    html = TOEFL_HTML.read_text(encoding="utf-8")

    # 기존 데이터 블록 찾기 (처음과 끝 위치)
    data_start = html.find('const TOEFL_DATE = "')
    data_end = html.find(';\n', html.find('const LISTENING')) if html.find('const LISTENING') != -1 else -1

    # 데이터 변수 생성
    data_js = f'const TOEFL_DATE = "{TOEFL_DATE}";\nconst READING = {json.dumps(data["reading"], ensure_ascii=False)};\nconst WRITING = {json.dumps(data["writing"], ensure_ascii=False)};\nconst SPEAKING = {json.dumps(data["speaking"], ensure_ascii=False)};\nconst LISTENING = {json.dumps(data["listening"], ensure_ascii=False)};'

    # 기존 데이터 대체 또는 새로 추가
    if data_start != -1 and data_end != -1:
        # 기존 데이터 블록 교체
        html = html[:data_start] + data_js + html[data_end+1:]
    else:
        # 새로 추가 (</script> 직전)
        script_end = html.rfind('</script>')
        if script_end != -1:
            html = html[:script_end] + data_js + '\n' + html[script_end:]

    TOEFL_HTML.write_text(html, encoding="utf-8")
    print(f"[✓] HTML 업데이트 완료")
    return True


def deploy_to_netlify() -> bool:
    """Netlify에 배포"""
    print("[*] Netlify 배포 중...")
    try:
        result = subprocess.run(
            '"C:\\Program Files\\Git\\cmd\\git.exe" add toefl/index.html && netlify deploy --prod',
            cwd=str(ROOT),
            shell=True,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(f"[✓] Netlify 배포 완료")
            return True
        else:
            print(f"[!] 배포 실패: {result.stderr}")
            return False
    except Exception as e:
        print(f"[!] 배포 오류: {e}")
        return False


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[!] ANTHROPIC_API_KEY 환경변수 필요")
        return False

    try:
        client = anthropic.Anthropic(api_key=api_key)

        # 1. 데이터 생성
        data = generate_toefl_with_claude(client)

        # 2. HTML 업데이트
        inject_data_to_html(data)

        # 3. Netlify 배포
        deploy_to_netlify()

        # 4. 알림
        try:
            notify(f"✅ TOEFL 업데이트 완료! ({TOEFL_DATE})")
        except:
            pass

        print("[✓] 완료")
        return True

    except Exception as e:
        print(f"[!] 오류: {e}")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
