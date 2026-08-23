#!/usr/bin/env python3
"""
NPR News Now 수집기
NPR News Now RSS → Firebase english/npr/{date}/{slot}
매일 3회 GitHub Actions에서 실행 (07:00 / 08:30 / 10:00 KST)
API 키 불필요 — 순수 RSS 수집만
"""
import json
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree

DB_URL = "https://yongstudy-1f242-default-rtdb.asia-southeast1.firebasedatabase.app"
NPR_RSS = "https://feeds.npr.org/500005/podcast.xml"
ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd"


def get_kst_info() -> tuple[str, str]:
    """현재 KST 기준 (날짜, 슬롯) 반환. 슬롯: 0700 / 0830 / 1000"""
    kst = datetime.now(timezone.utc) + timedelta(hours=9)
    date = kst.strftime("%Y-%m-%d")
    h, m = kst.hour, kst.minute
    if h < 8:
        slot = "0700"
    elif h == 8 and m < 45:
        slot = "0830"
    else:
        slot = "1000"
    return date, slot


def fetch_npr_episode() -> dict | None:
    req = urllib.request.Request(NPR_RSS, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
    except Exception as e:
        print(f"[!] NPR RSS 수집 실패: {e}")
        return None

    try:
        root = ElementTree.fromstring(raw)
    except Exception as e:
        print(f"[!] NPR RSS 파싱 실패: {e}")
        return None

    for item in root.findall(".//item"):
        enc = item.find("enclosure")
        if enc is None:
            continue
        audio_url = enc.get("url", "")
        if not audio_url:
            continue

        title = item.findtext("title", "").strip()
        desc = re.sub(r"<[^>]+>", "", item.findtext("description", "") or "").strip()
        pub = item.findtext("pubDate", "").strip()
        duration = item.findtext(f"{{{ITUNES_NS}}}duration", "").strip()
        summary = item.findtext(f"{{{ITUNES_NS}}}summary", "").strip() or desc

        duration_sec = 0
        if duration:
            parts = duration.split(":")
            try:
                if len(parts) == 3:
                    duration_sec = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                elif len(parts) == 2:
                    duration_sec = int(parts[0]) * 60 + int(parts[1])
                else:
                    duration_sec = int(duration)
            except ValueError:
                pass

        print(f"[+] NPR: {title[:70]}")
        print(f"    오디오: {audio_url[:70]}")
        print(f"    길이: {duration_sec}초  스크립트: {len(summary)}자")

        return {
            "title": title,
            "script": summary,
            "audio_url": audio_url,
            "duration_sec": duration_sec,
            "published": pub,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    print("[!] NPR: 오디오 에피소드 없음")
    return None


def push_to_firebase(date: str, slot: str, data: dict) -> bool:
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    url = f"{DB_URL}/english/npr/{date}/{slot}.json"
    req = urllib.request.Request(url, data=payload, method="PUT",
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
        print(f"[+] Firebase 저장: english/npr/{date}/{slot}")
        return True
    except urllib.error.HTTPError as e:
        print(f"[!] HTTP {e.code}: {e.read().decode()}")
        return False
    except Exception as e:
        print(f"[!] Firebase 저장 실패: {e}")
        return False


def main():
    date, slot = get_kst_info()
    print(f"[*] NPR News Now 수집 — {date} {slot} KST")

    episode = fetch_npr_episode()
    if not episode:
        sys.exit(1)

    if not push_to_firebase(date, slot, episode):
        sys.exit(1)

    print("[+] 완료!")


if __name__ == "__main__":
    main()
