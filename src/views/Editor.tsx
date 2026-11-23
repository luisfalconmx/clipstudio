import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Kbd, Separator, Slider, Tooltip, toast } from "@heroui/react";
import {
  ArrowLeft,
  ArrowShapeTurnUpLeft,
  ArrowUpFromSquare,
  Camera,
  FloppyDisk,
  MagnifierMinus,
  MagnifierPlus,
  Scissors,
  TrashBin,
} from "@gravity-ui/icons";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Preview, { type PreviewHandle } from "../components/Preview";
import Transport from "../components/Transport";
import Timeline from "../components/Timeline";
import MediaBin from "../components/MediaBin";
import CoverPanel from "../components/CoverPanel";
import ExportModal from "../components/ExportModal";
import { api, errMsg, fileUrl, IMAGE_EXTS, joinPath, VIDEO_EXTS } from "../lib/api";
import {
  RESOLUTIONS,
  clipAt,
  pushRecent,
  totalDuration,
  uid,
  type Clip,
  type MediaItem,
  type Project,
} from "../lib/project";

interface Props {
  initial: Project;
  initialPath: string | null;
  /** Videos a importar y poner en la línea de tiempo al abrir (menú contextual). */
  importPaths?: string[];
  onDirtyChange?: (dirty: boolean) => void;
  onClose: () => void;
}

const AUDIO_KEY = "clipstudio.audio";
function loadAudio(): { volume: number; muted: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? "{}");
    return { volume: typeof v.volume === "number" ? v.volume : 1, muted: !!v.muted };
  } catch {
    return { volume: 1, muted: false };
  }
}

const MAX_HISTORY = 100;

export default function Editor({ initial, initialPath, importPaths, onDirtyChange, onClose }: Props) {
  const [project, setProject] = useState<Project>(initial);
  const [path, setPath] = useState<string | null>(initialPath);
  const [dirty, setDirty] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(40);
  const [importing, setImporting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [audio, setAudio] = useState(loadAudio);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  // Arrastre de un medio de la biblioteca hacia la línea de tiempo
  const [binDrag, setBinDrag] = useState<{ media: MediaItem; sx: number; sy: number; x: number; y: number; active: boolean } | null>(
    null,
  );
  const binDragRef = useRef(binDrag);
  binDragRef.current = binDrag;
  const history = useRef<Project[]>([]);
  const previewRef = useRef<PreviewHandle>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  const media = useMemo(() => new Map(project.media.map((m) => [m.id, m])), [project.media]);
  const total = totalDuration(project.clips);
  const res = RESOLUTIONS[project.export.resolution];
  const aspect = project.export.orientation === "portrait" ? res.h / res.w : res.w / res.h;

  /** Cambia el proyecto. `record` guarda el estado previo para deshacer. */
  const update = useCallback((fn: (p: Project) => Project, record = true) => {
    if (record) {
      history.current.push(projectRef.current);
      if (history.current.length > MAX_HISTORY) history.current.shift();
    }
    setProject((p) => fn(p));
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) {
      setProject(prev);
      setDirty(true);
    }
  }, []);

  // Al abrir: verificar archivos y regenerar miniaturas
  useEffect(() => {
    (async () => {
      const miss = new Set<string>();
      const thumbs: Record<string, string> = {};
      for (const m of initial.media) {
        if (!(await api.fileExists(m.path))) {
          miss.add(m.id);
          continue;
        }
        try {
          thumbs[m.id] = await api.thumbnail(m.path, Math.min(1, m.duration / 2));
        } catch {
          /* ignorar */
        }
      }
      setMissing(miss);
      setProject((p) => ({ ...p, media: p.media.map((m) => (thumbs[m.id] ? { ...m, thumb: thumbs[m.id] } : m)) }));
      if (miss.size) toast.warning(`${miss.size} archivo(s) del proyecto no se encontraron`);
    })();
  }, [initial]);

  // Proyecto creado desde el Explorador: importar los videos y guardar.
  const didImport = useRef(false);
  const [saveAfterImport, setSaveAfterImport] = useState(false);

  // Llaves obligatorias: lo que devuelve un efecto React lo usa como limpieza.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    try {
      localStorage.setItem(AUDIO_KEY, JSON.stringify(audio));
    } catch {
      /* ignorar */
    }
  }, [audio]);

  const toggleMute = useCallback(() => setAudio((a) => ({ ...a, muted: !a.muted || a.volume === 0, volume: a.volume || 1 })), []);
  const setVolume = useCallback((volume: number) => setAudio({ volume, muted: volume === 0 }), []);

  // Pantalla completa: la ventana pasa a fullscreen y la vista previa ocupa todo.
  const toggleFullscreen = useCallback(async (force?: boolean) => {
    const next = force ?? !fullscreenRef.current;
    setFullscreen(next);
    try {
      await getCurrentWindow().setFullscreen(next);
    } catch {
      /* ignorar */
    }
  }, []);
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;
  useEffect(
    () => () => {
      getCurrentWindow()
        .setFullscreen(false)
        .catch(() => {});
    },
    [],
  );

  // Ocultar controles en pantalla completa tras 2.5 s sin mover el mouse
  const hideTimer = useRef<number | undefined>(undefined);
  const pokeControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2500);
  }, []);
  useEffect(() => {
    if (fullscreen) pokeControls();
    else setControlsVisible(true);
  }, [fullscreen, pokeControls]);

  useEffect(() => {
    getCurrentWindow()
      .setTitle(`${dirty ? "● " : ""}${project.name} — ClipStudio`)
      .catch(() => {});
  }, [project.name, dirty]);

  useEffect(() => {
    if (playhead > total) setPlayhead(total);
  }, [total, playhead]);

  // ---------- Medios ----------
  const importPathsImpl = useCallback(
    async (paths: string[], addToTimeline: boolean) => {
      setImporting(true);
      const added: MediaItem[] = [];
      for (const p of paths) {
        try {
          const info = await api.probe(p);
          let thumb: string | undefined;
          try {
            thumb = await api.thumbnail(p, Math.min(1, info.duration / 2));
          } catch {
            /* sin miniatura */
          }
          added.push({ ...info, id: uid(), thumb });
        } catch (e) {
          toast.danger(`No se pudo importar ${p.split(/[\\/]/).pop()}`, { description: errMsg(e) });
        }
      }
      setImporting(false);
      if (!added.length) return;
      update((pr) => ({
        ...pr,
        media: [...pr.media, ...added],
        clips: addToTimeline
          ? [...pr.clips, ...added.map((m) => ({ id: uid(), mediaId: m.id, in: 0, out: m.duration }))]
          : pr.clips,
      }));
    },
    [update],
  );

  useEffect(() => {
    if (!importPaths?.length || didImport.current) return;
    didImport.current = true;
    importPathsImpl(importPaths, true).then(() => setSaveAfterImport(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importDialog() {
    const sel = await open({ multiple: true, filters: [{ name: "Videos", extensions: VIDEO_EXTS }] });
    if (sel) importPathsImpl(Array.isArray(sel) ? sel : [sel], false);
  }

  // Arrastrar archivos desde el Explorador de Windows
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop") {
        const vids = e.payload.paths.filter((p) => VIDEO_EXTS.includes(p.split(".").pop()?.toLowerCase() ?? ""));
        if (vids.length) importPathsImpl(vids, true);
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, [importPathsImpl]);

  const addToTimeline = (m: MediaItem) =>
    update((p) => ({ ...p, clips: [...p.clips, { id: uid(), mediaId: m.id, in: 0, out: m.duration }] }));

  const insertAt = (m: MediaItem, index: number) =>
    update((p) => {
      const clips = [...p.clips];
      clips.splice(Math.min(index, clips.length), 0, { id: uid(), mediaId: m.id, in: 0, out: m.duration });
      return { ...p, clips };
    });

  const binDragging = binDrag != null;
  useEffect(() => {
    if (!binDragging) return;
    const move = (e: PointerEvent) =>
      setBinDrag((d) =>
        d ? { ...d, x: e.clientX, y: e.clientY, active: d.active || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6 } : d,
      );
    // Si no llegó a activarse (fue un clic), se limpia aquí; si estaba activo lo resuelve onExternalDrop.
    const up = () => setTimeout(() => setBinDrag(null), 0);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [binDragging]);

  const onExternalDrop = (index: number | null) => {
    const d = binDragRef.current;
    if (d?.active && index != null) {
      insertAt(d.media, index);
      toast(`Agregado: ${d.media.name}`);
    }
    setBinDrag(null);
  };

  const removeMedia = (m: MediaItem) =>
    update((p) => ({
      ...p,
      media: p.media.filter((x) => x.id !== m.id),
      clips: p.clips.filter((c) => c.mediaId !== m.id),
    }));

  // ---------- Edición ----------
  const splitAtPlayhead = useCallback(() => {
    const p = projectRef.current;
    const hit = clipAt(p.clips, playhead);
    if (!hit) return;
    const local = hit.clip.in + (playhead - hit.start);
    if (local - hit.clip.in < 0.05 || hit.clip.out - local < 0.05) return;
    const a: Clip = { ...hit.clip, out: local };
    const b: Clip = { ...hit.clip, id: uid(), in: local };
    update((pr) => {
      const clips = [...pr.clips];
      clips.splice(hit.index, 1, a, b);
      return { ...pr, clips };
    });
    setSelectedId(b.id);
  }, [playhead, update]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    update((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== selectedId) }));
    setSelectedId(null);
  }, [selectedId, update]);

  const trim = useCallback(
    (id: string, inPoint: number, outPoint: number) =>
      update((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, in: inPoint, out: outPoint } : c)) }), false),
    [update],
  );

  const reorder = useCallback(
    (from: number, to: number) =>
      update((p) => {
        const clips = [...p.clips];
        const [c] = clips.splice(from, 1);
        clips.splice(to, 0, c);
        return { ...p, clips };
      }, false),
    [update],
  );

  const beginEdit = useCallback(() => {
    history.current.push(projectRef.current);
    if (history.current.length > MAX_HISTORY) history.current.shift();
  }, []);

  // ---------- Portada ----------
  async function captureCover() {
    const src = previewRef.current?.sourceAt(playhead);
    if (!src) return;
    setPlaying(false);
    setCapturing(true);
    try {
      const img = await api.captureFrame(src.path, src.time);
      update((p) => ({ ...p, cover: img }));
      toast.success("Fotograma capturado como portada");
    } catch (e) {
      toast.danger("No se pudo capturar el fotograma", { description: errMsg(e) });
    } finally {
      setCapturing(false);
    }
  }

  async function pickCover() {
    const sel = await open({ filters: [{ name: "Imágenes", extensions: IMAGE_EXTS }] });
    if (typeof sel === "string") update((p) => ({ ...p, cover: sel }));
  }

  // ---------- Guardar / cerrar ----------
  const saveProject = useCallback(
    async (saveAs = false) => {
      let target = path;
      if (!target || saveAs) {
        const dir = await api.projectsDir().catch(() => null);
        const file = `${projectRef.current.name.replace(/[\\/:*?"<>|]/g, "_")}.clipstudio`;
        const sel = await save({
          defaultPath: dir ? joinPath(dir, file) : file,
          filters: [{ name: "Proyecto ClipStudio", extensions: ["clipstudio"] }],
        });
        if (!sel) return false;
        target = sel.endsWith(".clipstudio") ? sel : `${sel}.clipstudio`;
      }
      try {
        await api.saveText(target, JSON.stringify(projectRef.current, null, 2));
        setPath(target);
        setDirty(false);
        pushRecent(target, projectRef.current.name);
        toast.success("Proyecto guardado");
        return true;
      } catch (e) {
        toast.danger("No se pudo guardar", { description: errMsg(e) });
        return false;
      }
    },
    [path],
  );

  // Guardar automáticamente cuando termina la importación inicial (ya con el estado aplicado).
  useEffect(() => {
    if (!saveAfterImport) return;
    setSaveAfterImport(false);
    saveProject(false);
  }, [saveAfterImport, saveProject]);

  async function close() {
    if (dirty) {
      const ok = await ask("Hay cambios sin guardar. ¿Salir de todos modos?", {
        title: "ClipStudio",
        kind: "warning",
        okLabel: "Salir sin guardar",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }
    getCurrentWindow().setTitle("ClipStudio").catch(() => {});
    onClose();
  }

  // ---------- Atajos ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || exportOpen) return;
      if ((e.target as HTMLElement)?.closest?.('[role="slider"],[role="listbox"],[role="dialog"]')) return;
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject(e.shiftKey);
      } else if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (e.code === "Space") {
        // Captura: evita que un botón enfocado también reciba el Espacio.
        e.preventDefault();
        e.stopPropagation();
        if (projectRef.current.clips.length) setPlaying((v) => !v);
      } else if (e.key === "Escape" && fullscreenRef.current) {
        e.preventDefault();
        toggleFullscreen(false);
      } else if (e.key.toLowerCase() === "f" && !e.ctrlKey) {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === "m" && !e.ctrlKey) {
        toggleMute();
      } else if (e.key.toLowerCase() === "s" && !e.ctrlKey) {
        splitAtPlayhead();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        setPlayhead((t) => Math.max(0, t - (e.shiftKey ? 1 : 1 / 60)));
      } else if (e.key === "ArrowRight") {
        setPlaying(false);
        setPlayhead((t) => Math.min(total, t + (e.shiftKey ? 1 : 1 / 60)));
      } else if (e.key === "Home") {
        setPlayhead(0);
      } else if (e.key === "End") {
        setPlayhead(total);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [saveProject, undo, splitAtPlayhead, deleteSelected, total, exportOpen, toggleFullscreen, toggleMute]);

  const seek = useCallback((t: number) => {
    setPlaying(false);
    setPlayhead(t);
  }, []);

  const tip = (label: string, key?: string) => (
    <Tooltip.Content>
      {label} {key && <Kbd className="ml-1">{key}</Kbd>}
    </Tooltip.Content>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior */}
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button isIconOnly variant="ghost" size="sm" aria-label="Volver al inicio" onPress={close}>
          <ArrowLeft />
        </Button>
        <input
          className="min-w-0 max-w-xs rounded-lg bg-transparent px-2 py-1 font-semibold outline-none hover:bg-surface focus:bg-surface"
          value={project.name}
          onChange={(e) => update((p) => ({ ...p, name: e.target.value }), false)}
        />
        {dirty && <span className="text-xs text-muted">sin guardar</span>}
        <div className="flex-1" />
        <Tooltip delay={300}>
          <Button size="sm" variant="ghost" onPress={undo} isDisabled={!history.current.length}>
            <ArrowShapeTurnUpLeft />
            Deshacer
          </Button>
          {tip("Deshacer", "Ctrl+Z")}
        </Tooltip>
        <Tooltip delay={300}>
          <Button size="sm" variant="secondary" onPress={() => saveProject()}>
            <FloppyDisk />
            Guardar
          </Button>
          {tip("Guardar proyecto", "Ctrl+S")}
        </Tooltip>
        <Button size="sm" onPress={() => setExportOpen(true)} isDisabled={!project.clips.length}>
          <ArrowUpFromSquare />
          Exportar
        </Button>
      </header>

      {/* Zona superior: medios · vista previa · portada */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-border">
          <MediaBin
            media={project.media}
            importing={importing}
            missing={missing}
            onImport={importDialog}
            onAdd={addToTimeline}
            onRemove={removeMedia}
            onDragStart={(m, e) => setBinDrag({ media: m, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, active: false })}
          />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            className={fullscreen ? "fixed inset-0 z-40 bg-black" : "min-h-0 flex-1"}
            style={fullscreen && !controlsVisible ? { cursor: "none" } : undefined}
            onPointerMove={fullscreen ? pokeControls : undefined}
            onDoubleClick={() => toggleFullscreen()}
          >
            <Preview
              ref={previewRef}
              clips={project.clips}
              media={media}
              playhead={playhead}
              playing={playing}
              aspect={aspect}
              volume={audio.volume}
              muted={audio.muted}
              onTime={setPlayhead}
              onEnded={() => setPlaying(false)}
            />
            {fullscreen && (
              <div
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-6 pb-4 pt-16 transition-opacity duration-300 ${
                  controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Transport
                  overlay
                  playhead={playhead}
                  total={total}
                  playing={playing}
                  disabled={!project.clips.length}
                  volume={audio.volume}
                  muted={audio.muted}
                  fullscreen
                  onTogglePlay={() => setPlaying((v) => !v)}
                  onSeek={seek}
                  onVolume={setVolume}
                  onToggleMute={toggleMute}
                  onToggleFullscreen={() => toggleFullscreen(false)}
                />
              </div>
            )}
          </div>
          <div className="border-t border-border px-3 py-2">
            <Transport
              playhead={playhead}
              total={total}
              playing={playing}
              disabled={!project.clips.length}
              volume={audio.volume}
              muted={audio.muted}
              fullscreen={false}
              onTogglePlay={() => setPlaying((v) => !v)}
              onSeek={seek}
              onVolume={setVolume}
              onToggleMute={toggleMute}
              onToggleFullscreen={() => toggleFullscreen(true)}
            />
          </div>
        </main>
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border">
          <CoverPanel
            cover={project.cover}
            capturing={capturing}
            canCapture={project.clips.length > 0}
            onCapture={captureCover}
            onPickImage={pickCover}
            onClear={() => update((p) => ({ ...p, cover: null }))}
          />
        </aside>
      </div>

      {/* Herramientas de la línea de tiempo */}
      <div className="flex items-center gap-1 border-y border-border px-3 py-1.5">
        <Tooltip delay={300}>
          <Button size="sm" variant="ghost" onPress={splitAtPlayhead} isDisabled={!project.clips.length}>
            <Scissors />
            Dividir
          </Button>
          {tip("Dividir en el cabezal", "S")}
        </Tooltip>
        <Tooltip delay={300}>
          <Button size="sm" variant="ghost" onPress={deleteSelected} isDisabled={!selectedId}>
            <TrashBin />
            Eliminar
          </Button>
          {tip("Eliminar clip seleccionado", "Supr")}
        </Tooltip>
        <Tooltip delay={300}>
          <Button size="sm" variant="ghost" onPress={captureCover} isDisabled={!project.clips.length} isPending={capturing}>
            <Camera />
            Captura → portada
          </Button>
          {tip("Usar el fotograma actual como portada")}
        </Tooltip>
        <Separator orientation="vertical" className="mx-2 h-5" />
        <span className="text-xs text-muted">
          Arrastra medios a la pista · bordes para recortar · clip para reordenar.
        </span>
        <div className="flex-1" />
        <MagnifierMinus className="text-muted" />
        <Slider
          aria-label="Zoom"
          className="w-40"
          minValue={5}
          maxValue={300}
          value={zoom}
          onChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <MagnifierPlus className="text-muted" />
      </div>

      <div className="h-36 shrink-0">
        <Timeline
          clips={project.clips}
          media={media}
          playhead={playhead}
          zoom={zoom}
          selectedId={selectedId}
          onSeek={seek}
          onSelect={setSelectedId}
          onBeginEdit={beginEdit}
          onTrim={trim}
          onReorder={reorder}
          externalDrag={binDrag?.active ? { x: binDrag.x, y: binDrag.y } : null}
          onExternalDrop={onExternalDrop}
        />
      </div>

      {binDrag?.active && (
        <div
          className="pointer-events-none fixed z-50 w-40 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border-2 border-accent bg-surface shadow-2xl"
          style={{ left: binDrag.x, top: binDrag.y }}
        >
          <div className="aspect-video bg-black">
            {binDrag.media.thumb && <img src={fileUrl(binDrag.media.thumb)} className="h-full w-full object-cover" />}
          </div>
          <p className="truncate px-2 py-1 text-[11px]">{binDrag.media.name}</p>
        </div>
      )}

      <ExportModal
        isOpen={exportOpen}
        onOpenChange={setExportOpen}
        project={project}
        media={media}
        onSettings={(s) => update((p) => ({ ...p, export: s }), false)}
      />
    </div>
  );
}
