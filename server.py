"""
로컬 논문 뷰어 서버.

  python server.py

브라우저가 자동으로 열리며, 좋아요/삭제 클릭 시 user_prefs.json에 즉시 저장됩니다.
TOEFL Writing 피드백은 Claude API로 자동 생성하며, 답변은 toefl/responses.json에 저장됩니다.
"""
import json
import webbrowser
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path
from threading import Timer

ROOT       = Path(__file__).parent
PREFS_FILE = ROOT / "paper_search" / "user_prefs.json"
RESPONSES_FILE = ROOT / "toefl" / "responses.json"
PORT       = 5000

_MIME = {".html": "text/html", ".json": "application/json",
         ".js": "text/javascript", ".css": "text/css",
         ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon"}



class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        path = args[0] if args else ""
        if "/api/" in str(path):
            status = args[1] if len(args) > 1 else ""
            print(f"  [sync] {path}  →  {status}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/api/prefs":
            prefs = {"liked": [], "deleted": [], "last_updated": ""}
            if PREFS_FILE.exists():
                prefs = json.loads(PREFS_FILE.read_text(encoding="utf-8"))
            self._send_json(prefs)
            return

        # 정적 파일 서빙: ROOT 기준으로 경로 매핑
        rel = path.lstrip("/") or "index.html"
        file_path = (ROOT / rel).resolve()

        # ROOT 밖으로 탈출하는 경로 차단 (보안)
        try:
            file_path.relative_to(ROOT.resolve())
        except ValueError:
            self.send_response(403)
            self.end_headers()
            return

        # 디렉토리면 index.html로
        if file_path.is_dir():
            file_path = file_path / "index.html"

        if file_path.exists() and file_path.is_file():
            self._send_file(file_path)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/prefs":
            length = int(self.headers.get("Content-Length", 0))
            body   = self.rfile.read(length)
            data   = json.loads(body)
            PREFS_FILE.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            liked   = len(data.get("liked", []))
            deleted = len(data.get("deleted", []))
            print(f"  [prefs] 좋아요 {liked}개 / 숨김 {deleted}개 저장됨")
            self._send_json({"ok": True})
            return

        if self.path == "/api/feedback":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            text = data.get("text", "").strip()
            feedback_type = data.get("type", "writing")
            prompt = data.get("prompt", "")
            structure = data.get("structure", {})

            if not text:
                self._send_json({"error": "텍스트가 비어있습니다."})
                return

            api_key = os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                self._send_json({"error": "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다."})
                return

            try:
                if feedback_type == "writing":
                    structure_text = ""
                    if structure:
                        structure_text = "\n구조 가이드:\n"
                        for key, val in structure.items():
                            if val:
                                structure_text += f"  - {key}: {val}\n"

                    prompt_text = f"""당신은 TOEFL Writing 채점자입니다. 다음 에세이를 평가하고 상세한 피드백을 제공해주세요.

문제: {prompt}
{structure_text}

작성된 에세이:
{text}

다음 항목들을 포함한 상세 피드백을 작성해주세요:
1. 전체 점수 평가 (0-30점)
2. 각 섹션의 강점 (Intro, Body1, Body2, Conclusion)
3. 문법/표현 개선 사항 (상위 3개)
4. 구조 개선 제안
5. 단어 선택 개선 제안
6. 다음 작성을 위한 조언

친절하고 건설적인 톤으로 작성해주세요."""
                else:
                    prompt_text = f"""당신은 TOEFL Speaking 채점자입니다. 다음 스피킹 답변을 평가하고 피드백을 제공해주세요.

질문: {prompt}

답변:
{text}

다음 항목들을 포함한 상세 피드백을 작성해주세요:
1. 전체 점수 평가 (0-30점)
2. 발음/유창성 평가
3. 어휘 사용 평가
4. 문법 평가
5. 답변 완성도
6. 개선 사항 (상위 3개)
7. 다음을 위한 조언

친절하고 건설적인 톤으로 작성해주세요."""

                request_body = json.dumps({
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 1024,
                    "messages": [{"role": "user", "content": prompt_text}]
                }).encode('utf-8')

                req = urllib.request.Request(
                    "https://api.anthropic.com/v1/messages",
                    data=request_body,
                    headers={
                        "Content-Type": "application/json",
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01"
                    }
                )

                with urllib.request.urlopen(req, timeout=30) as response:
                    response_data = json.loads(response.read().decode('utf-8'))
                    feedback = response_data["content"][0]["text"]
                    print(f"  [feedback] {feedback_type} 피드백 생성 완료 ({len(feedback)}자)")
                    self._send_json({"feedback": feedback})
                    return
            except Exception as e:
                error_msg = str(e)
                print(f"  [feedback] 오류: {error_msg}")
                self._send_json({"error": f"피드백 생성 실패: {error_msg}"})
                return

        if self.path == "/api/save-response":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            try:
                if RESPONSES_FILE.exists():
                    responses = json.loads(RESPONSES_FILE.read_text(encoding="utf-8"))
                else:
                    responses = {"responses": []}

                responses["responses"].append(data)
                RESPONSES_FILE.write_text(
                    json.dumps(responses, ensure_ascii=False, indent=2), encoding="utf-8"
                )

                total = len(responses.get("responses", []))
                print(f"  [responses] 답변 저장 완료 (총 {total}개)")
                self._send_json({"ok": True, "total": total})
                return
            except Exception as e:
                error_msg = str(e)
                print(f"  [responses] 저장 실패: {error_msg}")
                self._send_json({"error": f"답변 저장 실패: {error_msg}"})
                return

        self.send_response(404)
        self.end_headers()

    def _send_file(self, path: Path):
        data = path.read_bytes()
        mime = _MIME.get(path.suffix, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)


def _local_ip() -> str:
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    lan_ip = _local_ip()
    print(f"\n논문 뷰어 서버 시작")
    print(f"  PC:     http://localhost:{PORT}")
    print(f"  모바일: http://{lan_ip}:{PORT}  (같은 WiFi 필요)")
    print("\n좋아요/삭제 클릭 시 user_prefs.json에 자동 저장됩니다.")
    print("종료: Ctrl+C\n")
    Timer(0.8, webbrowser.open, args=[f"http://localhost:{PORT}"]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버 종료.")


if __name__ == "__main__":
    main()
