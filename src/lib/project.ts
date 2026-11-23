import { api, type MediaInfo } from "./api";

export interface MediaItem extends MediaInfo {
  id: string;
  thumb?: string;
}

/** Un segmento de un medio colocado en la línea de tiempo. El orden del arreglo es el orden de reproducción. */
export interface Clip {
  id: string;
  mediaId: string;
  in: number;
  out: number;
}

export interface ExportSettings {
  resolution: "1080p" | "1440p" | "2160p";
  orientation: "landscape" | "portrait";
  fps: 60 | 120;
  codec: "h264" | "hevc" | "h264_nvenc" | "hevc_nvenc";
  quality: "high" | "medium" | "low";
}

export interface Project {
  version: 1;
  name: string;
  media: MediaItem[];
  clips: Clip[];
  cover: string | null;
  export: ExportSettings;
}

export const RESOLUTIONS: Record<ExportSettings["resolution"], { label: string; w: number; h: number }> = {
  "1080p": { label: "1080p Full HD", w: 1920, h: 1080 },
  "1440p": { label: "1440p 2K", w: 2560, h: 1440 },
  "2160p": { label: "2160p 4K UHD", w: 3840, h: 2160 },
};

export const QUALITY: Record<ExportSettings["quality"], { label: string; crf: number }> = {
  high: { label: "Alta", crf: 18 },
  medium: { label: "Media", crf: 22 },
  low: { label: "Ligera", crf: 27 },
};

export const CODECS: Record<ExportSettings["codec"], string> = {
  h264: "H.264 (CPU, máxima compatibilidad)",
  hevc: "H.265 / HEVC (CPU, archivos más pequeños)",
  h264_nvenc: "H.264 NVIDIA NVENC (GPU, rápido)",
  hevc_nvenc: "H.265 NVIDIA NVENC (GPU, rápido)",
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const newProject = (name = "Proyecto sin título"): Project => ({
  version: 1,
  name,
  media: [],
  clips: [],
  cover: null,
  export: { resolution: "1080p", orientation: "landscape", fps: 60, codec: "h264", quality: "high" },
});

export const clipLen = (c: Clip) => Math.max(0, c.out - c.in);

export const totalDuration = (clips: Clip[]) => clips.reduce((s, c) => s + clipLen(c), 0);

/** Devuelve el clip que contiene el tiempo `t` de la línea de tiempo y su inicio. */
export function clipAt(clips: Clip[], t: number): { clip: Clip; index: number; start: number } | null {
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLen(clips[i]);
    if (t < acc + len || i === clips.length - 1) {
      return { clip: clips[i], index: i, start: acc };
    }
    acc += len;
  }
  return null;
}

export const clipStart = (clips: Clip[], index: number) =>
  clips.slice(0, index).reduce((s, c) => s + clipLen(c), 0);

export function formatTime(sec: number, withFrames = false): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  if (!withFrames) return base;
  const cs = Math.floor((sec % 1) * 100);
  return `${base}.${pad(cs)}`;
}

const RECENTS_KEY = "reelcut.recents";

export function getRecents(): { path: string; name: string; at: number }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushRecent(path: string, name: string) {
  try {
    const list = getRecents().filter((r) => r.path !== path);
    list.unshift({ path, name, at: Date.now() });
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* ignorar */
  }
}

export function removeRecent(path: string) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(getRecents().filter((r) => r.path !== path)));
  } catch {
    /* ignorar */
  }
}

/** Crea y guarda de inmediato un proyecto nuevo (por defecto en Videos\\Reelcut). */
export async function createProjectFile(name: string, dir: string | null = null): Promise<{ project: Project; path: string }> {
  const project = newProject(name);
  const path = await api.newProjectPath(name, dir);
  await api.saveText(path, JSON.stringify(project, null, 2));
  pushRecent(path, name);
  return { project, path };
}
