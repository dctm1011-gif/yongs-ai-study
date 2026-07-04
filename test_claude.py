import anthropic, os, json, sys
from datetime import date

sys.stdout.reconfigure(encoding='utf-8')

api_key = os.environ.get("ANTHROPIC_API_KEY")
client = anthropic.Anthropic(api_key=api_key)
target_date = date.today().isoformat()

prompt = f"""5 English words. JSON: {{"date": "{target_date}", "words": [{{"word": "test", "part_of_speech": "n", "meaning_ko": "테스트", "explanation": "설명", "example_from_convo": "ex", "example_ko": "예", "tip": "팁", "emoji": "X"}}], "quiz": [{{"type": "meaning", "word": "test", "question": "?", "options": ["A"], "answer": 0, "explanation": "."}}]}}"""

response = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=1500,
    messages=[{"role": "user", "content": prompt}]
)

text = response.content[0].text.strip()
print("=== Claude Response (first 1000 chars) ===")
print(text[:1000])
print("\n=== Trying JSON parse ===")
start = text.find("{")
end = text.rfind("}") + 1
if start != -1 and end > 1:
    try:
        json.loads(text[start:end])
        print("SUCCESS: Valid JSON")
    except json.JSONDecodeError as e:
        print(f"FAILED: {e}")
