#!/usr/bin/env bash
# Modo desarrollo con recarga en caliente:
#  1. Compila un ClipStudio.exe de depuración (apunta a http://localhost:1420)
#  2. Lo deja en ./release/dev junto con ffmpeg.exe / ffprobe.exe
#  3. Arranca Vite en el contenedor (puerto 1420 publicado a Windows)
# Abre release\dev\ClipStudio-dev.exe desde Windows y edita el código: la UI se recarga sola.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose build dev
docker compose run --rm dev bash -c '
  set -e
  pnpm install --frozen-lockfile
  ./scripts/fetch-ffmpeg-win.sh
  cd src-tauri && cargo xwin build --target x86_64-pc-windows-msvc && cd ..
  mkdir -p release/dev
  cp src-tauri/target/x86_64-pc-windows-msvc/debug/clipstudio.exe release/dev/ClipStudio-dev.exe
  cp src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe release/dev/ffmpeg.exe
  cp src-tauri/binaries/ffprobe-x86_64-pc-windows-msvc.exe release/dev/ffprobe.exe
'
echo "Ejecutable de desarrollo: $(pwd)/release/dev/ClipStudio-dev.exe"
echo "Iniciando Vite en http://localhost:1420 (Ctrl+C para salir)..."
docker compose run --rm --service-ports dev pnpm dev
