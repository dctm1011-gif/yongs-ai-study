#!/usr/bin/env python3
"""
Generate 10 random daily English phrases using Claude API.
Runs daily via GitHub Actions at 06:00 UTC.
Uses current date as seed for consistent daily content.
"""
import json
import sys
import os
from pathlib import Path
from datetime import date
import anthropic


def generate_daily_phrases():
    """Generate 10 daily English phrases using Claude API."""

    today = date.today()
    output_file = Path(__file__).parent.parent / "english" / "daily.json"

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    print(f"[*] Generating 10 daily English phrases for {today}...")

    # Generate seed-based phrase list (same date = same content)
    # Use date as part of prompt to ensure consistency
    prompt = f"""Generate exactly 10 everyday English words and expressions for language learners.
Today's date: {today}

Return ONLY valid JSON, no other text.

JSON Format:
{{
  "date": "{today}",
  "words": [
    {{
      "id": "phrase-1",
      "word": "lowkey",
      "part_of_speech": "부사/형용사",
      "meaning_ko": "은근히, 어느 정도",
      "explanation": "일상 영어에서 자주 쓰이는 표현. 뭔가를 인정하지만 강하지 않게 표현할 때 사용합니다.",
      "example_en": "I'm lowkey tired after the meeting",
      "example_ko": "회의 후에 은근히 피곤해",
      "tip": "SNS나 캐주얼한 대화에서 매우 자주 등장해요.",
      "emoji": "😏"
    }},
    ...10개 total...
  ]
}}

Guidelines:
- Exactly 10 different words/phrases (no duplicates)
- Mix of: slang, idioms, phrasal verbs, everyday expressions
- Each must include: id, word, part_of_speech, meaning_ko, explanation, example_en, example_ko, tip, emoji
- Use variety: verbs, nouns, adjectives, adverbs, idioms
- Make them practical and commonly used in casual conversation
- Ensure emoji matches the meaning
- Keep explanations concise (1-2 sentences)

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

        words = data.get("words", [])
        if len(words) < 10:
            print(f"[!] Got only {len(words)} words, expected 10")
            return False

        # Ensure output directory exists
        output_file.parent.mkdir(parents=True, exist_ok=True)

        # Write to file
        output_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[+] Successfully generated {len(words)} phrases")
        print(f"[+] Saved to {output_file}")

        return True

    except json.JSONDecodeError as e:
        print(f"[!] JSON parse error: {e}")
        return False
    except anthropic.APIError as e:
        print(f"[!] API error: {e}")
        return False


if __name__ == "__main__":
    success = generate_daily_phrases()
    sys.exit(0 if success else 1)
