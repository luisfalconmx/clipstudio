import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ProgressBar } from "@heroui/react";
import { ArrowsRotateRight, Cpu, TriangleExclamation } from "@gravity-ui/icons";
import { api, errMsg, formatBytes, type FfmpegSetupProgress, type FfmpegStatus } from "../lib/api";
import { LogoMark, PageBackdrop } from "./ui/Shell";

const STAGE: Record<FfmpegSetupProgress["stage"], string> = {
  download: "Descargando",
  verify: "Verificando integridad (SHA-256)",
  extract: "Instalando",
  done: "Listo",
};

/**
 * Pantalla de primer uso: descarga e instala ffmpeg una sola vez en los datos
 * locales de ClipStudio. Las actualizaciones de la app no lo vuelven a descargar.
 */
export default function FfmpegSetup({ onReady }: { onReady: (s: FfmpegStatus) => void }) {
  const [progress, setProgress] = useState<FfmpegSetupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setProgress(null);
    try {
      const status = await api.installFfmpeg();
      if (status.ffmpeg && status.ffprobe) onReady(status);
      else setError("ffmpeg se descargó, pero no se pudo encontrar después de instalarlo.");
    } catch (e) {
      setError(errMsg(e));
    }
  }, [onReady]);

  useEffect(() => {
    const un = api.onFfmpegSetup(setProgress);
    if (!started.current) {
      started.current = true;
      run();
    }
    return () => {
      un.then((f) => f());
    };
  }, [run]);

  const pct = progress?.total ? Math.round((progress.downloaded / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center text-white">
      <PageBackdrop />
      <div className="glass relative flex w-full max-w-lg flex-col gap-6 rounded-3xl p-8">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h2 className="text-xl font-semibold">Preparando ClipStudio</h2>
            <p className="text-sm text-white/55">Solo la primera vez · no se repite al actualizar</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-4 text-sm text-white/70">
          <Cpu className="mt-0.5 size-5 shrink-0 text-red-500" />
          <p>
            Descargando el motor de video <b className="text-white">ffmpeg 9.0</b> (≈ 90 MB). Se guarda en los datos de
            ClipStudio y se reutiliza en todas las actualizaciones.
          </p>
        </div>

        {error ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger-soft-foreground">
              <TriangleExclamation className="mt-0.5 size-5 shrink-0" />
              <p className="select-text break-words">{error}</p>
            </div>
            <Button onPress={run} className="self-end">
              <ArrowsRotateRight />
              Reintentar
            </Button>
          </div>
        ) : (
          <ProgressBar
            aria-label="Progreso"
            value={progress?.stage === "download" ? pct : progress ? 100 : 0}
            isIndeterminate={!progress || progress.stage === "verify" || progress.stage === "extract"}
          >
            <div className="flex w-full justify-between text-sm">
              <span>{progress ? STAGE[progress.stage] : "Conectando…"}</span>
              <span className="tabular-nums text-white/55">
                {progress?.stage === "download" && progress.total
                  ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)} · ${pct}%`
                  : ""}
              </span>
            </div>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        )}
      </div>
    </div>
  );
}
