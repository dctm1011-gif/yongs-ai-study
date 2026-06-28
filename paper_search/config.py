import json
from pathlib import Path

CONFIG_FILE = Path(__file__).parent / "config.json"


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return _setup()
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _setup() -> dict:
    print("\n=== 초기 설정 ===")
    print("Obsidian Vault 경로를 입력하세요.")
    print("예) C:\\Users\\yourname\\Documents\\MyVault")
    vault_path = input("Vault 경로: ").strip().strip('"')

    papers_folder = input("논문 저장 폴더명 (기본값: Papers): ").strip() or "Papers"

    config = {
        "vault_path": vault_path,
        "papers_folder": papers_folder,
        "db_file": str(Path(__file__).parent / "paper_db.json"),
    }

    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    papers_dir = Path(vault_path) / papers_folder
    papers_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n설정 완료! 논문은 {papers_dir} 에 저장됩니다.\n")
    return config
