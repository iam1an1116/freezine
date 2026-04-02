from __future__ import annotations

import base64
import os
import re
import time
from typing import Any
from urllib.parse import quote

from flask import Flask, jsonify, request
from supabase import create_client

# Vercel Python Serverless entry:
# - Do NOT call app.run()
# - Export `app` at module level.

ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://bkrsxteqbdsgrddlskle.supabase.co")
SUPABASE_ANON_KEY = os.environ.get(
  "SUPABASE_ANON_KEY",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrcnN4dGVxYmRzZ3JkZGxza2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjQ3ODQsImV4cCI6MjA5MDcwMDc4NH0.HvTyn83uO4q2Iwb4tF9cBxmnfn_pUxYznQmSwRRq9Aw",
)
BUCKET = "zines"

supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 80 * 1024 * 1024  # 80MB


def _bad_id(zid: str) -> bool:
  return (not zid) or (not ID_RE.match(zid))


def _pick_list_fields(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": row.get("id"),
    "createdAt": row.get("created_at"),
    "pageCount": row.get("page_count"),
    "aspect": row.get("aspect"),
    "iconDataURL": row.get("icon_data_url"),
    "title": row.get("title"),
  }


def _to_row(payload: dict[str, Any], zid: str) -> dict[str, Any]:
  return {
    "id": zid,
    "title": payload.get("title") or f"自由ZINE-{zid[:8]}",
    "created_at": int(payload.get("createdAt") or int(time.time() * 1000)),
    "page_count": payload.get("pageCount"),
    "aspect": payload.get("aspect"),
    "icon_data_url": payload.get("iconDataURL"),
    "default_font_family": payload.get("defaultFontFamily"),
    "default_bg_color": payload.get("defaultBgColor"),
    "data": {
      "pageWidthPx": payload.get("pageWidthPx"),
      "pageHeightPx": payload.get("pageHeightPx"),
      "pageStates": payload.get("pageStates"),
      "fontScaleForPage": payload.get("fontScaleForPage"),
    },
  }


def _row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
  data = row.get("data") or {}
  return {
    "id": row.get("id"),
    "title": row.get("title"),
    "createdAt": row.get("created_at"),
    "pageCount": row.get("page_count"),
    "aspect": row.get("aspect"),
    "iconDataURL": row.get("icon_data_url"),
    "defaultFontFamily": row.get("default_font_family"),
    "defaultBgColor": row.get("default_bg_color"),
    "pageWidthPx": data.get("pageWidthPx"),
    "pageHeightPx": data.get("pageHeightPx"),
    "pageStates": data.get("pageStates") or [],
    "fontScaleForPage": data.get("fontScaleForPage") or [],
  }


@app.get("/api/health")
def health():
  return jsonify({"ok": True, "storage": "supabase"})


@app.get("/api/zines")
def list_zines():
  try:
    r = (
      supabase.table("zines")
      .select("id, created_at, page_count, aspect, icon_data_url, title")
      .order("created_at", desc=True)
      .execute()
    )
    rows = r.data or []
    return jsonify({"items": [_pick_list_fields(x) for x in rows], "storage": "supabase"})
  except Exception as e:
    return jsonify({"error": "failed_to_list", "detail": str(e)}), 500


@app.get("/api/zines/<zid>")
def get_zine(zid: str):
  if _bad_id(zid):
    return jsonify({"error": "bad_id"}), 400
  try:
    r = (
      supabase.table("zines")
      .select("*")
      .eq("id", zid)
      .limit(1)
      .execute()
    )
    rows = r.data or []
    if not rows:
      return jsonify({"error": "not_found"}), 404
    return jsonify(_row_to_payload(rows[0]))
  except Exception as e:
    return jsonify({"error": "failed_to_read", "detail": str(e)}), 500


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

  try:
    row = _to_row(body, zid)
    supabase.table("zines").upsert(row).execute()
    return jsonify({"ok": True, "storage": "supabase"})
  except Exception as e:
    return jsonify({"error": "failed_to_write", "detail": str(e)}), 500


@app.delete("/api/zines/<zid>")
def delete_zine(zid: str):
  if _bad_id(zid):
    return jsonify({"error": "bad_id"}), 400
  try:
    supabase.table("zines").delete().eq("id", zid).execute()
    return jsonify({"ok": True, "storage": "supabase"})
  except Exception as e:
    return jsonify({"error": "failed_to_delete", "detail": str(e)}), 500


@app.post("/api/upload-image")
def upload_image():
  body = request.get_json(silent=True)
  if not isinstance(body, dict):
    return jsonify({"error": "bad_body"}), 400

  data_url = body.get("dataUrl")
  zine_id = body.get("zineId") or "temp"
  file_name = body.get("fileName") or f"img-{int(time.time() * 1000)}.jpg"

  if not isinstance(data_url, str) or not data_url.startswith("data:"):
    return jsonify({"error": "bad_data_url"}), 400
  if _bad_id(str(zine_id).replace("temp", "temp")):
    zine_id = "temp"

  try:
    header, b64 = data_url.split(",", 1)
    mime = "image/jpeg"
    if ";base64" in header and ":" in header:
      mime = header.split(":", 1)[1].split(";", 1)[0]
    ext = "jpg"
    if mime.endswith("png"):
      ext = "png"
    elif mime.endswith("webp"):
      ext = "webp"
    elif mime.endswith("gif"):
      ext = "gif"

    raw = base64.b64decode(b64)
    safe_base = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(file_name).rsplit(".", 1)[0]).strip("-") or "img"
    key = f"{zine_id}/{int(time.time()*1000)}-{safe_base}.{ext}"

    supabase.storage.from_(BUCKET).upload(
      path=key,
      file=raw,
      file_options={"content-type": str(mime), "cache-control": "3600"},
    )

    public_url = supabase.storage.from_(BUCKET).get_public_url(key)
    if isinstance(public_url, dict):
      public_url = public_url.get("publicUrl") or public_url.get("public_url")
    if isinstance(public_url, str):
      # Ensure path segments are URL-safe
      public_url = public_url.replace(key, quote(key, safe="/._-"))

    return jsonify({"ok": True, "publicUrl": public_url, "path": key})
  except Exception as e:
    return jsonify({"error": "failed_to_upload", "detail": str(e)}), 500

