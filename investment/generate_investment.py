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

import anthropic

ROOT = Path(__file__).parent.parent
OUTPUT_JSON = ROOT / "investment" / "daily.json"

MODEL = "claude-haiku-4-5-20251001"

PROMPT = """오늘 날짜: {today}

아래 두 가지를 웹 검색으로 조사한 뒤, 투자 칼럼 2개를 JSON으로만 작성해줘. JSON 외 다른 텍스트는 포함하지 마세요.

1. 부동산: 경기도 아파트 시장. 경기도 내에서 가격대가 서로 다른 지역 20곳을 직접 골라줘
   (예: 판교/분당/광교처럼 비싼 곳, 용인/수지/동탄/기흥처럼 중간대, 그 외 중저가 지역까지 골고루 섞어서
   가격 스펙트럼을 대표할 수 있게). 각 지역의 최근 5개월 아파트 평균 매매가 추이를 조사·추정해줘.
   ⚠️ 월별 수치는 실제 시장처럼 자연스러운 오르내림이 있어야 함 — 매달 똑같이 조금씩만 증가하는
   기계적인 패턴(예: 18.1→18.4→18.6→19.0→19.3처럼 단조로운 증가) 금지. 어떤 달은 크게 오르고
   어떤 달은 보합/소폭 하락하는 등 실제 시세처럼 변동폭에 차이를 줘. 소수점 첫째자리까지 구체적으로.
2. 주식: 오늘 관심 있는 국내/해외 종목 1개의 최근 주가 동향. 이것도 매달 일정하게 증가하는 패턴이
   아니라 실제 주가처럼 상승/하락이 섞인 자연스러운 흐름으로.

JSON 형식 (정확히 이 스키마를 따를 것):
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
      "readTime": 5,
      "source": "실제 검색으로 확인한 구체적 출처 (기관명 + 어떤 자료인지 명시. 예: 'KB부동산 리브온 월간 아파트 시세동향 (2026년 7월)', '국토교통부 실거래가 공개시스템 - 경기도 아파트 매매 실거래가')",
      "chartData": [
        {{
          "area": "판교",
          "title": "판교 아파트 평균 매매가 추이",
          "unit": "단위: 억원",
          "data": [
            {{"label": "3월", "value": 18.1}},
            {{"label": "4월", "value": 18.4}},
            {{"label": "5월", "value": 18.6}},
            {{"label": "6월", "value": 19.0}},
            {{"label": "7월", "value": 19.3}}
          ]
        }},
        {{"area": "분당", "title": "분당 아파트 평균 매매가 추이", "unit": "단위: 억원", "data": [...5개월치...]}},
        {{"area": "용인", "...": "... (이런 식으로 총 20개 지역 항목)"}}
      ]
    }},
    {{
      "id": "col-stocks-{today}",
      "title": "기사 제목",
      "category": "stocks",
      "author": "저자명",
      "authorTitle": "저자 직함",
      "date": "{today}",
      "ticker": "종목코드 또는 티커",
      "summary": "1~2문장 요약 (목록 화면 카드 미리보기용)",
      "sections": [
        {{"heading": "시장 동향", "body": "3~5문장. 최근 실적/이슈, 업종 동향, 경쟁 구도"}},
        {{"heading": "배경 분석", "body": "3~5문장. 이런 흐름이 나타나는 원인/배경"}},
        {{"heading": "전망과 시사점", "body": "3~5문장. 향후 전망과 투자자에게 주는 시사점"}}
      ],
      "outlook": "positive 또는 neutral 또는 negative",
      "readTime": 6,
      "source": "실제 검색으로 확인한 구체적 출처 (증권사명 + 어떤 자료인지 명시. 예: '신한투자증권 리서치센터 SK하이닉스 커버리지 리포트 (2026년 7월)')",
      "chartData": [
        {{
          "area": "종목명",
          "title": "종목명 주가 추이",
          "unit": "단위: 원",
          "data": [
            {{"label": "3월", "value": 68000}},
            {{"label": "4월", "value": 71500}},
            {{"label": "5월", "value": 75200}},
            {{"label": "6월", "value": 79800}},
            {{"label": "7월", "value": 84300}}
          ]
        }}
      ]
    }}
  ]
}}

부동산 칼럼의 chartData는 반드시 경기도 내 서로 다른 가격대의 지역 20개 항목이어야 해 (고가/중가/중저가 지역이 골고루 섞이도록). 각 항목의 실제 수치는 검색으로 확인한 값에 최대한 가깝게 추정해줘. 숫자를 모르면 최근 시세 기준으로 합리적으로 추정하되, 모든 chartData(부동산 20개 + 주식 1개)의 월별 수치는 절대 단조 증가/일정한 간격으로 만들지 말고 실제 시장처럼 변동성 있게 작성해줘."""


def get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        print("[!] ANTHROPIC_API_KEY를 찾을 수 없습니다.")
        sys.exit(1)
    return key


def generate(client: anthropic.Anthropic, target_date: date) -> dict:
    messages = [{"role": "user", "content": PROMPT.format(today=target_date)}]
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
    return json.loads(text[start:end])


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

    client = anthropic.Anthropic(api_key=get_api_key())

    print(f"[*] {target_date} 투자 칼럼 생성 중 (웹 검색)...")
    data = generate(client, target_date)

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
