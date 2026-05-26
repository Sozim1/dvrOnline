#!/bin/sh
set -u

STREAM_NAME="${1:-}"
SOURCE_NAME="${2:-}"

if [ -z "$STREAM_NAME" ] || [ -z "$SOURCE_NAME" ]; then
  echo "Usage: webrtc-relay.sh <stream-name> <RTSP_MAIN|RTSP_SUB>" >&2
  exit 1
fi

case "$SOURCE_NAME" in
  RTSP_MAIN)
    SOURCE_URL="${RTSP_MAIN:-}"
    ;;
  RTSP_SUB)
    SOURCE_URL="${RTSP_SUB:-}"
    ;;
  *)
    echo "Unknown RTSP source env name: $SOURCE_NAME" >&2
    exit 1
    ;;
esac

if [ -z "$SOURCE_URL" ]; then
  echo "$SOURCE_NAME is empty; cannot start WebRTC relay for $STREAM_NAME" >&2
  exit 1
fi

AUDIO_BITRATE="${WEBRTC_AUDIO_BITRATE:-32k}"
AUDIO_CHANNELS="${WEBRTC_AUDIO_CHANNELS:-1}"
AUDIO_SAMPLE_RATE="${WEBRTC_AUDIO_SAMPLE_RATE:-48000}"
VIDEO_MODE="${WEBRTC_VIDEO_MODE:-copy}"
VIDEO_BITRATE="${WEBRTC_VIDEO_BITRATE:-1800k}"
VIDEO_FPS="${WEBRTC_VIDEO_FPS:-15}"
VIDEO_GOP_SECONDS="${WEBRTC_VIDEO_GOP_SECONDS:-2}"
LOG_LEVEL="${WEBRTC_RELAY_LOG_LEVEL:-warning}"
RESTART_DELAY="${WEBRTC_RELAY_RESTART_DELAY_SECONDS:-5}"

while true; do
  echo "Starting WebRTC relay for $STREAM_NAME with video=$VIDEO_MODE and Opus audio..."

  if [ "$VIDEO_MODE" = "transcode" ]; then
    ffmpeg \
      -hide_banner \
      -loglevel "$LOG_LEVEL" \
      -fflags +genpts+igndts+nobuffer+discardcorrupt \
      -flags low_delay \
      -use_wallclock_as_timestamps 1 \
      -rtsp_transport tcp \
      -i "$SOURCE_URL" \
      -map 0:v:0 \
      -map 0:a:0? \
      -c:v libx264 \
      -preset ultrafast \
      -tune zerolatency \
      -profile:v baseline \
      -level:v 4.0 \
      -pix_fmt yuv420p \
      -r "$VIDEO_FPS" \
      -g "$((VIDEO_FPS * VIDEO_GOP_SECONDS))" \
      -keyint_min "$VIDEO_FPS" \
      -bf 0 \
      -b:v "$VIDEO_BITRATE" \
      -c:a libopus \
      -af aresample=async=1:first_pts=0 \
      -application lowdelay \
      -frame_duration 20 \
      -b:a "$AUDIO_BITRATE" \
      -ac "$AUDIO_CHANNELS" \
      -ar "$AUDIO_SAMPLE_RATE" \
      -muxdelay 0 \
      -muxpreload 0 \
      -flush_packets 1 \
      -f rtsp \
      -rtsp_transport tcp \
      "rtsp://mediamtx:8554/$STREAM_NAME"
  else
    ffmpeg \
      -hide_banner \
      -loglevel "$LOG_LEVEL" \
      -fflags +genpts+igndts+nobuffer+discardcorrupt \
      -flags low_delay \
      -use_wallclock_as_timestamps 1 \
      -rtsp_transport tcp \
      -i "$SOURCE_URL" \
      -map 0:v:0 \
      -map 0:a:0? \
      -c:v copy \
      -c:a libopus \
      -af aresample=async=1:first_pts=0 \
      -application lowdelay \
      -frame_duration 20 \
      -b:a "$AUDIO_BITRATE" \
      -ac "$AUDIO_CHANNELS" \
      -ar "$AUDIO_SAMPLE_RATE" \
      -muxdelay 0 \
      -muxpreload 0 \
      -flush_packets 1 \
      -f rtsp \
      -rtsp_transport tcp \
      "rtsp://mediamtx:8554/$STREAM_NAME"
  fi

  exit_code="$?"
  echo "WebRTC relay for $STREAM_NAME exited with code $exit_code. Restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
