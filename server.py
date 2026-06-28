"""
로컬 논문 뷰어 서버.

  python server.py

브라우저가 자동으로 열리며, 좋아요/삭제 클릭 시 user_prefs.json에 즉시 저장됩니다.
"""
import json
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path
from threading import Timer

ROOT       = Path(__file__).parent
PREFS_FILE = ROOT / "paper_search" / "user_prefs.json"
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
