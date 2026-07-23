"""
투자 칼럼 자동 생성
Claude API 웹서치 툴로 오늘자 부동산/주식 뉴스를 검색하고
investment/daily.json으로 저장 (netlify/functions/investment-daily.mjs가 읽어서 Firebase에 업로드)
매일 Task Scheduler로 자동 실행
"""
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import anthropic

from realestate_api import get_all_areas_chart_data, get_molit_api_key
from stock_api import pick_and_fetch_stock, load_recent_picks

ROOT = Path(__file__).parent.parent
OUTPUT_JSON = ROOT / "investment" / "daily.json"

MODEL = "claude-haiku-4-5-20251001"

# 실제로 인용된 검색 결과 도메인을 사람이 읽기 좋은 사이트명으로 매핑 (출처 필드 생성용)
SITE_NAMES = {
    "rt.molit.go.kr": "국토교통부 실거래가 공개시스템",
    "www.data.go.kr": "공공데이터포털",
    "data.go.kr": "공공데이터포털",
    "www.reb.or.kr": "한국부동산원",
    "reb.or.kr": "한국부동산원",
    "www.r-one.co.kr": "한국부동산원 부동산통계정보시스템",
    "r-one.co.kr": "한국부동산원 부동산통계정보시스템",
    "kbland.kr": "KB부동산",
    "data.kbland.kr": "KB부동산",
    "land.naver.com": "네이버 부동산",
    "finance.naver.com": "네이버페이 증권",
    "finance.yahoo.com": "야후 파이낸스",
    "www.hankyung.com": "한국경제",
    "www.mk.co.kr": "매일경제",
    "www.yna.co.kr": "연합뉴스",
    "biz.chosun.com": "조선비즈",
}


def extract_cited_sites(response) -> list[str]:
    """Claude 응답의 web_search_tool_result 블록에서 실제로 검색된 URL의 도메인을 추출."""
    domains: list[str] = []
    seen = set()
    for block in getattr(response, "content", []):
        if getattr(block, "type", None) != "web_search_tool_result":
            continue
        for item in getattr(block, "content", None) or []:
            url = getattr(item, "url", None)
            if not url:
                continue
            domain = urlparse(url).netloc.replace("www.", "")
            if domain and domain not in seen:
                seen.add(domain)
                domains.append(domain)
    return domains


def friendly_source(domains: list[str], base: str, max_extra: int = 2) -> str:
    """base(항상 보장되는 실제 데이터 출처) + 검색으로 실제 인용된 사이트 몇 개를 붙인 출처 문자열."""
    names = [base]
    for d in domains:
        name = SITE_NAMES.get(d, d)
        if name not in names:
            names.append(name)
        if len(names) - 1 >= max_extra:
            break
    return ", ".join(names)

PROMPT = """오늘 날짜: {today}

[부동산 실제 데이터] 국토교통부 실거래가 공개 API로 조회한 경기도 20개 지역의 최근 5개월
아파트 평균 매매가 (추정치 아님, 실거래 평균):

{real_estate_table}

[주식 실제 데이터] 오늘의 관심 종목으로 이미 선정된 {stock_name}({stock_ticker})의
야후 파이낸스 실제 최근 12개월 월평균 종가:

{stock_table}

위 두 실제 데이터를 그대로 인용해서 투자 칼럼 2개(부동산 1개, 주식 1개)를 작성해줘. 필요하면
웹 검색으로 관련 뉴스/맥락을 추가 조사해도 되지만, 수치는 반드시 위 표의 값만 사용해라. JSON으로만
작성하고, JSON 외 다른 텍스트는 포함하지 마세요.

⚠️ 절대 규칙: 부동산·주식 수치 모두 위에 제공된 실제 데이터 외의 숫자를 지어내지 마라. 어떤
지역/달을 언급하든 반드시 위 표에 있는 값만 사용해라. chartData 필드는 두 칼럼 모두 작성하지
마라 (스크립트가 실제 데이터로 채워 넣는다).

1. 부동산 칼럼: 위 20개 지역 데이터를 근거로 시장 동향/배경 분석/전망 섹션 작성. 고가/중가/중저가
   지역이 골고루 섞여 있다는 점과 실제 수치(예: "판교는 X월 Y억에서 Z월 W억으로") 를 구체적으로 인용.
2. 주식 칼럼: {stock_name}({stock_ticker})의 최근 실적/이슈와 위 실제 주가 흐름을 엮어서 작성.

JSON 형식 (정확히 이 스키마를 따를 것, chartData/source 필드는 포함하지 말 것 - 스크립트가 채움):
{{
  "columns": [
    {{
      "id": "col-real-estate-{today}",
      "title": "기사 제목",
      "category": "real-estate",
      "author": "저자명 (가상 인물 괜찮음)",
      "authorTitle": "저자 직함",
      "date": "{today}",
      "region": "경기도",
      "summary": "1~2문장 요약 (목록 화면 카드 미리보기용)",
      "sections": [
        {{"heading": "시장 동향", "body": "3~5문장. 가격대별로 어떤 지역들을 골랐는지, 최근 시장 동향, 지역별 특징 설명"}},
        {{"heading": "배경 분석", "body": "3~5문장. 이런 흐름이 나타나는 원인/배경"}},
        {{"heading": "전망과 시사점", "body": "3~5문장. 향후 전망과 투자자에게 주는 시사점"}}
      ],
      "outlook": "positive 또는 neutral 또는 negative",
      "readTime": 5
    }},
    {{
      "id": "col-stocks-{today}",
      "title": "기사 제목",
      "category": "stocks",
      "author": "저자명",
      "authorTitle": "저자 직함",
      "date": "{today}",
      "ticker": "{stock_ticker}",
      "summary": "1~2문장 요약 (목록 화면 카드 미리보기용)",
      "sections": [
        {{"heading": "시장 동향", "body": "3~5문장. 최근 실적/이슈, 업종 동향, 경쟁 구도"}},
        {{"heading": "배경 분석", "body": "3~5문장. 이런 흐름이 나타나는 원인/배경"}},
        {{"heading": "전망과 시사점", "body": "3~5문장. 향후 전망과 투자자에게 주는 시사점"}}
      ],
      "outlook": "positive 또는 neutral 또는 negative",
      "readTime": 6
    }}
  ]
}}

부동산 칼럼은 chartData 필드를 포함하지 마라 (스크립트가 실제 API 데이터로 채워 넣는다). 주식 칼럼의 chartData는 위 스키마대로 작성하되, 검색으로 확인되지 않는 달은 절대 추정하지 말고 생략해라."""


def get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        print("[!] ANTHROPIC_API_KEY를 찾을 수 없습니다.")
        sys.exit(1)
    return key


def format_real_estate_table(chart_data: list[dict]) -> str:
    """중앙값(대표값) 위주로 요약. 괄호 안은 그 달의 최소~최대 실거래 범위와 거래건수."""
    lines = []
    for entry in chart_data:
        points = ", ".join(
            f"{p['label']}={p['median']}억(범위 {p['min']}~{p['max']}억, {p['count']}건)"
            for p in entry["data"]
        )
        lines.append(f"- {entry['area']}: {points}")
    return "\n".join(lines)


def format_stock_table(stock_info: dict) -> str:
    chart = stock_info["chartData"][0]
    points = ", ".join(f"{p['label']}={p['value']}" for p in chart["data"])
    return f"- {chart['unit']}: {points}"


STOCK_PICK_PROMPT = """오늘 날짜: {today}

국내(코스피/코스닥) 또는 해외(미국 등) 상장 종목 중 오늘 투자자들이 관심 가질 만한 종목 1개를
웹 검색으로 골라줘. 아래 JSON 형식으로만 답변해줘. JSON 외 다른 텍스트는 포함하지 마세요.

{{
  "name": "종목명 (예: SK하이닉스)",
  "yahoo_ticker": "야후 파이낸스 티커 형식",
  "reason": "선정 이유 1문장"
}}

- 국내 코스피 종목은 종목코드 뒤에 .KS (예: 삼성전자 -> 005930.KS)
- 국내 코스닥 종목은 .KQ (예: 에코프로 -> 086520.KQ)
- 해외(미국) 종목은 티커 그대로 (예: NVDA, AAPL)
- 최근에 고른 종목: {recent_picks} - 이 중 하나를 반복 선정하지 마라. 단, 실적 발표·급등락처럼
  오늘 특별히 다룰만한 큰 이슈가 있다면 예외적으로 반복 선정해도 된다."""


def pick_stock(client: anthropic.Anthropic, target_date: date):
    """오늘의 관심 종목을 웹 검색으로 고름. 실패 시 (None, None) - stock_api의 fallback이 처리."""
    try:
        recent_picks = load_recent_picks(5)
        recent_text = ", ".join(recent_picks) if recent_picks else "없음"
        messages = [{"role": "user", "content": STOCK_PICK_PROMPT.format(today=target_date, recent_picks=recent_text)}]
        tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}]
        response = client.messages.create(model=MODEL, max_tokens=2000, tools=tools, messages=messages)
        text = "".join(b.text for b in response.content if b.type == "text")
        start, end = text.find("{"), text.rfind("}") + 1
        if start == -1 or end == 0:
            return None, response
        return json.loads(text[start:end]), response
    except Exception as e:
        print(f"[!] 종목 선정 실패, fallback 종목 사용: {e}")
        return None, None


def generate(client: anthropic.Anthropic, target_date: date, real_estate_table: str,
             stock_name: str, stock_ticker: str, stock_table: str):
    messages = [{"role": "user", "content": PROMPT.format(
        today=target_date,
        real_estate_table=real_estate_table,
        stock_name=stock_name,
        stock_ticker=stock_ticker,
        stock_table=stock_table,
    )}]
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 8}]

    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=20000,
            tools=tools,
            messages=messages,
        )
        if response.stop_reason == "pause_turn":
            # 서버사이드 툴 반복 한도(10회) 도달 - 재요청하면 이어서 진행됨
            messages.append({"role": "assistant", "content": response.content})
            continue
        break

    # 웹서치 사용 시 응답이 여러 개의 text 블록으로 나뉘어 오므로 전부 이어붙여야 함
    text = "".join(b.text for b in response.content if b.type == "text")
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise RuntimeError("응답에서 JSON을 찾을 수 없습니다")
    return json.loads(text[start:end]), response


def deploy(target_date: date) -> None:
    print("[*] GitHub 배포 중...")
    subprocess.run(["git", "pull", "--rebase", "origin", "main"], cwd=str(ROOT))
    subprocess.run(["git", "add", "investment/daily.json"], cwd=str(ROOT))
    msg = f"auto: update investment {target_date}"
    r1 = subprocess.run(["git", "commit", "-m", msg], cwd=str(ROOT))
    if r1.returncode != 0:
        print("[*] 커밋할 변경 없음 - 배포 생략")
        return
    result = subprocess.run(["git", "push"], cwd=str(ROOT))
    if result.returncode == 0:
        print("[+] GitHub 배포 완료")
    else:
        print("[!] GitHub 배포 실패 (returncode:", result.returncode, ")")


def main(target_date: date = None):
    if target_date is None:
        target_date = date.today()

    molit_key = get_molit_api_key()
    print(f"[*] {target_date} 경기도 20개 지역 실거래가 조회 중 (국토교통부 API)...")
    real_estate_chart_data = get_all_areas_chart_data(target_date, molit_key)
    if not real_estate_chart_data:
        raise RuntimeError("국토교통부 API에서 실거래 데이터를 하나도 가져오지 못했습니다")
    print(f"[+] 실거래 데이터 확보: {len(real_estate_chart_data)}개 지역")

    client = anthropic.Anthropic(api_key=get_api_key())

    print(f"[*] {target_date} 오늘의 관심 종목 선정 중 (웹 검색)...")
    picked, pick_response = pick_stock(client, target_date)
    stock_info = pick_and_fetch_stock(target_date, picked)
    print(f"[+] 종목: {stock_info['name']} ({stock_info['ticker']})")

    print(f"[*] {target_date} 투자 칼럼 생성 중 (웹 검색)...")
    real_estate_table = format_real_estate_table(real_estate_chart_data)
    stock_table = format_stock_table(stock_info)
    data, main_response = generate(
        client, target_date, real_estate_table,
        stock_info["name"], stock_info["ticker"], stock_table,
    )

    # 실제 검색으로 인용된 사이트만 모아 출처 문자열 구성 (Claude 자체 요약 문구는 사용하지 않음)
    cited_domains = extract_cited_sites(main_response)
    if pick_response is not None:
        cited_domains = list(dict.fromkeys(cited_domains + extract_cited_sites(pick_response)))
    real_estate_source = friendly_source(cited_domains, "국토교통부 실거래가 공개시스템")
    stock_source = friendly_source(cited_domains, "야후 파이낸스")

    # chartData/source는 Claude 응답을 신뢰하지 않고 실제 데이터로 강제 치환
    for column in data.get("columns", []):
        if column.get("category") == "real-estate":
            column["chartData"] = real_estate_chart_data
            column["source"] = real_estate_source
        elif column.get("category") == "stocks":
            column["chartData"] = stock_info["chartData"]
            column["ticker"] = stock_info["ticker"]
            column["source"] = stock_source

    column_count = len(data.get("columns", []))
    print(f"[+] 칼럼 {column_count}개 생성 완료")

    OUTPUT_JSON.parent.mkdir(exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[+] daily.json 저장: {OUTPUT_JSON}")

    deploy(target_date)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        from datetime import datetime
        d = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
        main(d)
    else:
        main()
