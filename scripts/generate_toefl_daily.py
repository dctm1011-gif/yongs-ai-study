#!/usr/bin/env python3
"""
Generate daily TOEFL problems using Claude API.
Creates Reading, Writing, Speaking, Listening sections.
Runs daily via GitHub Actions at 06:00 UTC.
"""
import json
import sys
import os
from pathlib import Path
from datetime import date
import anthropic


def generate_daily_toefl():
    """Generate daily TOEFL problems using Claude API."""

    today = date.today()
    output_file = Path(__file__).parent.parent / "toefl" / "daily.json"

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    print(f"[*] Generating TOEFL problems for {today}...")

    prompt = f"""Generate TOEFL iBT practice problems for {today}.
Create 4 sections: Reading, Writing, Speaking, Listening.

Return ONLY valid JSON, no other text.

JSON Format:
{{
  "date": "{today}",
  "reading": {{
    "title": "지문 제목",
    "passage": "TOEFL 수준 영문 (80-100단어, 1단락)",
    "questions": [
      {{"q": "According to the passage...", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "한국어 해설"}}
    ]
  }},
  "writing": {{
    "prompt": "Do you agree or disagree with...",
    "structure": {{
      "intro": "도입부 작성 가이드",
      "body1": "본론1 아이디어",
      "body2": "본론2 아이디어",
      "conclusion": "결론 작성 가이드"
    }},
    "useful_phrases": ["In my opinion,", "Furthermore,"]
  }},
  "speaking": {{
    "prompt": "Some people prefer X. Others prefer Y. Which do you prefer?",
    "useful_expressions": ["In my opinion,", "One reason is that..."],
    "sample_points": ["첫 번째 아이디어", "두 번째 아이디어"]
  }},
  "listening": {{
    "title": "대화/강의 제목",
    "type": "conversation",
    "script": "2명 대화 또는 교수 강의 (180-220단어)",
    "questions": [
      {{"q": "What is the main topic?", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "해설"}}
    ]
  }}
}}

Guidelines:
- Reading: 3 comprehension questions max
- Writing: Provide structure guide + useful phrases
- Speaking: 3 useful expressions + 2 sample answer points
- Listening: 2-3 comprehension questions
- All explanations in Korean

Return ONLY the JSON object, nothing else."""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=3000,
            messages=[{"role": "user", "content": prompt}]
        )

        text = response.content[0].text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1

        if start == -1 or end == 0:
            print("[!] No JSON found in response")
            return False

        data = json.loads(text[start:end])

        # Validate structure
        if not isinstance(data, dict):
            print("[!] Invalid JSON structure (not dict)")
            return False

        required_keys = ["reading", "writing", "speaking", "listening"]
        if not all(key in data for key in required_keys):
            print(f"[!] Missing required keys: {required_keys}")
            return False

        # Ensure output directory exists
        output_file.parent.mkdir(parents=True, exist_ok=True)

        # Write to file
        output_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[+] Successfully generated TOEFL problems")
        print(f"[+] Saved to {output_file}")

        return True

    except json.JSONDecodeError as e:
        print(f"[!] JSON parse error: {e}")
        return False
    except anthropic.APIError as e:
        print(f"[!] API error: {e}")
        return False


def git_commit_and_push(date_str: str) -> bool:
    """Generate 후 git pull → add → commit → push."""
    import subprocess
    ROOT = Path(__file__).parent.parent
    GIT = "git"

    subprocess.run([GIT, "pull", "--rebase", "origin", "main"], cwd=str(ROOT))
    subprocess.run([GIT, "add", "toefl/daily.json"], cwd=str(ROOT))

    msg = f"auto: update toefl {date_str}"
    r = subprocess.run([GIT, "commit", "-m", msg], cwd=str(ROOT))
    if r.returncode != 0:
        print("[!] Nothing to commit or commit failed")
        return False

    result = subprocess.run([GIT, "push"], cwd=str(ROOT))
    if result.returncode == 0:
        print(f"[+] Pushed: {msg}")
        return True
    else:
        print("[!] git push failed")
        return False


if __name__ == "__main__":
    success = generate_daily_toefl()
    if success:
        from datetime import date
        git_commit_and_push(str(date.today()))
    sys.exit(0 if success else 1)
