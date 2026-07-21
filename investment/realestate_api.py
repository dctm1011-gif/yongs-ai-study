"""
국토교통부 아파트매매 실거래상세자료 Open API
(data.go.kr, https://www.data.go.kr/data/15126469/openapi.do)

20개 경기도 지역의 최근 5개월 아파트 실거래가 분포(박스플랏: 최소/1분위/중앙값/3분위/최대)를
실제 거래 데이터로 집계한다. 추정/보간 없음 - 해당 월에 거래가 없으면 그 데이터 포인트는 생략한다.
"""
import os
import sys
import xml.etree.ElementTree as ET
from datetime import date

import requests

ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"

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
    resp = requests.get(ENDPOINT, params=params, timeout=15)
    resp.raise_for_status()
    return ET.fromstring(resp.content)


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


def get_monthly_summary(area_config: dict, deal_ymd: str, service_key: str) -> dict | None:
    """지역 하나의 특정 계약월 실거래가 분포(억원, 소수 2자리): min/q1/median/q3/max/count. 거래 없으면 None."""
    all_trades: list[dict] = []
    for lawd_cd in _lawd_codes(area_config):
        all_trades.extend(fetch_trades(lawd_cd, deal_ymd, service_key))

    umd_filter = area_config.get("umd")
    if umd_filter:
        all_trades = [t for t in all_trades if t["umdNm"] in umd_filter]

    if not all_trades:
        return None

    amounts = sorted(t["dealAmount"] / 10000 for t in all_trades)  # 만원 -> 억원
    return {
        "min": round(amounts[0], 2),
        "q1": round(_percentile(amounts, 0.25), 2),
        "median": round(_percentile(amounts, 0.5), 2),
        "q3": round(_percentile(amounts, 0.75), 2),
        "max": round(amounts[-1], 2),
        "count": len(amounts),
    }


def recent_deal_ymds(target_date: date, count: int = 5) -> list[str]:
    """target_date 기준 최근 count개월의 DEAL_YMD(YYYYMM) 리스트, 과거->최신 순."""
    result = []
    y, m = target_date.year, target_date.month
    for _ in range(count):
        result.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(result))


def get_all_areas_chart_data(target_date: date, service_key: str) -> list[dict]:
    """20개 지역 전체의 chartData 배열 (앱 스키마: area/title/unit/data)."""
    months = recent_deal_ymds(target_date, 5)
    month_labels = {ymd: f"{int(ymd[4:6])}월" for ymd in months}

    chart_data = []
    for area, config in AREA_CODES.items():
        print(f"[*] {area} 실거래가 조회 중...")
        points = []
        for ymd in months:
            summary = get_monthly_summary(config, ymd, service_key)
            if summary is not None:
                points.append({"label": month_labels[ymd], **summary})
        if not points:
            print(f"[!] {area}: 5개월간 거래 데이터 없음 - 항목 생략")
            continue
        chart_data.append({
            "area": area,
            "title": f"{area} 아파트 매매가 분포",
            "unit": "단위: 억원",
            "data": points,
        })

    return chart_data


if __name__ == "__main__":
    key = get_molit_api_key()
    data = get_all_areas_chart_data(date.today(), key)
    for entry in data:
        print(entry["area"], entry["data"])
