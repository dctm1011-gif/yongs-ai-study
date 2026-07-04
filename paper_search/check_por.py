import json, sys, hashlib
from pathlib import Path

ROOT = Path(__file__).parent.parent
db = json.loads((Path(__file__).parent / 'paper_db.json').read_text(encoding='utf-8'))

por_pids_db = [
    'ss:2dd7b3defa64fd1334c8e77a3fcd4b9337d061e7',
    'ss:fe7841187123e84e55a2859979baee3114f31554',
    'ss:e30d23fed2b653ef347f46e6dab167af7975e973',
    'ss:50645afc2715bfc49b5f8bda5336321e3b940db3',
    'ss:f09e6e6a80b4d623c4504569123ac077e25988bf',
    'ss:f5fd433c1ff9702d87548e9623ed50d0edb5a265',
    'ss:6473a43e515b5328947de00853ea1688a77cb0c6',
    'ss:47c11dbc6c9b1830af0f4da9cc98ce9c02be6a64',
]

def _paper_id(title):
    return hashlib.md5(title.lower().strip().encode()).hexdigest()[:12]

index_html = (ROOT / 'history' / 'index.html').read_text(encoding='utf-8')

missing = []
for pid in por_pids_db:
    p = db.get(pid, {})
    if not isinstance(p, dict):
        continue
    title = p.get('title', '')
    html_pid = _paper_id(title)
    in_html = f'data-pid="{html_pid}"' in index_html
    status = 'already' if in_html else 'MISSING'
    print(f'  [{status}] {title[:75]}')
    if not in_html:
        missing.append(pid)

print(f'\n미추가 POR 논문: {len(missing)}개')
