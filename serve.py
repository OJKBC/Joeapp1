#!/usr/bin/env python3
# キャッシュ無効で配信する開発用サーバー（iPad等で常に最新が見えるように）
# つかいかた:  python3 serve.py
import http.server, socketserver

PORT = 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', PORT), NoCacheHandler) as httpd:
    print(f'no-cache server on http://0.0.0.0:{PORT}')
    httpd.serve_forever()
