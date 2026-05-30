#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
verify_locucion.py — Verifica que la locución de un vídeo está completa.

Lo lanza la app (yt-content-pipeline) como proceso en background. Hace dos cosas:

  1. QUICK (siempre): mide la duración real del audio en `01_BRUTOS/_LOCUCION/`
     (vía PyAV), la compara con la duración declarada en packaging.md
     ("Duración audio: ~2:30") y con la duración estimada a partir del nº de
     palabras del guion (~150 wpm).

  2. FULL (mode=full): además transcribe el audio con faster-whisper y lo compara
     con el texto del guion (sección "### Texto completo:" del packaging.md o
     "## Guion"). Devuelve un % de cobertura y un veredicto:
       COMPLETA / INCOMPLETA / DISCREPANCIA / SIN_GUION

Escribe el resultado (y actualizaciones de progreso) como JSON en --out. La app
hace polling de ese archivo.

Uso:
  python verify_locucion.py --folder "<videoFolder>" --out "<result.json>" \
      [--mode quick|full] [--model small]

Pensado para ejecutarse con el venv de auto-edit (tiene PyAV + faster-whisper):
  C:\\.venvs\\auto-edit\\Scripts\\python.exe
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

AUDIO_EXTS = {".mp3", ".wav", ".m4a"}
WORDS_PER_MINUTE = 150  # ritmo de narración típico para estimar duración


def write_result(out_path: str, payload: dict) -> None:
    """Escribe el JSON de resultado de forma atómica (tmp + replace)."""
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, out_path)


def list_audio_files(locucion_dir: Path):
    if not locucion_dir.is_dir():
        return []
    files = [
        p for p in sorted(locucion_dir.iterdir())
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS
    ]
    return files


def audio_duration_seconds(path: Path) -> float:
    """Duración en segundos vía PyAV. 0.0 si no se puede leer."""
    try:
        import av  # type: ignore
        with av.open(str(path)) as container:
            if container.duration is not None:
                return float(container.duration) / 1_000_000.0  # AV_TIME_BASE
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream and stream.duration and stream.time_base:
                return float(stream.duration * stream.time_base)
    except Exception:
        pass
    return 0.0


def parse_stated_duration(md: str):
    """Extrae la duración declarada en packaging.md. Devuelve segundos o None."""
    if not md:
        return None
    # "Duración audio: ~2:30" / "Duración: 2:30" / "**Duración audio:** ~2:30"
    m = re.search(r"duraci[oó]n[^\n:]*:\s*\*?\*?\s*~?\s*(\d{1,2}):(\d{2})", md, re.IGNORECASE)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    # "~2 min" / "2 minutos"
    m = re.search(r"duraci[oó]n[^\n:]*:\s*\*?\*?\s*~?\s*(\d{1,3})\s*min", md, re.IGNORECASE)
    if m:
        return int(m.group(1)) * 60
    return None


def extract_script_text(md: str) -> str:
    """Extrae el cuerpo del guion del packaging.md."""
    if not md:
        return ""
    lines = md.splitlines()
    # 1) Preferimos la sección "### Texto completo:" hasta el siguiente heading.
    start = None
    for i, ln in enumerate(lines):
        if re.match(r"^#{2,4}\s*texto completo", ln.strip(), re.IGNORECASE):
            start = i + 1
            break
    if start is not None:
        body = []
        for ln in lines[start:]:
            if re.match(r"^#{1,6}\s", ln) or re.match(r"^---\s*$", ln):
                break
            body.append(ln)
        text = "\n".join(body).strip()
        if len(text) >= 80:
            return text
    # 2) Fallback: sección "## Guion" completa.
    start = None
    for i, ln in enumerate(lines):
        if re.match(r"^#{2}\s*guion", ln.strip(), re.IGNORECASE):
            start = i + 1
            break
    if start is not None:
        body = []
        for ln in lines[start:]:
            if re.match(r"^#{1,2}\s", ln):
                break
            body.append(ln)
        return "\n".join(body).strip()
    return ""


def normalize_words(text: str):
    """Normaliza a lista de palabras: minúsculas, sin acentos, sin puntuación."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    # quita marcas markdown y puntuación, deja letras/números/espacios
    text = re.sub(r"[*_`#>\[\]()]", " ", text)
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return [w for w in text.split() if w]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mode", choices=["quick", "full"], default="full")
    ap.add_argument("--model", default="small")
    args = ap.parse_args()

    folder = Path(args.folder)
    out = args.out

    base = {
        "schemaVersion": 1,
        "mode": args.mode,
        "folder": str(folder),
    }

    def progress(stage: str, extra: dict | None = None):
        payload = dict(base)
        payload["status"] = "running"
        payload["stage"] = stage
        if extra:
            payload.update(extra)
        write_result(out, payload)

    try:
        progress("Buscando audio")
        locucion_dir = folder / "01_BRUTOS" / "_LOCUCION"
        audio_files = list_audio_files(locucion_dir)
        if not audio_files:
            write_result(out, {**base, "status": "done", "verdict": "SIN_AUDIO",
                               "message": "No hay archivos de audio en 01_BRUTOS/_LOCUCION/.",
                               "audio": {"count": 0, "files": [], "totalSeconds": 0, "totalBytes": 0}})
            return 0

        progress("Midiendo duración")
        total_seconds = 0.0
        total_bytes = 0
        file_infos = []
        for p in audio_files:
            dur = audio_duration_seconds(p)
            size = p.stat().st_size
            total_seconds += dur
            total_bytes += size
            file_infos.append({"name": p.name, "seconds": round(dur, 1), "bytes": size})

        # Contexto del guion
        packaging_path = folder / "_PACKAGING" / "packaging.md"
        md = ""
        if packaging_path.is_file():
            md = packaging_path.read_text(encoding="utf-8", errors="replace")
        stated_seconds = parse_stated_duration(md)
        script_text = extract_script_text(md)
        script_words = normalize_words(script_text)
        script_word_count = len(script_words)
        estimated_seconds = (script_word_count / WORDS_PER_MINUTE * 60) if script_word_count else None

        audio_block = {
            "count": len(audio_files),
            "files": file_infos,
            "totalSeconds": round(total_seconds, 1),
            "totalBytes": total_bytes,
        }
        expected_block = {
            "statedSeconds": stated_seconds,
            "scriptWordCount": script_word_count,
            "estimatedSeconds": round(estimated_seconds, 1) if estimated_seconds else None,
            "hasScript": script_word_count > 0,
        }

        if args.mode == "quick" or script_word_count == 0:
            # Veredicto solo por duración.
            verdict, message = duration_verdict(total_seconds, stated_seconds, estimated_seconds, script_word_count)
            result = {**base, "status": "done", "verdict": verdict, "message": message,
                      "audio": audio_block, "expected": expected_block}
            if args.mode == "full" and script_word_count == 0:
                result["note"] = "No encontré el texto del guion en packaging.md; verifico solo por duración."
            write_result(out, result)
            return 0

        # ── FULL: transcripción + comparación con el guion ──────────────────
        progress("Transcribiendo (Whisper)", {"audio": audio_block, "expected": expected_block})
        transcript = transcribe(audio_files, args.model, progress, audio_block, expected_block)
        progress("Comparando con el guion", {"audio": audio_block, "expected": expected_block})

        trans_words = normalize_words(transcript)
        trans_word_count = len(trans_words)
        # Similitud de secuencia (orden importa) + ratio de longitud.
        sim = SequenceMatcher(None, script_words, trans_words, autojunk=False).ratio()
        len_ratio = (trans_word_count / script_word_count) if script_word_count else 0.0
        coverage_pct = round(min(len_ratio, 1.0) * 100)
        similarity_pct = round(sim * 100)

        verdict, message = coverage_verdict(similarity_pct, len_ratio)

        write_result(out, {
            **base, "status": "done", "verdict": verdict, "message": message,
            "audio": audio_block, "expected": expected_block,
            "transcript": {
                "wordCount": trans_word_count,
                "coveragePercent": coverage_pct,
                "similarityPercent": similarity_pct,
                "preview": transcript[:600].strip(),
            },
        })
        return 0
    except Exception as e:  # noqa: BLE001
        import traceback
        write_result(out, {**base, "status": "error",
                           "error": str(e), "traceback": traceback.format_exc()})
        return 1


def duration_verdict(total_seconds, stated_seconds, estimated_seconds, script_word_count):
    target = estimated_seconds if estimated_seconds else stated_seconds
    if not target:
        if total_seconds < 20:
            return "INCOMPLETA", f"El audio dura solo {fmt(total_seconds)} — parece un test, no una locución completa."
        return "PROBABLE", f"Audio de {fmt(total_seconds)}. Sin duración/guion de referencia en packaging.md para contrastar."
    ratio = total_seconds / target if target else 0
    if ratio < 0.85:
        return "INCOMPLETA", (
            f"El audio dura {fmt(total_seconds)} pero se esperaban ~{fmt(target)} "
            f"({'guion' if estimated_seconds else 'packaging'}). Cubre ~{round(ratio*100)}%."
        )
    if ratio > 1.4:
        return "REVISAR", (
            f"El audio dura {fmt(total_seconds)}, bastante más que los ~{fmt(target)} esperados. "
            "Puede tener silencios o material de más."
        )
    return "COMPLETA", (
        f"El audio dura {fmt(total_seconds)}, en línea con los ~{fmt(target)} esperados "
        f"({'guion' if estimated_seconds else 'packaging'})."
    )


def coverage_verdict(similarity_pct, len_ratio):
    if similarity_pct >= 70 and 0.9 <= len_ratio <= 1.2:
        return "COMPLETA", f"La transcripción coincide con el guion ({similarity_pct}% de similitud). Locución completa."
    if len_ratio < 0.85:
        return "INCOMPLETA", (
            f"El audio cubre solo ~{round(min(len_ratio,1.0)*100)}% del guion "
            f"(similitud {similarity_pct}%). Falta locucionar parte del texto."
        )
    if similarity_pct < 45:
        return "DISCREPANCIA", (
            f"El audio NO coincide bien con el guion (similitud {similarity_pct}%). "
            "¿Es el guion correcto, o el audio es de otra versión?"
        )
    return "REVISAR", (
        f"Cobertura ~{round(min(len_ratio,1.0)*100)}%, similitud {similarity_pct}%. "
        "Casi, pero conviene una revisión manual."
    )


def transcribe(audio_files, model_name, progress, audio_block, expected_block) -> str:
    from faster_whisper import WhisperModel  # type: ignore
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    chunks = []
    n = len(audio_files)
    for i, p in enumerate(audio_files):
        progress(f"Transcribiendo {i+1}/{n}: {p.name}", {"audio": audio_block, "expected": expected_block})
        segments, _info = model.transcribe(str(p), vad_filter=True)
        for seg in segments:
            chunks.append(seg.text)
    return " ".join(chunks)


def fmt(seconds) -> str:
    seconds = int(round(seconds or 0))
    return f"{seconds // 60}:{seconds % 60:02d}"


if __name__ == "__main__":
    sys.exit(main())
