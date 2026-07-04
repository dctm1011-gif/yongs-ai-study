import sys
sys.path.insert(0, r'C:\Users\dctm1\OneDrive\바탕 화면\CLAUDE_PROJECT_1\history')
from discord_utils import _request, _cfg

cfg = _cfg()
cid = cfg['channel_id']

# 현재 채널 이름
ch = _request('GET', f'/channels/{cid}')
if ch:
    name = ch.get('name', '')
    sys.stdout.buffer.write(f"채널 이름: {name}\n".encode('utf-8'))
    sys.stdout.buffer.write(f"채널 ID: {cid}\n".encode('utf-8'))
    sys.stdout.buffer.write(f"서버 ID: {ch.get('guild_id','')}\n".encode('utf-8'))
else:
    sys.stdout.buffer.write("채널 조회 실패\n".encode('utf-8'))

# 서버의 모든 채널 목록
guild_id = cfg['guild_id']
channels = _request('GET', f'/guilds/{guild_id}/channels')
if channels:
    sys.stdout.buffer.write("\n--- 서버 전체 채널 ---\n".encode('utf-8'))
    for c in channels:
        line = f"  [{c['id']}] {c.get('name','?')} (type={c.get('type')})\n"
        sys.stdout.buffer.write(line.encode('utf-8'))
