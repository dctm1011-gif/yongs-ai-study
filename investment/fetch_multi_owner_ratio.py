"""
KOSIS 국가통계포털 Open API로 시군구별 2주택 이상 소유 가구 비율(%)을 가져온다.

출처 표: DT_1OH0407 (거주지역/주택소유물건수별 주택소유 가구수), 기관 101(통계청)
비율 = (주택소유가구 중 2건 이상 소유 가구 수) / (전체 주택소유가구 수) * 100

통계청이 그 해 주택소유통계를 보통 11월경에 갱신하므로, 연 1회 정도 재실행해서
realestate_api.py의 MULTI_OWNER_RATIO / useInvestmentSync.ts의 MULTI_OWNER_RATIO_FALLBACK을
수동으로 갱신하면 된다 (자동 반영 아님 - 값 복사해서 코드에 붙여넣기).

사용법:
    $env:KOSIS_API_KEY="발급받은 인증키"
    python fetch_multi_owner_ratio.py
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

TBL_ID = "DT_1OH0407"
ORG_ID = "101"
START_YEAR = 2016
END_YEAR = 2024

# area(코드베이스 라벨) -> KOSIS 거주지역(SGG) 코드
# 판교/광교는 동 단위라 KOSIS에 없음 -> 소속 구(분당구/영통구) 코드로 대체
AREA_SGG = {
    "판교": "31023", "분당": "31023",           # 성남시 분당구
    "광교": "31014", "수원 영통": "31014",       # 수원시 영통구
    "과천": "31110",
    "동탄": "31240",                             # 화성시
    "기흥": "31192",                             # 용인시 기흥구
    "수지": "31193",                             # 용인시 수지구
    "안산": "31090",                             # 안산시 (상록구+단원구 합산)
    "평택": "31070",
    "김포": "31230",
    "용인(처인)": "31191",                       # 용인시 처인구
    "수원 권선": "31012",                        # 수원시 권선구
    "시흥": "31150",
    "하남": "31180",
    "오산": "31140",
    "의정부": "31030",
    "남양주": "31130",
    "구리": "31120",
    "부천": "31050",                             # 부천시 (원미/소사/오정 통합 코드)
}


def get_kosis_api_key() -> str:
    key = os.environ.get("KOSIS_API_KEY", "")
    if not key:
        print("[!] KOSIS_API_KEY를 찾을 수 없습니다. (kosis.kr/openapi 발급 인증키)")
        sys.exit(1)
    return key


def fetch_region(sgg_code: str, api_key: str) -> dict[int, float]:
    """SGG 코드 하나의 연도별 2주택 이상 소유 비율(%). {year: ratio}"""
    params = {
        "method": "getList",
        "apiKey": api_key,
        "itmId": "T001",
        "objL1": sgg_code,
        "objL2": "ALL",
        "format": "json",
        "jsonVD": "Y",
        "prdSe": "Y",
        "startPrdDe": str(START_YEAR),
        "endPrdDe": str(END_YEAR),
        "orgId": ORG_ID,
        "tblId": TBL_ID,
    }
    url = "https://kosis.kr/openapi/Param/statisticsParameterData.do?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=20) as resp:
        rows = json.loads(resp.read().decode("utf-8"))

    if isinstance(rows, dict):
        raise RuntimeError(f"KOSIS 오류 (SGG={sgg_code}): {rows}")

    by_year_total: dict[str, int] = {}
    by_year_single: dict[str, int] = {}
    for row in rows:
        year = row["PRD_DE"]
        c2 = row["C2"]  # 000=총계, 010=1건, 020~050=2건 이상
        dt = int(row["DT"])
        if c2 == "000":
            by_year_total[year] = dt
        elif c2 == "010":
            by_year_single[year] = dt

    result = {}
    for year, total in by_year_total.items():
        single = by_year_single.get(year)
        if single is None or total == 0:
            continue
        result[int(year)] = round((total - single) / total * 100, 1)
    return result


def main():
    api_key = get_kosis_api_key()
    fetched_by_sgg: dict[str, dict[int, float]] = {}
    all_ratios: dict[str, dict[int, float]] = {}

    for area, sgg in AREA_SGG.items():
        if sgg not in fetched_by_sgg:
            print(f"[*] {area} (SGG={sgg}) 조회 중...")
            fetched_by_sgg[sgg] = fetch_region(sgg, api_key)
            time.sleep(0.2)
        all_ratios[area] = fetched_by_sgg[sgg]

    print(json.dumps(all_ratios, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
