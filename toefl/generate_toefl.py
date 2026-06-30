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
  "reading": {{"title": "title", "passage": "100단어 정도의 짧은 영어 지문. 개행 없이 한 줄로.", "questions": [{{"q": "Q1", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "exp"}}]}},
  "writing": {{"prompt": "Write about X", "structure": {{"I": "tip", "B1": "tip", "B2": "tip", "C": "tip"}}, "useful_phrases": ["p1", "p2"]}},
  "speaking": {{"prompt": "Describe X", "useful_expressions": ["e1", "e2"], "sample_points": ["s1", "s2"]}},
  "listening": {{"script": "30단어 영어 대화", "questions": [{{"q": "Q1", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "exp"}}]}}
}}"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
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
