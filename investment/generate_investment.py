"""
투자 칼럼 자동 생성
Claude API 웹서치 툴로 오늘자 부동산/주식 뉴스를 검색하고
investment/daily.json으로 저장 (netlify/functions/investment-daily.mjs가 읽어서 Firebase에 업로드)
매일 Task Scheduler로 자동 실행
"""
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import anthropic

from realestate_api import get_all_areas_chart_data, get_dong_comparison_data, get_molit_api_key
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


def strip_citations(text: str) -> str:
    """웹검색 응답에서 <cite> 태그 제거."""
    return re.sub(r'</?cite[^>]*>', '', text).strip()


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

TERM_PROMPT = """오늘 날짜: {today}

웹 검색으로 요즘 한국 부동산 시장에서 자주 등장하는 정책·용어 중 하나를 골라줘.
최근 뉴스나 정책 변화와 연관된 용어를 우선으로 해줘.
아래 용어들은 이미 다뤘으니 절대 선택하지 마: {used_terms}
JSON만 출력. JSON 외 텍스트 포함 금지.

{{
  "term": "용어명 (짧고 명확하게)",
  "fullName": "풀 이름 (영문 약자면 한국어 전체 이름 병기, 예: LTV → 주택담보대출비율)",
  "definition": "2~3문장. 무엇인지, 어떻게 쓰이는지 설명",
  "example": "실생활 예시 1문장 (구체적 수치나 상황 포함)",
  "relatedPolicy": "관련 정책·규정 1~2문장",
  "category": "금융정책 또는 부동산세제 또는 청약제도 또는 대출규제 또는 시장분석 중 하나",
  "tip": "실수요자·투자자 핵심 팁 1문장"
}}"""

NEWS_PROMPT = """오늘 날짜: {today}

웹 검색으로 최근 한국 부동산·주식·경제 관련 뉴스 기사 3개를 찾아줘.
제목과 출처는 실제 검색 결과 그대로 가져와라. JSON만 출력. JSON 외 텍스트 포함 금지.

{{
  "articles": [
    {{
      "title": "실제 기사 제목",
      "source": "출처 이름 (한국경제/매일경제/조선비즈/연합뉴스/뉴스1/한겨레 등)",
      "summary": "기사 핵심 2~3문장 요약. 투자자 관점 시사점 포함",
      "category": "real-estate 또는 stocks 또는 economy 중 하나",
      "publishedAt": "{today}"
    }}
  ]
}}

선택 기준:
- 오늘 또는 최근 2~3일 기사 우선
- 투자자에게 실질적으로 도움이 되는 내용
- 부동산 1~2개, 주식·경제 1~2개 균형 있게 구성"""

TAX_POLICY_PROMPT = """오늘 날짜: {today}

웹 검색으로 최근 한국 양도소득세 관련 정책 동향을 검색해줘. 아래 세 가지 주제를 중심으로 찾아줘:
1. 다주택자 양도세 중과세율 현황 및 단계별 완화/재개 일정 (2026~2029)
2. 장기보유특별공제 → 장기거주소득공제 전환 내용 (거주기간 기준 공제 방식 변경)
3. 최근 양도세 관련 정책 개편 논의나 뉴스

검색 결과를 바탕으로 현재 양도세 정책 방향을 4~6문장으로 요약해줘.
JSON만 출력. JSON 외 텍스트 포함 금지.

{{
  "text": "현재 양도세 정책 방향 요약 (4~6문장). 중과세율 단계별 일정, 장기보유공제 방식 변화, 실수요자·투자자 시사점 순으로 작성.",
  "updatedAt": "{today}"
}}

요약 작성 기준:
- 양도세 중과가 재개됐는지, 단계별 세율(2주택/3주택) 구체적으로 언급
- 장기거주소득공제 전환으로 달라지는 점 1~2문장
- 실수요자·투자자 관점의 시사점으로 마무리
- 확인되지 않은 내용은 추정하지 말 것"""


def generate_tax_policy_summary(client: anthropic.Anthropic, target_date: date) -> dict | None:
    """최근 양도세 정책 방향을 뉴스 검색 기반으로 요약. 실패 시 None 반환."""
    try:
        messages = [{"role": "user", "content": TAX_POLICY_PROMPT.format(today=target_date)}]
        tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 4}]
        while True:
            response = client.messages.create(model=MODEL, max_tokens=2000, tools=tools, messages=messages)
            if response.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue
            break
        text = "".join(b.text for b in response.content if b.type == "text")
        start, end = text.find("{"), text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("JSON not found in response")
        result = json.loads(text[start:end])
        result["text"] = strip_citations(result.get("text", ""))
        result["updatedAt"] = str(target_date)
        return result
    except Exception as e:
        print(f"[!] 양도세 정책 요약 생성 실패 (무시): {e}")
        return None


JONGBUSE_POLICY_PROMPT = """오늘 날짜: {today}

웹 검색으로 최근 한국 종합부동산세(종부세) 정책 동향에 관한 뉴스를 2~3건 찾아줘.
세율 개편안, 공정시장가액비율 변경, 과세 기준 조정, 다주택자 세부담 등을 중심으로 검색해.
검색 결과를 바탕으로 현재 종부세 정책 방향을 3~5문장으로 요약해줘.
JSON만 출력. JSON 외 텍스트 포함 금지.

{{
  "text": "현재 종부세 정책 방향 요약 (3~5문장). 최근 개편 내용, 세율·과세기준 변화, 향후 방향성 순으로 작성.",
  "updatedAt": "{today}"
}}

요약 작성 기준:
- 최근 세제개편안이나 정책 변화 구체적으로 언급 (세율, 공제금액 등 수치 포함)
- 1주택자와 다주택자 영향 구분
- 실수요자·투자자 관점의 시사점으로 마무리
- 확인되지 않은 내용은 추정하지 말 것"""


def generate_jongbuse_summary(client: anthropic.Anthropic, target_date: date) -> dict | None:
    """최근 종합부동산세 정책 방향을 뉴스 검색 기반으로 요약. 실패 시 None 반환."""
    try:
        messages = [{"role": "user", "content": JONGBUSE_POLICY_PROMPT.format(today=target_date)}]
        tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}]
        while True:
            response = client.messages.create(model=MODEL, max_tokens=1500, tools=tools, messages=messages)
            if response.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue
            break
        text = "".join(b.text for b in response.content if b.type == "text")
        start, end = text.find("{"), text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("JSON not found in response")
        result = json.loads(text[start:end])
        result["text"] = strip_citations(result.get("text", ""))
        result["updatedAt"] = str(target_date)
        return result
    except Exception as e:
        print(f"[!] 종부세 정책 요약 생성 실패 (무시): {e}")
        return None


def _fetch_used_terms() -> list[str]:
    """Firebase에서 최근 30일간 사용된 용어 목록을 가져온다."""
    try:
        import urllib.request as _req
        DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"
        url = DB_URL + "/investment/columns.json?shallow=true"
        with _req.urlopen(url, timeout=8) as r:
            dates = list(json.loads(r.read().decode()).keys())
        terms = []
        for d in sorted(dates)[-30:]:
            url2 = DB_URL + f"/investment/columns/{d}/termOfDay/term.json"
            with _req.urlopen(url2, timeout=8) as r:
                t = json.loads(r.read().decode())
            if t and isinstance(t, str):
                terms.append(t)
        return list(dict.fromkeys(terms))  # 순서 유지 중복 제거
    except Exception as e:
        print(f"[!] 이전 용어 조회 실패 (무시): {e}")
        return []


def generate_term(client: anthropic.Anthropic, target_date: date) -> dict:
    """오늘의 부동산 용어를 웹 검색으로 생성. 실패 시 기본 용어 반환."""
    used_terms = _fetch_used_terms()
    used_str = ", ".join(used_terms) if used_terms else "없음"
    print(f"[*] 이전 용어 {len(used_terms)}개 제외: {used_str}")
    try:
        messages = [{"role": "user", "content": TERM_PROMPT.format(today=target_date, used_terms=used_str)}]
        tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}]
        while True:
            response = client.messages.create(model=MODEL, max_tokens=3000, tools=tools, messages=messages)
            if response.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue
            break
        text = "".join(b.text for b in response.content if b.type == "text")
        start, end = text.find("{"), text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("JSON not found in response")
        term = json.loads(text[start:end])
        term["date"] = str(target_date)
        return term
    except Exception as e:
        print(f"[!] 용어 생성 실패 ({type(e).__name__}: {e}), fallback 사용")
        return {
            "term": "LTV",
            "fullName": "주택담보대출비율 (Loan-to-Value Ratio)",
            "definition": "주택 담보 가치 대비 대출 가능한 최대 비율. 금융당국이 지역·상품별로 상한선을 규정한다.",
            "example": "5억짜리 아파트에 LTV 70% 적용 시 최대 3.5억까지 대출 가능.",
            "relatedPolicy": "투기과열지구 LTV 40%, 조정대상지역 50%, 비규제지역 70% 상한 적용.",
            "category": "대출규제",
            "tip": "LTV 한도 안에서도 DSR(총부채원리금상환비율) 기준을 함께 충족해야 실제 대출이 실행된다.",
            "date": str(target_date),
        }


def generate_news(client: anthropic.Anthropic, target_date: date) -> list[dict]:
    """최근 투자 관련 뉴스 기사 3개를 웹 검색으로 찾아 반환. 실패 시 빈 리스트."""
    try:
        messages = [{"role": "user", "content": NEWS_PROMPT.format(today=target_date)}]
        tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}]
        while True:
            response = client.messages.create(model=MODEL, max_tokens=3000, tools=tools, messages=messages)
            if response.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue
            break
        text = "".join(b.text for b in response.content if b.type == "text")
        start, end = text.find("{"), text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("JSON not found in response")
        data = json.loads(text[start:end])
        articles = data.get("articles", [])
        for i, a in enumerate(articles):
            a["id"] = f"news-{i + 1}-{target_date}"
            a.setdefault("publishedAt", str(target_date))
        return articles
    except Exception as e:
        print(f"[!] 뉴스 생성 실패, fallback 사용: {e}")
        return []


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


NETLIFY_INVESTMENT_URL = "https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/investment-daily"


def _trigger_netlify_investment(target_date: date, wait_sec: int = 300) -> None:
    """git push 후 Netlify 빌드 완료를 기다렸다가 investment-daily 함수를 직접 트리거.

    Netlify 스케줄(06:00 KST)이 daily.json 생성(06:52 KST)보다 먼저 실행되는
    타이밍 문제를 막기 위해, 스크립트 실행 직후 Firebase에 덮어씀.
    """
    import time
    import urllib.request as _ur

    print(f"[*] Netlify 빌드 완료 대기 중 ({wait_sec}초)...")
    time.sleep(wait_sec)

    try:
        req = _ur.Request(NETLIFY_INVESTMENT_URL, data=b"{}", method="POST")
        req.add_header("Content-Type", "application/json")
        with _ur.urlopen(req, timeout=60) as resp:
            body = resp.read().decode()
            print(f"[+] investment-daily 트리거 완료 ({resp.status}): {body}")
    except Exception as e:
        print(f"[!] investment-daily 트리거 실패: {e}")


def _load_env_vars() -> dict:
    """프로젝트 루트 .env 파일에서 Firebase 환경변수 로드."""
    env = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def _push_to_firebase_direct(target_date: date) -> None:
    """daily.json을 Firebase Realtime Database에 직접 업로드.
    Netlify 빌드 타이밍에 의존하지 않고 즉시 반영.
    """
    env = _load_env_vars()
    script = f"""
const {{ initializeApp, getApps }} = require('firebase/app');
const {{ getDatabase, ref, set }} = require('firebase/database');
const fs = require('fs');
const config = {{
  apiKey: '{env.get("EXPO_PUBLIC_FIREBASE_API_KEY", os.environ.get("EXPO_PUBLIC_FIREBASE_API_KEY", ""))}',
  authDomain: '{env.get("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", os.environ.get("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", ""))}',
  databaseURL: '{env.get("EXPO_PUBLIC_FIREBASE_DATABASE_URL", os.environ.get("EXPO_PUBLIC_FIREBASE_DATABASE_URL", ""))}',
  projectId: '{env.get("EXPO_PUBLIC_FIREBASE_PROJECT_ID", os.environ.get("EXPO_PUBLIC_FIREBASE_PROJECT_ID", ""))}',
}};
const app = getApps().length ? getApps()[0] : initializeApp(config);
const db = getDatabase(app);
const daily = JSON.parse(fs.readFileSync('{str(OUTPUT_JSON).replace(chr(92), "/")}', 'utf-8'));
const data = {{
  columns: daily.columns,
  termOfDay: daily.termOfDay || null,
  newsArticles: daily.newsArticles || [],
  dongCharts: daily.dongCharts || [],
  timestamp: new Date().toISOString(),
  date: '{target_date}',
  count: daily.columns.length,
}};
set(ref(db, 'investment/columns/{target_date}'), data)
  .then(() => {{ console.log('[+] Firebase 직접 업로드 완료 - term:', daily.termOfDay?.term); process.exit(0); }})
  .catch(e => {{ console.error('[!] Firebase 업로드 실패:', e.message); process.exit(1); }});
"""
    try:
        result = subprocess.run(
            ["node", "-e", script],
            cwd=str(ROOT),
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            print(result.stdout.strip())
        else:
            print(f"[!] Firebase 직접 업로드 실패: {result.stderr.strip()}")
    except Exception as e:
        print(f"[!] Firebase 직접 업로드 예외: {e}")


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

    print(f"[*] {target_date} 수지/동탄 동별 실거래가 조회 중...")
    dong_charts = get_dong_comparison_data(target_date, molit_key)
    print(f"[+] 동별 데이터 확보: {len(dong_charts)}개 지역")

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

    print(f"[*] {target_date} 오늘의 부동산 용어 생성 중...")
    term = generate_term(client, target_date)
    print(f"[+] 용어: {term.get('term')}")
    data["termOfDay"] = term

    print(f"[*] {target_date} 뉴스 큐레이션 중 (웹 검색)...")
    news_articles = generate_news(client, target_date)
    print(f"[+] 뉴스 기사: {len(news_articles)}개")
    data["newsArticles"] = news_articles
    data["dongCharts"] = dong_charts

    print(f"[*] {target_date} 양도세 정책 방향 요약 생성 중 (웹 검색)...")
    tax_policy_summary = generate_tax_policy_summary(client, target_date)
    print(f"[+] 양도세 정책 요약 완료" if tax_policy_summary else f"[!] 양도세 정책 요약 실패 (null로 저장)")
    data["taxPolicySummary"] = tax_policy_summary

    print(f"[*] {target_date} 종합부동산세 정책 방향 요약 생성 중 (웹 검색)...")
    jongbuse_summary = generate_jongbuse_summary(client, target_date)
    print(f"[+] 종부세 정책 요약 완료" if jongbuse_summary else f"[!] 종부세 정책 요약 실패 (null로 저장)")
    data["jongbuseSummary"] = jongbuse_summary

    OUTPUT_JSON.parent.mkdir(exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[+] daily.json 저장: {OUTPUT_JSON}")

    deploy(target_date)
    _push_to_firebase_direct(target_date)  # 즉시 반영 (1차)
    _trigger_netlify_investment(target_date)  # 5분 대기 후 Netlify 트리거
    _push_to_firebase_direct(target_date)  # Netlify가 혹시 덮어썼을 경우 재보정 (2차)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        from datetime import datetime
        d = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
        main(d)
    else:
        main()
