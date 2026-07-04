import json, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
db = json.loads(open(ROOT / 'paper_search/paper_db.json', encoding='utf-8').read())
prefs = json.loads(open(ROOT / 'paper_search/user_prefs.json', encoding='utf-8').read())
liked_pids = set(prefs.get('liked', []))

W = lambda s: sys.stdout.buffer.write(s.encode('utf-8'))

# DB 첫 항목 구조
first_key, first_val = list(db.items())[0]
W(f'=== DB structure ===\n')
W(f'key: {first_key}\n')
W(f'fields: {list(first_val.keys())}\n')

# 태그 필드명 찾기
for field in ['tags', 'tag', 'categories', 'category']:
    if field in first_val:
        W(f'tag field name: {field} = {first_val[field]}\n')

W(f'\n=== liked_pids sample ===\n')
for p in list(liked_pids)[:5]:
    W(f'  {p}\n')

W(f'\n=== DB key vs title-pid comparison ===\n')
from collections import Counter
tag_counter = Counter()
matched = 0

def pid_from_title(title):
    return ''.join(c if c.isalnum() else '_' for c in title)[:40]

for key, p in db.items():
    title = p.get('title', '')
    tpid = pid_from_title(title)
    if tpid in liked_pids:
        matched += 1
        tags = p.get('tags', p.get('tag', []))
        if isinstance(tags, str):
            tags = [tags]
        for t in tags:
            tag_counter[t] += 1

W(f'matched: {matched}\n')
W(f'top tags: {tag_counter.most_common(15)}\n')
