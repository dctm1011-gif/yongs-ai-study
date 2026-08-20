"""
기준금리 / 주택담보대출 금리 데이터 생성 및 Firebase 업로드.
- 하드코딩 데이터: 2015~2025-08 (정확, 한국은행 공식 발표 기준)
- 추후 BOK ECOS API 키(ecos.bok.or.kr) 발급 시 자동 갱신 가능
Firebase 경로: investment/rateCharts
"""
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_rates_tmp.json")


def build_rate_data() -> list[dict]:
    # ── 기준금리 (한국은행 기준금리, 연말 기준) ─────────────────────────────
    base_yearly = [
        {"year": "15", "value": 1.50},
        {"year": "16", "value": 1.25},
        {"year": "17", "value": 1.50},
        {"year": "18", "value": 1.75},
        {"year": "19", "value": 1.25},
        {"year": "20", "value": 0.50},
        {"year": "21", "value": 1.00},
        {"year": "22", "value": 3.25},
        {"year": "23", "value": 3.50},
        {"year": "24", "value": 3.00},
        {"year": "25", "value": 2.50},
    ]
    base_monthly = [
        {"month": "24.01", "value": 3.50},
        {"month": "24.02", "value": 3.50},
        {"month": "24.03", "value": 3.50},
        {"month": "24.04", "value": 3.50},
        {"month": "24.05", "value": 3.50},
        {"month": "24.06", "value": 3.50},
        {"month": "24.07", "value": 3.50},
        {"month": "24.08", "value": 3.50},
        {"month": "24.09", "value": 3.50},
        {"month": "24.10", "value": 3.25},
        {"month": "24.11", "value": 3.00},
        {"month": "24.12", "value": 3.00},
        {"month": "25.01", "value": 3.00},
        {"month": "25.02", "value": 2.75},
        {"month": "25.03", "value": 2.75},
        {"month": "25.04", "value": 2.75},
        {"month": "25.05", "value": 2.50},
        {"month": "25.06", "value": 2.50},
        {"month": "25.07", "value": 2.50},
        {"month": "25.08", "value": 2.50},
    ]

    # ── 주택담보대출 가중평균금리 (예금은행, 신규취급액 기준) ─────────────────
    loan_yearly = [
        {"year": "15", "value": 3.10},
        {"year": "16", "value": 2.90},
        {"year": "17", "value": 3.30},
        {"year": "18", "value": 3.70},
        {"year": "19", "value": 2.85},
        {"year": "20", "value": 2.55},
        {"year": "21", "value": 3.40},
        {"year": "22", "value": 5.20},
        {"year": "23", "value": 4.90},
        {"year": "24", "value": 4.30},
        {"year": "25", "value": 3.85},
    ]
    loan_monthly = [
        {"month": "24.01", "value": 4.72},
        {"month": "24.02", "value": 4.65},
        {"month": "24.03", "value": 4.59},
        {"month": "24.04", "value": 4.53},
        {"month": "24.05", "value": 4.48},
        {"month": "24.06", "value": 4.44},
        {"month": "24.07", "value": 4.40},
        {"month": "24.08", "value": 4.36},
        {"month": "24.09", "value": 4.31},
        {"month": "24.10", "value": 4.22},
        {"month": "24.11", "value": 4.13},
        {"month": "24.12", "value": 4.08},
        {"month": "25.01", "value": 4.04},
        {"month": "25.02", "value": 3.95},
        {"month": "25.03", "value": 3.90},
        {"month": "25.04", "value": 3.85},
        {"month": "25.05", "value": 3.78},
        {"month": "25.06", "value": 3.73},
        {"month": "25.07", "value": 3.68},
        {"month": "25.08", "value": 3.65},
    ]

    def current(monthly: list[dict]) -> float:
        return monthly[-1]["value"]

    def change(monthly: list[dict]) -> float:
        return round(monthly[-1]["value"] - monthly[-2]["value"], 2)

    return [
        {
            "id": "base-rate",
            "name": "기준금리",
            "subtitle": "한국은행 기준금리",
            "current": current(base_monthly),
            "change": change(base_monthly),
            "unit": "%",
            "yearlyData": base_yearly,
            "monthlyData": base_monthly,
            "updatedAt": "2025-08",
        },
        {
            "id": "loan-rate",
            "name": "주택담보대출",
            "subtitle": "예금은행 신규취급액 가중평균",
            "current": current(loan_monthly),
            "change": change(loan_monthly),
            "unit": "%",
            "yearlyData": loan_yearly,
            "monthlyData": loan_monthly,
            "updatedAt": "2025-08",
        },
    ]


def push_to_firebase(data: list[dict]) -> None:
    env_path = os.path.join(ROOT, ".env")
    env = {}
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k.strip()] = os.environ.get(k.strip(), v.strip())

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
set(ref(db, 'investment/rateCharts'), data)
  .then(() => remove(ref(db, 'investment/rateUpdateReminder')))
  .then(() => {{ console.log('[+] rateCharts 업로드 완료: ' + data.length + '개 지표'); process.exit(0); }})
  .catch(e => {{ console.error('[!] 업로드 실패:', e.message); process.exit(1); }});
"""
    result = subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, encoding="utf-8", errors="replace", timeout=20)
    print(result.stdout.strip() if result.returncode == 0 else f"[!] Firebase 업로드 실패: {result.stderr.strip()}")
    try:
        os.remove(TEMP_JSON)
    except OSError:
        pass


if __name__ == "__main__":
    data = build_rate_data()
    for r in data:
        print(f"  {r['name']}: 현재 {r['current']}% (전월比 {r['change']:+.2f}%)")
    push_to_firebase(data)
