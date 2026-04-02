from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory


ROOT = Path(__file__).resolve().parent.parent  # workspace root
DATA_DIR = Path(__file__).resolve().parent / "data"
ZINES_DIR = DATA_DIR / "zines"

ZINES_DIR.mkdir(parents=True, exist_ok=True)

ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 80 * 1024 * 1024  # 80MB


def zine_path(zid: str) -> Path:
  safe = zid.strip()
  if not safe or not ID_RE.match(safe):
    raise ValueError("bad_id")
  return ZINES_DIR / f"{safe}.json"


def read_json_file(p: Path) -> dict[str, Any]:
  return json.loads(p.read_text("utf-8"))


def write_json_atomic(p: Path, obj: dict[str, Any]) -> None:
  tmp = p.with_suffix(p.suffix + f".tmp-{os.getpid()}")
  tmp.write_text(json.dumps(obj, ensure_ascii=False), "utf-8")
  tmp.replace(p)


def pick_list_fields(z: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": z.get("id"),
    "createdAt": z.get("createdAt"),
    "pageCount": z.get("pageCount"),
    "aspect": z.get("aspect"),
    "iconDataURL": z.get("iconDataURL"),
  }


@app.get("/api/health")
def health():
  return jsonify({"ok": True})


@app.get("/api/zines")
def list_zines():
  items: list[dict[str, Any]] = []
  for fp in ZINES_DIR.glob("*.json"):
    try:
      z = read_json_file(fp)
      items.append(pick_list_fields(z))
    except Exception:
      continue
  items.sort(key=lambda x: int(x.get("createdAt") or 0), reverse=True)
  return jsonify({"items": items})


@app.get("/api/zines/<zid>")
def get_zine(zid: str):
  try:
    fp = zine_path(zid)
  except ValueError:
    return jsonify({"error": "bad_id"}), 400
  if not fp.exists():
    return jsonify({"error": "not_found"}), 404
  return jsonify(read_json_file(fp))


@app.put("/api/zines/<zid>")
def put_zine(zid: str):
  try:
    fp = zine_path(zid)
  except ValueError:
    return jsonify({"error": "bad_id"}), 400

  body = request.get_json(silent=True)
  if not isinstance(body, dict):
    return jsonify({"error": "bad_body"}), 400

  body.setdefault("id", zid)
  if body.get("id") != zid:
    return jsonify({"error": "id_mismatch"}), 400
  body.setdefault("createdAt", int(__import__("time").time() * 1000))

  write_json_atomic(fp, body)
  return jsonify({"ok": True})


@app.delete("/api/zines/<zid>")
def delete_zine(zid: str):
  try:
    fp = zine_path(zid)
  except ValueError:
    return jsonify({"error": "bad_id"}), 400
  try:
    fp.unlink(missing_ok=True)
  except Exception as e:
    return jsonify({"error": "failed_to_delete", "detail": str(e)}), 500
  return jsonify({"ok": True})


@app.get("/")
def index():
  return send_from_directory(ROOT, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
  # Serve your existing front-end files from workspace root
  return send_from_directory(ROOT, filename)


if __name__ == "__main__":
  port = int(os.environ.get("PORT", "8787"))
  app.run(host="0.0.0.0", port=port, debug=True)

