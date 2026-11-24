import { useEffect, useRef, useState } from "react";
import { Toast, toast } from "@heroui/react";
import { ask } from "@tauri-apps/plugin-dialog";
import ErrorBoundary from "./components/ErrorBoundary";
import FfmpegSetup from "./components/FfmpegSetup";
import Home from "./views/Home";
import Editor from "./views/Editor";
import MetadataManager from "./views/MetadataManager";
import { api, baseName, errMsg, stripExt, type FfmpegStatus } from "./lib/api";
import { createProjectFile, type Project } from "./lib/project";

export type View =
  | { name: "home" }
  | { name: "editor"; project: Project; path: string | null; importPaths?: string[]; key: number }
  | { name: "metadata" };

export default function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [ffmpeg, setFfmpeg] = useState<FfmpegStatus | null>(null);
  const editorDirty = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const openEditor = (project: Project, path: string | null, importPaths?: string[]) => {
    editorDirty.current = false;
    setView({ name: "editor", project, path, importPaths, key: Date.now() });
  };

  /** Crea un proyecto nuevo con estos videos ya en la línea de tiempo y lo abre. */
  const openVideosAsProject = async (input: string[]) => {
    const paths = [...new Set(input)];
    if (!paths.length) return;
    if (viewRef.current.name === "editor" && editorDirty.current) {
        const ok = await ask("El proyecto actual tiene cambios sin guardar. ¿Abrir el nuevo proyecto de todos modos?", {
          title: "ClipStudio",
          kind: "warning",
          okLabel: "Abrir nuevo",
          cancelLabel: "Cancelar",
        });
      if (!ok) return;
    }
    try {
      const name = stripExt(baseName(paths[0]));
      const { project, path } = await createProjectFile(paths.length > 1 ? `${name} y ${paths.length - 1} más` : name);
      openEditor(project, path, paths);
    } catch (e) {
      toast.danger("No se pudo crear el proyecto", { description: errMsg(e) });
    }
  };
  const openVideosRef = useRef(openVideosAsProject);
  openVideosRef.current = openVideosAsProject;

  // "Abrir como proyecto en ClipStudio" desde el Explorador: al iniciar o con la app ya abierta.
  // Explorer lanza un proceso por archivo seleccionado: se agrupan en un solo proyecto.
  useEffect(() => {
    let pending: string[] = [];
    let timer: number | undefined;
    const flush = () => {
      const paths = pending;
      pending = [];
      openVideosRef.current(paths);
    };
    const enqueue = (paths: string[]) => {
      pending.push(...paths);
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 700);
    };
    api.takeStartupPaths().then((p) => p.length && enqueue(p)).catch(() => {});
    const un = api.onOpenAsProject(enqueue);
    return () => {
      window.clearTimeout(timer);
      un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    api.ffmpegStatus().then(setFfmpeg).catch(() => setFfmpeg({ ffmpeg: null, ffprobe: null, version: null }));
  }, []);

  // Evita que soltar archivos fuera de las zonas de drop navegue el webview.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <Toast.Provider placement="bottom end" />
      {ffmpeg && (!ffmpeg.ffmpeg || !ffmpeg.ffprobe) && <FfmpegSetup onReady={setFfmpeg} />}
      <div className="min-h-0 flex-1">
        <ErrorBoundary resetKey={view.name === "editor" ? view.key : view.name} onHome={() => setView({ name: "home" })}>
        {view.name === "home" && (
          <Home
            ffmpegVersion={ffmpeg?.version ?? null}
            onOpenProject={(project, path) => openEditor(project, path)}
            onOpenVideos={openVideosAsProject}
            onMetadata={() => setView({ name: "metadata" })}
          />
        )}
        {view.name === "editor" && (
          <Editor
            key={view.key}
            initial={view.project}
            initialPath={view.path}
            importPaths={view.importPaths}
            onDirtyChange={(d) => {
              editorDirty.current = d;
            }}
            onClose={() => setView({ name: "home" })}
          />
        )}
        {view.name === "metadata" && <MetadataManager onBack={() => setView({ name: "home" })} />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
