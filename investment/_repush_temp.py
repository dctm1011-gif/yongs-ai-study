import json
from datetime import date

from generate_investment import _push_to_firebase_direct
import push_region_charts as prc

today = date.today()
print(f"[*] {today} 오늘의 daily.json 재업로드 시작 (재수집 없이 기존 데이터 사용)")

# 1) columns/termOfDay/newsArticles/dongCharts/taxPolicy/jongbuse 번들
_push_to_firebase_direct(today)

# 2) regionCharts (별도 경로) - daily.json에서 그대로 읽어서 재사용, API 재호출 없음
with open("daily.json", encoding="utf-8") as f:
    daily = json.load(f)
region_charts = daily.get("regionCharts", [])
print(f"[*] regionCharts {len(region_charts)}개 Firebase 업로드 중...")
prc.push_to_firebase(str(today), region_charts)
