#!/usr/bin/env bash
# Compila el instalador de Windows (NSIS .exe) dentro de Docker y lo copia a ./release
# Uso (desde WSL):  ./scripts/build-windows.sh
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose build dev
docker compose run --rm dev bash -c '
  set -e
  pnpm install --frozen-lockfile
  ./scripts/fetch-ffmpeg-win.sh
  pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
  mkdir -p release && rm -f release/*.exe
  cp src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe release/
  cp src-tauri/target/x86_64-pc-windows-msvc/release/clipstudio.exe release/ClipStudio-portable.exe
'
echo
echo "Listo. Instalador en: $(pwd)/release"
echo "Desde Windows: explorer.exe \"$(wslpath -w "$(pwd)/release" 2>/dev/null || echo "$(pwd)/release")\""
