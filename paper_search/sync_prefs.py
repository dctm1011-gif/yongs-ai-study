"""
HTML에서 '환경설정 내보내기' 버튼으로 복사한 JSON을 user_prefs.json에 저장.

사용법:
  python sync_prefs.py          # JSON을 직접 붙여넣기 (Enter 두 번으로 완료)
  python sync_prefs.py '{"liked":[...],"deleted":[...]}'
"""
import json
import sys
from pathlib import Path

PREFS_FILE = Path(__file__).parent / "user_prefs.json"


def main():
    if len(sys.argv) > 1:
        raw = sys.argv[1]
    else:
        print("JSON 붙여넣기 후 Enter 두 번:")
        lines = []
        while True:
            line = input()
            if not line and lines:
                break
            lines.append(line)
        raw = "\n".join(lines)

    try:
        prefs = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"JSON 파싱 오류: {e}")
        sys.exit(1)

    prefs.setdefault("liked", [])
    prefs.setdefault("deleted", [])

    with open(PREFS_FILE, "w", encoding="utf-8") as f:
        json.dump(prefs, f, ensure_ascii=False, indent=2)

    print(f"저장 완료: 좋아요 {len(prefs['liked'])}개 / 삭제 {len(prefs['deleted'])}개")
    print(f"파일: {PREFS_FILE}")
    print("\n다음 단계: python history/generate.py 로 HTML 재생성")


if __name__ == "__main__":
    main()
