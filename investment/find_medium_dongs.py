"""
2026년 7월 기준 동별 중앙값이 6억~8억 사이인 동 찾기.
단일 월 조회라 빠름 (35개 구 × 1개월 = 35 API 호출).
"""
import json
import os
from datetime import date

from realestate_api import (
    REGION_CODES, _lawd_codes, fetch_trades,
    summarize_trades, get_molit_api_key, DONG_MIN_TRADES,
)

DEAL_YMD = "202607"
MEDIAN_MIN = 6.0  # 억원
MEDIAN_MAX = 8.0  # 억원


def main():
    key = get_molit_api_key()
    results = []

    for area, config in REGION_CODES.items():
        si = config.get("si", area)
        gu = config.get("gu")
        label = gu if gu else si
        print(f"[*] {si} {label} 조회 중...", end=" ", flush=True)

        trades = []
        try:
            for lawd_cd in _lawd_codes(config):
                trades.extend(fetch_trades(lawd_cd, DEAL_YMD, key))
        except Exception as e:
            print(f"실패: {e}")
            continue

        print(f"{len(trades)}건")

        # 동별 집계
        by_dong: dict[str, list] = {}
        for t in trades:
            dong = t.get("umdNm", "").strip()
            if dong:
                by_dong.setdefault(dong, []).append(t)

        for dong, dong_trades in by_dong.items():
            if len(dong_trades) < DONG_MIN_TRADES:
                continue
            s = summarize_trades(dong_trades)
            if s and MEDIAN_MIN <= s["median"] <= MEDIAN_MAX:
                results.append({
                    "area": area,
                    "si": si,
                    "gu": gu,
                    "label": label,
                    "dongName": dong,
                    "displayLabel": f"{si} {label} {dong}" if gu else f"{si} {dong}",
                    "median": s["median"],
                    "count": s["count"],
                })

    results.sort(key=lambda x: x["median"])
    print(f"\n=== 6억~8억 중앙값 동 ({len(results)}개) ===")
    for r in results:
        print(f"  {r['displayLabel']:30s}  중앙값 {r['median']}억  ({r['count']}건)")

    out_path = os.path.join(os.path.dirname(__file__), "medium_dongs_2607.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n[+] 저장: {out_path}")


if __name__ == "__main__":
    main()
