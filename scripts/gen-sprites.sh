#!/bin/bash
# Genera los 8 sprites Jedi en serie via kie-bridge.
set -e

BASE="C:/dev/yt-content-pipeline/.tmp-prompts/sprite-base.txt"
KIE="Y:/04_DEV/J.A.R.V.I.S/lab/kie-bridge/kie.py"
OUT_DIR="C:/Users/pablo/.yt-content-pipeline/avatars"
TMP="C:/dev/yt-content-pipeline/.tmp-prompts"
MODEL="nano-banana-pro"

mkdir -p "$OUT_DIR"

declare -A RANKS
RANKS[1]="Wearing simple beige novice robes with V-neck collar. No lightsaber visible. No padawan braid yet. Looks young and curious. Cream and sand tones."
RANKS[2]="Wearing light-brown padawan tunic with darker brown belt. Thin padawan braid visible behind the right ear, falling to the shoulder, with small silver bead at the end. Calm focused expression."
RANKS[4]="Wearing standard Jedi Knight robes: brown outer tunic over cream undertunic, dark leather belt. NO padawan braid (cut during the knighting ceremony). Lightsaber hilt visible at the belt, silver and black. Confident posture."
RANKS[7]="Wearing darker more practical Jedi Sentinel robes: slate grey and deep brown layers, leather utility belt with several pouches. Hood resting on shoulders. Lightsaber hilt at belt with a yellow emitter band (Sentinel iconography). A subtle scar on the brow."
RANKS[10]="Wearing full Jedi Master robes: layered brown and cream, heavier outer cloak with high collar. Detailed leather belt with metal clasps. Lightsaber hilt with green emitter. Hair slightly longer, light grey starting at the temples. Wise serene expression."
RANKS[14]="Wearing Jedi Council formal robes: dark brown outer cloak with embroidered hem (subtle geometric pattern). Cream inner robe with high collar. Both shoulders covered. Lightsaber hilt at hip. Hair fully grey at temples. Sitting tall, dignified."
RANKS[18]="Wearing solemn deep-brown Master of the Order robes with subtle gold trim along the collar and cuffs. Heavier ceremonial mantle on the shoulders. A small badge of office (geometric circle motif) at the throat. Full grey hair, neat beard. Calm authority in the gaze."
RANKS[22]="Wearing simple modest grey-and-cream robes - the Grand Master archetype is humble, like late-Yoda or post-RotJ Luke. Holding a wooden gimer-stick (staff) in the foreground. White hair, full white beard. Eyes calm and ancient, with faint hint of a smile. Light glows subtly around the silhouette (1-2 pixels of soft yellow)."

for lvl in 1 2 4 7 10 14 18 22; do
  out="$OUT_DIR/level-${lvl}.png"
  if [ -f "$out" ]; then
    echo "[$lvl] ya existe, skip"
    continue
  fi
  prompt_file="$TMP/sprite-${lvl}.txt"
  cat "$BASE" > "$prompt_file"
  echo "${RANKS[$lvl]}" >> "$prompt_file"
  echo "[$lvl] generando..."
  if python "$KIE" --model "$MODEL" --prompt-file "$prompt_file" --aspect 1:1 --resolution 1K --format png --out "$out" >/tmp/kie-${lvl}.log 2>&1; then
    echo "[$lvl] OK → $out"
  else
    echo "[$lvl] FAIL — log: /tmp/kie-${lvl}.log"
    tail -5 "/tmp/kie-${lvl}.log"
  fi
done

echo "=== resultados ==="
ls -lh "$OUT_DIR" | head -20
