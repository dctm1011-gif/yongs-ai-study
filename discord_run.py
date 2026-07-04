"""
Discord 승인 후 명령 실행 오케스트레이터.
Claude Code가 이 스크립트를 dangerouslyDisableSandbox:true 로 실행 →
  Discord에서 yes/no 받은 뒤 실제 작업 진행.

사용법:
  python discord_run.py inject 5        # 논문 5개 업데이트
  python discord_run.py inject 10       # 논문 10개 업데이트
  python discord_run.py deploy          # Netlify 배포만
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "history"))

try:
    from discord_utils import ask_yes_no, notify
except Exception as e:
    print(f"discord_utils 로드 실패: {e}")
    sys.exit(1)

PYTHON = sys.executable

COMMANDS = {
    "inject": {
        "desc": lambda args: f"논문 최대 {args[0] if args else 20}개 추가 + Netlify 배포",
        "cmd":  lambda args: [PYTHON, "history/inject_papers.py"] + args,
    },
    "targeted": {
        "desc": lambda args: f"키워드 '{' '.join(args)}' 논문 강제 추가 + 배포",
        "cmd":  lambda args: [PYTHON, "history/inject_targeted.py"] + args,
    },
    "deploy": {
        "desc": lambda args: "Netlify 배포",
        "cmd":  lambda args: ["netlify", "deploy", "--prod"],
    },
    "update": {
        "desc": lambda args: "주간 자동 업데이트 (배치검색 + inject + 배포)",
        "cmd":  lambda args: [PYTHON, "auto_update.py"],
    },
}


def main():
    args = sys.argv[1:]
    if not args:
        print("사용법: python discord_run.py <command> [args...]")
        print("commands:", list(COMMANDS))
        sys.exit(1)

    cmd_name = args[0].lower()
    cmd_args  = args[1:]

    if cmd_name not in COMMANDS:
        print(f"알 수 없는 명령: {cmd_name}. 가능한 명령: {list(COMMANDS)}")
        sys.exit(1)

    entry = COMMANDS[cmd_name]
    desc  = entry["desc"](cmd_args)
    cmd   = entry["cmd"](cmd_args)

    ok = ask_yes_no(
        f"**{desc}** 을 실행할까요?",
        timeout=120,
        default=None,
    )

    if ok is True:
        subprocess.run(cmd, cwd=ROOT, shell=(cmd_name == "deploy"))
    elif ok is False:
        print("취소됨 (Discord no)")
    else:
        notify("⏱️ 120초 내 응답 없음 — 취소됩니다.")
        print("취소됨 (timeout)")


if __name__ == "__main__":
    main()
