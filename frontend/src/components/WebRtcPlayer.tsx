import type { StreamKind } from "../services/api";

type WebRtcPlayerProps = {
  stream: StreamKind;
  reloadKey: number;
};

function getWebRtcBaseUrl() {
  const configuredUrl = import.meta.env.VITE_WEBRTC_URL?.trim().replace(/\/$/, "");

  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window === "undefined") {
    return "/webrtc";
  }

  const port = import.meta.env.VITE_WEBRTC_PORT || "8889";
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

export function WebRtcPlayer({ stream, reloadKey }: WebRtcPlayerProps) {
  const path = stream === "main" ? "main" : "sub";
  const startsMuted = import.meta.env.VITE_WEBRTC_MUTED !== "false";
  const src = `${getWebRtcBaseUrl()}/${path}/?controls=true&muted=${startsMuted ? "true" : "false"}&autoplay=true&playsInline=true&r=${reloadKey}`;

  return (
    <div className="player-frame webrtc-player-frame">
      <iframe
        key={`${path}-${reloadKey}`}
        src={src}
        title={`Live WebRTC ${stream}`}
        allow="autoplay; fullscreen; picture-in-picture"
      />
    </div>
  );
}
