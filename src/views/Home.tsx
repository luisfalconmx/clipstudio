import { useEffect, useState } from "react";
import { Button, Card, Input, Label, Modal, TextField, toast } from "@heroui/react";
import { Clock, Filmstrip, Folder, FolderOpen, Picture, Plus, Xmark, Video } from "@gravity-ui/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath as openInExplorer } from "@tauri-apps/plugin-opener";
import { api, errMsg, joinPath, type ProjectEntry } from "../lib/api";
import { createProjectFile, getRecents, pushRecent, removeRecent, type Project } from "../lib/project";

interface Props {
  ffmpegVersion: string | null;
  onOpenProject: (p: Project, path: string | null) => void;
  onMetadata: () => void;
}

const sameDir = (file: string, dir: string) =>
  file.toLowerCase().replace(/[\\/][^\\/]*$/, "") === dir.toLowerCase().replace(/[\\/]+$/, "");

export default function Home({ ffmpegVersion, onOpenProject, onMetadata }: Props) {
  const [recents, setRecents] = useState(getRecents);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("Mi video");
  const [targetDir, setTargetDir] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.projectsDir().then(setProjectsDir).catch(() => {});
    api.listProjects().then(setProjects).catch(() => {});
  }, []);

  async function openPath(path: string) {
    try {
      const text = await api.loadText(path);
      const p = JSON.parse(text) as Project;
      if (p.version !== 1 || !Array.isArray(p.clips)) throw new Error("Archivo de proyecto no válido.");
      pushRecent(path, p.name);
      onOpenProject(p, path);
    } catch (e) {
      toast.danger("No se pudo abrir el proyecto", { description: errMsg(e) });
      removeRecent(path);
      setRecents(getRecents());
    }
  }

  async function openDialog() {
    const path = await open({
      defaultPath: projectsDir ?? undefined,
      filters: [{ name: "Proyecto ClipStudio", extensions: ["clipstudio"] }],
    });
    if (typeof path === "string") openPath(path);
  }

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { project, path } = await createProjectFile(name.trim(), targetDir);
      setNewOpen(false);
      onOpenProject(project, path);
    } catch (e) {
      toast.danger("No se pudo crear el proyecto", { description: errMsg(e) });
    } finally {
      setCreating(false);
    }
  }

  async function pickTargetDir() {
    const sel = await open({ directory: true, defaultPath: targetDir ?? projectsDir ?? undefined });
    if (typeof sel === "string") setTargetDir(sel);
  }

  const otherRecents = projectsDir ? recents.filter((r) => !sameDir(r.path, projectsDir)) : recents;
  const location = targetDir ?? projectsDir;
  const fileName = `${(name.trim() || "Proyecto").replace(/[\\/:*?"<>|]/g, "_")}.clipstudio`;

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-8 py-12">
        <header className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Video className="size-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">ClipStudio</h1>
            <p className="text-sm text-muted">Edita, une y exporta tus videos en 1080p, 2K o 4K a 60 fps.</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ActionCard
            icon={<Plus className="size-6" />}
            title="Nuevo proyecto"
            desc="Importa videos, recórtalos en la línea de tiempo, únelos y renderiza."
            onPress={() => {
              setTargetDir(null);
              setNewOpen(true);
            }}
            primary
          />
          <ActionCard
            icon={<FolderOpen className="size-6" />}
            title="Abrir proyecto"
            desc="Continúa un proyecto .clipstudio guardado."
            onPress={openDialog}
          />
          <ActionCard
            icon={<Picture className="size-6" />}
            title="Metadata Manager"
            desc="Edita título, portada y demás metadata de un video, o revisa una carpeta completa. Sin renderizar."
            onPress={onMetadata}
          />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Mis proyectos</h2>
            {projectsDir && (
              <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted" title={projectsDir}>
                <Folder className="size-3.5 shrink-0" />
                {projectsDir}
              </span>
            )}
            <div className="flex-1" />
            {projectsDir && (
              <Button size="sm" variant="ghost" onPress={() => openInExplorer(projectsDir).catch((e) => toast.danger(errMsg(e)))}>
                <FolderOpen />
                Abrir carpeta
              </Button>
            )}
          </div>
          {projects.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
              Aún no hay proyectos. Los proyectos nuevos se guardan aquí automáticamente.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <button
                  key={p.path}
                  onClick={() => openPath(p.path)}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left transition hover:bg-surface-secondary"
                  title={p.path}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-default">
                    <Filmstrip className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Filmstrip className="size-3" /> {p.clips} clip(s)
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" /> {new Date(p.modified).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {otherRecents.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Recientes en otras carpetas</h2>
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl bg-surface">
              {otherRecents.map((r) => (
                <div key={r.path} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary">
                  <button className="flex min-w-0 flex-1 flex-col text-left" onClick={() => openPath(r.path)}>
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="truncate text-xs text-muted">{r.path}</span>
                  </button>
                  <span className="text-xs text-muted">{new Date(r.at).toLocaleDateString()}</span>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label="Quitar de recientes"
                    onPress={() => {
                      removeRecent(r.path);
                      setRecents(getRecents());
                    }}
                  >
                    <Xmark />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-auto text-xs text-muted">{ffmpegVersion ?? "ffmpeg no detectado"}</footer>
      </div>

      <Modal.Backdrop isOpen={newOpen} onOpenChange={setNewOpen}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Nuevo proyecto</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <TextField value={name} onChange={setName} autoFocus>
                <Label>Nombre</Label>
                <Input placeholder="Mi video" onKeyDown={(e) => e.key === "Enter" && create()} />
              </TextField>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Se guardará en</span>
                <div className="flex items-center gap-2 rounded-xl bg-surface-secondary p-2.5">
                  <Folder className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 break-all text-xs" title={location ?? ""}>
                    {location ? joinPath(location, fileName) : "…"}
                  </span>
                  <Button size="sm" variant="ghost" onPress={pickTargetDir}>
                    Cambiar…
                  </Button>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Cancelar
              </Button>
              <Button isDisabled={!name.trim()} isPending={creating} onPress={create}>
                <Plus />
                Crear
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

function ActionCard(props: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <button onClick={props.onPress} className="text-left outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-3xl">
      <Card className="h-full transition hover:-translate-y-0.5 hover:bg-surface-secondary">
        <div
          className={`flex size-11 items-center justify-center rounded-xl ${
            props.primary ? "bg-accent text-accent-foreground" : "bg-default text-foreground"
          }`}
        >
          {props.icon}
        </div>
        <Card.Header>
          <Card.Title>{props.title}</Card.Title>
          <Card.Description>{props.desc}</Card.Description>
        </Card.Header>
      </Card>
    </button>
  );
}
