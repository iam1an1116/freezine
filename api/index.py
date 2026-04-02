from __future__ import annotations

import re
import time
from typing import Any

from flask import Flask, jsonify, request

# Vercel Python Serverless entry:
# - Do NOT call app.run()
# - Export `app` at module level.

ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 80 * 1024 * 1024  # 80MB

# NOTE: Vercel runtime has no durable writable disk. This in-memory store resets
# on cold start / redeploy, so it is NOT permanent storage.
_ZINES: dict[str, dict[str, Any]] = {}


def _bad_id(zid: str) -> bool:
  return (not zid) or (not ID_RE.match(zid))


def _pick_list_fields(z: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": z.get("id"),
    "createdAt": z.get("createdAt"),
    "pageCount": z.get("pageCount"),
    "aspect": z.get("aspect"),
    "iconDataURL": z.get("iconDataURL"),
  }


@app.get("/api/health")
def health():
  return jsonify({"ok": True, "storage": "memory", "warning": "no_durable_storage_on_vercel"})


@app.get("/api/zines")
def list_zines():
  items = [_pick_list_fields(z) for z in _ZINES.values()]
  items.sort(key=lambda x: int(x.get("createdAt") or 0), reverse=True)
  return jsonify({"items": items, "storage": "memory"})


@app.get("/api/zines/<zid>")
def get_zine(zid: str):
  if _bad_id(zid):
    return jsonify({"error": "bad_id"}), 400
  z = _ZINES.get(zid)
  if not z:
    return jsonify({"error": "not_found"}), 404
  return jsonify(z)


@app.put("/api/zines/<zid>")
def put_zine(zid: str):
  if _bad_id(zid):
    return jsonify({"error": "bad_id"}), 400

  body = request.get_json(silent=True)
  if not isinstance(body, dict):
    return jsonify({"error": "bad_body"}), 400

  body.setdefault("id", zid)
  if body.get("id") != zid:
    return jsonify({"error": "id_mismatch"}), 400
  body.setdefault("createdAt", int(time.time() * 1000))

  _ZINES[zid] = body
  return jsonify({"ok": True, "storage": "memory"})


@app.delete("/api/zines/<zid>")
def delete_zine(zid: str):
  if _bad_id(zid):
    return jsonify({"error": "bad_id"}), 400
  _ZINES.pop(zid, None)
  return jsonify({"ok": True, "storage": "memory"})

