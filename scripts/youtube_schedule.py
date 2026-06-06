"""
Lista los vídeos de un canal de YouTube — PUBLICADOS y PROGRAMADOS (privados con
publishAt) — usando el token de lectura del skill youtube-seo-optimizer
(scope youtube.readonly). Lo consume la app (lib/youtube-schedule.ts) para volcar
el horario REAL del canal al calendario y que los "huecos" sean ciertos.

Salida: JSON por stdout
  { "channel": "...", "channelId": "...", "fetchedAt": "ISO",
    "items": [ { "videoId", "title", "privacyStatus", "publishAt"?,
                 "publishedAt"?, "date": "ISO (publishAt||publishedAt)" } ] }

Requisitos (los pasa la app por env / args):
  --channel <seo_channel_key>          (p.ej. moderni-stoici)
  --seo-scripts-dir <dir>              dir con youtube_data.py + _auth.py del skill
  [--max N]                            nº de vídeos recientes a inspeccionar (def 50)

Uso CLI (smoke test):
  python scripts/youtube_schedule.py --channel moderni-stoici \
     --seo-scripts-dir "Y:/04_DEV/J.A.R.V.I.S/.claude/skills/youtube-seo-optimizer/scripts"
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", required=True)
    ap.add_argument("--seo-scripts-dir", default=os.environ.get("YTCP_SEO_SCRIPTS_DIR", ""))
    ap.add_argument("--max", type=int, default=50)
    args = ap.parse_args()

    seo_dir = args.seo_scripts_dir
    if not seo_dir or not os.path.isdir(seo_dir):
        print(json.dumps({"error": f"seo-scripts-dir no existe: {seo_dir}"}))
        sys.exit(2)
    sys.path.insert(0, seo_dir)

    try:
        from youtube_data import build_client  # type: ignore
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"no pude importar youtube_data: {e}"}))
        sys.exit(2)

    try:
        client = build_client(args.channel)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"build_client falló: {e}"}))
        sys.exit(2)

    # 1) Vídeos PROPIOS (incluye privados / programados) — search forMine, los más
    #    recientes por fecha. forMine exige el token del dueño del canal.
    try:
        search = (
            client.search()
            .list(part="id", forMine=True, type="video", order="date", maxResults=min(args.max, 50))
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"search.forMine falló: {e}"}))
        sys.exit(2)

    ids = [
        it["id"]["videoId"]
        for it in search.get("items", [])
        if it.get("id", {}).get("videoId")
    ]
    if not ids:
        print(json.dumps({"channel": args.channel, "items": [], "fetchedAt": datetime.now(timezone.utc).isoformat()}))
        return

    # 2) Detalle: snippet (publishedAt, title) + status (privacyStatus, publishAt)
    items = []
    channel_id = ""
    for i in range(0, len(ids), 50):
        chunk = ids[i : i + 50]
        resp = client.videos().list(part="snippet,status", id=",".join(chunk)).execute()
        for v in resp.get("items", []):
            snip = v.get("snippet", {})
            status = v.get("status", {})
            channel_id = channel_id or snip.get("channelId", "")
            publish_at = status.get("publishAt")  # programado (privado con fecha futura)
            published_at = snip.get("publishedAt")  # subido/publicado
            date = publish_at or published_at
            items.append(
                {
                    "videoId": v.get("id"),
                    "title": snip.get("title"),
                    "privacyStatus": status.get("privacyStatus"),
                    "publishAt": publish_at,
                    "publishedAt": published_at,
                    "date": date,
                }
            )

    out = {
        "channel": args.channel,
        "channelId": channel_id,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "items": items,
    }
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
