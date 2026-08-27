"""
한국부동산원 아파트 매매수급지수 (KOSIS DT_40803_N0007) → Firebase 업로드.
Firebase 경로: investment/supplyDemandIndex
{
  lastUpdated: "2026-08-27",
  data: {
    "서울":    [{"month":"202603","value":103.1}, ...],
    "경기":    [...],
    "인천":    [...],
    "수도권":  [...],
    "전국":    [...],
  }
}
기준: 아파트(C1=01), 최근 5개월
"""
import json, os, subprocess, sys, urllib.parse, urllib.request
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ORG_ID = "408"
TBL_ID = "DT_40803_N0007"
TYPE_CODE = "01"  # 아파트

REGION_MAP = {
    "a5": "서울",
    "a6": "경기",
    "a7": "인천",
}

MONTHS = 96


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


def fetch_supply_demand(months: int = MONTHS) -> dict[str, list[dict]]:
    env = load_env()
    api_key = env.get("KOSIS_API_KEY", "")
    if not api_key:
        raise ValueError("KOSIS_API_KEY not found in .env")

    today = date.today()
    end_ym = (today.replace(day=1) - timedelta(days=1))  # 지난달
    start_ym = (end_ym.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1)

    start_str = start_ym.strftime("%Y%m")
    end_str = end_ym.strftime("%Y%m")
    print(f"[*] KOSIS 매매수급지수 조회: {start_str}~{end_str} (아파트)")

    params = {
        "method": "getList",
        "apiKey": api_key,
        "orgId": ORG_ID,
        "tblId": TBL_ID,
        "itmId": "ALL",
        "objL1": TYPE_CODE,
        "objL2": "ALL",
        "format": "json",
        "jsonVD": "Y",
        "prdSe": "M",
        "startPrdDe": start_str,
        "endPrdDe": end_str,
    }
    url = "https://kosis.kr/openapi/Param/statisticsParameterData.do?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=20) as resp:
        rows = json.loads(resp.read().decode())

    if isinstance(rows, dict):
        raise RuntimeError(f"KOSIS API 오류: {rows}")

    result: dict[str, list[dict]] = {name: [] for name in REGION_MAP.values()}
    for row in rows:
        region_code = row.get("C2", "")
        if region_code not in REGION_MAP:
            continue
        month = row.get("PRD_DE", "")
        value = float(row.get("DT", 0))
        result[REGION_MAP[region_code]].append({"month": month, "value": round(value, 1)})

    for name in result:
        result[name].sort(key=lambda x: x["month"])

    for name, pts in result.items():
        print(f"  {name}: {len(pts)}개월 | 최신={pts[-1]['value'] if pts else 'N/A'}")

    return result


def push_to_firebase(data: dict, last_updated: str) -> None:
    env = load_env()
    payload = {"lastUpdated": last_updated, "data": data}
    tmp_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_sdi_tmp.json")

    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    tmp_fwd = tmp_path.replace("\\", "/")
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
const payload = JSON.parse(fs.readFileSync('{tmp_fwd}', 'utf-8'));
set(ref(db, 'investment/supplyDemandIndex'), payload)
  .then(() => {{
    console.log('[+] supplyDemandIndex 업로드 완료: lastUpdated=' + payload.lastUpdated);
    process.exit(0);
  }})
  .catch(e => {{ console.error('[!] 업로드 실패:', e.message); process.exit(1); }});
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        capture_output=True, encoding="utf-8", errors="replace", timeout=30,
    )
    print(result.stdout.strip() if result.returncode == 0 else f"[!] Firebase 실패: {result.stderr.strip()}")
    try:
        os.remove(tmp_path)
    except OSError:
        pass


def main() -> None:
    months = int(sys.argv[1]) if len(sys.argv) > 1 else MONTHS
    data = fetch_supply_demand(months)
    last_updated = date.today().isoformat()
    push_to_firebase(data, last_updated)


if __name__ == "__main__":
    main()
