# 自由ZINE Python 后端

把书籍数据存到服务器磁盘（`server_py/data/zines/*.json`），并托管前端静态文件。

## 运行

```bash
cd server_py
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

访问：`http://localhost:8787`

## API

- `GET /api/zines`
- `GET /api/zines/:id`
- `PUT /api/zines/:id`（JSON）
- `DELETE /api/zines/:id`

