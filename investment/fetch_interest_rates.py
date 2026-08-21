"""
기준금리 / 주택담보대출 / 신용대출 금리 데이터 자동 수집 및 Firebase 업로드.
- 기준금리:      BOK ECOS API (SAMPLE 키, 무료)  — StatCode 722Y001, ItemCode 0101000
- 주택담보대출:   KOSIS API (기존 키)              — OrgId 301, TblId DT_121Y006, BECBLA0302
- 신용대출:      KOSIS API (기존 키)              — OrgId 301, TblId DT_121Y006, BECBLA0304
Firebase 경로: investment/rateCharts
"""
import json
import os
import subprocess
import urllib.request
import urllib.parse
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_rates_tmp.json")

ECOS_SAMPLE_KEY = "sample"
ECOS_BASE_RATE_STAT = "722Y001"
ECOS_BASE_RATE_ITEM = "0101000"

KOSIS_LOAN_ORG    = "301"
KOSIS_LOAN_TBL    = "DT_121Y006"
KOSIS_LOAN_ITM    = "13103134553999"
KOSIS_MORTGAGE_C1 = "13102134553ACC_ITEM.BECBLA0302"  # 주택담보대출
KOSIS_CREDIT_C1   = "13102134553ACC_ITEM.BECBLA0304"  # 신용대출


def get_kosis_key() -> str:
    env_path = os.path.join(ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("KOSIS_API_KEY="):
                    return line.split("=", 1)[1].strip()
    return os.environ.get("KOSIS_API_KEY", "")


def _ym_add(ym: str, months: int) -> str:
    """'202501' + 3개월 → '202504' (연도 넘김 처리)."""
    y, m = int(ym[:4]), int(ym[4:6])
    m += months
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return f"{y}{m:02d}"


def fetch_ecos_base_rate_all(start_year: int) -> list[dict]:
    """ECOS SAMPLE 키(최대 10행/요청)로 기준금리 전체 수집 — 10개월 청크 분할."""
    today = date.today()
    start_ym = f"{start_year}01"
    end_ym = f"{today.year}{today.month:02d}"
    results = []
    chunk_start = start_ym
    while chunk_start <= end_ym:
        chunk_end = _ym_add(chunk_start, 9)  # 10개월 (start 포함)
        if chunk_end > end_ym:
            chunk_end = end_ym
        url = (
            f"https://ecos.bok.or.kr/api/StatisticSearch/{ECOS_SAMPLE_KEY}/json/kr"
            f"/1/10/{ECOS_BASE_RATE_STAT}/M/{chunk_start}/{chunk_end}/{ECOS_BASE_RATE_ITEM}"
        )
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                data = json.loads(r.read().decode())
            rows = data.get("StatisticSearch", {}).get("row", [])
            results.extend({"ym": row["TIME"], "value": float(row["DATA_VALUE"])} for row in rows)
        except Exception as e:
            print(f"  [ECOS] {chunk_start}~{chunk_end} 조회 실패: {e}")
        chunk_start = _ym_add(chunk_end, 1)
    return results


def fetch_kosis_loan_rate(start_ym: str, end_ym: str, kosis_key: str, c1: str) -> list[dict]:
    """KOSIS API로 대출금리 월별 데이터 fetch. c1으로 대출 종류 구분."""
    params = {
        "method": "getList",
        "apiKey": kosis_key,
        "itmId": KOSIS_LOAN_ITM,
        "objL1": c1,
        "format": "json",
        "jsonVD": "Y",
        "prdSe": "M",
        "startPrdDe": start_ym,
        "endPrdDe": end_ym,
        "orgId": KOSIS_LOAN_ORG,
        "tblId": KOSIS_LOAN_TBL,
    }
    url = "https://kosis.kr/openapi/Param/statisticsParameterData.do?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=15) as r:
        rows = json.loads(r.read().decode())
    if isinstance(rows, dict):
        raise RuntimeError(f"KOSIS 오류: {rows}")
    return [{"ym": row["PRD_DE"], "value": float(row["DT"])} for row in rows if row.get("DT")]


def ym_to_label(ym: str, mode: str) -> str:
    """'202601' → '26.01' (monthly) 또는 연도 레이블 생성."""
    if mode == "monthly":
        return f"{ym[2:4]}.{ym[4:6]}"
    return ym[2:4]  # yearly: '26'


def make_yearly(monthly: list[dict]) -> list[dict]:
    """월별 데이터에서 연도별 데이터 생성 (각 연도의 마지막 월 기준)."""
    by_year: dict[str, float] = {}
    for item in monthly:
        year = item["ym"][:4]
        by_year[year] = item["value"]  # 마지막 월 값으로 덮어씀
    return [{"year": y[2:4], "value": v} for y, v in sorted(by_year.items())]


def make_monthly_labels(monthly: list[dict]) -> list[dict]:
    return [{"month": ym_to_label(item["ym"], "monthly"), "value": item["value"]} for item in monthly]


def build_rate_data(kosis_key: str) -> list[dict]:
    today = date.today()
    start_year = 2015
    start_ym = f"{start_year}01"
    end_ym = f"{today.year}{today.month:02d}"

    print(f"[1/3] 기준금리 수집 (ECOS SAMPLE, {start_year}~{today.year})...")
    base_monthly_raw = fetch_ecos_base_rate_all(start_year)
    if not base_monthly_raw:
        raise RuntimeError("기준금리 데이터 없음")
    print(f"  → {len(base_monthly_raw)}개월 수집")

    print(f"[2/3] 주택담보대출 금리 수집 (KOSIS, {start_ym}~{end_ym})...")
    mortgage_monthly_raw = fetch_kosis_loan_rate(start_ym, end_ym, kosis_key, KOSIS_MORTGAGE_C1)
    if not mortgage_monthly_raw:
        raise RuntimeError("주택담보대출 금리 데이터 없음")
    print(f"  → {len(mortgage_monthly_raw)}개월 수집")

    print(f"[3/3] 신용대출 금리 수집 (KOSIS, {start_ym}~{end_ym})...")
    credit_monthly_raw = fetch_kosis_loan_rate(start_ym, end_ym, kosis_key, KOSIS_CREDIT_C1)
    if not credit_monthly_raw:
        raise RuntimeError("신용대출 금리 데이터 없음")
    print(f"  → {len(credit_monthly_raw)}개월 수집")

    base_monthly = make_monthly_labels(base_monthly_raw)
    base_yearly = make_yearly(base_monthly_raw)
    mortgage_monthly = make_monthly_labels(mortgage_monthly_raw)
    mortgage_yearly = make_yearly(mortgage_monthly_raw)
    credit_monthly = make_monthly_labels(credit_monthly_raw)
    credit_yearly = make_yearly(credit_monthly_raw)

    # 최근 24개월만 월별 차트에 표시
    base_monthly = base_monthly[-24:]
    mortgage_monthly = mortgage_monthly[-24:]
    credit_monthly = credit_monthly[-24:]

    def ym_to_updated(raw): return raw[-1]["ym"][:4] + "." + raw[-1]["ym"][4:6]
    def current(m): return m[-1]["value"]
    def change(m): return round(m[-1]["value"] - m[-2]["value"], 2) if len(m) >= 2 else 0.0

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
            "updatedAt": ym_to_updated(base_monthly_raw),
        },
        {
            "id": "loan-rate",
            "name": "주택담보대출",
            "subtitle": "예금은행 신규취급액 가중평균",
            "current": current(mortgage_monthly),
            "change": change(mortgage_monthly),
            "unit": "%",
            "yearlyData": mortgage_yearly,
            "monthlyData": mortgage_monthly,
            "updatedAt": ym_to_updated(mortgage_monthly_raw),
        },
        {
            "id": "credit-rate",
            "name": "시중은행 신용대출",
            "subtitle": "예금은행 신규취급액 가중평균",
            "current": current(credit_monthly),
            "change": change(credit_monthly),
            "unit": "%",
            "yearlyData": credit_yearly,
            "monthlyData": credit_monthly,
            "updatedAt": ym_to_updated(credit_monthly_raw),
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
const {{ getDatabase, ref, set, remove }} = require('firebase/database');
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
set(ref(db, 'investment/rateCharts'), data)
  .then(() => remove(ref(db, 'investment/rateUpdateReminder')))
  .then(() => {{ console.log('[+] rateCharts 업로드 완료: ' + data.length + '개 지표'); process.exit(0); }})
  .catch(e => {{ console.error('[!] 업로드 실패:', e.message); process.exit(1); }});
"""
    result = subprocess.run(
        ["node", "-e", script], cwd=ROOT,
        capture_output=True, encoding="utf-8", errors="replace", timeout=20
    )
    print(result.stdout.strip() if result.returncode == 0 else f"[!] Firebase 업로드 실패: {result.stderr.strip()}")
    try:
        os.remove(TEMP_JSON)
    except OSError:
        pass


if __name__ == "__main__":
    kosis_key = get_kosis_key()
    if not kosis_key:
        print("[!] KOSIS_API_KEY 없음. .env 파일을 확인하세요.")
        exit(1)

    data = build_rate_data(kosis_key)
    for r in data:
        print(f"  {r['name']}: {r['current']}% (전월比 {r['change']:+.2f}%) | {r['updatedAt']} 기준 | 연도별 {len(r['yearlyData'])}개 월별 {len(r['monthlyData'])}개")
    push_to_firebase(data)
