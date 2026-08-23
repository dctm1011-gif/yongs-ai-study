#!/usr/bin/env python3
"""
경기도 중학교 특목고 진학률 크롤러
출처: 학교알리미 (schoolinfo.go.kr) — 졸업생 진로현황 공시 데이터
      NEIS Open API (open.neis.go.kr)  — 학교 목록 + 주소

실행 전 준비:
  1. pip install playwright requests
  2. playwright install chromium
  3. NEIS API 키 발급 (무료): https://open.neis.go.kr → 회원가입 → 인증키 신청
     .env 파일에 NEIS_API_KEY=발급받은키 추가

실행:
  python fetch_school_rankings.py

결과:
  school_rankings.json 생성 → Firebase /investment/schoolRankings 에 업로드
"""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from playwright.async_api import async_playwright, Page, Browser

# ── 환경변수 로드 ────────────────────────────────────────────
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

NEIS_KEY         = os.environ.get("NEIS_API_KEY", "demo")
FIREBASE_API_KEY = os.environ.get("FIREBASE_API_KEY", "")
DB_URL           = os.environ.get("EXPO_PUBLIC_FIREBASE_DATABASE_URL", "")

TARGET_YEAR  = "2023"   # 학교알리미 공시 연도 (최근 3년 제공)
OUTPUT_FILE  = Path(__file__).parent / "school_rankings.json"

# ── 1단계: NEIS API로 경기도 중학교 목록 조회 ─────────────────
def fetch_gyeonggi_middle_schools() -> list[dict]:
    """
    NEIS Open API — 학교기본정보
    경기도교육청 코드: J10
    응답 필드: SD_SCHUL_CODE, SCHUL_NM, ORG_RDNMA, ORG_RDNDA (지번주소)
    """
    url = "https://open.neis.go.kr/hub/schoolInfo"
    all_schools: list[dict] = []
    page_idx = 1

    while True:
        params = {
            "KEY":               NEIS_KEY,
            "Type":              "json",
            "pIndex":            page_idx,
            "pSize":             1000,
            "ATPT_OFCDC_SC_CODE": "J10",      # 경기도교육청
            "SCHUL_KND_SC_NM":   "중학교",
        }
        try:
            resp = requests.get(url, params=params, timeout=15)
            data = resp.json()
        except Exception as e:
            print(f"  NEIS API 오류: {e}")
            break

        # 오류 확인
        if "RESULT" in data:
            code = data["RESULT"].get("CODE", "")
            if code != "INFO-000":
                print(f"  NEIS API 응답 오류: {data['RESULT']}")
                print("  → https://open.neis.go.kr 에서 무료 API 키를 발급받아 .env에 NEIS_API_KEY=키 추가")
                break

        try:
            rows = data["schoolInfo"][1]["row"]
        except (KeyError, IndexError):
            break

        all_schools.extend(rows)
        if len(rows) < 1000:
            break
        page_idx += 1

    return all_schools


def parse_address(school: dict) -> tuple[str, str, str]:
    """학교 주소에서 (시, 구, 동) 파싱"""
    addr = school.get("ORG_RDNMA", "") or school.get("ORG_RDNDA", "")
    # 경기도 용인시 수지구 성복동 → ("용인시", "수지구", "성복동")
    parts = addr.split()
    # "경기도" 제거
    if parts and parts[0] == "경기도":
        parts = parts[1:]
    city = parts[0] if len(parts) > 0 else ""
    gu   = parts[1] if len(parts) > 1 else ""
    dong = parts[2] if len(parts) > 2 else ""
    # 구가 없는 도시(과천시, 오산시 등)
    if gu and not gu.endswith(("구", "군")):
        dong = gu
        gu   = ""
    return city, gu, dong


# ── 2단계: Playwright로 학교알리미 특목고 진학현황 크롤링 ─────────

ALIMI_URL = "https://www.schoolinfo.go.kr/ei/ss/pneiss_a05_s1.do"

async def select_option_by_text(page: Page, selector: str, text: str):
    """select 요소에서 텍스트로 옵션 선택"""
    await page.evaluate(
        f"""({{sel, txt}}) => {{
            const el = document.querySelector(sel);
            if (!el) return;
            for (const opt of el.options) {{
                if (opt.text.trim().includes(txt)) {{
                    el.value = opt.value;
                    el.dispatchEvent(new Event('change', {{bubbles: true}}));
                    break;
                }}
            }}
        }}""",
        {"sel": selector, "txt": text},
    )
    await page.wait_for_timeout(500)


async def crawl_special_admission(browser: Browser) -> list[dict]:
    """
    학교알리미 > 지역별 공시정보 > 특목고 진학현황 페이지
    경기도 중학교 전체 데이터를 한 번에 가져옴
    """
    page = await browser.new_page()
    results: list[dict] = []

    try:
        print(f"  {ALIMI_URL} 접속 중...")
        await page.goto(ALIMI_URL, wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(2000)

        # 연도 선택 (select 요소)
        year_selectors = ["select#SEARCH_YEAR", "select[name='SEARCH_YEAR']", "select#year"]
        for sel in year_selectors:
            if await page.query_selector(sel):
                await page.select_option(sel, TARGET_YEAR)
                await page.wait_for_timeout(500)
                break

        # 학교급: 중학교 라디오/체크박스 선택
        radio_selectors = [
            "input[type='radio'][value='3']",
            "input[type='radio'][value='중학교']",
            "label:has-text('중학교') input",
        ]
        for sel in radio_selectors:
            el = await page.query_selector(sel)
            if el:
                await el.click()
                await page.wait_for_timeout(500)
                break

        # 시도: 경기 선택
        sido_selectors = ["select#SIDO_CODE", "select[name='SIDO_CODE']", "select#sido"]
        for sel in sido_selectors:
            if await page.query_selector(sel):
                await select_option_by_text(page, sel, "경기")
                await page.wait_for_timeout(800)
                break

        # 조회 버튼 클릭
        search_selectors = [
            "button:has-text('조회')",
            "input[type='button'][value='조회']",
            "a:has-text('조회')",
            "#btnSearch",
        ]
        for sel in search_selectors:
            el = await page.query_selector(sel)
            if el:
                await el.click()
                await page.wait_for_load_state("networkidle")
                await page.wait_for_timeout(3000)
                break

        # 테이블 데이터 추출 — 여러 table 구조 시도
        table_data = await page.evaluate("""() => {
            const results = [];
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                const rows = table.querySelectorAll('tbody tr');
                if (rows.length < 5) continue;  // 너무 작은 테이블 무시
                for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
                    if (cells.length >= 4) {
                        results.push(cells);
                    }
                }
                if (results.length > 0) break;  // 데이터 있는 첫 테이블 사용
            }
            return results;
        }""")

        print(f"  테이블에서 {len(table_data)}개 행 발견")

        # 테이블 헤더 파악 (첫 행 확인)
        headers = await page.evaluate("""() => {
            const tables = document.querySelectorAll('table');
            for (const table of tables) {
                const ths = Array.from(table.querySelectorAll('thead th, thead td, tr:first-child th'));
                if (ths.length > 0) return ths.map(th => th.innerText.trim());
            }
            return [];
        }""")
        print(f"  헤더: {headers}")

        # 페이지 전체 텍스트에서 학교명 + 특목고 진학자 수 패턴 찾기
        # 보통 컬럼: 학교명 | 졸업자수 | 특목고진학 | 일반고진학 | ...
        for row in table_data:
            # 학교명이 있고 숫자가 포함된 행만
            if not row or len(row) < 4:
                continue
            school_name = row[0] if "중학교" in row[0] or "중" in row[0] else None
            if not school_name:
                continue
            # 졸업자 수와 특목고 진학자 수 파싱
            nums = []
            for cell in row[1:]:
                try:
                    nums.append(int(cell.replace(",", "").strip()))
                except ValueError:
                    nums.append(None)
            if nums:
                results.append({
                    "name":         school_name,
                    "raw_cells":    row,
                    "nums":         nums,
                })

    except Exception as e:
        print(f"  크롤링 오류: {e}")
        await page.screenshot(path="school_crawl_debug.png")
        print("  디버그 스크린샷 저장: school_crawl_debug.png")
    finally:
        await page.close()

    return results


async def crawl_individual_school(page: Page, schul_code: str) -> dict | None:
    """
    개별 학교 공시정보 페이지에서 졸업생 진로현황 추출
    (지역 통계 페이지로 못 가져올 경우 폴백)
    """
    # 학교알리미 학교 검색 → 공시정보
    url = f"https://www.schoolinfo.go.kr/ei/si/pneisi_b01_l0.do?schulCode={schul_code}&schulCrseScCode=3"
    try:
        await page.goto(url, wait_until="networkidle", timeout=20_000)
        await page.wait_for_timeout(1500)

        # "졸업생 진로현황" 탭/링크 클릭
        career_link = await page.query_selector(
            "a:has-text('졸업생 진로'), a:has-text('진로현황'), a[href*='career'], a[href*='jiro']"
        )
        if career_link:
            await career_link.click()
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(1500)

        # 특목고 진학자 수 텍스트 파싱
        content = await page.inner_text("body")
        # 예: "특목고  123" 또는 "특목고 진학 : 45명"
        match_special = re.search(r"특목고\s*[：:\s]+\s*(\d+)", content)
        match_grad    = re.search(r"졸업(생)?\s*(인원|자)?\s*[：:\s]+\s*(\d+)", content)

        special_count = int(match_special.group(1)) if match_special else None
        grad_count    = int(match_grad.group(3))    if match_grad    else None

        return {
            "schul_code":     schul_code,
            "special_count":  special_count,
            "grad_count":     grad_count,
        }
    except Exception as e:
        return None


# ── 3단계: Firebase 업로드 ────────────────────────────────────
def upload_to_firebase(data: dict):
    if not DB_URL or not FIREBASE_API_KEY:
        print("  Firebase 설정 없음, 스킵")
        return
    path  = "/investment/schoolRankings.json"
    url   = f"{DB_URL}{path}?auth={FIREBASE_API_KEY}"
    resp  = requests.put(url, json=data, timeout=15)
    print(f"  Firebase 업로드: {resp.status_code}")


# ── 메인 ──────────────────────────────────────────────────────
async def main():
    print("=" * 60)
    print("경기도 중학교 특목고 진학률 크롤러")
    print("=" * 60)

    # 1단계: NEIS API로 학교 목록
    print("\n[1/3] NEIS API — 경기도 중학교 목록 조회...")
    neis_schools = fetch_gyeonggi_middle_schools()
    print(f"  → {len(neis_schools)}개 학교")
    if not neis_schools:
        print("  NEIS API 실패. API 키를 확인하세요: https://open.neis.go.kr")
        print("  .env에 NEIS_API_KEY=발급키 추가 후 재실행")

    # 주소→(시/구/동) 매핑 테이블 만들기 (이름 기반)
    neis_map: dict[str, dict] = {}
    for s in neis_schools:
        name = s.get("SCHUL_NM", "")
        city, gu, dong = parse_address(s)
        neis_map[name] = {
            "code": s.get("SD_SCHUL_CODE", ""),
            "city": city,
            "gu":   gu,
            "dong": dong,
        }

    # 2단계: Playwright로 특목고 진학현황 크롤링
    print(f"\n[2/3] 학교알리미 — 특목고 진학현황 크롤링 (연도: {TARGET_YEAR})...")
    ranked: list[dict] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)  # 디버깅용: headless=True로 변경 가능

        # 우선 지역 통계 페이지 시도
        regional_data = await crawl_special_admission(browser)

        if regional_data:
            print(f"  지역 통계 페이지에서 {len(regional_data)}개 학교 데이터 수집")
            for entry in regional_data:
                name = entry["name"]
                nums = entry["nums"]
                # 컬럼 구조 추정: [졸업자, 특목고, 자사고, 일반고, ...]
                grad_count    = nums[0] if len(nums) > 0 and nums[0] else 0
                special_count = nums[1] if len(nums) > 1 and nums[1] else 0
                rate = round(special_count / grad_count * 100, 1) if grad_count and special_count else 0

                addr = neis_map.get(name, {})
                ranked.append({
                    "name":          name,
                    "grad_count":    grad_count,
                    "special_count": special_count,
                    "rate":          rate,
                    "city":          addr.get("city", ""),
                    "gu":            addr.get("gu", ""),
                    "dong":          addr.get("dong", ""),
                    "raw":           entry["raw_cells"],
                })
        else:
            # 폴백: 개별 학교 페이지 스크래핑
            print("  지역 통계 페이지 실패 → 개별 학교 페이지 크롤링...")
            page = await browser.new_page()
            for i, (name, info) in enumerate(list(neis_map.items())[:50]):  # 일단 50개 테스트
                code = info["code"]
                if not code:
                    continue
                print(f"  [{i+1}] {name} ({code})")
                result = await crawl_individual_school(page, code)
                if result:
                    special_count = result.get("special_count") or 0
                    grad_count    = result.get("grad_count") or 0
                    rate = round(special_count / grad_count * 100, 1) if grad_count else 0
                    ranked.append({
                        "name":          name,
                        "grad_count":    grad_count,
                        "special_count": special_count,
                        "rate":          rate,
                        "city":          info["city"],
                        "gu":            info["gu"],
                        "dong":          info["dong"],
                    })
                await asyncio.sleep(0.5)  # 서버 부하 방지
            await page.close()

        await browser.close()

    # 특목고 진학률 기준 정렬
    ranked.sort(key=lambda x: x["rate"], reverse=True)
    for i, s in enumerate(ranked, 1):
        s["rank"] = i

    # TOP 50만 보관 (앱에는 30위까지 표시)
    ranked = ranked[:50]

    # 결과 출력
    print(f"\n[결과] TOP 10 경기도 중학교 (특목고 진학률 기준):")
    for s in ranked[:10]:
        print(f"  {s['rank']:2d}위 {s['name']:15s} {s['rate']:5.1f}%  ({s['city']} {s['gu']} {s['dong']})")

    # 3단계: 저장 + 업로드
    output = {
        "updated": time.strftime("%Y-%m-%d"),
        "year":    TARGET_YEAR,
        "source":  "학교알리미 졸업생 진로현황 공시 + NEIS Open API",
        "schools": ranked,
    }
    OUTPUT_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[3/3] 저장: {OUTPUT_FILE}")

    upload_to_firebase(output)
    print("완료!")


if __name__ == "__main__":
    asyncio.run(main())
