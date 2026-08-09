"""
KOSIS 국가통계포털 Open API로 시군구별 2주택 이상 소유 가구 비율(%)을 가져온다.

출처 표: DT_1OH0407 (거주지역/주택소유물건수별 주택소유 가구수), 기관 101(통계청)
비율 = (주택소유가구 중 2건 이상 소유 가구 수) / (전체 주택소유가구 수) * 100

통계청이 그 해 주택소유통계를 보통 11월경에 갱신하므로, 연 1회 정도 재실행해서
investment.tsx의 REGION_RATIO_DATA를 업데이트하면 된다.
(자동 반영 아님 - 출력된 값을 코드에 복사)

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

# REGION_CODES(realestate_api.py) area 키 -> KOSIS 거주지역(SGG) 코드
# KOSIS는 시군구 단위로 제공. 구 없는 시는 시 코드, 구 있는 시는 구 코드 사용.
# 화성_본청과 화성_동탄은 2026.02 동탄구 신설 이전 데이터가 화성시 전체(31240)로만 있음 → 동일 코드 공유.
AREA_SGG = {
    # 수원시 4구
    "수원_장안":   "31011",
    "수원_권선":   "31012",
    "수원_팔달":   "31013",
    "수원_영통":   "31014",
    # 성남시 3구
    "성남_수정":   "31021",
    "성남_중원":   "31022",
    "성남_분당":   "31023",
    # 의정부시
    "의정부":      "31030",
    # 안양시 2구
    "안양_만안":   "31041",
    "안양_동안":   "31042",
    # 부천시 (구 폐지, 통합 코드)
    "부천":        "31050",
    # 광명시
    "광명":        "31060",
    # 평택시
    "평택":        "31070",
    # 안산시 2구
    "안산_상록":   "31091",
    "안산_단원":   "31092",
    # 고양시 3구
    "고양_덕양":   "31101",
    "고양_일산동": "31102",
    "고양_일산서": "31103",
    # 과천시
    "과천":        "31110",
    # 구리시
    "구리":        "31120",
    # 남양주시
    "남양주":      "31130",
    # 오산시
    "오산":        "31140",
    # 시흥시
    "시흥":        "31150",
    # 군포시
    "군포":        "31160",
    # 의왕시
    "의왕":        "31170",
    # 하남시
    "하남":        "31180",
    # 용인시 3구
    "용인_처인":   "31191",
    "용인_기흥":   "31192",
    "용인_수지":   "31193",
    # 파주시
    "파주":        "31200",
    # 이천시
    "이천":        "31210",
    # 김포시
    "김포":        "31230",
    # 화성시 (2026.02 동탄구 신설 전은 화성시 전체 코드)
    "화성_동탄":   "31240",
    "화성_본청":   "31240",
    # 광주시
    "광주":        "31250",
    # 양주시
    "양주":        "31260",
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
    years = list(range(START_YEAR, END_YEAR + 1))
    fetched_by_sgg: dict[str, dict[int, float]] = {}
    all_ratios: dict[str, dict[int, float]] = {}

    for area, sgg in AREA_SGG.items():
        if sgg not in fetched_by_sgg:
            print(f"[*] {area} (SGG={sgg}) 조회 중...")
            try:
                fetched_by_sgg[sgg] = fetch_region(sgg, api_key)
            except Exception as e:
                print(f"  [!] 실패: {e}")
                fetched_by_sgg[sgg] = {}
            time.sleep(0.2)
        all_ratios[area] = fetched_by_sgg[sgg]

    # investment.tsx REGION_RATIO_DATA 형식으로 출력
    print("\n// ===== investment.tsx REGION_RATIO_DATA 업데이트용 =====")
    print("const REGION_RATIO_DATA: Record<string, number[]> = {")
    for area, ratios in all_ratios.items():
        vals = [ratios.get(y, 0.0) for y in years]
        vals_str = ", ".join(f"{v}" for v in vals)
        pad = max(0, 12 - len(area))
        print(f"  '{area}':{' ' * pad}[{vals_str}],")
    print("};")

    # 원본 JSON도 출력
    print("\n// ===== 원본 JSON =====")
    print(json.dumps(all_ratios, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
