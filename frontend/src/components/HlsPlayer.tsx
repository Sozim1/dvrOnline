import { useEffect, useRef, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { getStoredToken } from "../services/api";

type HlsPlayerProps = {
  source?: string;
  label: string;
  onFatalError?: (reason: string) => void;
};

export function HlsPlayer({ source, label, onFatalError }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onFatalErrorRef = useRef(onFatalError);
  const [message, setMessage] = useState("Aguardando live view.");

  useEffect(() => {
    onFatalErrorRef.current = onFatalError;
  }, [onFatalError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) {
      setMessage("Preparando live view...");
      return;
    }

    const videoElement = video;
    const sourceUrl = source;
    setMessage("Carregando HLS...");

    let cleanup: (() => void) | undefined;
    let cancelled = false;
    let stallTimer: number | undefined;
    let recoveryAttempts = 0;

    function clearStallTimer() {
      if (stallTimer) window.clearTimeout(stallTimer);
      stallTimer = undefined;
    }

    function reportFatal(reason: string) {
      if (cancelled) return;
      setMessage("Reconectando live...");
      onFatalErrorRef.current?.(reason);
    }

    function scheduleStallRecovery(reason: string) {
      if (videoElement.paused || videoElement.ended) return;
      setMessage("Aguardando novos frames da live...");
      clearStallTimer();
      stallTimer = window.setTimeout(() => reportFatal(reason), 10_000);
    }

    function markPlaying() {
      clearStallTimer();
      setMessage("");
    }

    function handleWaiting() {
      scheduleStallRecovery("Player aguardando frames HLS.");
    }

    function handleStalled() {
      scheduleStallRecovery("Player HLS travou sem receber dados.");
    }

    videoElement.addEventListener("waiting", handleWaiting);
    videoElement.addEventListener("stalled", handleStalled);
    videoElement.addEventListener("playing", markPlaying);
    videoElement.addEventListener("timeupdate", markPlaying);

    async function setupHls() {
      const Hls = (await import("hls.js")).default;
      if (cancelled) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 6,
          maxLiveSyncPlaybackRate: 1.25,
          maxBufferLength: 12,
          backBufferLength: 15,
          manifestLoadingTimeOut: 10_000,
          manifestLoadingMaxRetry: 4,
          levelLoadingTimeOut: 10_000,
          levelLoadingMaxRetry: 4,
          fragLoadingTimeOut: 15_000,
          fragLoadingMaxRetry: 4,
          xhrSetup(xhr) {
            const token = getStoredToken();
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setMessage("");
          videoElement.play().catch(() => undefined);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) {
            if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
              scheduleStallRecovery("Buffer HLS travou.");
              hls.startLoad();
            }
            return;
          }

          recoveryAttempts += 1;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoveryAttempts <= 3) {
            setMessage("Reconectando stream HLS...");
            hls.startLoad();
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttempts <= 3) {
            setMessage("Recuperando player...");
            hls.recoverMediaError();
            return;
          }

          reportFatal(`Falha fatal HLS: ${data.details}`);
        });

        hls.loadSource(sourceUrl);
        hls.attachMedia(videoElement);
        cleanup = () => hls.destroy();
        return;
      }

      if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        videoElement.src = sourceUrl;
        videoElement.play().catch(() => undefined);
        setMessage("");
        return;
      }

      setMessage("Este navegador nao suporta HLS.");
    }

    setupHls().catch(() => reportFatal("Falha ao carregar o player HLS."));

    return () => {
      cancelled = true;
      clearStallTimer();
      videoElement.removeEventListener("waiting", handleWaiting);
      videoElement.removeEventListener("stalled", handleStalled);
      videoElement.removeEventListener("playing", markPlaying);
      videoElement.removeEventListener("timeupdate", markPlaying);
      cleanup?.();
    };
  }, [source]);

  return (
    <div className="player-frame">
      <video ref={videoRef} controls muted playsInline aria-label={label} />
      {message ? (
        <div className="player-placeholder">
          <MonitorPlay size={42} />
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}
