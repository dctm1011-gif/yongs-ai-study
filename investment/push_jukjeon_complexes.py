"""
수지구 죽전동 아파트 단지별 최근 실거래가 수집 후 Firebase 업로드.
Firebase 경로: investment/jukjeonComplexes
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta

from realestate_api import fetch_jukjeon_complex_prices, get_molit_api_key

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_jukjeon_tmp.json")


def load_env() -> dict:
    env_path = os.path.join(ROOT, ".env")
    config = {}
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    config[k.strip()] = v.strip()
    for k in list(config):
        config[k] = os.environ.get(k, config[k])
    return config


def push_to_firebase(complexes: list) -> None:
    env = load_env()
    with open(TEMP_JSON, "w", encoding="utf-8") as f:
        json.dump(complexes, f, ensure_ascii=False)

    tmp_path = TEMP_JSON.replace("\\", "/")
    script = f"""
const {{ initializeApp, getApps }} = require('firebase/app');
const {{ getDatabase, ref, set }} = require('firebase/database');
const fs = require('fs');
const config = {{
  apiKey: '{env.get("EXPO_PUBLIC_FIREBASE_API_KEY", "")}',
  authDomain: '{env.get("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "")}',
  databaseURL: '{env.get("EXPO_PUBLIC_FIREBASE_DATABASE_URL", "")}',
  projectId: '{env.get("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "")}',
}};
const app = getApps().length ? getApps()[0] : initializeApp(config);
const db = getDatabase(app);
const data = JSON.parse(fs.readFileSync('{tmp_path}', 'utf-8'));
set(ref(db, 'investment/jukjeonComplexes'), data)
  .then(() => {{
    console.log('[+] jukjeonComplexes Firebase 업로드 완료: ' + data.length + '개 단지');
    process.exit(0);
  }})
  .catch(e => {{ console.error('[!] 업로드 실패:', e.message); process.exit(1); }});
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        capture_output=True, encoding="utf-8", errors="replace", timeout=30,
    )
    if result.returncode == 0:
        print(result.stdout.strip())
    else:
        print(f"[!] Firebase 업로드 실패: {result.stderr.strip()}")
    try:
        os.remove(TEMP_JSON)
    except OSError:
        pass


def main():
    molit_key = get_molit_api_key()
    months = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    print(f"[*] 수지구 죽전동 단지별 실거래가 수집 (최근 {months}개월)...")
    complexes = fetch_jukjeon_complex_prices(molit_key, months=months)
    print(f"[+] {len(complexes)}개 단지 수집 완료")
    for c in complexes[:5]:
        print(f"    {c['name']}: {c['medianPrice']}억 ({c['tradeCount']}건, {c['refMonth']})")
    push_to_firebase(complexes)


if __name__ == "__main__":
    main()
