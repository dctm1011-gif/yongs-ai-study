"""
Netlify에 사이트를 배포합니다. 첫 실행 시 토큰과 사이트 ID를 입력하면
deploy.json에 저장되어 이후에는 자동으로 배포됩니다.

사용법:
  python deploy.py
"""
import hashlib
import json
import os
import sys
from pathlib import Path

import requests

ROOT        = Path(__file__).parent
CONFIG_FILE = ROOT / "deploy.json"
DIST_DIR    = ROOT
INCLUDE     = ["index.html", "history/index.html", "train-bg.jpg"]


def load_config() -> dict:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    return _setup()


def _setup() -> dict:
    print("\n=== Netlify 초기 설정 ===")
    print("1. https://app.netlify.com 에서 로그인")
    print("2. 우상단 아이콘 → User settings → Applications → Personal access tokens")
    print("3. 'New access token' 클릭 → 이름 입력 → 토큰 복사\n")
    token = input("Netlify 토큰 붙여넣기: ").strip()

    print("\n첫 배포를 위해 사이트를 생성합니다...")
    resp = requests.post(
        "https://api.netlify.com/api/v1/sites",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"name": "yongs-ai-study"},
    )
    if resp.status_code not in (200, 201):
        # 이름 중복 시 랜덤 이름으로 재시도
        resp = requests.post(
            "https://api.netlify.com/api/v1/sites",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={},
        )

    site = resp.json()
    site_id  = site["id"]
    site_url = site.get("ssl_url") or site.get("url", "")

    config = {"token": token, "site_id": site_id, "site_url": site_url}
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

    print(f"\n사이트 생성 완료: {site_url}")
    return config


def build_file_map() -> dict:
    """배포할 파일 목록과 SHA1 해시를 반환."""
    file_map = {}
    for rel in INCLUDE:
        path = DIST_DIR / rel
        if path.exists():
            data = path.read_bytes()
            sha1 = hashlib.sha1(data).hexdigest()
            file_map["/" + rel.replace("\\", "/")] = (path, sha1, data)
    return file_map


def deploy():
    config  = load_config()
    token   = config["token"]
    site_id = config["site_id"]

    print("파일 준비 중...")
    file_map = build_file_map()
    if not file_map:
        print("배포할 파일이 없습니다. 먼저 generate.py를 실행하세요.")
        sys.exit(1)

    headers_auth = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }

    # 1단계: 파일 해시 목록 전송
    digest_map = {path_key: sha1 for path_key, (_, sha1, _) in file_map.items()}
    resp = requests.post(
        f"https://api.netlify.com/api/v1/sites/{site_id}/deploys",
        headers=headers_auth,
        json={"files": digest_map},
    )
    if resp.status_code not in (200, 201):
        print(f"배포 시작 실패: {resp.status_code} {resp.text[:200]}")
        sys.exit(1)

    deploy_data = resp.json()
    deploy_id   = deploy_data["id"]
    required    = deploy_data.get("required", [])

    print(f"업로드 필요 파일: {len(required)}개")

    # 2단계: 필요한 파일만 업로드
    for path_key, (file_path, sha1, data) in file_map.items():
        if sha1 in required:
            print(f"  업로드: {path_key}")
            up = requests.put(
                f"https://api.netlify.com/api/v1/deploys/{deploy_id}/files{path_key}",
                headers={
                    "Authorization":  f"Bearer {token}",
                    "Content-Type":   "application/octet-stream",
                },
                data=data,
            )
            if up.status_code not in (200, 201):
                print(f"  업로드 실패: {up.status_code}")

    site_url = config.get("site_url", "")
    print(f"\n배포 완료!")
    print(f"URL: {site_url}")
    print(f"(반영까지 1~2분 소요)")

    # config에 URL 업데이트
    if not site_url:
        info = requests.get(
            f"https://api.netlify.com/api/v1/sites/{site_id}",
            headers={"Authorization": f"Bearer {token}"},
        ).json()
        config["site_url"] = info.get("ssl_url", info.get("url", ""))
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
        print(f"URL: {config['site_url']}")


if __name__ == "__main__":
    # HTML이 없으면 먼저 생성
    if not (ROOT / "history" / "index.html").exists():
        print("history/index.html 없음 — generate.py 먼저 실행하세요.")
        sys.exit(1)

    deploy()
