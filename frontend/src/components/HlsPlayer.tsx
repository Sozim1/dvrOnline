import { useEffect, useRef, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { getStoredToken } from "../services/api";

type HlsPlayerProps = {
  source?: string;
  label: string;
};

export function HlsPlayer({ source, label }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [message, setMessage] = useState("Aguardando live view.");

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

    async function setupHls() {
      const Hls = (await import("hls.js")).default;
      if (cancelled) return;

      if (Hls.isSupported()) {
        let recovered = false;
        const hls = new Hls({
          lowLatencyMode: true,
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
          if (!data.fatal) return;

          if (!recovered && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            recovered = true;
            setMessage("Reconectando stream HLS...");
            hls.startLoad();
            return;
          }

          if (!recovered && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            recovered = true;
            setMessage("Recuperando player...");
            hls.recoverMediaError();
            return;
          }

          setMessage("Falha ao carregar o stream HLS.");
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

    setupHls().catch(() => setMessage("Falha ao carregar o player HLS."));

    return () => {
      cancelled = true;
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
