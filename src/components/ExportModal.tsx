import { useEffect, useRef, useState } from "react";
import { Button, Label, ListBox, Modal, ProgressBar, Select, toast } from "@heroui/react";
import { ArrowUpFromSquare, FolderOpen } from "@gravity-ui/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, errMsg, joinPath, type RenderProgress } from "../lib/api";
import {
  CODECS,
  QUALITY,
  RESOLUTIONS,
  clipLen,
  formatTime,
  type ExportSettings,
  type MediaItem,
  type Project,
} from "../lib/project";

interface Props {
  isOpen: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  media: Map<string, MediaItem>;
  onSettings: (s: ExportSettings) => void;
}

type Phase = { kind: "idle" } | { kind: "rendering"; p: RenderProgress | null } | { kind: "done"; output: string };

function Choice<K extends string>(props: {
  label: string;
  value: K;
  options: Record<K, string>;
  onChange: (k: K) => void;
  isDisabled?: boolean;
}) {
  return (
    <Select
      className="w-full"
      value={props.value}
      onChange={(k) => k != null && props.onChange(String(k) as K)}
      isDisabled={props.isDisabled}
    >
      <Label>{props.label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {(Object.keys(props.options) as K[]).map((k) => (
            <ListBox.Item key={k} id={k} textValue={props.options[k]}>
              {props.options[k]}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export default function ExportModal({ isOpen, onOpenChange, project, media, onSettings }: Props) {
  const s = project.export;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const total = project.clips.reduce((a, c) => a + clipLen(c), 0);
  const res = RESOLUTIONS[s.resolution];
  const [w, h] = s.orientation === "portrait" ? [res.h, res.w] : [res.w, res.h];

  useEffect(() => {
    const un1 = api.onRenderProgress((p) => {
      if (phaseRef.current.kind === "rendering") setPhase({ kind: "rendering", p });
    });
    const un2 = api.onRenderDone((d) => {
      if (d.ok) {
        setPhase({ kind: "done", output: d.output });
        toast.success("Video exportado", { description: d.output });
      } else {
        setPhase({ kind: "idle" });
        if (d.cancelled) toast("Renderizado cancelado");
        else toast.danger("Error al renderizar", { description: d.error ?? "", timeout: 0 });
      }
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
    };
  }, []);

  async function start() {
    const dir = await api.projectsDir().catch(() => null);
    const file = `${project.name.replace(/[\\/:*?"<>|]/g, "_")}.mp4`;
    const output = await save({
      defaultPath: dir ? joinPath(dir, file) : file,
      filters: [{ name: "Video MP4", extensions: ["mp4"] }],
    });
    if (!output) return;
    const clips = project.clips.map((c) => {
      const m = media.get(c.mediaId)!;
      return { path: m.path, start: c.in, end: c.out, hasAudio: m.hasAudio };
    });
    try {
      setPhase({ kind: "rendering", p: null });
      await api.startRender({
        clips,
        output: output.toLowerCase().endsWith(".mp4") ? output : `${output}.mp4`,
        width: w,
        height: h,
        fps: s.fps,
        codec: s.codec,
        quality: QUALITY[s.quality].crf,
        cover: project.cover,
      });
    } catch (e) {
      setPhase({ kind: "idle" });
      toast.danger("No se pudo iniciar el renderizado", { description: errMsg(e) });
    }
  }

  const rendering = phase.kind === "rendering";
  const set = (patch: Partial<ExportSettings>) => onSettings({ ...s, ...patch });

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(v) => {
        if (rendering) return; // no cerrar mientras renderiza
        if (!v) setPhase({ kind: "idle" });
        onOpenChange(v);
      }}
      isDismissable={!rendering}
      isKeyboardDismissDisabled={rendering}
    >
      <Modal.Container size="md">
        <Modal.Dialog>
          {!rendering && <Modal.CloseTrigger />}
          <Modal.Header>
            <Modal.Heading>Exportar video</Modal.Heading>
            <p className="text-sm text-muted">
              {project.clips.length} clip(s) · duración {formatTime(total, true)} · {w}×{h} @ {s.fps} fps
            </p>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Choice
                label="Resolución"
                value={s.resolution}
                isDisabled={rendering}
                options={{ "1080p": RESOLUTIONS["1080p"].label, "1440p": RESOLUTIONS["1440p"].label, "2160p": RESOLUTIONS["2160p"].label }}
                onChange={(resolution) => set({ resolution })}
              />
              <Choice
                label="Orientación"
                value={s.orientation}
                isDisabled={rendering}
                options={{ landscape: "Horizontal 16:9", portrait: "Vertical 9:16" }}
                onChange={(orientation) => set({ orientation })}
              />
              <Choice
                label="Cuadros por segundo"
                value={String(s.fps) as "60" | "120"}
                isDisabled={rendering}
                options={{ "60": "60 fps", "120": "120 fps" }}
                onChange={(fps) => set({ fps: Number(fps) as 60 | 120 })}
              />
              <Choice
                label="Calidad"
                value={s.quality}
                isDisabled={rendering}
                options={{ high: QUALITY.high.label, medium: QUALITY.medium.label, low: QUALITY.low.label }}
                onChange={(quality) => set({ quality })}
              />
            </div>
            <Choice
              label="Códec"
              value={s.codec}
              isDisabled={rendering}
              options={CODECS}
              onChange={(codec) => set({ codec })}
            />
            <p className="text-xs text-muted">
              {project.cover ? "✓ Se incrustará la portada del proyecto." : "Sin portada (puedes capturar una en el panel derecho)."}
              {" "}Los videos con otra relación de aspecto se ajustan con barras negras.
            </p>

            {phase.kind === "rendering" && (
              <ProgressBar aria-label="Progreso" value={phase.p?.percent ?? 0} isIndeterminate={!phase.p}>
                <Label>
                  Renderizando
                  {phase.p && ` · ${formatTime(phase.p.seconds)} / ${formatTime(phase.p.total)} · ${Math.round(phase.p.fps)} fps · ${phase.p.speed}`}
                </Label>
                <ProgressBar.Output />
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
              </ProgressBar>
            )}
            {phase.kind === "done" && (
              <div className="rounded-xl bg-success-soft p-3 text-sm text-success-soft-foreground">
                Listo: <span className="break-all">{phase.output}</span>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            {rendering ? (
              <Button variant="danger" onPress={() => api.cancelRender()}>
                Cancelar
              </Button>
            ) : phase.kind === "done" ? (
              <>
                <Button variant="secondary" onPress={() => revealItemInDir(phase.output)}>
                  <FolderOpen />
                  Mostrar en carpeta
                </Button>
                <Button slot="close">Cerrar</Button>
              </>
            ) : (
              <>
                <Button slot="close" variant="secondary">
                  Cancelar
                </Button>
                <Button onPress={start} isDisabled={project.clips.length === 0}>
                  <ArrowUpFromSquare />
                  Renderizar
                </Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
