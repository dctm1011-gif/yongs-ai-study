import json, anthropic, os
from pathlib import Path

WORDS_DB = Path(__file__).parent / 'words_db.json'
DAILY = Path(__file__).parent / 'daily.json'

entries = json.loads(WORDS_DB.read_text(encoding='utf-8'))
used = sorted({e.get('word','') for e in entries if e.get('word')})
used_lower = {w.lower() for w in used}
print(f'제외 단어 {len(used)}개:', ', '.join(used))

client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])

prompt = (
    "TOEFL iBT 빈출 학술 어휘 5개를 선정하고 학습 자료를 JSON으로만 생성해주세요. (2026-08-17)\n"
    "JSON 외 다른 텍스트는 절대 포함하지 마세요.\n\n"
    f"아래 단어는 이미 다뤘으니 반드시 제외하세요:\n{', '.join(used)}\n\n"
    "단어 선정 기준: TOEFL iBT B2~C1 수준 실제 출제 어휘. GRE 전용 고난도(perspicacious, mendacious, obsequious 등) 절대 금지. 슬랭/구어체 금지, 위 제외 목록에 없는 단어만.\n\n"
    '{"date":"2026-08-17","words":[{"word":"ameliorate","part_of_speech":"동사","meaning_ko":"개선하다","explanation":"상황을 더 나아지게 만드는 것","example_from_convo":"Policy changes can ameliorate poverty.","example_ko":"정책 변화는 빈곤을 개선할 수 있어요.","tip":"동의어: improve, alleviate. 반의어: worsen, exacerbate.","emoji":"📈"}],"quiz":[{"type":"meaning","word":"ameliorate","question":"Which best defines ameliorate?","options":["to improve a bad situation","to make worse","to ignore","to prevent"],"answer":0,"explanation":"ameliorate=개선하다"}]}\n\n'
    "규칙: 단어 5개, 퀴즈 8개(meaning 3, fill_blank 3, situation 2), JSON만 반환"
)

collected_words = []
collected_quiz = []
seen_ids = set(used_lower)

for attempt in range(6):
    if len(collected_words) >= 5:
        break

    need = 5 - len(collected_words)
    cur_used = seen_ids | {w['word'].lower() for w in collected_words}
    p = prompt.replace(', '.join(used), ', '.join(sorted(cur_used)))

    resp = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=4000,
        messages=[{'role': 'user', 'content': p}]
    )
    text = resp.content[0].text.strip()
    start = text.find('{')
    end = text.rfind('}') + 1
    if start == -1:
        print(f'시도 {attempt+1}: JSON 없음')
        continue
    try:
        data = json.loads(text[start:end])
    except Exception as e:
        print(f'시도 {attempt+1}: 파싱 실패 {e}')
        continue

    for w in data.get('words', []):
        wl = w.get('word', '').lower()
        if wl and wl not in cur_used and len(collected_words) < 5:
            collected_words.append(w)
            seen_ids.add(wl)
    for q in data.get('quiz', []):
        if q.get('word', '').lower() in {w['word'].lower() for w in collected_words}:
            collected_quiz.append(q)

    new_words = [w['word'] for w in collected_words]
    print(f'시도 {attempt+1}: 누적 단어 {new_words}')

if len(collected_words) >= 5:
    final = {
        'date': '2026-08-17',
        'words': collected_words[:5],
        'quiz': collected_quiz[:8],
    }
    DAILY.write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding='utf-8')
    print('daily.json 저장 완료:', [w['word'] for w in final['words']])
else:
    print(f'실패: {len(collected_words)}개만 수집됨')
