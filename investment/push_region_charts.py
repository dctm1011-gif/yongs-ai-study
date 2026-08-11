"""
경기도 전체 지역별(시/구/동) 실거래가 수집 후 Firebase에 업로드.
generate_investment.py 없이 regionCharts만 독립 실행.
Node.js Firebase SDK 사용 (generate_investment.py와 동일 방식).
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta

from realestate_api import get_all_regions_chart_data, get_molit_api_key

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_region_charts_tmp.json")


def get_kst_date() -> str:
    return (datetime.utcnow() + timedelta(hours=9)).strftime("%Y-%m-%d")


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


def push_to_firebase(today: str, region_charts: list) -> None:
    env = load_env()
    with open(TEMP_JSON, "w", encoding="utf-8") as f:
        json.dump(region_charts, f, ensure_ascii=False)

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
const regionCharts = JSON.parse(fs.readFileSync('{tmp_path}', 'utf-8'));
set(ref(db, 'investment/columns/{today}/regionCharts'), regionCharts)
  .then(() => {{
    console.log('[+] regionCharts Firebase 업로드 완료: ' + regionCharts.length + '개');
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
    today = get_kst_date()
    target = date.today()
    if len(sys.argv) > 1:
        today = sys.argv[1]
        target = date.fromisoformat(today)

    print(f"[*] {today} 경기도 전체 지역 실거래가 + 동별 드릴다운 수집 시작...")
    region_charts = get_all_regions_chart_data(target, molit_key)
    print(f"[+] {len(region_charts)}개 지역 수집 완료, Firebase 업로드 중...")
    push_to_firebase(today, region_charts)


if __name__ == "__main__":
    main()
