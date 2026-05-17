import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export type StreamKind = "main" | "sub";

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(value.toLowerCase());
}

function streamFromEnv(name: string, fallback: StreamKind): StreamKind {
  return process.env[name] === "main" || process.env[name] === "sub"
    ? process.env[name]
    : fallback;
}

function resolveFromCwd(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  timezone: process.env.TZ ?? "America/Sao_Paulo",
  host: process.env.HOST ?? "127.0.0.1",
  port: numberFromEnv("PORT", 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",

  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123",

  cameraName: process.env.CAMERA_NAME ?? "Camera Sala",
  rtspMain: process.env.RTSP_MAIN ?? "",
  rtspSub: process.env.RTSP_SUB ?? "",
  defaultStream: streamFromEnv("DEFAULT_STREAM", "sub"),
  recordingStream: streamFromEnv("RECORDING_STREAM", "main"),
  motionStream: streamFromEnv("MOTION_STREAM", "sub"),

  databasePath: resolveFromCwd(process.env.DATABASE_PATH ?? "./storage/data/nvr.sqlite"),
  recordingsPath: resolveFromCwd(process.env.RECORDINGS_PATH ?? "./storage/recordings"),
  backupPath: resolveFromCwd(process.env.BACKUP_PATH ?? "./storage/backups"),
  hlsPath: resolveFromCwd(process.env.HLS_PATH ?? "./storage/hls"),
  snapshotsPath: resolveFromCwd(process.env.SNAPSHOTS_PATH ?? "./storage/snapshots"),

  autoRecordingEnabled: boolFromEnv("AUTO_RECORDING_ENABLED", false),
  segmentSeconds: numberFromEnv("SEGMENT_SECONDS", 300),
  retentionDays: numberFromEnv("RETENTION_DAYS", 7),
  motionEnabled: boolFromEnv("MOTION_ENABLED", false),
  motionSensitivity: numberFromEnv("MOTION_SENSITIVITY", 25),

  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  hlsSegmentSeconds: numberFromEnv("HLS_SEGMENT_SECONDS", 2),
  hlsTranscode: boolFromEnv("HLS_TRANSCODE", false)
};
