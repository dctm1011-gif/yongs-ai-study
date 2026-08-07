"""
국토교통부 아파트매매 실거래상세자료 Open API
(data.go.kr, https://www.data.go.kr/data/15126469/openapi.do)

20개 경기도 지역의 아파트 실거래가 분포(박스플랏: 최소/1분위/중앙값/3분위/최대)를
실제 거래 데이터로 집계한다. 최근 12개월(월별)과 과거 10년(연도별) 두 가지 시야를 만든다.
추정/보간 없음 - 거래가 없는 달/해는 그 데이터 포인트를 생략한다.
"""
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date

import requests

ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"

MONTHLY_WINDOW = 12   # 월별 보기: 최근 12개월
YEARLY_WINDOW_MONTHS = 120  # 연도별 보기: 과거 10년(=120개월)치를 모아서 연 단위로 집계
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

    return result


if __name__ == "__main__":
    key = get_molit_api_key()
    data = get_all_areas_chart_data(date.today(), key)
    for entry in data:
        print(entry["area"], "월별:", entry["data"])
        print(entry["area"], "연도별:", entry["yearlyData"])
