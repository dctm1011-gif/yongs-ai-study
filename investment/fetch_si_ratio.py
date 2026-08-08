"""용인시/성남시 전체 SGG 코드 탐색 및 비율 조회"""
import json, urllib.parse, urllib.request, os, sys

TBL_ID = "DT_1OH0407"
ORG_ID = "101"

def fetch_region(sgg_code, api_key):
    params = {
        "method": "getList", "apiKey": api_key,
        "itmId": "T001", "objL1": sgg_code, "objL2": "ALL",
        "format": "json", "jsonVD": "Y", "prdSe": "Y",
        "startPrdDe": "2016", "endPrdDe": "2024",
        "orgId": ORG_ID, "tblId": TBL_ID,
    }
    url = "https://kosis.kr/openapi/Param/statisticsParameterData.do?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=20) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    if isinstance(rows, dict):
        return None, str(rows)
    by_year_total, by_year_single = {}, {}
    for row in rows:
        year, c2, dt = row["PRD_DE"], row["C2"], int(row["DT"])
        if c2 == "000": by_year_total[year] = dt
        elif c2 == "010": by_year_single[year] = dt
    result = {}
    for year, total in by_year_total.items():
        single = by_year_single.get(year)
        if single and total:
            result[int(year)] = round((total - single) / total * 100, 1)
    return result, None

api_key = os.environ.get("KOSIS_API_KEY", "")
if not api_key:
    print("KOSIS_API_KEY 없음"); sys.exit(1)

candidates = {
    "성남시": ["31020", "3102", "31021"],
    "용인시": ["31190", "3119", "31191"],
}
for city, codes in candidates.items():
    for code in codes:
        result, err = fetch_region(code, api_key)
        if result:
            vals = [result.get(y) for y in range(2016, 2025)]
            print(f"{city} (SGG={code}): {vals}")
            break
        else:
            print(f"{city} (SGG={code}): ERR={err[:100]}")
