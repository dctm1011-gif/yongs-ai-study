import re, json, urllib.request

env = {}
with open(r'C:\Users\dctm1\YongStudyApp\.env', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip()

db_url = env['EXPO_PUBLIC_FIREBASE_DATABASE_URL']
api_key = env['ANTHROPIC_API_KEY']
today = '2026-09-02'

words = 'advocate, bolster, aggregate, coherent, conduit, aloof, amiable, antecedent, compelling, conflate'
prompt = (
    'You are an English writing tutor. Write a cohesive story (5-6 sentences) using ALL: ' + words + '. '
    'Bold each vocab word with **word** syntax. One coherent narrative. '
    'Provide a natural Korean translation for EACH sentence separately. '
    'Return ONLY valid JSON with no code block:\n'
    '{"sentences":[{"en":"English sentence 1 with **vocab**.","ko":"문장1 번역"},{"en":"Sentence 2.","ko":"문장2 번역"}],'
    '"wordNuances":[{"word":"word","meaning":"뜻","nuance":"뉘앙스 설명"}]}'
)

payload = json.dumps({
    'model': 'claude-haiku-4-5-20251001',
    'max_tokens': 2000,
    'messages': [{'role': 'user', 'content': prompt}]
}).encode('utf-8')

req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=payload,
    headers={'x-api-key': api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
with urllib.request.urlopen(req, timeout=30) as r:
    text = json.loads(r.read().decode('utf-8'))['content'][0]['text'].strip()

# code block 제거
text = re.sub(r'^```[a-z]*\n?', '', text, flags=re.MULTILINE)
text = re.sub(r'\n?```$', '', text, flags=re.MULTILINE).strip()
m = re.search(r'\{[\s\S]*\}', text)
result = json.loads(m.group(0))
result['generatedAt'] = today

fb = json.dumps(result, ensure_ascii=False).encode('utf-8')
req2 = urllib.request.Request(f'{db_url}/english/reviewStory/{today}.json',
    data=fb, method='PUT', headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req2, timeout=15) as r:
    print(f'Firebase: {r.status}')

for i, s in enumerate(result['sentences']):
    print(f'{i+1}. {s["en"]}')
    print(f'   {s["ko"]}')
    print()
print('뉘앙스 수:', len(result['wordNuances']))
