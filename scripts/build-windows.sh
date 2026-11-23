#!/usr/bin/env bash
# Compila el instalador de Windows (NSIS .exe) dentro de Docker y lo copia a ./release
# Uso (desde WSL):  ./scripts/build-windows.sh
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose build dev
docker compose run --rm dev bash -c '
  set -e
  npm ci --no-audit --no-fund
  ./scripts/fetch-ffmpeg-win.sh
  npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
  mkdir -p release
  cp src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe release/
  cp src-tauri/target/x86_64-pc-windows-msvc/release/reelcut.exe release/ReelCut-portable.exe
'
echo
echo "Listo. Instalador en: $(pwd)/release"
echo "Desde Windows: explorer.exe \"$(wslpath -w "$(pwd)/release" 2>/dev/null || echo "$(pwd)/release")\""
