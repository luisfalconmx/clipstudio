import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface MediaInfo {
  path: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoCodec: string;
  coverStream: number | null;
  videoStreams: number;
  tags: Record<string, string>;
  size: number;
  formatName: string;
  bitRate: number;
  audioCodec: string;
  audioChannels: number;
  audioSampleRate: number;
  subtitleStreams: number;
  chapters: number;
}

export interface ProjectEntry {
  path: string;
  name: string;
  clips: number;
  media: number;
  modified: number;
  duration: number;
  cover: string | null;
  previewPath: string | null;
  previewTime: number;
  resolution: string;
  fps: number;
  orientation: string;
}

/** true cuando corre dentro de Tauri (no en un navegador normal). */
export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type CoverChange = { kind: "keep" } | { kind: "remove" } | { kind: "set"; path: string };

export interface ScanItem {
  path: string;
  name: string;
  folder: string;
  editable: boolean;
  info: MediaInfo | null;
  error: string | null;
}

export interface FfmpegStatus {
  ffmpeg: string | null;
  ffprobe: string | null;
  version: string | null;
}

export interface FfmpegSetupProgress {
  stage: "download" | "verify" | "extract" | "done";
  downloaded: number;
  total: number;
}

export interface RenderClip {
  path: string;
  start: number;
  end: number;
  hasAudio: boolean;
  transition: { kind: string; duration: number } | null;
  zoom: { scale: number; x: number; y: number } | null;
}

export interface RenderJob {
  clips: RenderClip[];
  output: string;
  width: number;
  height: number;
  fps: number;
  codec: string;
  quality: number;
  cover: string | null;
  metadata: Record<string, string>;
}

export interface RenderProgress {
  percent: number;
  seconds: number;
  total: number;
  fps: number;
  speed: string;
}

export interface RenderDone {
  ok: boolean;
  cancelled: boolean;
  output: string;
  error: string | null;
}

/** Convierte una ruta local en una URL que el webview puede cargar. */
export const fileUrl = (path: string) => convertFileSrc(path);

export const api = {
  ffmpegStatus: () => invoke<FfmpegStatus>("ffmpeg_status"),
  probe: (path: string) => invoke<MediaInfo>("probe_media", { path }),
  thumbnail: (path: string, time: number, width = 320) => invoke<string>("thumbnail", { path, time, width }),
  /** Con `frame`, aplica el mismo encuadre/zoom que el video exportado. */
  captureFrame: (
    path: string,
    time: number,
    frame: { width: number; height: number; zoom: { scale: number; x: number; y: number } | null } | null = null,
  ) => invoke<string>("capture_frame", { path, time, frame }),
  readCover: (path: string) => invoke<string | null>("read_cover", { path }),
  writeMetadata: (video: string, tags: Record<string, string>, cover: CoverChange, output: string | null) =>
    invoke<string>("write_metadata", { video, tags, cover, output }),
  scanFolder: (path: string, recursive: boolean) => invoke<ScanItem[]>("scan_folder", { path, recursive }),
  startRender: (job: RenderJob) => invoke<void>("start_render", { job }),
  cancelRender: () => invoke<void>("cancel_render"),
  saveText: (path: string, contents: string) => invoke<void>("save_text", { path, contents }),
  loadText: (path: string) => invoke<string>("load_text", { path }),
  fileExists: (path: string) => invoke<boolean>("file_exists", { path }),
  projectsDir: () => invoke<string>("projects_dir"),
  newProjectPath: (name: string, dir: string | null = null) => invoke<string>("new_project_path", { name, dir }),
  listProjects: () => invoke<ProjectEntry[]>("list_projects"),
  deleteProject: (path: string) => invoke<void>("delete_project", { path }),
  takeStartupPaths: () => invoke<string[]>("take_startup_paths"),
  onOpenAsProject: (cb: (paths: string[]) => void): Promise<UnlistenFn> =>
    listen<string[]>("open-as-project", (e) => cb(e.payload)),
  installFfmpeg: () => invoke<FfmpegStatus>("install_ffmpeg"),
  onFfmpegSetup: (cb: (p: FfmpegSetupProgress) => void): Promise<UnlistenFn> =>
    listen<FfmpegSetupProgress>("ffmpeg-setup", (e) => cb(e.payload)),
  defaultExportDir: () => invoke<string>("default_export_dir"),
  dirExists: (path: string) => invoke<boolean>("dir_exists", { path }),
  onRenderProgress: (cb: (p: RenderProgress) => void): Promise<UnlistenFn> =>
    listen<RenderProgress>("render-progress", (e) => cb(e.payload)),
  onRenderDone: (cb: (p: RenderDone) => void): Promise<UnlistenFn> =>
    listen<RenderDone>("render-done", (e) => cb(e.payload)),
};

export const VIDEO_EXTS = ["mp4", "mov", "m4v", "mkv", "webm", "avi"];
export const COVER_VIDEO_EXTS = ["mp4", "m4v"];
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "bmp"];

export const errMsg = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const dirName = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
export const stripExt = (p: string) => p.replace(/\.[^.\\/]+$/, "");

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** Limita cuántas tareas async corren a la vez (miniaturas del listado). */
export function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    queue.shift()!();
  };
  return <T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() =>
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          }),
      );
      next();
    });
}

/** Une carpeta + archivo respetando el separador de la plataforma. */
export const joinPath = (dir: string, file: string) => {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + file : dir + sep + file;
};
