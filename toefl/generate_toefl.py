"""
TOEFL 매일 자동 업데이트 (Reading/Writing/Speaking/Listening)
Claude API로 생성 → toefl/index.html 데이터 업데이트 → Netlify 배포
매일 Task Scheduler로 자동 실행
"""
import json
import sys
import os
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


def generate_with_claude(client: anthropic.Anthropic) -> dict:
    """Claude API로 하루치 TOEFL 문제 생성"""
    print("[*] Claude API 호출 중...")

    prompt = f"""당신은 TOEFL 출제자입니다. 오늘({TOEFL_DATE})의 TOEFL 연습 문제를 생성해주세요.

다음 JSON 포맷으로 정확히 반환해주세요:
{{
  "reading": {{
    "title": "제목",
    "passage": "영어 지문 (200-300단어)",
    "questions": [
      {{
        "q": "질문1",
        "options": ["A", "B", "C", "D"],
        "answer": 0,
        "explanation": "설명"
      }},
      {{
        "q": "질문2",
        "options": ["A", "B", "C", "D"],
        "answer": 1,
        "explanation": "설명"
      }},
      {{
        "q": "질문3",
        "options": ["A", "B", "C", "D"],
        "answer": 2,
        "explanation": "설명"
      }}
    ]
  }},
  "writing": {{
    "prompt": "에세이 주제 (1-2문장)",
    "structure": {{
      "Introduction": "소개 문장 팁",
      "Body 1": "첫번째 주장 팁",
      "Body 2": "두번째 주장 팁",
      "Conclusion": "결론 문장 팁"
    }},
    "useful_phrases": ["phrase1", "phrase2", "phrase3"]
  }},
  "speaking": {{
    "prompt": "스피킹 질문 (1-2문장)",
    "useful_expressions": ["expression1", "expression2", "expression3"],
    "sample_points": ["point1", "point2", "point3"]
  }},
  "listening": {{
    "script": "영어 대화 스크립트 (150-200단어)",
    "questions": [
      {{
        "q": "질문1",
        "options": ["A", "B", "C", "D"],
        "answer": 0,
        "explanation": "설명"
      }},
      {{
        "q": "질문2",
        "options": ["A", "B", "C", "D"],
        "answer": 1,
        "explanation": "설명"
      }}
    ]
  }}
}}

JSON만 반환해주세요. 다른 설명은 없이."""

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}]
    )

    text = response.content[0].text
    # JSON 추출
    match = re.search(r'\{[\s\S]*\}', text)
    if not match:
        raise ValueError("Claude 응답에서 JSON을 찾을 수 없음")

    data = json.loads(match.group())
    print(f"[✓] 생성 완료: Reading, Writing, Speaking, Listening")
    return data


def inject_data_to_html(data: dict) -> bool:
    """toefl/index.html에 데이터 주입"""
    print("[*] HTML 업데이트 중...")

    html = TOEFL_HTML.read_text(encoding="utf-8")

    # TOEFL_DATE 업데이트
    html = re.sub(
        r'const TOEFL_DATE = "[^"]*";',
        f'const TOEFL_DATE = "{TOEFL_DATE}";',
        html
    )

    # 데이터 변수 주입 (</script> 직전에)
    data_js = f"""
const TOEFL_DATE = "{TOEFL_DATE}";
const READING = {json.dumps(data['reading'], ensure_ascii=False)};
const WRITING = {json.dumps(data['writing'], ensure_ascii=False)};
const SPEAKING = {json.dumps(data['speaking'], ensure_ascii=False)};
const LISTENING = {json.dumps(data['listening'], ensure_ascii=False)};
"""

    # 기존 데이터 제거 및 새로 삽입
    html = re.sub(
        r'const TOEFL_DATE = "[^"]*";\nconst READING = \{[\s\S]*?\};\nconst WRITING = \{[\s\S]*?\};\nconst SPEAKING = \{[\s\S]*?\};\nconst LISTENING = \{[\s\S]*?\};',
        data_js.strip(),
        html
    )

    # 만약 기존 데이터가 없으면 </script> 직전에 추가
    if 'const READING' not in html:
        html = html.replace('</script>', data_js + '</script>', 1)

    TOEFL_HTML.write_text(html, encoding="utf-8")
    print(f"[✓] HTML 업데이트 완료")
    return True


def deploy_to_netlify() -> bool:
    """Netlify에 배포"""
    print("[*] Netlify 배포 중...")
    try:
        result = subprocess.run(
            "netlify deploy --prod",
            cwd=str(ROOT),
            shell=True,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(f"[✓] Netlify 배포 완료")
            return True
        else:
            print(f"[!] Netlify 배포 실패: {result.stderr}")
            return False
    except Exception as e:
        print(f"[!] 배포 오류: {e}")
        return False


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[!] ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.")
        try:
            notify("❌ TOEFL 업데이트 실패: API 키 없음")
        except:
            pass
        return False

    try:
        client = anthropic.Anthropic()

        # 1. 데이터 생성
        data = generate_with_claude(client)

        # 2. HTML 업데이트
        inject_data_to_html(data)

        # 3. Netlify 배포
        deploy_to_netlify()

        # 4. Discord 알림
        try:
            notify(f"✅ TOEFL 매일 연습 업데이트 완료! ({TOEFL_DATE})\n📖 Reading · ✍️ Writing · 🎙️ Speaking · 👂 Listening")
        except:
            pass
        print("[✓] 모든 작업 완료")
        return True

    except Exception as e:
        error = str(e)
        print(f"[!] 오류: {error}")
        try:
            notify(f"❌ TOEFL 업데이트 실패: {error}")
        except:
            pass
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
