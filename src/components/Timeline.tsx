import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl } from "../lib/api";
import { clipLen, formatTime, totalDuration, type Clip, type MediaItem } from "../lib/project";

interface Props {
  clips: Clip[];
  media: Map<string, MediaItem>;
  playhead: number;
  zoom: number; // px por segundo
  selectedId: string | null;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  /** Se llama una vez al iniciar una edición (para el historial de deshacer). */
  onBeginEdit: () => void;
  onTrim: (id: string, inPoint: number, outPoint: number) => void;
  onReorder: (from: number, to: number) => void;
  /** Medio arrastrándose desde la biblioteca (posición del puntero). */
  externalDrag?: { x: number; y: number } | null;
  /** Al soltar el medio: índice de inserción, o null si se soltó fuera. */
  onExternalDrop?: (index: number | null) => void;
}

const MIN_LEN = 0.1;
const HEADER = 28;
const TRACK_H = 72;
const PAD_LEFT = 12;

function tickStep(zoom: number) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s * zoom >= 70) ?? 600;
}

type Drag =
  | { kind: "trim-l" | "trim-r"; id: string; startX: number; in0: number; out0: number; dur: number }
  | { kind: "move"; id: string; index: number; startX: number; active: boolean; x: number }
  | { kind: "scrub" };

export default function Timeline(p: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const total = totalDuration(p.clips);
  const width = Math.max(total * p.zoom + 400, 800);
  const step = tickStep(p.zoom);

  const layout = useMemo(() => {
    let acc = 0;
    return p.clips.map((c) => {
      const x = PAD_LEFT + acc * p.zoom;
      const w = clipLen(c) * p.zoom;
      acc += clipLen(c);
      return { clip: c, x, w };
    });
  }, [p.clips, p.zoom]);

  // Índice de inserción para un medio arrastrado desde la biblioteca
  const extIndex = useMemo(() => {
    const d = p.externalDrag;
    const el = scrollRef.current;
    if (!d || !el) return null;
    const r = el.getBoundingClientRect();
    if (d.x < r.left || d.x > r.right || d.y < r.top - 20 || d.y > r.bottom) return null;
    const x = d.x - r.left + el.scrollLeft;
    const idx = layout.findIndex((l) => x < l.x + l.w / 2);
    return idx === -1 ? layout.length : idx;
  }, [p.externalDrag, layout]);
  const extIndexRef = useRef(extIndex);
  extIndexRef.current = extIndex;
  const dropCb = useRef(p.onExternalDrop);
  dropCb.current = p.onExternalDrop;
  const extActive = !!p.externalDrag;

  useEffect(() => {
    if (!extActive) return;
    const up = () => dropCb.current?.(extIndexRef.current);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [extActive]);

  const shownDrop = dropIndex ?? extIndex;

  const timeFromClientX = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - PAD_LEFT;
    return Math.max(0, Math.min(total, x / p.zoom));
  };

  // Mantener visible el cabezal durante la reproducción
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || drag) return;
    const x = PAD_LEFT + p.playhead * p.zoom;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
    }
  }, [p.playhead, p.zoom, drag]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (drag.kind === "scrub") {
        p.onSeek(timeFromClientX(e.clientX));
      } else if (drag.kind === "trim-l" || drag.kind === "trim-r") {
        const dt = (e.clientX - drag.startX) / p.zoom;
        if (drag.kind === "trim-l") {
          const nin = Math.min(Math.max(0, drag.in0 + dt), drag.out0 - MIN_LEN);
          p.onTrim(drag.id, nin, drag.out0);
        } else {
          const nout = Math.max(Math.min(drag.dur, drag.out0 + dt), drag.in0 + MIN_LEN);
          p.onTrim(drag.id, drag.in0, nout);
        }
      } else if (drag.kind === "move") {
        const active = drag.active || Math.abs(e.clientX - drag.startX) > 5;
        if (active) {
          const el = scrollRef.current!;
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left + el.scrollLeft;
          // índice de inserción: antes del primer clip cuyo centro está a la derecha del puntero
          let idx = layout.findIndex((l) => x < l.x + l.w / 2);
          if (idx === -1) idx = layout.length;
          setDropIndex(idx);
          setDrag({ ...drag, active, x: e.clientX });
        }
      }
    };
    const up = () => {
      if (drag.kind === "move" && drag.active && dropIndex !== null) {
        let to = dropIndex;
        if (to > drag.index) to -= 1;
        if (to !== drag.index) {
          p.onBeginEdit();
          p.onReorder(drag.index, to);
        }
      }
      setDrag(null);
      setDropIndex(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const ticks: number[] = [];
  for (let t = 0; t * p.zoom < width; t += step) ticks.push(t);

  return (
    <div
      ref={scrollRef}
      className={`relative h-full overflow-x-auto overflow-y-hidden bg-surface transition ${
        extIndex != null ? "ring-2 ring-inset ring-accent" : extActive ? "ring-1 ring-inset ring-accent/40" : ""
      }`}
      onWheel={(e) => {
        if (!e.ctrlKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && scrollRef.current) {
          scrollRef.current.scrollLeft += e.deltaY;
        }
      }}
    >
      <div className="relative h-full" style={{ width }}>
        {/* Regla */}
        <div
          className="sticky top-0 z-10 cursor-pointer border-b border-border bg-surface-secondary"
          style={{ height: HEADER }}
          onPointerDown={(e) => {
            p.onSeek(timeFromClientX(e.clientX));
            setDrag({ kind: "scrub" });
          }}
        >
          {ticks.map((t) => (
            <div key={t} className="absolute top-0 h-full" style={{ left: PAD_LEFT + t * p.zoom }}>
              <div className="h-2 w-px bg-muted/60" />
              <span className="absolute left-1 top-2 whitespace-nowrap text-[10px] text-muted">{formatTime(t)}</span>
            </div>
          ))}
        </div>

        {/* Pista de video */}
        <div
          className="relative mt-3"
          style={{ height: TRACK_H }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              p.onSelect(null);
              p.onSeek(timeFromClientX(e.clientX));
            }
          }}
        >
          {layout.map(({ clip, x, w }, index) => {
            const m = p.media.get(clip.mediaId);
            const selected = clip.id === p.selectedId;
            const moving = drag?.kind === "move" && drag.active && drag.id === clip.id;
            return (
              <div
                key={clip.id}
                className={`group absolute top-0 h-full overflow-hidden rounded-lg border-2 bg-accent/30 ${
                  selected ? "border-warning" : "border-accent/60"
                } ${moving ? "opacity-40" : ""}`}
                style={{
                  left: x,
                  width: Math.max(w, 6),
                  backgroundImage: m?.thumb ? `url("${fileUrl(m.thumb)}")` : undefined,
                  backgroundSize: "auto 100%",
                  backgroundRepeat: "repeat-x",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  p.onSelect(clip.id);
                  setDrag({ kind: "move", id: clip.id, index, startX: e.clientX, active: false, x: e.clientX });
                }}
                onDoubleClick={(e) => p.onSeek(timeFromClientX(e.clientX))}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 truncate bg-black/55 px-2 py-0.5 text-[11px] text-white">
                  {m?.name ?? "Medio no encontrado"} · {formatTime(clipLen(clip), true)}
                </div>
                {/* Manijas de recorte */}
                {(["trim-l", "trim-r"] as const).map((kind) => (
                  <div
                    key={kind}
                    title="Arrastra para recortar"
                    className={`absolute top-0 h-full w-2.5 cursor-ew-resize bg-warning/0 transition group-hover:bg-warning/80 ${
                      kind === "trim-l" ? "left-0" : "right-0"
                    } ${selected ? "bg-warning/80" : ""}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      p.onSelect(clip.id);
                      p.onBeginEdit();
                      setDrag({
                        kind,
                        id: clip.id,
                        startX: e.clientX,
                        in0: clip.in,
                        out0: clip.out,
                        dur: m?.duration ?? clip.out,
                      });
                    }}
                  />
                ))}
              </div>
            );
          })}

          {p.clips.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-border text-xs text-muted">
              Arrastra aquí un medio de la biblioteca
            </div>
          )}
          {shownDrop !== null && (
            <div
              className="absolute -top-1 z-20 h-[calc(100%+8px)] w-1 rounded bg-warning"
              style={{
                left: (shownDrop < layout.length ? layout[shownDrop].x : PAD_LEFT + total * p.zoom) - 2,
              }}
            />
          )}
        </div>

        {/* Cabezal */}
        <div
          className="pointer-events-none absolute top-0 z-20 h-full w-px bg-danger"
          style={{ left: PAD_LEFT + p.playhead * p.zoom }}
        >
          <div className="absolute -left-1.5 top-0 size-3 rotate-45 bg-danger" />
        </div>
      </div>
    </div>
  );
}
