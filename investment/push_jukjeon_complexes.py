"""
수지구/기흥구/동탄구 아파트 단지 실거래가 수집 후 Firebase 업로드.
세 구 모두 구 전체 → 동별 자동 그룹핑 방식.
Firebase 경로: investment/sujiComplexes
{
  수지구: { 죽전동: [...], 풍덕천동: [...], 신봉동: [...], 동천동: [...], 상현동: [...], ... },
  기흥구: { 구갈동: [...], 보정동: [...], ... },
  동탄구: { 여울동: [...], 청계동: [...], ... },
}
"""
import json
import os
import subprocess
import sys

from realestate_api import fetch_gu_complexes_by_dong, get_molit_api_key

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_suji_tmp.json")

# 구 단위 수집 (동 자동 감지)
GU_LIST = [
    {"key": "수지구", "lawd_cd": "41465"},  # 용인시 수지구
    {"key": "기흥구", "lawd_cd": "41463"},  # 용인시 기흥구
    {"key": "동탄구", "lawd_cd": "41597"},  # 화성시 동탄구
]


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


def push_to_firebase(data: dict) -> None:
    env = load_env()
    with open(TEMP_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

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
const {{ remove }} = require('firebase/database');
set(ref(db, 'investment/sujiComplexes'), data)
  .then(() => remove(ref(db, 'investment/complexUpdateReminder')))
  .then(() => {{
    let total = 0;
    for (const gu of Object.values(data)) {{
      for (const complexes of Object.values(gu)) total += complexes.length;
    }}
    console.log('[+] sujiComplexes 업로드 완료: ' + total + '개 단지 (' + Object.keys(data).join('/') + ')');
    process.exit(0);
  }})
  .catch(e => {{ console.error('[!] 업로드 실패:', e.message); process.exit(1); }});
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        capture_output=True, encoding="utf-8", errors="replace", timeout=30,
    )
    print(result.stdout.strip() if result.returncode == 0 else f"[!] Firebase 업로드 실패: {result.stderr.strip()}")
    try:
        os.remove(TEMP_JSON)
    except OSError:
        pass


def main():
    molit_key = get_molit_api_key()
    months = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    all_data = {}

    for gu in GU_LIST:
        key = gu["key"]
        lawd_cd = gu["lawd_cd"]
        print(f"[*] {key} 수집 중 (최근 {months}개월, lawd_cd={lawd_cd})...")
        gu_by_dong = fetch_gu_complexes_by_dong(lawd_cd, molit_key, months=months)
        all_data[key] = gu_by_dong
        total = sum(len(v) for v in gu_by_dong.values())
        print(f"  → {len(gu_by_dong)}개 동, {total}개 단지")
        top_dongs = sorted(gu_by_dong.items(), key=lambda x: (x[1][0]["medianPrice"] if x[1] else 0), reverse=True)[:3]
        for dong, complexes in top_dongs:
            print(f"     {dong}: {complexes[0]['name']} {complexes[0]['medianPrice']}억 외 {len(complexes)}단지")

    push_to_firebase(all_data)


if __name__ == "__main__":
    main()
