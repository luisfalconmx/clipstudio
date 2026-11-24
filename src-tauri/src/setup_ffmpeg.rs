//! Descarga e instalación única de ffmpeg/ffprobe en la carpeta de datos local
//! de la app (%LOCALAPPDATA%\com.clipstudio.app\ffmpeg). El instalador de
//! ClipStudio ya no incluye ffmpeg: así las actualizaciones son ligeras y
//! ffmpeg solo se descarga si no está disponible.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Rama estable de ffmpeg (builds de BtbN, GPL, binarios + DLLs).
const ASSET: &str = "ffmpeg-n9.0-latest-win64-gpl-shared-9.0.zip";
const BASE: &str = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SetupProgress {
    /// "download" | "verify" | "extract" | "done"
    pub stage: &'static str,
    pub downloaded: u64,
    pub total: u64,
}

fn emit(app: &AppHandle, stage: &'static str, downloaded: u64, total: u64) {
    let _ = app.emit("ffmpeg-setup", SetupProgress { stage, downloaded, total });
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("ClipStudio")
        .connect_timeout(Duration::from_secs(20))
        .timeout(None)
        .build()
        .map_err(|e| e.to_string())
}

/// Instala ffmpeg en `dir`. Devuelve la carpeta con ffmpeg.exe.
pub fn install(app: &AppHandle, dir: &Path) -> Result<PathBuf, String> {
    let http = client()?;

    // 1. Checksum publicado en el mismo release
    let sums = http
        .get(format!("{BASE}/checksums.sha256"))
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map_err(|e| format!("No se pudo consultar la versión de ffmpeg (¿sin internet?): {e}"))?;
    let expected = sums
        .lines()
        .find_map(|l| {
            let (hash, name) = l.split_once(char::is_whitespace)?;
            (name.trim().trim_start_matches('*') == ASSET).then(|| hash.trim().to_lowercase())
        })
        .ok_or("No se encontró el checksum de ffmpeg en el release.")?;

    // 2. Descarga con progreso, calculando SHA-256 al vuelo
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let zip_path = dir.join("ffmpeg-download.zip");
    let mut resp = http
        .get(format!("{BASE}/{ASSET}"))
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("No se pudo descargar ffmpeg: {e}"))?;
    let total = resp.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut done: u64 = 0;
    let mut last = Instant::now();
    emit(app, "download", 0, total);
    loop {
        let n = resp.read(&mut buf).map_err(|e| format!("Descarga interrumpida: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        if last.elapsed() > Duration::from_millis(200) {
            emit(app, "download", done, total);
            last = Instant::now();
        }
    }
    drop(file);
    emit(app, "verify", done, total);
    let got = format!("{:x}", hasher.finalize());
    if got != expected {
        let _ = std::fs::remove_file(&zip_path);
        return Err("La descarga de ffmpeg no pasó la verificación de integridad (SHA-256). Intenta de nuevo.".into());
    }

    // 3. Extraer solo la carpeta bin/ a un directorio temporal y luego moverlo
    emit(app, "extract", done, total);
    let tmp = dir.join("bin.partial");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    {
        let f = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(f).map_err(|e| format!("Zip inválido: {e}"))?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let Some(rel) = entry.enclosed_name() else { continue };
            let parts: Vec<_> = rel.components().collect();
            // <raíz>/bin/<archivo>
            if parts.len() != 3 || parts[1].as_os_str() != "bin" || entry.is_dir() {
                continue;
            }
            // ffplay no se usa: ahorra ~18 MB
            if parts[2].as_os_str().to_string_lossy().starts_with("ffplay") {
                continue;
            }
            let out = tmp.join(parts[2].as_os_str());
            let mut w = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut w).map_err(|e| e.to_string())?;
        }
    }
    let _ = std::fs::remove_file(&zip_path);
    let exe = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    if !tmp.join(exe).is_file() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err("El paquete descargado no contiene ffmpeg.".into());
    }
    let bin = dir.join("bin");
    let _ = std::fs::remove_dir_all(&bin);
    std::fs::rename(&tmp, &bin).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("VERSION"), ASSET).ok();
    emit(app, "done", done, total);
    Ok(bin)
}
