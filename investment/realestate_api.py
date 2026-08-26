"""
국토교통부 아파트매매 실거래상세자료 Open API
(data.go.kr, https://www.data.go.kr/data/15126469/openapi.do)

20개 경기도 지역의 아파트 실거래가 분포(박스플랏: 최소/1분위/중앙값/3분위/최대)를
실제 거래 데이터로 집계한다. 최근 12개월(월별)과 과거 10년(연도별) 두 가지 시야를 만든다.
추정/보간 없음 - 거래가 없는 달/해는 그 데이터 포인트를 생략한다.
"""
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

import requests

ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
RENT_ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"  # 전월세 실거래가 (전세가율용)
# 세대수 조회는 2단계 API로 구성됨 (data.go.kr에서 상품이 분리돼 있음):
#   1) 단지 목록: 시군구코드 -> 단지코드+동명 목록 (국토교통부_공동주택 단지 목록제공 서비스)
#   2) 단지 상세: 단지코드 -> 총세대수 kaptdaCnt (국토교통부_공동주택 기본 정보제공 서비스, V4)
APT_LIST_ENDPOINT = "https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3"
APT_BASIS_ENDPOINT = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4"

# 단지별 원자료(동/세대수)는 사실상 거의 안 바뀌는 값이라, 시군구코드 단위로 로컬에 캐시해두고 재사용한다.
# (단지 목록 API는 페이지당 1회, 단지 상세 API는 단지 수만큼 호출 - 매일 재실행하면 일일 트래픽 쿼터를
#  금방 소진하므로, 한번 받아온 뒤로는 이 파일을 지우기 전까진 재호출하지 않음)
# 캐시에는 단지 단위 원자료를 그대로 저장 - 동별 총세대수(거래 활발도)와 동별 대단지 비율 둘 다
# 이 원자료 하나에서 파생시켜서 API를 두 번 타지 않도록 한다.
COMPLEX_CACHE_PATH = Path(__file__).parent / "dong_complexes_cache.json"
LARGE_COMPLEX_THRESHOLD = 1000  # 이 세대수 이상이면 "대단지"로 분류

MONTHLY_WINDOW = 12   # 월별 보기: 최근 12개월
YEARLY_WINDOW_MONTHS = 120  # 연도별 보기: 과거 10년(=120개월)치를 모아서 연 단위로 집계
REGION_YEARLY_WINDOW_MONTHS = 60   # 지역 탐색 전체 수집: 5년
REGION_INCREMENTAL_MONTHS = 18     # 지역 탐색 증분 업데이트: 18개월(월별 12 + 동별 6 커버)
DONG_MIN_TRADES = 3  # 동별 비교에서 이보다 거래가 적은 동은 노이즈로 보고 제외

# area(기존 라벨) -> { lawd_cd: 5자리 법정동 시군구코드(str 또는 list[str]), umd: 법정동명 필터(list[str] 또는 None) }
AREA_CODES = {
    "판교": {"lawd_cd": "41135", "umd": ["삼평동", "백현동", "운중동"]},
    "분당": {"lawd_cd": "41135", "umd": ["정자동", "서현동", "이매동", "야탑동", "수내동"]},
    "광교": {"lawd_cd": "41117", "umd": ["이의동", "하동", "원천동"]},
    "과천": {"lawd_cd": "41290", "umd": None},
    "동탄": {"lawd_cd": "41597", "umd": None},  # 2026-02 화성시 분구로 동탄구 신설, 옛 화성시 통합코드(41590) 대체
    "기흥": {"lawd_cd": "41463", "umd": None},
    "수지": {"lawd_cd": "41465", "umd": None},
    "안산": {"lawd_cd": ["41271", "41273"], "umd": None},
    "평택": {"lawd_cd": "41220", "umd": None},
    "김포": {"lawd_cd": "41570", "umd": None},
    "용인(처인)": {"lawd_cd": "41461", "umd": None},
    "수원 영통": {"lawd_cd": "41117", "umd": None},
    "수원 권선": {"lawd_cd": "41113", "umd": None},
    "시흥": {"lawd_cd": "41390", "umd": None},
    "하남": {"lawd_cd": "41450", "umd": None},
    "오산": {"lawd_cd": "41370", "umd": None},
    "의정부": {"lawd_cd": "41150", "umd": None},
    "남양주": {"lawd_cd": "41360", "umd": None},
    "구리": {"lawd_cd": "41310", "umd": None},
    "부천": {"lawd_cd": ["41194", "41196", "41198"], "umd": None},
    # 인천
    "송도": {"lawd_cd": "28185", "umd": ["송도동"]},  # 인천 연수구 송도동
}

# 동별 비교 대상 지역. 어떤 동을 보여줄지는 하드코딩하지 않고, 매 실행마다
# get_dong_comparison_data()가 지역 전체 거래에서 Q1~평균 구간에 드는 동만 동적으로 골라낸다.
DONG_FOCUS = {
    "수지": {"lawd_cd": "41465"},
    "동탄": {"lawd_cd": "41597"},
}

# 통계청 주택소유통계 기반 2주택 이상 소유 가구 비율 (%) - 시군구 단위 연도별 정적 데이터
# 값 = (주택소유가구 중 2건 이상 소유 가구) / (전체 주택소유가구) * 100
# 출처: KOSIS 국가통계포털 Open API - 표 DT_1OH0407(거주지역/주택소유물건수별 주택소유 가구수), 2026-08-07 조회
# 갱신: investment/fetch_multi_owner_ratio.py (통계청이 매년 11월경 그 해 자료 갱신 -> 연 1회 재실행 권장)
MULTI_OWNER_RATIO: dict[str, dict[int, float]] = {
    "수지": {  # 용인시 수지구 (KOSIS SGG 31193)
        2016: 31.7, 2017: 31.5, 2018: 31.5, 2019: 31.7, 2020: 31.3,
        2021: 28.9, 2022: 27.8, 2023: 27.7, 2024: 27.5,
    },
    "동탄": {  # 화성시 (KOSIS SGG 31240)
        2016: 26.6, 2017: 26.9, 2018: 27.0, 2019: 28.8, 2020: 27.5,
        2021: 25.2, 2022: 24.9, 2023: 24.4, 2024: 23.9,
    },
}


def _load_complex_cache() -> dict:
    if COMPLEX_CACHE_PATH.exists():
        try:
            return json.loads(COMPLEX_CACHE_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_complex_cache(cache: dict) -> None:
    COMPLEX_CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_dong_complexes(sigungu_cd: str, service_key: str) -> list[dict]:
    """시군구의 단지별 원자료([{dong, units}, ...])를 받아온다.
    1) 단지 목록(AptListService3/getSigunguAptList3)으로 그 시군구의 단지코드+동명(as3) 목록을 받고
    2) 단지 상세(AptBasisInfoServiceV4/getAphusBassInfoV4)에서 단지코드별 총세대수(kaptdaCnt)를 받음.
    결과는 시군구코드 단위로 로컬 캐시에 저장하고 이후에는 캐시를 재사용한다 (세대수는 거의 안 바뀌고,
    단지 수만큼 API를 호출하므로 매일 다시 받으면 일일 트래픽 쿼터를 낭비함 - 강제로 다시 받으려면
    dong_complexes_cache.json에서 해당 시군구코드 키를 지울 것).
    이 원자료 하나에서 동별 총세대수(거래 활발도용)와 동별 대단지 비율을 둘 다 파생시킨다.
    API 실패 또는 데이터 없으면 빈 리스트 반환.
    """
    cache = _load_complex_cache()
    if sigungu_cd in cache:
        return cache[sigungu_cd]

    list_items: list[dict] = []
    page_no = 1
    while True:
        try:
            resp = requests.get(APT_LIST_ENDPOINT, params={
                "serviceKey": service_key,
                "sigunguCode": sigungu_cd,
                "pageNo": page_no,
                "numOfRows": 1000,
            }, timeout=20)
            resp.raise_for_status()
            body = resp.json().get("response", {}).get("body", {})
        except Exception as e:
            print(f"    [!] 공동주택 단지 목록 조회 실패 ({sigungu_cd}): {e}")
            return []

        items = body.get("items") or []
        if isinstance(items, dict):  # 결과가 1건이면 list 대신 dict로 오는 경우 방어
            items = [items]
        if not items:
            break
        list_items.extend(items)

        total = int(body.get("totalCount", 0) or 0)
        if page_no * 1000 >= total:
            break
        page_no += 1
        time.sleep(0.1)

    complexes: list[dict] = []
    for c in list_items:
        kapt_code = c.get("kaptCode")
        dong = (c.get("as3") or "").strip()
        if not kapt_code or not dong:
            continue
        try:
            resp = requests.get(APT_BASIS_ENDPOINT, params={
                "serviceKey": service_key,
                "kaptCode": kapt_code,
            }, timeout=20)
            resp.raise_for_status()
            item = resp.json().get("response", {}).get("body", {}).get("item") or {}
        except Exception as e:
            print(f"    [!] 단지 상세 조회 실패 ({kapt_code}): {e}")
            continue

        try:
            units = int(float(item.get("kaptdaCnt") or 0))
        except (TypeError, ValueError):
            continue
        if units > 0:
            complexes.append({"dong": dong, "units": units})

    cache[sigungu_cd] = complexes
    _save_complex_cache(cache)
    return complexes


def fetch_dong_unit_counts(sigungu_cd: str, service_key: str) -> dict[str, int]:
    """시군구의 동별 아파트 총세대수 합산 (거래 회전율 계산용)."""
    dong_units: dict[str, int] = {}
    for c in fetch_dong_complexes(sigungu_cd, service_key):
        dong_units[c["dong"]] = dong_units.get(c["dong"], 0) + c["units"]
    return dong_units


def fetch_dong_large_complex_ratio(sigungu_cd: str, service_key: str) -> dict[str, float]:
    """시군구의 동별 대단지(세대수 LARGE_COMPLEX_THRESHOLD 이상) 비율(%) - 세대수 기준.
    분모가 0(단지 정보 없음)인 동은 결과에서 제외.
    """
    totals: dict[str, int] = {}
    large: dict[str, int] = {}
    for c in fetch_dong_complexes(sigungu_cd, service_key):
        dong, units = c["dong"], c["units"]
        totals[dong] = totals.get(dong, 0) + units
        if units >= LARGE_COMPLEX_THRESHOLD:
            large[dong] = large.get(dong, 0) + units
    return {
        dong: round(large.get(dong, 0) / total * 100, 1)
        for dong, total in totals.items() if total > 0
    }


def get_molit_api_key() -> str:
    key = os.environ.get("MOLIT_API_KEY", "")
    if not key:
        print("[!] MOLIT_API_KEY를 찾을 수 없습니다. (data.go.kr 국토교통부 아파트매매 실거래상세자료 인증키)")
        sys.exit(1)
    return key


def _fetch_page(lawd_cd: str, deal_ymd: str, service_key: str, page_no: int) -> ET.Element:
    params = {
        "serviceKey": service_key,
        "LAWD_CD": lawd_cd,
        "DEAL_YMD": deal_ymd,
        "pageNo": page_no,
        "numOfRows": 1000,
    }
    max_attempts = 4
    for attempt in range(max_attempts):
        try:
            resp = requests.get(ENDPOINT, params=params, timeout=20)
            resp.raise_for_status()
            return ET.fromstring(resp.content)
        except (requests.exceptions.RequestException, ET.ParseError) as e:
            if attempt == max_attempts - 1:
                raise
            wait = 2 * (attempt + 1)
            print(f"[!] 요청 실패 (LAWD_CD={lawd_cd}, DEAL_YMD={deal_ymd}, 시도 {attempt + 1}): {e} - {wait}초 후 재시도")
            time.sleep(wait)


def fetch_trades(lawd_cd: str, deal_ymd: str, service_key: str) -> list[dict]:
    """단일 시군구코드 + 계약월의 전체 거래 목록. 응답이 1000건을 넘으면 페이징."""
    trades: list[dict] = []
    page_no = 1
    while True:
        root = _fetch_page(lawd_cd, deal_ymd, service_key, page_no)
        result_code = root.findtext(".//resultCode")
        if result_code not in (None, "00", "000"):
            result_msg = root.findtext(".//resultMsg", default="")
            print(f"[!] API 오류 (LAWD_CD={lawd_cd}, DEAL_YMD={deal_ymd}): {result_code} {result_msg}")
            return trades

        items = root.findall(".//item")
        for item in items:
            amount_raw = (item.findtext("dealAmount") or "").replace(",", "").strip()
            umd = (item.findtext("umdNm") or "").strip()
            if not amount_raw:
                continue
            try:
                amount = int(amount_raw)
            except ValueError:
                continue
            trades.append({"dealAmount": amount, "umdNm": umd})

        total_count = int(root.findtext(".//totalCount", default="0") or 0)
        if page_no * 1000 >= total_count:
            break
        page_no += 1

    return trades


def fetch_rent_trades(lawd_cd: str, deal_ymd: str, service_key: str) -> list[dict]:
    """단일 시군구코드 + 계약월의 순수 전세 거래 목록(월세 0원인 건만 - 반전세/월세는 제외).
    summarize_trades와 그대로 호환되도록 보증금을 dealAmount(만원 단위) 키로 반환한다."""
    trades: list[dict] = []
    page_no = 1
    while True:
        try:
            resp = requests.get(RENT_ENDPOINT, params={
                "serviceKey": service_key,
                "LAWD_CD": lawd_cd,
                "DEAL_YMD": deal_ymd,
                "pageNo": page_no,
                "numOfRows": 1000,
            }, timeout=20)
            resp.raise_for_status()
            root = ET.fromstring(resp.content)
        except (requests.exceptions.RequestException, ET.ParseError) as e:
            print(f"[!] 전세 조회 실패 (LAWD_CD={lawd_cd}, DEAL_YMD={deal_ymd}): {e}")
            break

        result_code = root.findtext(".//resultCode")
        if result_code not in (None, "00", "000"):
            result_msg = root.findtext(".//resultMsg", default="")
            print(f"[!] 전세 API 오류 (LAWD_CD={lawd_cd}, DEAL_YMD={deal_ymd}): {result_code} {result_msg}")
            break

        items = root.findall(".//item")
        for item in items:
            monthly_rent_raw = (item.findtext("monthlyRent") or "0").replace(",", "").strip()
            if monthly_rent_raw not in ("", "0"):
                continue  # 월세가 있는 건(반전세/월세)은 제외 - 순수 전세만 집계
            deposit_raw = (item.findtext("deposit") or "").replace(",", "").strip()
            umd = (item.findtext("umdNm") or "").strip()
            if not deposit_raw:
                continue
            try:
                deposit = int(deposit_raw)
            except ValueError:
                continue
            trades.append({"dealAmount": deposit, "umdNm": umd})

        total_count = int(root.findtext(".//totalCount", default="0") or 0)
        if page_no * 1000 >= total_count:
            break
        page_no += 1

    return trades


def _lawd_codes(area_config: dict) -> list[str]:
    lawd_cd = area_config["lawd_cd"]
    return lawd_cd if isinstance(lawd_cd, list) else [lawd_cd]


def fetch_area_trades(area_config: dict, deal_ymd: str, service_key: str) -> list[dict]:
    """지역 하나(여러 시군구코드 합산 가능) + 계약월의 실제 거래 목록 (umd 필터 적용)."""
    all_trades: list[dict] = []
    for lawd_cd in _lawd_codes(area_config):
        all_trades.extend(fetch_trades(lawd_cd, deal_ymd, service_key))

    umd_filter = area_config.get("umd")
    if umd_filter:
        all_trades = [t for t in all_trades if t["umdNm"] in umd_filter]

    return all_trades


def _percentile(sorted_values: list[float], p: float) -> float:
    """선형보간 방식 백분위수 (0<=p<=1). sorted_values는 오름차순 정렬돼 있어야 함."""
    n = len(sorted_values)
    if n == 1:
        return sorted_values[0]
    idx = p * (n - 1)
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * frac


def summarize_trades(trades: list[dict]) -> dict | None:
    """거래 목록(dealAmount 만원 단위) -> 박스플랏 요약(억원, 소수 2자리). 비어있으면 None.

    whisker는 IQR 기반(Q1-1.5*IQR ~ Q3+1.5*IQR)으로 계산하고,
    그 범위를 벗어나는 값은 outliers 배열로 별도 반환.
    min/max는 절대 최솟값이 아닌 whisker 안의 실제 최솟값/최댓값.
    """
    if not trades:
        return None
    amounts = sorted(t["dealAmount"] / 10000 for t in trades)  # 만원 -> 억원
    q1 = _percentile(amounts, 0.25)
    q3 = _percentile(amounts, 0.75)
    iqr = q3 - q1
    fence_low = q1 - 1.5 * iqr
    fence_high = q3 + 1.5 * iqr
    inner = [v for v in amounts if fence_low <= v <= fence_high]
    outliers = [round(v, 2) for v in amounts if v < fence_low or v > fence_high]
    return {
        "avg": round(sum(amounts) / len(amounts), 2),
        "min": round(inner[0], 2) if inner else round(amounts[0], 2),
        "q1": round(q1, 2),
        "median": round(_percentile(amounts, 0.5), 2),
        "q3": round(q3, 2),
        "max": round(inner[-1], 2) if inner else round(amounts[-1], 2),
        "outliers": outliers,
        "count": len(amounts),
    }


def recent_year_months(target_date: date, count: int) -> list[tuple[int, int]]:
    """target_date 기준 최근 count개월의 (year, month) 리스트, 과거->최신 순."""
    result = []
    y, m = target_date.year, target_date.month
    for _ in range(count):
        result.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(result))


def get_area_chart_data(area: str, config: dict, target_date: date, service_key: str) -> dict | None:
    """지역 하나의 chartData 항목: 월별(최근 12개월) + 연도별(과거 10년) 박스플랏."""
    all_months = recent_year_months(target_date, YEARLY_WINDOW_MONTHS)

    trades_by_month: dict[tuple[int, int], list[dict]] = {}
    for (y, m) in all_months:
        deal_ymd = f"{y}{m:02d}"
        trades_by_month[(y, m)] = fetch_area_trades(config, deal_ymd, service_key)

    # 월별: 최근 12개월
    monthly_points = []
    for (y, m) in all_months[-MONTHLY_WINDOW:]:
        summary = summarize_trades(trades_by_month[(y, m)])
        if summary is not None:
            monthly_points.append({"label": f"{m}월", **summary})

    # 연도별: 과거 10년, 그 해 1~12월 거래를 전부 모아 집계 (거래 없는 해는 생략)
    years = sorted({y for (y, m) in all_months})
    yearly_points = []
    for y in years:
        year_trades = [t for (yy, mm), ts in trades_by_month.items() if yy == y for t in ts]
        summary = summarize_trades(year_trades)
        if summary is not None:
            yearly_points.append({"label": f"{y}년", **summary})

    if not monthly_points and not yearly_points:
        return None

    return {
        "area": area,
        "title": f"{area} 아파트 매매가 분포",
        "unit": "단위: 억원",
        "data": monthly_points,
        "yearlyData": yearly_points,
    }


def get_all_areas_chart_data(target_date: date, service_key: str) -> list[dict]:
    """20개 지역 전체의 chartData 배열 (앱 스키마: area/title/unit/data/yearlyData)."""
    chart_data = []
    for area, config in AREA_CODES.items():
        print(f"[*] {area} 실거래가 조회 중 (12개월 + 과거 10년)...")
        try:
            entry = get_area_chart_data(area, config, target_date, service_key)
        except Exception as e:
            # 한 지역에서 재시도까지 다 실패해도 나머지 19개 지역 결과는 살린다
            print(f"[!] {area}: 조회 실패 (재시도 소진) - 항목 생략: {e}")
            continue
        if entry is None:
            print(f"[!] {area}: 거래 데이터 없음 - 항목 생략")
            continue
        chart_data.append(entry)

    return chart_data


def get_dong_comparison_data(target_date: date, service_key: str) -> list[dict]:
    """DONG_FOCUS 지역의 동별 시계열 박스플랏 집계.

    120개월 전체 거래를 수집한 뒤, 6개월 집계 기준으로 유효 동을 결정하고
    각 동마다 지역 차트와 동일한 형식으로 data(최근 12개월)/yearlyData(10년)를 생성.

    반환 형식:
    [
      { "area": "수지", "title": "...", "unit": "...",
        "dongs": [
          { "name": "죽전동",
            "data": [{"label": "1월", ...stats}, ...],      # 최근 12개월
            "yearlyData": [{"label": "2016년", ...stats}, ...] },  # 10년
          ...
        ]
      },
      ...
    ]
    """
    all_months = recent_year_months(target_date, YEARLY_WINDOW_MONTHS)  # 120개월
    recent_6_set = {(y, m) for (y, m) in recent_year_months(target_date, 6)}
    result = []

    for area, cfg in DONG_FOCUS.items():
        try:
            lawd_cd = cfg["lawd_cd"]

            # 120개월 전체 수집
            trades_by_month: dict[tuple[int, int], list[dict]] = {}
            for (y, m) in all_months:
                trades_by_month[(y, m)] = fetch_trades(lawd_cd, f"{y}{m:02d}", service_key)

            # 6개월 집계로 유효 동 결정 (Q1~평균 범위 필터)
            trades_6m = [t for (y, m), ts in trades_by_month.items() if (y, m) in recent_6_set for t in ts]
            overall = summarize_trades(trades_6m)
            if overall is None:
                continue
            lo, hi = sorted((overall["q1"], overall["avg"]))

            by_dong_6m: dict[str, list[dict]] = {}
            for t in trades_6m:
                by_dong_6m.setdefault(t.get("umdNm", ""), []).append(t)

            valid_dongs: set[str] = set()
            dong_avg_6m: dict[str, float] = {}
            for dong, trades in by_dong_6m.items():
                if len(trades) < DONG_MIN_TRADES:
                    continue
                summary = summarize_trades(trades)
                if summary and (lo <= summary["avg"] <= hi):
                    valid_dongs.add(dong)
                    dong_avg_6m[dong] = summary["avg"]

            if not valid_dongs:
                continue

            # 동별 월별/연도별 시계열 생성
            dongs_data = []
            for dong in sorted(valid_dongs, key=lambda d: dong_avg_6m.get(d, 0)):
                # 월별: 최근 12개월
                monthly: list[dict] = []
                for (y, m) in all_months[-MONTHLY_WINDOW:]:
                    dong_trades = [t for t in trades_by_month[(y, m)] if t.get("umdNm") == dong]
                    summary = summarize_trades(dong_trades)
                    if summary is not None:
                        monthly.append({"label": f"{m}월", **summary})

                # 연도별: 10년
                years = sorted({y for (y, m) in all_months})
                yearly: list[dict] = []
                for y in years:
                    dong_trades = [t for (yy, mm), ts in trades_by_month.items() if yy == y for t in ts if t.get("umdNm") == dong]
                    summary = summarize_trades(dong_trades)
                    if summary is not None:
                        yearly.append({"label": f"{y}년", **summary})

                if monthly or yearly:
                    dongs_data.append({"name": dong, "data": monthly, "yearlyData": yearly})

            if not dongs_data:
                continue

            # 해당 지역의 연도별 2주택자 비율 데이터 추가 (yearlyData에 있는 연도만)
            existing_year_labels = {
                p["label"]
                for d in dongs_data
                for p in d.get("yearlyData", [])
            }
            ratio_map = MULTI_OWNER_RATIO.get(area, {})
            multi_owner_ratio = [
                {"label": f"{y}년", "ratio": ratio_map[y]}
                for y in sorted(ratio_map.keys())
                if f"{y}년" in existing_year_labels
            ] if ratio_map else None

            result.append({
                "area": area,
                "title": f"{area} 동별 실거래가 추이",
                "unit": "단위: 억원",
                "dongs": dongs_data,
                **({"multiOwnerRatioByYear": multi_owner_ratio} if multi_owner_ratio else {}),
            })
        except Exception as e:
            # get_all_regions_chart_data와 동일하게, 한 지역이 실패(예: API 429)해도 전체가 죽지 않고
            # 그 지역만 생략하고 계속 진행 (부분 데이터라도 배포되는 게 스크립트 전체 크래시보다 나음)
            print(f"[!] {area}: 동별 비교 데이터 조회 실패 - 항목 생략: {e}")
            continue

    return result


# 경기도 시/구 단위 LAWD_CD 매핑 (지역 탐색 UI용)
# 기존 AREA_CODES(칼럼용 named areas)와 별개로, 행정구역 기준으로 경기 전체 커버
REGION_CODES: dict[str, dict] = {
    # 수원시
    "수원_장안": {"lawd_cd": "41111", "si": "수원시", "gu": "장안구"},
    "수원_권선": {"lawd_cd": "41113", "si": "수원시", "gu": "권선구"},
    "수원_팔달": {"lawd_cd": "41115", "si": "수원시", "gu": "팔달구"},
    "수원_영통": {"lawd_cd": "41117", "si": "수원시", "gu": "영통구"},
    # 성남시
    "성남_수정": {"lawd_cd": "41131", "si": "성남시", "gu": "수정구"},
    "성남_중원": {"lawd_cd": "41133", "si": "성남시", "gu": "중원구"},
    "성남_분당": {"lawd_cd": "41135", "si": "성남시", "gu": "분당구"},
    # 의정부시
    "의정부": {"lawd_cd": "41150", "si": "의정부시", "gu": None},
    # 안양시
    "안양_만안": {"lawd_cd": "41171", "si": "안양시", "gu": "만안구"},
    "안양_동안": {"lawd_cd": "41173", "si": "안양시", "gu": "동안구"},
    # 부천시 (2016년 일반구 폐지)
    "부천": {"lawd_cd": ["41194", "41196", "41198"], "si": "부천시", "gu": None},
    # 광명시
    "광명": {"lawd_cd": "41210", "si": "광명시", "gu": None},
    # 평택시
    "평택": {"lawd_cd": "41220", "si": "평택시", "gu": None},
    # 안산시
    "안산_상록": {"lawd_cd": "41271", "si": "안산시", "gu": "상록구"},
    "안산_단원": {"lawd_cd": "41273", "si": "안산시", "gu": "단원구"},
    # 고양시
    "고양_덕양": {"lawd_cd": "41281", "si": "고양시", "gu": "덕양구"},
    "고양_일산동": {"lawd_cd": "41285", "si": "고양시", "gu": "일산동구"},
    "고양_일산서": {"lawd_cd": "41287", "si": "고양시", "gu": "일산서구"},
    # 과천시
    "과천": {"lawd_cd": "41290", "si": "과천시", "gu": None},
    # 구리시
    "구리": {"lawd_cd": "41310", "si": "구리시", "gu": None},
    # 남양주시
    "남양주": {"lawd_cd": "41360", "si": "남양주시", "gu": None},
    # 오산시
    "오산": {"lawd_cd": "41370", "si": "오산시", "gu": None},
    # 시흥시
    "시흥": {"lawd_cd": "41390", "si": "시흥시", "gu": None},
    # 군포시
    "군포": {"lawd_cd": "41410", "si": "군포시", "gu": None},
    # 의왕시
    "의왕": {"lawd_cd": "41430", "si": "의왕시", "gu": None},
    # 하남시
    "하남": {"lawd_cd": "41450", "si": "하남시", "gu": None},
    # 용인시
    "용인_처인": {"lawd_cd": "41461", "si": "용인시", "gu": "처인구"},
    "용인_기흥": {"lawd_cd": "41463", "si": "용인시", "gu": "기흥구"},
    "용인_수지": {"lawd_cd": "41465", "si": "용인시", "gu": "수지구"},
    # 파주시
    "파주": {"lawd_cd": "41480", "si": "파주시", "gu": None},
    # 이천시
    "이천": {"lawd_cd": "41500", "si": "이천시", "gu": None},
    # 김포시
    "김포": {"lawd_cd": "41570", "si": "김포시", "gu": None},
    # 화성시 (2026-02 동탄구 신설 - 본청(병점 등)과 동탄구 분리)
    "화성_본청": {"lawd_cd": "41590", "si": "화성시", "gu": "화성본청"},
    "화성_동탄": {"lawd_cd": "41597", "si": "화성시", "gu": "동탄구"},
    # 광주시
    "광주": {"lawd_cd": "41610", "si": "광주시", "gu": None},
    # 양주시
    "양주": {"lawd_cd": "41630", "si": "양주시", "gu": None},
    # 인천광역시
    "인천_연수": {"lawd_cd": "28185", "si": "인천시", "gu": "연수구"},  # 송도 포함
}


def get_all_regions_chart_data(
    target_date: date,
    service_key: str,
    existing_data: list[dict] | None = None,
) -> list[dict]:
    """REGION_CODES 전체의 경기도 지역별 chartData. 앱 지역 탐색 UI용.

    구 있는 시: 시→구→동 3단계 / 구 없는 시: 시→동 2단계.
    existing_data 제공 시 증분 모드: 18개월만 fetch하고 yearlyData는 기존 데이터와 병합.
    existing_data=None 시 전체 모드: 5년(60개월) 전부 fetch.
    """
    is_incremental = existing_data is not None
    window = REGION_INCREMENTAL_MONTHS if is_incremental else REGION_YEARLY_WINDOW_MONTHS
    all_months = recent_year_months(target_date, window)
    recent_6_set = {(y, m) for (y, m) in recent_year_months(target_date, 6)}
    fetch_years = sorted({y for (y, m) in all_months})
    existing_by_area: dict[str, dict] = {e["area"]: e for e in (existing_data or [])}

    chart_data = []
    for area, config in REGION_CODES.items():
        gu = config.get("gu")
        si = config.get("si", area)
        label = gu if gu else si
        print(f"[*] {si} {label} 실거래가 + 동별 조회 중...")

        try:
            trades_by_month: dict[tuple[int, int], list[dict]] = {}
            for (y, m) in all_months:
                raw: list[dict] = []
                for lawd_cd in _lawd_codes(config):
                    raw.extend(fetch_trades(lawd_cd, f"{y}{m:02d}", service_key))
                trades_by_month[(y, m)] = raw
        except Exception as e:
            print(f"[!] {area}: 조회 실패 - 항목 생략: {e}")
            continue

        # 구/시 전체 월별
        monthly_points = []
        for (y, m) in all_months[-MONTHLY_WINDOW:]:
            s = summarize_trades(trades_by_month[(y, m)])
            if s:
                monthly_points.append({"label": f"{m}월", **s})

        # 구/시 전체 연도별 (증분 모드: fetch 범위 연도만 재계산 후 기존과 병합)
        new_yearly: dict[str, dict] = {}
        for y in fetch_years:
            year_trades = [t for (yy, mm), ts in trades_by_month.items() if yy == y for t in ts]
            s = summarize_trades(year_trades)
            if s:
                new_yearly[f"{y}년"] = {"label": f"{y}년", **s}
        if is_incremental and area in existing_by_area:
            existing_yearly = {p["label"]: p for p in existing_by_area[area].get("yearlyData", [])}
            merged_yearly = {**existing_yearly, **new_yearly}
            yearly_points = sorted(merged_yearly.values(), key=lambda p: p["label"])
        else:
            yearly_points = sorted(new_yearly.values(), key=lambda p: p["label"])

        if not monthly_points and not yearly_points:
            print(f"[!] {area}: 거래 데이터 없음 - 항목 생략")
            continue

        # 동별 드릴다운: 최근 6개월 DONG_MIN_TRADES 이상인 동만 포함
        trades_6m = [t for (y, m), ts in trades_by_month.items() if (y, m) in recent_6_set for t in ts]
        by_dong_6m: dict[str, list[dict]] = {}
        for t in trades_6m:
            dong = t.get("umdNm", "").strip()
            if dong:
                by_dong_6m.setdefault(dong, []).append(t)

        valid_dongs = {d for d, ts in by_dong_6m.items() if len(ts) >= DONG_MIN_TRADES}

        dongs_data = []
        for dong in sorted(valid_dongs):
            dong_monthly = []
            for (y, m) in all_months[-MONTHLY_WINDOW:]:
                dong_trades = [t for t in trades_by_month[(y, m)] if t.get("umdNm", "").strip() == dong]
                s = summarize_trades(dong_trades)
                if s:
                    dong_monthly.append({"label": f"{m}월", **s})

            new_dong_yearly: dict[str, dict] = {}
            for y in fetch_years:
                dong_trades = [t for (yy, mm), ts in trades_by_month.items() if yy == y for t in ts if t.get("umdNm", "").strip() == dong]
                s = summarize_trades(dong_trades)
                if s:
                    new_dong_yearly[f"{y}년"] = {"label": f"{y}년", **s}
            if is_incremental and area in existing_by_area:
                existing_dongs = {d["name"]: d for d in existing_by_area[area].get("dongs", [])}
                if dong in existing_dongs:
                    ex_dy = {p["label"]: p for p in existing_dongs[dong].get("yearlyData", [])}
                    merged_dy = {**ex_dy, **new_dong_yearly}
                    dong_yearly = sorted(merged_dy.values(), key=lambda p: p["label"])
                else:
                    dong_yearly = sorted(new_dong_yearly.values(), key=lambda p: p["label"])
            else:
                dong_yearly = sorted(new_dong_yearly.values(), key=lambda p: p["label"])

            if dong_monthly or dong_yearly:
                dongs_data.append({"name": dong, "data": dong_monthly, "yearlyData": dong_yearly})

        # 동별 총세대수 + 대단지 비율 조회 (같은 단지 원자료에서 파생 - API 추가 호출 없음)
        # 실패(예: API 429)해도 이미 구한 매매 데이터는 살리고 이 부분만 빈 값으로 생략
        dong_unit_counts: dict[str, int] = {}
        dong_large_units: dict[str, int] = {}
        dong_complex_count: dict[str, int] = {}  # 동별 단지 개수 (대단지 비율 신뢰도 판단용 - 표본 자체는 걸러내지 않고 개수를 같이 보여줌)
        try:
            for lawd_cd in _lawd_codes(config):
                print(f"    세대수 조회 중 ({lawd_cd})...")
                for c in fetch_dong_complexes(lawd_cd, service_key):
                    dong_unit_counts[c["dong"]] = dong_unit_counts.get(c["dong"], 0) + c["units"]
                    dong_complex_count[c["dong"]] = dong_complex_count.get(c["dong"], 0) + 1
                    if c["units"] >= LARGE_COMPLEX_THRESHOLD:
                        dong_large_units[c["dong"]] = dong_large_units.get(c["dong"], 0) + c["units"]
        except Exception as e:
            print(f"[!] {area}: 세대수/대단지 비율 조회 실패 - 생략: {e}")
            dong_unit_counts, dong_large_units, dong_complex_count = {}, {}, {}
        dong_large_complex_ratio = {
            dong: round(dong_large_units.get(dong, 0) / total * 100, 1)
            for dong, total in dong_unit_counts.items() if total > 0
        }

        # 전세가율 (최근 12개월만 - 매매처럼 10년치까지 볼 필요 없어 API 호출량을 아낌)
        # 실패해도 이미 구한 매매 데이터는 살리고 이 부분만 빈 값으로 생략
        rent_trades_by_month: dict[tuple[int, int], list[dict]] = {}
        try:
            for (y, m) in all_months[-MONTHLY_WINDOW:]:
                deal_ymd = f"{y}{m:02d}"
                raw_rent: list[dict] = []
                for lawd_cd in _lawd_codes(config):
                    raw_rent.extend(fetch_rent_trades(lawd_cd, deal_ymd, service_key))
                rent_trades_by_month[(y, m)] = raw_rent
        except Exception as e:
            print(f"[!] {area}: 전세가율 조회 실패 - 생략: {e}")
            rent_trades_by_month = {}

        rent_monthly_points = []
        for (y, m) in all_months[-MONTHLY_WINDOW:]:
            s = summarize_trades(rent_trades_by_month.get((y, m), []))
            if s:
                rent_monthly_points.append({"label": f"{m}월", **s})
        trade_median_by_label = {p["label"]: p["median"] for p in monthly_points}
        jeonse_ratio_points = [
            {"label": p["label"], "value": round(p["median"] / trade_median_by_label[p["label"]] * 100, 1)}
            for p in rent_monthly_points
            if trade_median_by_label.get(p["label"])
        ]

        # 동별 전세가율 (최근 12개월 전세 중앙값 / 최근 12개월 매매 중앙값 * 100)
        # 이미 위에서 받은 매매/전세 원자료를 재사용 - API 추가 호출 없음.
        # 표본을 이유로 숨기지 않고, 전세 거래건수(dongJeonseTradeCount)를 같이 내려서
        # 앱에서 "(전세 N건)"처럼 신뢰도를 사용자가 직접 판단하게 함.
        dong_jeonse_ratio: dict[str, float] = {}
        dong_jeonse_trade_count: dict[str, int] = {}
        all_rent_12m = [t for ts in rent_trades_by_month.values() for t in ts]
        for dong in valid_dongs:
            dong_rent = [t for t in all_rent_12m if t.get("umdNm", "").strip() == dong]
            rent_summary = summarize_trades(dong_rent)
            if not rent_summary:
                continue
            dong_trade_12m = [
                t for (y, m) in all_months[-MONTHLY_WINDOW:] for t in trades_by_month[(y, m)]
                if t.get("umdNm", "").strip() == dong
            ]
            trade_summary = summarize_trades(dong_trade_12m)
            if not trade_summary or trade_summary["median"] <= 0:
                continue
            dong_jeonse_ratio[dong] = round(rent_summary["median"] / trade_summary["median"] * 100, 1)
            dong_jeonse_trade_count[dong] = rent_summary["count"]

        entry: dict = {
            "area": area,
            "si": si,
            "gu": gu,
            "label": label,
            "title": f"{label} 아파트 매매가 분포",
            "unit": "단위: 억원",
            "data": monthly_points,
            "yearlyData": yearly_points,
            "dongs": dongs_data,
        }
        if dong_unit_counts:
            entry["dongUnitCounts"] = dong_unit_counts
        if dong_large_complex_ratio:
            entry["dongLargeComplexRatio"] = dong_large_complex_ratio
        if dong_complex_count:
            entry["dongComplexCount"] = dong_complex_count
        if rent_monthly_points:
            entry["jeonseData"] = rent_monthly_points
        if jeonse_ratio_points:
            entry["jeonseRatioData"] = jeonse_ratio_points
        if dong_jeonse_ratio:
            entry["dongJeonseRatio"] = dong_jeonse_ratio
        if dong_jeonse_trade_count:
            entry["dongJeonseTradeCount"] = dong_jeonse_trade_count
        chart_data.append(entry)

    return chart_data


def fetch_suji_dong_complex_prices(
    dong_name: str,
    service_key: str,
    months: int = 5,
    lawd_cd: str = "41465",
    umd_filter: str | None = None,
) -> list[dict]:
    """특정 시군구 내 아파트 단지별 최근 실거래가 집계.
    dong_name: Firebase 키로 사용되는 레이블. umd_filter=None이면 구 전체 수집.
    monthlyData는 오래된 순(왼쪽=과거, 오른쪽=최근) 리스트.
    medianPrice = 가장 최근 거래 월의 중앙값. 결과는 medianPrice 내림차순 정렬.
    """
    umd_target = umd_filter if umd_filter is not None else dong_name
    _filter_by_umd = umd_filter is not None or lawd_cd == "41465"
    _prev = date.today().replace(day=1) - timedelta(days=1)
    today = _prev.replace(day=1) - timedelta(days=1)  # 두달 전 기준 (신고기한 30일 경과로 데이터 완성)

    # 월 슬롯: 오래된 순 (spark bar 왼쪽→오른쪽)
    month_slots: list[tuple[str, str]] = []  # (deal_ymd, ref_label)
    for m in range(months - 1, -1, -1):
        year = today.year
        month = today.month - m
        while month <= 0:
            month += 12
            year -= 1
        month_slots.append((f"{year}{month:02d}", f"{str(year)[2:]}.{month:02d}"))

    # 단지별·월별 거래금액 목록
    prices_by_apt_month: dict[str, dict[str, list[int]]] = {}
    latest_month_by_apt: dict[str, str] = {}

    for deal_ymd, ref_label in month_slots:
        try:
            page_no = 1
            while True:
                root = _fetch_page(lawd_cd, deal_ymd, service_key, page_no)
                result_code = root.findtext(".//resultCode")
                if result_code not in (None, "00", "000"):
                    break
                items = root.findall(".//item")
                for item in items:
                    umd = (item.findtext("umdNm") or "").strip()
                    if _filter_by_umd and umd != umd_target:
                        continue
                    apt_nm = (item.findtext("aptNm") or "").strip()
                    amount_raw = (item.findtext("dealAmount") or "").replace(",", "").strip()
                    if not apt_nm or not amount_raw:
                        continue
                    try:
                        amount = int(amount_raw)
                    except ValueError:
                        continue
                    prices_by_apt_month.setdefault(apt_nm, {}).setdefault(ref_label, []).append(amount)
                    latest_month_by_apt[apt_nm] = ref_label  # 마지막 할당 = 가장 최근 월
                total_count = int(root.findtext(".//totalCount", default="0") or 0)
                if page_no * 1000 >= total_count:
                    break
                page_no += 1
        except Exception as e:
            print(f"[!] 단지 조회 실패 ({lawd_cd} {deal_ymd}): {e}")

    def _median(prices: list[int]) -> float:
        if not prices:
            return 0.0
        sp = sorted(prices)
        n = len(sp)
        mid = n // 2
        val = sp[mid] if n % 2 == 1 else (sp[mid - 1] + sp[mid]) // 2
        return round(val / 10000, 2)

    results = []
    for apt_nm, month_prices in prices_by_apt_month.items():
        monthly_data = [
            {"month": label, "count": len(month_prices.get(label, [])), "median": _median(month_prices.get(label, []))}
            for _, label in month_slots
        ]
        # 거래 없는 달은 직전 알려진 중앙값으로 forward-fill
        last_known = 0.0
        for d in monthly_data:
            if d["median"] > 0:
                last_known = d["median"]
            elif last_known > 0:
                d["median"] = last_known
        # 맨 앞 달이 비어있으면 첫 유효 값으로 backward-fill
        first_known = next((d["median"] for d in monthly_data if d["median"] > 0), 0.0)
        for d in monthly_data:
            if d["median"] == 0:
                d["median"] = first_known
        recent_median = next((d["median"] for d in reversed(monthly_data) if d["median"] > 0), 0.0)
        if recent_median == 0:
            continue
        results.append({
            "name": apt_nm,
            "medianPrice": recent_median,
            "monthlyData": monthly_data,
            "refMonth": latest_month_by_apt.get(apt_nm, ""),
        })

    results.sort(key=lambda x: x["medianPrice"], reverse=True)
    return results


def fetch_gu_complexes_by_dong(
    lawd_cd: str,
    service_key: str,
    months: int = 5,
    min_complexes: int = 3,
    reference_date: date | None = None,
) -> dict[str, list[dict]]:
    """구 전체 아파트 단지 실거래가를 수집해 동(umdNm)별로 그룹핑하여 반환.
    min_complexes: 단지 수가 이보다 적은 동은 노이즈로 간주해 제외.
    reference_date: 수집 기준 마지막 달(None이면 두달 전 자동 계산).
    Returns: { 동이름: [complex_dict, ...], ... }
    """
    if reference_date is not None:
        today = reference_date
    else:
        _prev = date.today().replace(day=1) - timedelta(days=1)
        today = _prev.replace(day=1) - timedelta(days=1)  # 두달 전 기준 (신고기한 30일 경과로 데이터 완성)
    month_slots: list[tuple[str, str]] = []
    for m in range(months - 1, -1, -1):
        year = today.year
        month = today.month - m
        while month <= 0:
            month += 12
            year -= 1
        month_slots.append((f"{year}{month:02d}", f"{str(year)[2:]}.{month:02d}"))

    # dong → apt → ref_label → [prices]
    raw: dict[str, dict[str, dict[str, list[int]]]] = {}
    latest_month_by_dong_apt: dict[str, dict[str, str]] = {}

    for deal_ymd, ref_label in month_slots:
        try:
            page_no = 1
            while True:
                root = _fetch_page(lawd_cd, deal_ymd, service_key, page_no)
                result_code = root.findtext(".//resultCode")
                if result_code not in (None, "00", "000"):
                    break
                items = root.findall(".//item")
                for item in items:
                    umd = (item.findtext("umdNm") or "").strip()
                    apt_nm = (item.findtext("aptNm") or "").strip()
                    amount_raw = (item.findtext("dealAmount") or "").replace(",", "").strip()
                    if not umd or not apt_nm or not amount_raw:
                        continue
                    try:
                        amount = int(amount_raw)
                    except ValueError:
                        continue
                    raw.setdefault(umd, {}).setdefault(apt_nm, {}).setdefault(ref_label, []).append(amount)
                    latest_month_by_dong_apt.setdefault(umd, {})[apt_nm] = ref_label
                total_count = int(root.findtext(".//totalCount", default="0") or 0)
                if page_no * 1000 >= total_count:
                    break
                page_no += 1
        except Exception as e:
            print(f"[!] 단지 조회 실패 ({lawd_cd} {deal_ymd}): {e}")

    def _median(prices: list[int]) -> float:
        if not prices:
            return 0.0
        sp = sorted(prices)
        n = len(sp)
        mid = n // 2
        val = sp[mid] if n % 2 == 1 else (sp[mid - 1] + sp[mid]) // 2
        return round(val / 10000, 2)

    result: dict[str, list[dict]] = {}
    for dong, apt_month_data in raw.items():
        complexes: list[dict] = []
        for apt_nm, month_prices in apt_month_data.items():
            monthly_data = [
                {"month": label, "count": len(month_prices.get(label, [])), "median": _median(month_prices.get(label, []))}
                for _, label in month_slots
            ]
            last_known = 0.0
            for d in monthly_data:
                if d["median"] > 0:
                    last_known = d["median"]
                elif last_known > 0:
                    d["median"] = last_known
            # 맨 앞 달이 비어있으면 첫 유효 값으로 backward-fill
            first_known = next((d["median"] for d in monthly_data if d["median"] > 0), 0.0)
            for d in monthly_data:
                if d["median"] == 0:
                    d["median"] = first_known
            recent_median = next((d["median"] for d in reversed(monthly_data) if d["median"] > 0), 0.0)
            if recent_median == 0:
                continue
            complexes.append({
                "name": apt_nm,
                "medianPrice": recent_median,
                "monthlyData": monthly_data,
                "refMonth": latest_month_by_dong_apt.get(dong, {}).get(apt_nm, ""),
            })
        if len(complexes) < min_complexes:
            continue
        complexes.sort(key=lambda x: x["medianPrice"], reverse=True)
        result[dong] = complexes

    return result


if __name__ == "__main__":
    key = get_molit_api_key()
    _prev = date.today().replace(day=1) - timedelta(days=1)
    data = get_all_areas_chart_data(_prev.replace(day=1) - timedelta(days=1), key)
    for entry in data:
        print(entry["area"], "월별:", entry["data"])
        print(entry["area"], "연도별:", entry["yearlyData"])
