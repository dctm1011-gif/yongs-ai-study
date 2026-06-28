import json, sys
sys.path.insert(0, r'C:\Users\dctm1\OneDrive\바탕 화면\CLAUDE_PROJECT_1\history')
from discord_utils import _request, _cfg

cfg = _cfg()
cid = cfg['channel_id']

msgs = _request('GET', f'/channels/{cid}/messages?limit=10')
if msgs:
    for m in msgs:
        username = m['author']['username']
        mid = m['id']
        content = m.get('content', '')
        msg_type = m.get('type', '?')
        attachments = m.get('attachments', [])
        sticker_items = m.get('sticker_items', [])
        embeds = m.get('embeds', [])
        flags = m.get('flags', 0)

        # 음성메시지 여부 (flags bit 13)
        is_voice = bool(flags & (1 << 13))

        line = (
            f"[{mid}] {username}\n"
            f"  type={msg_type}  content={repr(content)}\n"
            f"  attachments={len(attachments)}  stickers={len(sticker_items)}  embeds={len(embeds)}\n"
            f"  voice_msg={is_voice}  flags={flags}\n"
        )
        if attachments:
            for a in attachments:
                line += f"  attach: {a.get('content_type','?')} {a.get('filename','?')}\n"
        sys.stdout.buffer.write(line.encode('utf-8', errors='replace'))
        sys.stdout.buffer.write(b'\n')
