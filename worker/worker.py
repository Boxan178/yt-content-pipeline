"""Worker del yt-content-pipeline.

Loop de polling:
    1. Cada N seg consulta `thumbnail_jobs` con status='pending'.
    2. Por cada job: status='generating' → llama a kie-bridge (nano-banana-pro)
       → sube el binario al bucket `thumbnails` → status='ready' + image_url.
    3. Si algo falla: vuelve a 'pending' con el error en notes.

CERO dependencias externas — usa solo stdlib (urllib, json). No necesita
venv ni pip install. Esto evita problemas con pyiceberg/MSVC en Windows.

Uso (desde la raíz del proyecto):
    cd C:\\dev\\yt-content-pipeline
    python worker/worker.py

Variables que lee:
    NEXT_PUBLIC_SUPABASE_URL       desde ../.env.local (auto)
    NEXT_PUBLIC_SUPABASE_ANON_KEY  desde ../.env.local (auto)
    KIE_API_KEY                    via kie-bridge (C:\\Users\\pablo\\.claude\\secrets\\kie.json)
"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ── kie-bridge como librería ───────────────────────────────────────────────
KIE_BRIDGE = Path(r"Y:\04_DEV\J.A.R.V.I.S\lab\kie-bridge")
sys.path.insert(0, str(KIE_BRIDGE))
from kie import generate as kie_generate, KieError  # noqa: E402

# ── Cargar .env.local del padre ────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

POLL_INTERVAL = 3
BUCKET = "thumbnails"
DEFAULT_MODEL = "nano-banana-pro"

REST_BASE = f"{SUPABASE_URL}/rest/v1"
STORAGE_BASE = f"{SUPABASE_URL}/storage/v1"

BASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}


# ── HTTP helpers (urllib puro) ─────────────────────────────────────────────

def _request(url: str, method: str, *, data: bytes | None = None,
             headers: dict | None = None) -> tuple[int, bytes]:
    h = {**BASE_HEADERS, **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _json_request(url: str, method: str, *, body: dict | list | None = None,
                  extra_headers: dict | None = None):
    headers = {"Content-Type": "application/json", **(extra_headers or {})}
    data = json.dumps(body).encode() if body is not None else None
    code, raw = _request(url, method, data=data, headers=headers)
    if code >= 400:
        raise RuntimeError(f"HTTP {code} on {method} {url}: {raw.decode(errors='replace')[:500]}")
    if not raw:
        return None
    return json.loads(raw)


# ── Operaciones de alto nivel ──────────────────────────────────────────────

def select_pending() -> list[dict]:
    url = f"{REST_BASE}/thumbnail_jobs?status=eq.pending&order=created_at.asc&limit=10"
    return _json_request(url, "GET") or []


def claim_job(job_id: str) -> dict | None:
    """Intenta marcar el job como generating. Devuelve la fila si lo claimea,
    None si otro worker lo cogió antes."""
    url = f"{REST_BASE}/thumbnail_jobs?id=eq.{urllib.parse.quote(job_id)}&status=eq.pending"
    rows = _json_request(
        url, "PATCH",
        body={"status": "generating"},
        extra_headers={"Prefer": "return=representation"},
    ) or []
    return rows[0] if rows else None


def update_job(job_id: str, patch: dict) -> None:
    url = f"{REST_BASE}/thumbnail_jobs?id=eq.{urllib.parse.quote(job_id)}"
    _json_request(url, "PATCH", body=patch)


def upload_to_storage(local_path: Path, job_id: str) -> str:
    ext = local_path.suffix.lstrip(".") or "jpg"
    object_path = f"{job_id}/{int(time.time())}.{ext}"
    upload_url = f"{STORAGE_BASE}/object/{BUCKET}/{urllib.parse.quote(object_path)}"
    with open(local_path, "rb") as f:
        body = f.read()
    code, raw = _request(
        upload_url, "POST",
        data=body,
        headers={
            "Content-Type": f"image/{ext}",
            "x-upsert": "true",
        },
    )
    if code >= 400:
        raise RuntimeError(f"Storage upload HTTP {code}: {raw.decode(errors='replace')[:500]}")
    return f"{STORAGE_BASE}/object/public/{BUCKET}/{object_path}"


# ── Pipeline por job ───────────────────────────────────────────────────────

def build_kie_input(job: dict) -> dict:
    prompt = (job.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("Job sin prompt")
    meta = job.get("thumbnail_meta") or {}
    refs = meta.get("image_input") or meta.get("refs") or []
    user_input: dict = {
        "prompt": prompt,
        "aspect_ratio": meta.get("aspect_ratio", "16:9"),
        "resolution": meta.get("resolution", "2K"),
        "output_format": meta.get("output_format", "jpg"),
    }
    if refs:
        user_input["image_input"] = refs
    return user_input


def process_job(job: dict) -> None:
    jid = job["id"]
    title = job.get("video_title", "(sin título)")
    model = (job.get("thumbnail_meta") or {}).get("model", DEFAULT_MODEL)
    print(f"\n→ Job {jid[:8]} | {title!r} | model={model}")

    try:
        user_input = build_kie_input(job)
    except ValueError as e:
        update_job(jid, {"status": "pending", "notes": f"[worker] {e}"})
        print(f"  ✗ Skip: {e}")
        return

    out_fmt = user_input.get("output_format", "jpg")
    tmp = Path(tempfile.gettempdir()) / f"tg-{uuid.uuid4().hex}.{out_fmt}"
    try:
        kie_generate(model, user_input, tmp, verbose=True)
    except KieError as e:
        update_job(jid, {"status": "pending", "notes": f"[kie] {str(e)[:500]}"})
        print(f"  ✗ Kie error: {e}")
        return
    except Exception as e:
        update_job(jid, {"status": "pending",
                         "notes": f"[worker] {type(e).__name__}: {e}"})
        print(f"  ✗ Worker error: {e}")
        return

    try:
        public_url = upload_to_storage(tmp, jid)
    except Exception as e:
        update_job(jid, {"status": "pending",
                         "notes": f"[storage] {type(e).__name__}: {e}"})
        print(f"  ✗ Storage error: {e}")
        return
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass

    update_job(jid, {"status": "ready", "image_url": public_url, "notes": None})
    print(f"  ✓ Ready: {public_url}")


# ── Loop principal ─────────────────────────────────────────────────────────

def main_loop() -> None:
    print(f"[worker] up · supabase={SUPABASE_URL} · bucket={BUCKET} · poll={POLL_INTERVAL}s")
    while True:
        try:
            pending = select_pending()
            for j in pending:
                claimed = claim_job(j["id"])
                if claimed:
                    process_job(claimed)
        except KeyboardInterrupt:
            print("\n[worker] bye")
            break
        except Exception as e:
            print(f"[worker] loop error: {type(e).__name__}: {e}", file=sys.stderr)
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main_loop()
