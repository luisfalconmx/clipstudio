# ClipStudio

Editor de video para Windows 11, del estilo de Filmora. Está hecho con **Tauri 2 + Vite + React 19 + Tailwind CSS 4 + HeroUI v3**, y usa **ffmpeg** para el procesamiento.

## Funciones

- **Proyectos**: archivos `.clipstudio` (JSON) guardados en la carpeta de datos de la app (`%APPDATA%\com.clipstudio.app\projects`). Un proyecto nuevo se guarda ahí al crearlo, y Ctrl+S guarda sin preguntar. Si había proyectos en la ubicación anterior (`Videos\ClipStudio`), se mueven solos. Se pueden eliminar desde el inicio: van a la Papelera de reciclaje. "Abrir" acepta un `.clipstudio`, o uno o varios videos que se abren como proyecto nuevo.
- **Menú contextual del Explorador**: clic derecho en un video → **"Abrir como proyecto en ClipStudio"**. En Windows 11 aparece dentro de *Mostrar más opciones* (o con Shift+F10). Si seleccionas varios videos, se crea un solo proyecto con todos en la línea de tiempo. Si ClipStudio ya está abierto, se usa la misma ventana.
- **Medios**: importar MP4, MOV, MKV, WebM o AVI, ya sea con el botón o arrastrando desde el Explorador. Desde la biblioteca, un medio se arrastra a la línea de tiempo en la posición que quieras (o con doble clic se agrega al final).
- **Línea de tiempo**:
  - Recortar arrastrando los bordes del clip.
  - Dividir en el cabezal (`S`).
  - Reordenar arrastrando el clip.
  - Eliminar (`Supr`).
  - Deshacer (`Ctrl+Z`).
  - Zoom.
  - Vista previa continua con `Espacio`, volumen y silencio (`M`), pantalla completa solo del video (`F` o doble clic; `Esc` para salir).
  - **Transiciones** entre clips (disolver, fundido a negro/blanco, barridos, deslizar, círculo, radial, pixelado…), con duración ajustable. Se eligen en la pestaña Transiciones o con el botón de cada unión en la línea de tiempo; se renderizan con `xfade`/`acrossfade` de ffmpeg.
  - **Zoom y encuadre por clip** (100–400 %), con anclaje a 9 posiciones, sliders y arrastre en la vista previa. Se amplía dentro del cuadro de salida, así que el video nunca sale del formato 16:9 (ni de 9:16 en vertical).
- **Barra lateral izquierda** colapsable con pestañas: Medios, Encuadre, Transiciones, Portada, Metadatos y **Proyecto** (resolución, orientación, fps, calidad y códec; al importar el primer video se ajusta a su formato) (título, autor, descripción, etc. que se escriben en el MP4 exportado).
- **Exportar**: nombre de archivo y ruta de exportación editables (por defecto `%USERPROFILE%\Videos`). 1080p, 1440p o 4K, a 60 o 120 fps, en horizontal o vertical. Códecs disponibles: H.264 y H.265 por CPU, o NVENC por GPU NVIDIA. Muestra el progreso y permite cancelar. Si los clips tienen otra relación de aspecto, se ajustan con barras negras.
- **Portada (cover)**: captura el fotograma del cabezal con el mismo encuadre y zoom del video exportado, o elige una imagen. Se incrusta en el MP4 como `attached_pic`.
- **Metadata Manager** (desde la pantalla de inicio). Todo se hace **sin renderizar**: copia los streams y tarda segundos. Puede sobrescribir el original o guardar una copia.
  - **Editar un video**: metadata de video (título, autor/creador, fecha, género, tipo de video, copyright, descripción, sinopsis, comentario y datos de serie: serie, temporada, episodio, canal). También la portada: elegir un fotograma exacto con avance cuadro a cuadro, elegir una imagen o quitarla. Muestra la información técnica (códecs, resolución, bitrate, audio, subtítulos, capítulos y otras etiquetas).
  - **Revisar carpeta**: cuadrícula con las portadas de todos los videos de una carpeta (con subcarpetas opcionales), su estado, título y detalles. Se puede filtrar y buscar. La carpeta y su último escaneo se recuerdan, incluso al cerrar la app, hasta que pulses **Desvincular carpeta**. "Editar metadata" abre el mismo editor.

## Desarrollo, todo en Docker (WSL2)

No hace falta instalar Node, pnpm, Rust ni ffmpeg en Windows ni en WSL. Basta con Docker Desktop.

### Instalador de Windows

```bash
./scripts/build-windows.sh
```

Esto genera dos archivos en `release/`:

- `ClipStudio_<versión>_x64-setup.exe`: el instalador NSIS (≈3 MB). ffmpeg se descarga una sola vez, al primer uso.
- `ClipStudio-portable.exe`: el ejecutable suelto. También descarga ffmpeg al primer uso.

Para abrir la carpeta desde WSL: `explorer.exe release`.

### Modo desarrollo con recarga en caliente

```bash
./scripts/dev-windows.sh
```

El script compila `release/dev/ClipStudio-dev.exe` (versión debug), que carga la UI desde `http://localhost:1420`, y arranca Vite en el contenedor. Abre ese `.exe` desde Windows y edita el código en `src/`: la UI se recarga sola. Solo hay que volver a correr el script si cambias código Rust (`src-tauri/`).

### Comandos sueltos

```bash
docker compose run --rm dev pnpm build                          # typecheck + build del frontend
docker compose run --rm dev bash -c "cd src-tauri && cargo xwin check --target x86_64-pc-windows-msvc"
```

La compilación cruzada usa `cargo-xwin`, que descarga el SDK de Windows y lo guarda en caché en un volumen de Docker. Los volúmenes `node_modules`, `target`, el registro de cargo y la caché de xwin son de Docker, así que no ensucian el repo.

## Instalador

El instalador NSIS ejecuta [src-tauri/windows/hooks.nsh](src-tauri/windows/hooks.nsh), que registra el verbo del menú contextual en `HKCU\Software\Classes\SystemFileAssociations\.<ext>\shell` (sin permisos de administrador). Al desinstalar se quita el verbo; tus proyectos y ffmpeg se conservan.

## Actualizaciones automáticas y releases

La app busca actualizaciones firmadas al iniciar (y cada 6 h) en
`https://github.com/luisfalconmx/clipstudio/releases/latest/download/latest.json`. Si hay una versión nueva, muestra el botón
**"Nueva actualización disponible"**, que descarga el instalador, verifica su firma, lo instala y reinicia la app.

- La **llave privada** de firma está fuera del repo, en `~/.tauri/clipstudio-updater.key` (la pública está en `tauri.conf.json`).
  **Respáldala**: si se pierde, las instalaciones existentes no podrán recibir actualizaciones.
- Para publicar una versión:
  1. Escribe las notas en `release/NOTES.md`.
  2. `pnpm version minor` (o `patch`/`major`), que crea el commit y el tag `vX.Y.Z` y sincroniza `Cargo.toml`.
  3. `./scripts/build-windows.sh`: genera el instalador firmado, `ClipStudio-setup.exe` y `latest.json` en `release/`.
  4. `git push --follow-tags` y `gh release create vX.Y.Z release/ClipStudio_X.Y.Z_x64-setup.exe release/ClipStudio-setup.exe release/latest.json …`.

## Landing page

`landing/` es una página estática (HTML + three.js por CDN) que se publica en GitHub Pages con
[.github/workflows/pages.yml](.github/workflows/pages.yml): https://luisfalconmx.github.io/clipstudio/. El botón de descarga
apunta a `releases/latest/download/ClipStudio-setup.exe`, así que siempre entrega la versión más reciente.

## Estructura

```
src/
  views/Home.tsx          Inicio: nuevo/abrir proyecto, recientes, Metadata Manager
  views/Editor.tsx        Editor: estado del proyecto, atajos, guardar
  views/MetadataManager.tsx  Metadata Manager (un video / revisar carpeta)
  components/meta/        MetadataEditor y FolderScanner
  components/Timeline.tsx Línea de tiempo (recorte, reorden, cabezal)
  components/Preview.tsx  Reproductor que simula la secuencia con un <video>
  components/ExportModal.tsx
src-tauri/src/
  lib.rs                  Comandos Tauri
  ffmpeg.rs               Localizar/ejecutar ffmpeg, probe, fotogramas, portada
  (src/components/UpdateNotifier.tsx  aviso y descarga de actualizaciones)
  setup_ffmpeg.rs         Descarga única de ffmpeg con verificación SHA-256
  args.rs                 Construcción del filtro de render (trim + scale/pad + fps + concat)
  render.rs               Proceso de render con progreso y cancelación
```

## Notas

- **ffmpeg no va dentro del instalador.** La primera vez que abres ClipStudio, descarga ffmpeg 9.0 (≈90 MB, builds GPL de [BtbN](https://github.com/BtbN/FFmpeg-Builds)), verifica su SHA-256 y lo instala en `%LOCALAPPDATA%\com.clipstudio.app\ffmpeg`. Las actualizaciones de la app no lo vuelven a descargar. Si ya tienes ffmpeg en el PATH, se usa ese.
- La edición de metadata y portada solo funciona con MP4 y M4V. Los MOV, MKV, etc. aparecen en el listado como "solo lectura". Solo se escriben las etiquetas estándar de iTunes, que son las que leen Windows, VLC, Plex, etc.
- La vista previa usa el decodificador de WebView2, así que reproduce bien H.264. Algunos HEVC o MKV podrían no previsualizarse aunque sí se rendericen.
