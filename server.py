"""
本地问卷服务器 - 纯Python标准库，无需安装任何依赖
用法: python server.py
然后用 ngrok 暴露到公网: ngrok http 8080
"""

import http.server
import socketserver
import json
import csv
import os
from datetime import datetime
from urllib.parse import urlparse

PORT = 8080
CSV_FILE = os.path.join(os.path.dirname(__file__), 'responses.csv')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(__file__), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/submit':
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error":"Not Found"}')
            return

        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)

        try:
            payload = json.loads(post_data.decode('utf-8'))
            save_to_csv(payload)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"success":true}')
            print(f"[{datetime.now()}] 收到提交: {payload.get('respondentId', 'unknown')}")
        except Exception as e:
            print(f"[{datetime.now()}] 错误: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

def save_to_csv(payload):
    """将提交数据追加到CSV文件"""
    rows = []
    base = {
        '提交时间': payload.get('timestamp', datetime.now().isoformat()),
        '受访者ID': payload.get('respondentId', 'unknown'),
    }

    # Section A
    for i, r in enumerate(payload.get('sectionA', [])):
        rows.append({
            **base,
            '板块': 'SectionA',
            '用户序号': i + 1,
            '用户ID': r.get('userId', ''),
            'A1_整体自然度': r.get('A1', ''),
            'A2_人设匹配': r.get('A2', ''),
            'A3_生活逻辑': r.get('A3', ''),
            'A4_图文匹配': r.get('A4', ''),
            'A5_帖子连贯': r.get('A5', ''),
            '开放题': r.get('comment', ''),
        })

    # Section B
    for i, r in enumerate(payload.get('sectionB', [])):
        rows.append({
            **base,
            '板块': 'SectionB',
            '图片序号': i + 1,
            '图片ID': r.get('imageId', ''),
            '判别结果': r.get('value', ''),
        })

    # 后测
    postsurvey = payload.get('postsurvey', {})
    rows.append({
        **base,
        '板块': 'Postsurvey',
        'Q6_小红书使用频率': postsurvey.get('q6', ''),
        'Q9_判别自信度': postsurvey.get('q9', ''),
    })

    # 写入CSV
    fieldnames = ['提交时间', '受访者ID', '板块', '用户序号', '用户ID',
                  'A1_整体自然度', 'A2_人设匹配', 'A3_生活逻辑', 'A4_图文匹配', 'A5_帖子连贯',
                  '开放题', '图片序号', '图片ID', '判别结果', 'Q6_小红书使用频率', 'Q9_判别自信度']

    file_exists = os.path.exists(CSV_FILE) and os.path.getsize(CSV_FILE) > 0
    with open(CSV_FILE, 'a', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"=" * 50)
        print(f"问卷服务器已启动")
        print(f"本地访问: http://localhost:{PORT}")
        print(f"数据保存: {CSV_FILE}")
        print(f"=" * 50)
        print(f"\n要让公网访问，安装 ngrok 后运行:")
        print(f"  ngrok http {PORT}")
        print(f"\n按 Ctrl+C 停止服务器\n")
        httpd.serve_forever()
