import json, sys, time
sys.path.insert(0, r'C:\Users\dctm1\OneDrive\바탕 화면\CLAUDE_PROJECT_1\history')
from discord_utils import _request, _cfg

cfg = _cfg()
cid = cfg['channel_id']

# state 파일의 last_id
state = r'C:\Users\dctm1\OneDrive\바탕 화면\CLAUDE_PROJECT_1\paper_search\discord_listener_state.json'
try:
    last_id = json.loads(open(state).read())['last_id']
except:
    last_id = None

sys.stdout.buffer.write(f"last_id: {last_id}\n".encode('utf-8'))
sys.stdout.buffer.write(f"채널: {cid}\n".encode('utf-8'))

# after 없이 최근 10개 조회
msgs = _request('GET', f'/channels/{cid}/messages?limit=10')
if msgs:
    for m in msgs:
        line = f"  [{m['id']}] {m['author']['username']}: {m['content'][:50]}\n"
        sys.stdout.buffer.write(line.encode('utf-8'))
else:
    sys.stdout.buffer.write("  (메시지 없음 or 읽기 실패)\n".encode('utf-8'))

# after=last_id로 조회
if last_id:
    sys.stdout.buffer.write(f"\nafter {last_id} 이후 메시지:\n".encode('utf-8'))
    msgs2 = _request('GET', f'/channels/{cid}/messages?after={last_id}&limit=10')
    if msgs2:
        for m in msgs2:
            line = f"  [{m['id']}] {m['author']['username']}: {m['content'][:50]}\n"
            sys.stdout.buffer.write(line.encode('utf-8'))
    else:
        sys.stdout.buffer.write("  (없음)\n".encode('utf-8'))
