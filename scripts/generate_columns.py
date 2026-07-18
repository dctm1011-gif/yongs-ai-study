#!/usr/bin/env python3
"""
Investment Column Auto-Generation Script
매일 자동으로 22개의 투자 칼럼을 생성합니다:
- 서울 부동산 종합 분석 1개
- 경기권 지역별 분석 20개 (강남, 송파, 성남 분당 등)
- 주식 시장 분석 1개
"""

import json
import os
import sys
from datetime import datetime
from anthropic import Anthropic

# 설정
API_KEY = os.environ.get('ANTHROPIC_API_KEY')
if not API_KEY:
    print("ERROR: ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.")
    sys.exit(1)

client = Anthropic()

# 경기권 20개 지역
GYEONGGI_REGIONS = [
    "강남구", "송파구", "강동구", "서초구", "관악구",
    "성남시 분당", "성남시 수정", "성남시 중원",
    "수원시", "용인시", "부천시", "고양시", "파주시",
    "화성시", "평택시", "시흥시", "안산시",
    "광주시", "의왕시", "오산시"
]

def parse_json_response(text):
    """JSON 응답을 파싱합니다. 마크다운 코드블록이 있으면 제거"""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())

def generate_seoul_column():
    """서울 부동산 시장 전체 리포트 생성"""
    print("  📍 서울 종합 분석 생성 중...")

    prompt = """서울 부동산 시장 전체를 분석해줘.

## 분석 기준
- 강남, 서초, 종로, 마포, 은평 등 주요 지역의 트렌드
- 평균 거래가 및 전세가 동향
- 금주 주요 뉴스 및 시장 변화

## 응답 형식 (반드시 JSON으로만 응답)
{
  "title": "서울 부동산 시장 리포트 - 2026-07-18",
  "summary": "한 문장 요약 (30-50자)",
  "content": "상세 분석 (3-4단락, 각 단락 50-80자)",
  "analysis": "투자 포인트 3개 (각각 한 줄씩)",
  "outlook": "positive"
}

반드시 JSON 형식만 출력해."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )

        data = parse_json_response(message.content[0].text)
        return {
            "id": f"{datetime.now().strftime('%Y-%m-%d')}-seoul-overview",
            "title": data.get("title", "[서울] 부동산 시장 리포트"),
            "category": "real-estate",
            "region": "서울",
            "regionType": "overview",
            "author": "Real Estate Analyst",
            "authorTitle": "Market Analyst (AI)",
            "date": datetime.now().strftime('%Y-%m-%d'),
            "summary": data.get("summary", "서울 부동산 시장 분석"),
            "content": data.get("content", ""),
            "analysis": data.get("analysis", ""),
            "outlook": data.get("outlook", "neutral"),
            "readTime": 5,
            "generated": True
        }
    except Exception as e:
        print(f"  ⚠️ 서울 칼럼 생성 실패: {str(e)}")
        return None

def generate_gyeonggi_column(region):
    """경기권 지역별 칼럼 생성"""
    prompt = f"""경기도 {region}의 부동산 시장을 상세히 분석해줘.

## 분석 항목
1. 주요 주택 유형 (아파트/빌라/타운하우스)
2. 가격 추세 (상승/하락/보합)
3. 투자 매력도 평가
4. 향후 3개월 전망

## 응답 형식 (반드시 JSON으로만 응답)
{{
  "title": "{region} 부동산 시장 분석 - 2026-07-18",
  "summary": "한 문장 요약 (30-50자)",
  "content": "상세 분석 (2-3단락, 각 단락 50-80자)",
  "analysis": "투자 포인트 2-3개 (각각 한 줄씩)",
  "outlook": "positive"
}}

반드시 JSON 형식만 출력해."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}]
        )

        data = parse_json_response(message.content[0].text)
        return {
            "id": f"{datetime.now().strftime('%Y-%m-%d')}-gyeonggi-{region}",
            "title": data.get("title", f"[{region}] 부동산 분석"),
            "category": "real-estate",
            "region": "경기도",
            "regionType": "detailed",
            "district": region,
            "author": "Real Estate Analyst",
            "authorTitle": "Market Analyst (AI)",
            "date": datetime.now().strftime('%Y-%m-%d'),
            "summary": data.get("summary", ""),
            "content": data.get("content", ""),
            "analysis": data.get("analysis", ""),
            "outlook": data.get("outlook", "neutral"),
            "readTime": 4,
            "generated": True
        }
    except Exception as e:
        print(f"  ⚠️ {region} 칼럼 생성 실패: {str(e)}")
        return None

def generate_stock_column():
    """주식 시장 칼럼 생성"""
    print("  📈 주식 시장 분석 생성 중...")

    prompt = """오늘의 한국 주식 시장을 분석해줘.

## 분석 내용
1. KOSPI 지수 및 외국인 매매 동향
2. 기관 투자자 동향
3. 주요 종목 분석 (삼성전자, SK하이닉스, LG화학, 현대차 중 2-3개)
4. 시장 심리 및 향후 전망

## 응답 형식 (반드시 JSON으로만 응답)
{
  "title": "오늘의 시장 분석 - 2026-07-18",
  "summary": "한 문장 요약 (30-50자)",
  "content": "시장 분석 (3-4단락, 각 단락 60-100자)",
  "analysis": "투자 포인트 3개 (각각 한 줄씩)",
  "outlook": "positive"
}

반드시 JSON 형식만 출력해."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )

        data = parse_json_response(message.content[0].text)
        return {
            "id": f"{datetime.now().strftime('%Y-%m-%d')}-stocks",
            "title": data.get("title", "오늘의 시장 분석"),
            "category": "stocks",
            "author": "Stock Market Analyst",
            "authorTitle": "Market Analyst (AI)",
            "date": datetime.now().strftime('%Y-%m-%d'),
            "summary": data.get("summary", ""),
            "content": data.get("content", ""),
            "analysis": data.get("analysis", ""),
            "outlook": data.get("outlook", "neutral"),
            "readTime": 6,
            "generated": True
        }
    except Exception as e:
        print(f"  ⚠️ 주식 칼럼 생성 실패: {str(e)}")
        return None

def generate_all_columns():
    """모든 칼럼 생성"""
    print("\n" + "="*60)
    print("🚀 Investment 칼럼 자동화 시작")
    print("="*60)

    columns = []

    # 서울 칼럼 (1개)
    print("\n📍 부동산 칼럼 생성:")
    seoul = generate_seoul_column()
    if seoul:
        columns.append(seoul)

    # 경기권 칼럼 (20개)
    print(f"\n📍 경기권 지역별 분석 생성 중 ({len(GYEONGGI_REGIONS)}개)...")
    for idx, region in enumerate(GYEONGGI_REGIONS, 1):
        print(f"  [{idx:2d}/{len(GYEONGGI_REGIONS)}] {region} 분석 중...", end=" ", flush=True)
        gyeonggi = generate_gyeonggi_column(region)
        if gyeonggi:
            columns.append(gyeonggi)
            print("✅")
        else:
            print("❌")

    # 주식 칼럼 (1개)
    print("\n📈 주식 시장:")
    stock = generate_stock_column()
    if stock:
        columns.append(stock)

    # columns.json 저장
    output_path = "netlify/data/columns.json"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    data = {
        "columns": columns,
        "lastGenerated": datetime.now().isoformat() + "Z",
        "version": "1.0",
        "totalCount": len(columns)
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("\n" + "="*60)
    print(f"✅ 완료! {len(columns)}개 칼럼 생성됨")
    print(f"📁 저장 위치: {output_path}")
    print(f"⏰ 생성 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60 + "\n")

    return len(columns)

if __name__ == "__main__":
    try:
        count = generate_all_columns()
        if count > 0:
            print("✨ 스크립트 정상 종료")
            sys.exit(0)
        else:
            print("⚠️ 생성된 칼럼이 없습니다")
            sys.exit(1)
    except Exception as e:
        print(f"❌ 오류 발생: {str(e)}")
        sys.exit(1)
