import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Tabs, toast } from "@heroui/react";
import { ArrowLeft, FileArrowUp, FolderOpen, Video } from "@gravity-ui/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import MetadataEditor from "../components/meta/MetadataEditor";
import FolderScanner, { type FolderState } from "../components/meta/FolderScanner";
import { api, baseName, errMsg, VIDEO_EXTS } from "../lib/api";

type Tab = "single" | "folder";

// La carpeta vinculada y su último escaneo se guardan hasta que el usuario la desvincule.
const STORE_KEY = "reelcut.meta.folder";
const TAB_KEY = "reelcut.meta.tab";
const EMPTY: FolderState = { folder: null, recursive: false, items: [], scanning: false };

function loadFolder(): FolderState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw);
    return { folder: v.folder ?? null, recursive: !!v.recursive, items: Array.isArray(v.items) ? v.items : [], scanning: false };
  } catch {
    return EMPTY;
  }
}

function storeFolder(f: FolderState) {
  try {
    if (!f.folder) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, JSON.stringify({ folder: f.folder, recursive: f.recursive, items: f.items }));
  } catch {
    // Si el escaneo es demasiado grande, al menos recordar la carpeta.
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ folder: f.folder, recursive: f.recursive, items: [] }));
    } catch {
      /* ignorar */
    }
  }
}

export default function MetadataManager({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as Tab) || (loadFolder().folder ? "folder" : "single");
    } catch {
      return "single";
    }
  });
  const [single, setSingle] = useState<string | null>(null);
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const [folder, setFolder] = useState<FolderState>(loadFolder);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const scanToken = useRef(0);

  const scan = useCallback(async (dir: string, recursive: boolean) => {
    const token = ++scanToken.current;
    setFolder((f) => ({ ...f, folder: dir, recursive, scanning: true, items: f.folder === dir ? f.items : [] }));
    try {
      const items = await api.scanFolder(dir, recursive);
      if (token === scanToken.current) setFolder({ folder: dir, recursive, items, scanning: false });
    } catch (e) {
      toast.danger("No se pudo escanear la carpeta", { description: errMsg(e) });
      if (token === scanToken.current) setFolder((f) => ({ ...f, scanning: false }));
    }
  }, []);

  // Persistir carpeta + escaneo y pestaña activa
  useEffect(() => {
    if (!folder.scanning) storeFolder(folder);
  }, [folder]);
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* ignorar */
    }
  }, [tab]);

  // Al entrar: mostrar el último escaneo guardado y refrescarlo en segundo plano.
  useEffect(() => {
    const f = loadFolder();
    if (f.folder) scan(f.folder, f.recursive);
  }, [scan]);

  const unlink = useCallback(() => {
    scanToken.current++;
    setFolderEdit(null);
    setFolder(EMPTY);
    storeFolder(EMPTY);
  }, []);

  /** Actualiza una fila del listado tras guardar. */
  const refreshItem = useCallback(
    async (output: string, overwritten: boolean) => {
      if (!overwritten) {
        if (folder.folder) scan(folder.folder, folder.recursive);
        return;
      }
      try {
        const info = await api.probe(output);
        setFolder((f) => ({ ...f, items: f.items.map((i) => (i.path === output ? { ...i, info, error: null } : i)) }));
      } catch {
        /* ignorar */
      }
    },
    [folder.folder, folder.recursive, scan],
  );

  async function pickVideo() {
    const sel = await open({ filters: [{ name: "Videos", extensions: VIDEO_EXTS }] });
    if (typeof sel === "string") setSingle(sel);
  }

  // Arrastrar desde el Explorador: un video abre el editor, una carpeta se escanea.
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent(async (e) => {
      if (e.payload.type !== "drop" || !e.payload.paths.length) return;
      const p = e.payload.paths[0];
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      if (VIDEO_EXTS.includes(ext)) {
        setTab("single");
        setSingle(p);
      } else if (!(await api.fileExists(p))) {
        // No es un archivo: se trata como carpeta
        setTab("folder");
        setFolderEdit(null);
        scan(p, false);
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, [scan]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-3 py-2">
        <Button isIconOnly variant="ghost" size="sm" aria-label="Volver" onPress={onBack}>
          <ArrowLeft />
        </Button>
        <h2 className="font-semibold">Metadata Manager</h2>
        <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as Tab)} className="ml-4">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Modo">
              <Tabs.Tab id="single">
                <Video className="mr-1.5 size-4" />
                Editar un video
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="folder">
                <FolderOpen className="mr-1.5 size-4" />
                Revisar carpeta
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <div className="flex-1" />
        {tab === "single" && single && (
          <Button size="sm" variant="secondary" onPress={pickVideo}>
            <FileArrowUp />
            Abrir otro video
          </Button>
        )}
        {tab === "folder" && folderEdit && (
          <Button size="sm" variant="secondary" onPress={() => setFolderEdit(null)}>
            <ArrowLeft />
            Volver al listado
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1">
        {tab === "single" &&
          (single ? (
            <MetadataEditor key={single} path={single} onSaved={(out, ow) => !ow && setSingle(out)} />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <button
                onClick={pickVideo}
                className="flex h-72 w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border text-muted hover:bg-surface"
              >
                <FileArrowUp className="size-10" />
                <span className="text-lg font-medium text-foreground">Elige o arrastra un video</span>
                <span className="text-sm">Edita título, portada, descripción, fechas y más (MP4 / M4V)</span>
              </button>
            </div>
          ))}

        {tab === "folder" &&
          (folderEdit ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-border bg-surface px-4 py-1.5 text-xs text-muted">
                {folder.folder} › <span className="text-foreground">{baseName(folderEdit)}</span>
              </div>
              <div className="min-h-0 flex-1">
                <MetadataEditor key={folderEdit} path={folderEdit} onSaved={refreshItem} />
              </div>
            </div>
          ) : (
            <FolderScanner state={folder} onScan={scan} onEdit={setFolderEdit} onUnlink={unlink} />
          ))}
      </div>
    </div>
  );
}
