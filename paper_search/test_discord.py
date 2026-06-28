import sys
sys.path.insert(0, r'C:\Users\dctm1\OneDrive\바탕 화면\CLAUDE_PROJECT_1\history')
from discord_utils import _request, _cfg

cfg = _cfg()
channel_id = cfg["channel_id"]
print("channel_id:", channel_id)

msgs = _request("GET", f"/channels/{channel_id}/messages?limit=5")
if msgs:
    for m in msgs:
        print(f"  [{m['id']}] {m['author']['username']}: {m['content'][:60]}")
else:
    print("메시지 읽기 실패 또는 빈 채널")
