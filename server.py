"""
本地问卷服务器 - 纯Python标准库，无需安装任何依赖
用法: python server.py
然后用 ngrok 暴露到公网: ngrok http 8080

问卷分配逻辑:
- 5套问卷，每套=1个user+10张专属图片
- 每套目标3个成功提交
- 分配算法:
  1. 优先分配给 assigned < 3 的问卷（按user顺序）
  2. 若全部 assigned >=3，则按 submitted 最少优先分配（补足未提交的缺口）
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
ASSIGNMENTS_FILE = os.path.join(os.path.dirname(__file__), 'assignments.json')
DATA_FILE = os.path.join(os.path.dirname(__file__), 'data', 'data.json')


def load_data():
    """加载问卷数据"""
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_assignments():
    """加载分配记录"""
    if not os.path.exists(ASSIGNMENTS_FILE):
        return {}
    with open(ASSIGNMENTS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_assignments(assignments):
    """保存分配记录"""
    with open(ASSIGNMENTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(assignments, f, ensure_ascii=False, indent=2)


def assign_questionnaire():
    """
    分配问卷：返回 {questionnaireId, user, images}
    """
    data = load_data()
    users = data.get('sectionA_users', [])
    user_ids = [u['id'] for u in users]

    if not user_ids:
        raise ValueError('data.json 中没有用户数据')

    assignments = load_assignments()

    # 初始化缺失的user记录
    for uid in user_ids:
        if uid not in assignments:
            assignments[uid] = {'assigned': 0, 'submitted': 0}

    # === 分配算法 ===
    # 阶段1: 找 assigned < 3 的问卷（按user顺序）
    candidates = [uid for uid in user_ids if assignments[uid]['assigned'] < 3]

    if candidates:
        assigned_id = candidates[0]
    else:
        # 阶段2: 全部已分配过3次，按 submitted 最少优先
        min_submitted = min(assignments[uid]['submitted'] for uid in user_ids)
        candidates = [uid for uid in user_ids if assignments[uid]['submitted'] == min_submitted]
        assigned_id = candidates[0]

    # 记录分配
    assignments[assigned_id]['assigned'] += 1
    save_assignments(assignments)

    # 构建该问卷的数据
    user = next(u for u in users if u['id'] == assigned_id)

    # 获取该user对应的图片
    questionnaire_map = data.get('questionnaire_map', {})
    image_ids = questionnaire_map.get(assigned_id, [])

    # Fallback: 如果没有 questionnaire_map，用 source_user 匹配
    if not image_ids:
        all_images = data.get('sectionB_images', [])
        image_ids = [img['id'] for img in all_images if img.get('source_user') == assigned_id]

    # 如果还是不够10张，补充其他图片（按顺序）
    all_images = data.get('sectionB_images', [])
    img_map = {img['id']: img for img in all_images}
    images = []
    for img_id in image_ids:
        if img_id in img_map:
            images.append(img_map[img_id])

    # 兜底：确保至少有10张图
    if len(images) < 10:
        for img in all_images:
            if img['id'] not in image_ids and len(images) < 10:
                images.append(img)

    return {
        'questionnaireId': assigned_id,
        'user': user,
        'images': images[:10],  # 只取10张
    }


def record_submission(questionnaire_id):
    """
    记录一次成功提交：submitted +1
    """
    assignments = load_assignments()
    if questionnaire_id in assignments:
        assignments[questionnaire_id]['submitted'] += 1
        save_assignments(assignments)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(__file__), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # 防止浏览器缓存静态文件（开发/测试阶段）
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)

        # === /api/assign: 分配问卷 ===
        if parsed.path == '/api/assign':
            try:
                result = assign_questionnaire()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
                print(f"[{datetime.now()}] 分配问卷: {result['questionnaireId']} "
                      f"(assigned={load_assignments()[result['questionnaireId']]['assigned']}, "
                      f"submitted={load_assignments()[result['questionnaireId']]['submitted']})")
            except Exception as e:
                print(f"[{datetime.now()}] 分配错误: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        # === /api/submit: 提交答卷 ===
        if parsed.path == '/api/submit':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                payload = json.loads(post_data.decode('utf-8'))
                questionnaire_id = payload.get('questionnaireId', 'unknown')

                save_to_csv(payload)
                record_submission(questionnaire_id)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"success":true}')
                print(f"[{datetime.now()}] 收到提交: {payload.get('respondentId', 'unknown')} -> {questionnaire_id}")
            except Exception as e:
                print(f"[{datetime.now()}] 提交错误: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'{"error":"Not Found"}')


def save_to_csv(payload):
    """将提交数据追加到CSV文件（长格式）"""
    rows = []
    base = {
        '提交时间': payload.get('timestamp', datetime.now().isoformat()),
        '受访者ID': payload.get('respondentId', 'unknown'),
        '分配问卷': payload.get('questionnaireId', 'unknown'),
    }

    # Section A: 1个user，4个维度
    section_a = payload.get('sectionA', {})
    if section_a:
        rows.append({
            **base,
            '板块': 'SectionA',
            '用户ID': section_a.get('userId', ''),
            'A1_人设匹配': section_a.get('A1', ''),
            'A2_生活逻辑': section_a.get('A2', ''),
            'A3_图文匹配': section_a.get('A3', ''),
            'A4_帖子连贯': section_a.get('A4', ''),
            '开放题': section_a.get('comment', ''),
        })

    # Section B: 10张图片
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
    fieldnames = ['提交时间', '受访者ID', '分配问卷', '板块', '用户ID',
                  'A1_人设匹配', 'A2_生活逻辑', 'A3_图文匹配', 'A4_帖子连贯',
                  '开放题', '图片序号', '图片ID', '判别结果',
                  'Q6_小红书使用频率', 'Q9_判别自信度']

    file_exists = os.path.exists(CSV_FILE) and os.path.getsize(CSV_FILE) > 0
    with open(CSV_FILE, 'a', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)


if __name__ == '__main__':
    # 初始化 assignments.json（如果不存在）
    if not os.path.exists(ASSIGNMENTS_FILE):
        try:
            data = load_data()
            users = data.get('sectionA_users', [])
            initial = {u['id']: {'assigned': 0, 'submitted': 0} for u in users}
            save_assignments(initial)
            print(f"已初始化分配记录: {ASSIGNMENTS_FILE}")
        except Exception as e:
            print(f"初始化分配记录失败: {e}")

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"=" * 55)
        print(f"问卷服务器已启动")
        print(f"本地访问: http://localhost:{PORT}")
        print(f"数据保存: {CSV_FILE}")
        print(f"分配记录: {ASSIGNMENTS_FILE}")
        print(f"=" * 55)
        print(f"\n要让公网访问，安装 ngrok 后运行:")
        print(f"  ngrok http {PORT}")
        print(f"\n按 Ctrl+C 停止服务器\n")
        httpd.serve_forever()
