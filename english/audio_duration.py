"""오디오 길이 추정 — 파일 전체를 받지 않고 MP3 헤더만 읽는다.

팟캐스트 수집 스크립트가 duration_sec을 0으로 저장해 왔다. 피드에 길이가
없어서인데, MP3는 첫 프레임 헤더에 비트레이트가 들어 있으므로 Range 요청으로
앞부분만 받아 계산할 수 있다. CBR이면 오차는 보통 1~2초다.

VBR이거나 헤더를 못 읽으면 0을 돌려준다 — 앱이 재생하며 실제 길이를 알게 되면
그 값으로 덮어쓰므로, 여기서 틀린 값을 쓰는 것보다 0이 낫다.
"""
import struct
import urllib.request

_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_SAMPLE_RATES = {0: [44100, 48000, 32000], 2: [22050, 24000, 16000], 3: [11025, 12000, 8000]}


def _fetch(url: str, start: int, end: int) -> bytes:
    req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def _total_size(url: str) -> int:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return int(r.headers.get("Content-Length") or 0)


def _skip_id3(head: bytes) -> int:
    """ID3v2 태그 길이 — 오디오 데이터는 그 뒤부터 시작한다."""
    if len(head) >= 10 and head[:3] == b"ID3":
        # 크기는 7비트씩 쪼개 담는 synchsafe integer
        b = head[6:10]
        return 10 + ((b[0] & 0x7F) << 21 | (b[1] & 0x7F) << 14 | (b[2] & 0x7F) << 7 | (b[3] & 0x7F))
    return 0


def mp3_duration_sec(url: str) -> int:
    """실패하면 0. 호출부는 0을 '모름'으로 다루면 된다."""
    try:
        size = _total_size(url)
        if size <= 0:
            return 0
        head = _fetch(url, 0, 8191)
        offset = _skip_id3(head)
        if offset >= len(head):
            head = _fetch(url, offset, offset + 4095)
            offset = 0
        # 프레임 동기 워드(11비트가 모두 1)를 찾는다
        for i in range(offset, len(head) - 4):
            if head[i] == 0xFF and (head[i + 1] & 0xE0) == 0xE0:
                h = struct.unpack(">I", head[i:i + 4])[0]
                version = (h >> 19) & 0x3       # 3=MPEG1, 2=MPEG2, 0=MPEG2.5
                layer = (h >> 17) & 0x3         # 1=Layer III
                bitrate_idx = (h >> 12) & 0xF
                rate_idx = (h >> 10) & 0x3
                if layer != 1 or bitrate_idx in (0, 15) or rate_idx == 3:
                    continue
                table = _BITRATES_V1_L3 if version == 3 else _BITRATES_V2_L3
                kbps = table[bitrate_idx]
                if not kbps:
                    continue
                audio_bytes = size - (offset if offset else _skip_id3(head))
                return int(audio_bytes * 8 / (kbps * 1000))
        return 0
    except Exception:
        return 0
