#!/usr/bin/env bash
# Descarga ffmpeg/ffprobe para Windows (builds de BtbN, GPL) y los deja como
# sidecars de Tauri en src-tauri/binaries. Se ejecuta DENTRO del contenedor.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=src-tauri/binaries
TRIPLE=x86_64-pc-windows-msvc
if [[ -f "$DEST/ffmpeg-$TRIPLE.exe" && -f "$DEST/ffprobe-$TRIPLE.exe" ]]; then
  echo "ffmpeg para Windows ya está descargado."; exit 0
fi
URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
TMP=$(mktemp -d)
echo "Descargando $URL ..."
curl -fL --retry 3 -o "$TMP/ffmpeg.zip" "$URL"
unzip -q "$TMP/ffmpeg.zip" -d "$TMP"
BIN=$(find "$TMP" -type d -name bin | head -1)
mkdir -p "$DEST"
cp "$BIN/ffmpeg.exe" "$DEST/ffmpeg-$TRIPLE.exe"
cp "$BIN/ffprobe.exe" "$DEST/ffprobe-$TRIPLE.exe"
rm -rf "$TMP"
echo "Listo: $(ls -1 $DEST)"
