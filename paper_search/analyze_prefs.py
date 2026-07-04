import json, re, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent.parent
W = lambda s: sys.stdout.buffer.write(s.encode('utf-8'))

prefs = json.loads(open(ROOT / 'paper_search/user_prefs.json', encoding='utf-8').read())
liked_pids = set(prefs.get('liked', []))
deleted_pids = set(prefs.get('deleted', []))

html = open(ROOT / 'history/index.html', encoding='utf-8').read()

# paper-card 파싱: data-pid, data-tags, 제목
card_pattern = re.compile(
    r'<div class="paper-card"[^>]*data-tags=\'(\[[^\]]*\])\'[^>]*data-pid="([^"]+)"[^>]*>'
    r'.*?<h3 class="paper-title">([^<]+)</h3>',
    re.DOTALL
)

tag_counter = Counter()
venue_counter = Counter()
liked_titles = []
liked_tag_map = {}  # pid -> tags

for m in card_pattern.finditer(html):
    tags_json, pid, title = m.group(1), m.group(2), m.group(3)
    tags = json.loads(tags_json)
    if pid in liked_pids:
        for t in tags:
            tag_counter[t] += 1
        liked_titles.append((pid, title.strip(), tags))

W(f'=== YONG preference analysis ===\n')
W(f'liked: {len(liked_pids)} / deleted: {len(deleted_pids)}\n')
W(f'matched in HTML: {len(liked_titles)}\n\n')

W('--- tag distribution (liked papers) ---\n')
total_tags = sum(tag_counter.values())
for tag, cnt in tag_counter.most_common():
    pct = cnt / len(liked_titles) * 100 if liked_titles else 0
    bar = '#' * cnt
    W(f'  {tag:<22} {cnt:>3} ({pct:4.0f}%)  {bar}\n')

W('\n--- full liked paper list ---\n')
for i, (pid, title, tags) in enumerate(liked_titles):
    W(f'  [{i:02d}] {title[:75]}\n')
    W(f'       tags: {tags}\n')
