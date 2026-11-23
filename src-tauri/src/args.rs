//! Construcción de argumentos de ffmpeg para el render (sin dependencias de Tauri).

use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderClip {
    pub path: String,
    pub start: f64,
    pub end: f64,
    pub has_audio: bool,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderJob {
    pub clips: Vec<RenderClip>,
    pub output: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    /// "h264" | "hevc" | "h264_nvenc" | "hevc_nvenc"
    pub codec: String,
    /// CRF / CQ (menor = mejor calidad)
    pub quality: u32,
    pub cover: Option<String>,
}

/// Construye los argumentos de ffmpeg para el trabajo. Público para pruebas.
pub fn build_args(job: &RenderJob) -> Result<Vec<String>, String> {
    if job.clips.is_empty() {
        return Err("La línea de tiempo está vacía.".into());
    }
    if job.fps < 60 {
        return Err("El mínimo es 60 fps.".into());
    }
    let (w, h, fps) = (job.width, job.height, job.fps);
    let mut a: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-nostats".into(),
        "-loglevel".into(),
        "error".into(),
        "-progress".into(),
        "pipe:1".into(),
    ];

    for c in &job.clips {
        let dur = (c.end - c.start).max(0.04);
        a.extend([
            "-ss".into(),
            format!("{:.3}", c.start.max(0.0)),
            "-t".into(),
            format!("{:.3}", dur),
            "-i".into(),
            c.path.clone(),
        ]);
    }
    let cover_input = job.clips.len();
    if let Some(cover) = &job.cover {
        a.extend(["-i".into(), cover.clone()]);
    }

    let mut graph = String::new();
    let mut concat_in = String::new();
    for (i, c) in job.clips.iter().enumerate() {
        let dur = (c.end - c.start).max(0.04);
        graph.push_str(&format!(
            "[{i}:V:0]scale={w}:{h}:force_original_aspect_ratio=decrease:flags=lanczos,\
             pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={fps},format=yuv420p,\
             trim=duration={dur:.3},setpts=PTS-STARTPTS[v{i}];"
        ));
        if c.has_audio {
            graph.push_str(&format!(
                "[{i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,\
                 apad,atrim=duration={dur:.3},asetpts=PTS-STARTPTS[a{i}];"
            ));
        } else {
            graph.push_str(&format!(
                "anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration={dur:.3},\
                 aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a{i}];"
            ));
        }
        concat_in.push_str(&format!("[v{i}][a{i}]"));
    }
    graph.push_str(&format!(
        "{concat_in}concat=n={}:v=1:a=1[outv][outa]",
        job.clips.len()
    ));

    a.extend([
        "-filter_complex".into(),
        graph,
        "-map".into(),
        "[outv]".into(),
        "-map".into(),
        "[outa]".into(),
    ]);

    let q = job.quality.to_string();
    let enc: Vec<&str> = match job.codec.as_str() {
        "hevc" => vec!["-c:v:0", "libx265", "-preset:v:0", "medium", "-crf:v:0", &q, "-tag:v:0", "hvc1", "-x265-params", "log-level=error"],
        "h264_nvenc" => vec!["-c:v:0", "h264_nvenc", "-preset:v:0", "p5", "-rc:v:0", "vbr", "-cq:v:0", &q, "-b:v:0", "0"],
        "hevc_nvenc" => vec![
            "-c:v:0", "hevc_nvenc", "-preset:v:0", "p5", "-rc:v:0", "vbr", "-cq:v:0", &q, "-b:v:0", "0", "-tag:v:0", "hvc1",
        ],
        _ => vec!["-c:v:0", "libx264", "-preset:v:0", "medium", "-crf:v:0", &q],
    };
    a.extend(enc.into_iter().map(String::from));
    a.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()]);

    if job.cover.is_some() {
        a.extend([
            "-map".into(),
            format!("{cover_input}:v:0"),
            "-c:v:1".into(),
            "mjpeg".into(),
            "-q:v:1".into(),
            "2".into(),
            "-disposition:v:1".into(),
            "attached_pic".into(),
        ]);
    }
    a.extend(["-movflags".into(), "+faststart".into(), job.output.clone()]);
    Ok(a)
}
