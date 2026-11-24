#!/usr/bin/env bash
# Compila el instalador de Windows (NSIS) dentro de Docker, firmado para el
# actualizador automático, y deja en ./release:
#   ClipStudio_<versión>_x64-setup.exe (+ .sig)  · instalador versionado
#   ClipStudio-setup.exe                         · mismo instalador, nombre fijo (landing)
#   latest.json                                  · manifiesto que consulta la app para actualizarse
#   ClipStudio-portable.exe
# La llave privada de firma vive FUERA del repo: ~/.tauri/clipstudio-updater.key
# Notas de la versión (opcional): release/NOTES.md
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="$HOME/.tauri/clipstudio-updater.key"
if [[ ! -f "$KEY" ]]; then
  echo "Falta la llave de firma $KEY (genera una con: pnpm tauri signer generate -w $KEY)" >&2
  exit 1
fi
REPO_URL="https://github.com/luisfalconmx/clipstudio"
docker compose build dev
docker compose run --rm \
  -v "$HOME/.tauri:/keys:ro" \
  -e TAURI_SIGNING_PRIVATE_KEY_PATH=/keys/clipstudio-updater.key \
  -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD= \
  -e REPO_URL="$REPO_URL" \
  dev bash -c '
  set -e
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$TAURI_SIGNING_PRIVATE_KEY_PATH")"
  pnpm install --frozen-lockfile
  pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
  V=$(node -p "require(\"./package.json\").version")
  B=src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis
  SETUP="ClipStudio_${V}_x64-setup.exe"
  mkdir -p release && rm -f release/*.exe release/*.sig release/latest.json
  cp "$B/$SETUP" "$B/$SETUP.sig" release/
  cp "$B/$SETUP" release/ClipStudio-setup.exe
  cp src-tauri/target/x86_64-pc-windows-msvc/release/clipstudio.exe release/ClipStudio-portable.exe
  V="$V" SETUP="$SETUP" node -e "
    const fs = require(\"fs\");
    const notes = fs.existsSync(\"release/NOTES.md\") ? fs.readFileSync(\"release/NOTES.md\", \"utf8\").trim() : \"ClipStudio \" + process.env.V;
    const manifest = {
      version: process.env.V,
      notes,
      pub_date: new Date().toISOString(),
      platforms: {
        \"windows-x86_64\": {
          signature: fs.readFileSync(\"release/\" + process.env.SETUP + \".sig\", \"utf8\").trim(),
          url: process.env.REPO_URL + \"/releases/download/v\" + process.env.V + \"/\" + process.env.SETUP,
        },
      },
    };
    fs.writeFileSync(\"release/latest.json\", JSON.stringify(manifest, null, 2));
  "
'
echo
echo "Listo. Archivos en: $(pwd)/release"
ls -la release
