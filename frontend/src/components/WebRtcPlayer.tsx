import type { StreamKind } from "../services/api";

type WebRtcPlayerProps = {
  stream: StreamKind;
  reloadKey: number;
};

export function WebRtcPlayer({ stream, reloadKey }: WebRtcPlayerProps) {
  const path = stream === "main" ? "camera_main" : "camera_sub";
  const src = `/webrtc/${path}?controls=true&muted=true&autoplay=true&playsInline=true&r=${reloadKey}`;

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
