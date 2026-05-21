import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { StreamKind } from "../../config/env";
import { env } from "../../config/env";
import { getCameraById } from "../cameras/cameras.repository";
import { ensureDir, assertInside } from "../../shared/paths";
import { HttpError } from "../../shared/http";
import { writeLog } from "../logs/logs.service";

type LiveState = {
  cameraId: number;
  stream: StreamKind;
  startedAt: string;
  directory: string;
  playlistPath: string;
  process: ChildProcess;
};

export type LiveStatus = {
  cameraId: number;
  stream: StreamKind;
  isRunning: boolean;
  startedAt?: string;
  playlistPath: string;
  stale?: boolean;
  lastPlaylistAt?: string | null;
  pid?: number | null;
  restartCount?: number;
  lastError?: string | null;
};

class LiveStreamService {
  private streams = new Map<string, LiveState>();
  private intentionalStopProcesses = new WeakSet<ChildProcess>();
  private restartHistory = new Map<string, number[]>();
  private restartCount = new Map<string, number>();
  private lastError = new Map<string, string | null>();

  async start(cameraId: number, stream: StreamKind): Promise<LiveStatus> {
    const key = this.key(cameraId, stream);
    const existing = this.streams.get(key);
    if (existing && this.isProcessRunning(existing.process)) {
      if (this.isPlaylistFresh(existing)) return this.toStatus(existing);
      writeLog("ffmpeg", "warning", "Live HLS stale; reiniciando FFmpeg.", { cameraId, stream });
      this.stopState(existing, true);
    } else if (existing) {
      this.streams.delete(key);
    }

    return this.spawnLive(cameraId, stream);
  }

  async restart(cameraId: number, stream: StreamKind): Promise<LiveStatus> {
    const existing = this.streams.get(this.key(cameraId, stream));
    if (existing) this.stopState(existing, true);
    writeLog("ffmpeg", "warning", "Live HLS reiniciada manualmente pelo painel.", { cameraId, stream });
    return this.spawnLive(cameraId, stream);
  }

  stop(cameraId: number, stream: StreamKind): LiveStatus {
    const existing = this.streams.get(this.key(cameraId, stream));
    if (existing) this.stopState(existing, true);

    return {
      cameraId,
      stream,
      isRunning: false,
      playlistPath: this.playlistApiPath(cameraId, stream),
      stale: false,
      lastPlaylistAt: null,
      pid: null,
      restartCount: this.restartCount.get(this.key(cameraId, stream)) ?? 0,
      lastError: this.lastError.get(this.key(cameraId, stream)) ?? null
    };
  }

  stopAll(): void {
    for (const state of this.streams.values()) {
      this.stopState(state, true);
    }
    this.streams.clear();
  }

  status(cameraId: number, stream: StreamKind): LiveStatus {
    const state = this.streams.get(this.key(cameraId, stream));
    if (state && this.isProcessRunning(state.process)) {
      return this.toStatus(state);
    }

    return {
      cameraId,
      stream,
      isRunning: false,
      playlistPath: this.playlistApiPath(cameraId, stream),
      stale: false,
      lastPlaylistAt: this.getPlaylistMtime(this.getStreamDir(cameraId, stream)),
      pid: null,
      restartCount: this.restartCount.get(this.key(cameraId, stream)) ?? 0,
      lastError: this.lastError.get(this.key(cameraId, stream)) ?? null
    };
  }

  getHlsFile(cameraId: number, stream: StreamKind, fileName: string): string {
    const directory = this.getStreamDir(cameraId, stream);
    const safeName = path.basename(fileName);
    const filePath = path.join(directory, safeName);
    assertInside(filePath, directory);
    return filePath;
  }

  private async spawnLive(cameraId: number, stream: StreamKind): Promise<LiveStatus> {
    const key = this.key(cameraId, stream);
    const camera = getCameraById(cameraId);
    if (!camera) throw new HttpError(404, "Camera nao encontrada.");

    const rtspUrl = stream === "main" ? camera.rtsp_main : camera.rtsp_sub;
    if (!rtspUrl) throw new HttpError(400, `Stream ${stream} nao configurado.`);

    const directory = this.getStreamDir(cameraId, stream);
    fs.rmSync(directory, { recursive: true, force: true });
    ensureDir(directory);

    const playlistPath = path.join(directory, "index.m3u8");
    const segmentPattern = path.join(directory, "segment-%06d.ts");
    const codecArgs = env.hlsTranscode
      ? [
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-tune",
          "zerolatency",
          "-crf",
          String(env.hlsTranscodeCrf),
          "-pix_fmt",
          "yuv420p"
        ]
      : ["-c:v", "copy"];

    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-rtsp_transport",
      "tcp",
      "-rw_timeout",
      String(env.hlsRtspTimeoutMicroseconds),
      "-i",
      rtspUrl,
      "-an",
      ...codecArgs,
      "-f",
      "hls",
      "-hls_time",
      String(env.hlsSegmentSeconds),
      "-hls_list_size",
      String(env.hlsListSize),
      "-hls_delete_threshold",
      "4",
      "-hls_flags",
      "delete_segments+omit_endlist+program_date_time",
      "-hls_segment_filename",
      segmentPattern,
      playlistPath
    ];

    const child = spawn(env.ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    const state: LiveState = {
      cameraId,
      stream,
      directory,
      playlistPath,
      startedAt: new Date().toISOString(),
      process: child
    };

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        this.lastError.set(key, text);
        console.warn(`[live:${cameraId}:${stream}] ${text}`);
      }
    });

    child.on("error", (error) => {
      this.lastError.set(key, error.message);
      writeLog("ffmpeg", "error", "Falha ao iniciar FFmpeg da live.", { cameraId, stream, error: error.message });
      console.error(`[live:${cameraId}:${stream}] falha ao iniciar ffmpeg`, error);
      this.streams.delete(key);
    });

    child.on("close", (code) => {
      const wasIntentional = this.intentionalStopProcesses.has(child);
      console.warn(`[live:${cameraId}:${stream}] ffmpeg finalizado com codigo ${code}`);
      if (this.streams.get(key)?.process === child) {
        this.streams.delete(key);
      }
      writeLog(wasIntentional ? "ffmpeg" : "system", wasIntentional ? "info" : "warning", "FFmpeg da live finalizado.", {
        cameraId,
        stream,
        code,
        wasIntentional
      });
      if (!wasIntentional) this.scheduleAutoRestart(cameraId, stream);
    });

    this.streams.set(key, state);
    writeLog("ffmpeg", "info", "FFmpeg da live iniciado.", { cameraId, stream, pid: child.pid });
    try {
      await this.waitForPlaylist(state);
      return this.toStatus(state);
    } catch (error) {
      this.stopState(state, true);
      throw error;
    }
  }

  private toStatus(state: LiveState): LiveStatus {
    const key = this.key(state.cameraId, state.stream);
    return {
      cameraId: state.cameraId,
      stream: state.stream,
      isRunning: this.isProcessRunning(state.process),
      startedAt: state.startedAt,
      playlistPath: this.playlistApiPath(state.cameraId, state.stream),
      stale: !this.isPlaylistFresh(state),
      lastPlaylistAt: this.getPlaylistMtime(state.directory),
      pid: state.process.pid ?? null,
      restartCount: this.restartCount.get(key) ?? 0,
      lastError: this.lastError.get(key) ?? null
    };
  }

  private isProcessRunning(process: ChildProcess): boolean {
    return process.exitCode === null && !process.killed;
  }

  private async waitForPlaylist(state: LiveState): Promise<void> {
    const startedAt = Date.now();
    const timeoutMs = env.hlsStartTimeoutSeconds * 1000;

    while (Date.now() - startedAt < timeoutMs) {
      if (!this.isProcessRunning(state.process)) {
        throw new HttpError(502, "FFmpeg encerrou antes de criar a live HLS.");
      }

      if (this.playlistHasSegments(state.playlistPath)) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new HttpError(504, "Timeout aguardando FFmpeg criar a playlist HLS.");
  }

  private playlistHasSegments(playlistPath: string): boolean {
    if (!fs.existsSync(playlistPath) || fs.statSync(playlistPath).size <= 0) return false;
    return fs.readFileSync(playlistPath, "utf8").includes(".ts");
  }

  private isPlaylistFresh(state: LiveState): boolean {
    if (!fs.existsSync(state.playlistPath)) return false;
    const ageMs = Date.now() - fs.statSync(state.playlistPath).mtime.getTime();
    return ageMs <= env.hlsStaleSeconds * 1000;
  }

  private getPlaylistMtime(directory: string): string | null {
    const playlistPath = path.join(directory, "index.m3u8");
    if (!fs.existsSync(playlistPath)) return null;
    return fs.statSync(playlistPath).mtime.toISOString();
  }

  private scheduleAutoRestart(cameraId: number, stream: StreamKind): void {
    const key = this.key(cameraId, stream);
    if (!this.canRestart(key)) {
      writeLog("ffmpeg", "error", "Limite de reinicios automaticos da live atingido.", { cameraId, stream });
      return;
    }

    setTimeout(() => {
      if (this.streams.has(key)) return;
      this.incrementRestart(key);
      this.spawnLive(cameraId, stream)
        .then(() => {
          writeLog("ffmpeg", "warning", "Live HLS reiniciada automaticamente.", { cameraId, stream });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.lastError.set(key, message);
          writeLog("ffmpeg", "error", "Falha ao reiniciar live HLS automaticamente.", {
            cameraId,
            stream,
            error: message
          });
          this.scheduleAutoRestart(cameraId, stream);
        });
    }, 5000).unref?.();
  }

  private canRestart(key: string): boolean {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const recent = (this.restartHistory.get(key) ?? []).filter((entry) => now - entry < windowMs);
    this.restartHistory.set(key, recent);
    return recent.length < 5;
  }

  private incrementRestart(key: string): void {
    const recent = this.restartHistory.get(key) ?? [];
    recent.push(Date.now());
    this.restartHistory.set(key, recent);
    this.restartCount.set(key, (this.restartCount.get(key) ?? 0) + 1);
  }

  private stopState(state: LiveState, intentional: boolean): void {
    if (intentional) this.intentionalStopProcesses.add(state.process);
    state.process.kill("SIGTERM");
    this.streams.delete(this.key(state.cameraId, state.stream));
  }

  private getStreamDir(cameraId: number, stream: StreamKind): string {
    return path.join(env.hlsPath, String(cameraId), stream);
  }

  private playlistApiPath(cameraId: number, stream: StreamKind): string {
    return `/api/live/${cameraId}/${stream}/index.m3u8`;
  }

  private key(cameraId: number, stream: StreamKind): string {
    return `${cameraId}:${stream}`;
  }
}

export const liveStreamService = new LiveStreamService();
