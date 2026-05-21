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
LOG_LEVEL="${WEBRTC_RELAY_LOG_LEVEL:-warning}"
RESTART_DELAY="${WEBRTC_RELAY_RESTART_DELAY_SECONDS:-5}"

while true; do
  echo "Starting WebRTC relay for $STREAM_NAME with Opus audio..."

  ffmpeg \
    -hide_banner \
    -loglevel "$LOG_LEVEL" \
    -fflags nobuffer \
    -flags low_delay \
    -rtsp_transport tcp \
    -i "$SOURCE_URL" \
    -map 0:v:0 \
    -map 0:a:0? \
    -c:v copy \
    -c:a libopus \
    -application lowdelay \
    -frame_duration 20 \
    -b:a "$AUDIO_BITRATE" \
    -ac "$AUDIO_CHANNELS" \
    -ar "$AUDIO_SAMPLE_RATE" \
    -f rtsp \
    -rtsp_transport tcp \
    "rtsp://mediamtx:8554/$STREAM_NAME"

  exit_code="$?"
  echo "WebRTC relay for $STREAM_NAME exited with code $exit_code. Restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
