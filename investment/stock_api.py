"""
주식 실제 가격 데이터 - yfinance 기반
Claude가 오늘의 관심 종목(티커)을 고르면, 그 티커의 실제 최근 12개월 월평균 종가를 가져온다.
추정 없음 - 데이터가 없는 달은 생략, 티커 자체가 유효하지 않으면 안전한 fallback 종목으로 재시도.
"""
import json
import re
from datetime import date, timedelta
from pathlib import Path

import yfinance as yf

# Claude의 종목 선정이 실패하거나 유효하지 않은 티커를 줄 경우를 대비한 안전망
FALLBACK_TICKERS = [
    {"name": "삼성전자", "yahoo_ticker": "005930.KS"},
    {"name": "SK하이닉스", "yahoo_ticker": "000660.KS"},
    {"name": "NVIDIA", "yahoo_ticker": "NVDA"},
]

# 최근 선정 종목 기록 (다양성 강제용) - git 추적 대상 아님, 로컬 상태 파일
HISTORY_PATH = Path(__file__).parent / "stock_history.json"


def load_recent_picks(days: int = 5) -> list[str]:
    """최근 며칠간 고른 종목명 리스트 (최신순 아님, 날짜순)."""
    if not HISTORY_PATH.exists():
        return []
    try:
        entries = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    return [e["name"] for e in entries[-days:]]


def record_pick(name: str, ticker: str, target_date: date, keep: int = 10) -> None:
    entries = []
    if HISTORY_PATH.exists():
        try:
            entries = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            entries = []
    entries.append({"date": target_date.isoformat(), "name": name, "ticker": ticker})
    HISTORY_PATH.write_text(json.dumps(entries[-keep:], ensure_ascii=False, indent=2), encoding="utf-8")


def _recent_months(target_date: date, count: int = 12) -> list[tuple[int, int]]:
    months = []
    y, m = target_date.year, target_date.month
    for _ in range(count):
        months.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(months))


def _unit_for(ticker: str) -> str:
    return "단위: 원" if re.search(r"\.(KS|KQ)$", ticker) else "단위: 달러"


def fetch_monthly_avg_prices(ticker: str, target_date: date, months: int = 12) -> list[dict]:
    """야후 파이낸스에서 실제 일별 종가를 받아 월평균으로 집계. 실패/데이터없음 시 빈 리스트."""
    month_list = _recent_months(target_date, months)
    start = date(month_list[0][0], month_list[0][1], 1)
    end = target_date + timedelta(days=1)

    try:
        hist = yf.Ticker(ticker).history(start=start.isoformat(), end=end.isoformat())
    except Exception as e:
        print(f"[!] {ticker} 조회 실패: {e}")
        return []

    if hist.empty:
        return []

    decimals = 0 if _unit_for(ticker) == "단위: 원" else 2
    points = []
    for (y, m) in month_list:
        month_rows = hist[(hist.index.year == y) & (hist.index.month == m)]
        if month_rows.empty:
            continue
        avg_close = float(month_rows["Close"].mean())
        points.append({"label": f"{m}월", "value": round(avg_close, decimals)})

    return points


def pick_and_fetch_stock(target_date: date, picked: dict | None) -> dict:
    """picked({'name','yahoo_ticker',...} 또는 None)로 먼저 시도하고, 실패하면 fallback 종목으로 재시도."""
    candidates = ([picked] if picked and picked.get("yahoo_ticker") else []) + FALLBACK_TICKERS

    for cand in candidates:
        ticker = cand["yahoo_ticker"]
        points = fetch_monthly_avg_prices(ticker, target_date)
        if points:
            name = cand["name"]
            unit = _unit_for(ticker)
            record_pick(name, ticker, target_date)
            return {
                "name": name,
                "ticker": ticker,
                "chartData": [{
                    "area": name,
                    "title": f"{name} 주가 추이",
                    "unit": unit,
                    "data": points,
                }],
            }
        print(f"[!] {cand.get('name')}({ticker}) 실거래 데이터 없음 - 다음 후보로 재시도")

    raise RuntimeError("어떤 종목도 실제 가격 데이터를 가져오지 못했습니다")
