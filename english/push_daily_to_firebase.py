"""오늘 daily.json을 Firebase에 즉시 업로드"""
import json
import urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).parent.parent
DAILY_JSON = ROOT / "english" / "daily.json"

DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"

def get_kst_date():
    kst = datetime.now(timezone.utc) + timedelta(hours=9)
    return kst.strftime("%Y-%m-%d")

def push():
    daily_data = json.loads(DAILY_JSON.read_text(encoding="utf-8"))
    today = get_kst_date()
    daily_data["timestamp"] = datetime.now(timezone.utc).isoformat()
    daily_data["date"] = today

    payload = json.dumps(daily_data, ensure_ascii=False).encode("utf-8")
    url = f"{DB_URL}/english/words/{today}.json"

    req = urllib.request.Request(
        url,
        data=payload,
        method="PUT",
        headers={"Content-Type": "application/json"},
    )
    print(f"[*] Firebase에 업로드 중: {url}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = resp.read().decode("utf-8")
            print(f"[+] 성공! 단어 {len(daily_data.get('words', []))}개, 퀴즈 {len(daily_data.get('quiz', []))}개 업로드 완료")
            print(f"    → {today} 데이터 업데이트됨")
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"[!] HTTP {e.code} 오류: {body}")
        print("[!] Firebase 보안 규칙이 인증을 요구할 수 있습니다.")
        return False
    except Exception as e:
        print(f"[!] 오류: {e}")
        return False

if __name__ == "__main__":
    push()
