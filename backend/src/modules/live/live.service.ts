import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { StreamKind } from "../../config/env";
import { env } from "../../config/env";
import { getCameraById } from "../cameras/cameras.repository";
import { ensureDir, assertInside } from "../../shared/paths";
import { HttpError } from "../../shared/http";

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
};

class LiveStreamService {
  private streams = new Map<string, LiveState>();

  async start(cameraId: number, stream: StreamKind): Promise<LiveStatus> {
    const key = this.key(cameraId, stream);
    const existing = this.streams.get(key);
    if (existing && this.isProcessRunning(existing.process)) {
      return this.toStatus(existing);
    }

    const camera = getCameraById(cameraId);
    if (!camera) throw new HttpError(404, "Camera nao encontrada.");

    const rtspUrl = stream === "main" ? camera.rtsp_main : camera.rtsp_sub;
    if (!rtspUrl) throw new HttpError(400, `Stream ${stream} nao configurado.`);

    const directory = this.getStreamDir(cameraId, stream);
    fs.rmSync(directory, { recursive: true, force: true });
    ensureDir(directory);

    const playlistPath = path.join(directory, "index.m3u8");
    const segmentPattern = path.join(directory, "segment-%03d.ts");
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
      "-i",
      rtspUrl,
      "-an",
      ...codecArgs,
      "-f",
      "hls",
      "-hls_time",
      String(env.hlsSegmentSeconds),
      "-hls_list_size",
      "6",
      "-hls_flags",
      "delete_segments+omit_endlist",
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
      if (text) console.warn(`[live:${cameraId}:${stream}] ${text}`);
    });

    child.on("error", (error) => {
      console.error(`[live:${cameraId}:${stream}] falha ao iniciar ffmpeg`, error);
      this.streams.delete(key);
    });

    child.on("close", (code) => {
      console.warn(`[live:${cameraId}:${stream}] ffmpeg finalizado com codigo ${code}`);
      this.streams.delete(key);
    });

    this.streams.set(key, state);
    await this.waitForPlaylist(state);
    return this.toStatus(state);
  }

  stop(cameraId: number, stream: StreamKind): LiveStatus {
    const key = this.key(cameraId, stream);
    const existing = this.streams.get(key);
    if (existing) {
      existing.process.kill("SIGTERM");
      this.streams.delete(key);
    }

    return {
      cameraId,
      stream,
      isRunning: false,
      playlistPath: this.playlistApiPath(cameraId, stream)
    };
  }

  stopAll(): void {
    for (const state of this.streams.values()) {
      state.process.kill("SIGTERM");
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
      playlistPath: this.playlistApiPath(cameraId, stream)
    };
  }

  getHlsFile(cameraId: number, stream: StreamKind, fileName: string): string {
    const directory = this.getStreamDir(cameraId, stream);
    const safeName = path.basename(fileName);
    const filePath = path.join(directory, safeName);
    assertInside(filePath, directory);
    return filePath;
  }

  private toStatus(state: LiveState): LiveStatus {
    return {
      cameraId: state.cameraId,
      stream: state.stream,
      isRunning: this.isProcessRunning(state.process),
      startedAt: state.startedAt,
      playlistPath: this.playlistApiPath(state.cameraId, state.stream)
    };
  }

  private isProcessRunning(process: ChildProcess): boolean {
    return process.exitCode === null && !process.killed;
  }

  private async waitForPlaylist(state: LiveState): Promise<void> {
    const startedAt = Date.now();
    const timeoutMs = 12_000;

    while (Date.now() - startedAt < timeoutMs) {
      if (!this.isProcessRunning(state.process)) {
        throw new HttpError(502, "FFmpeg encerrou antes de criar a live HLS.");
      }

      if (fs.existsSync(state.playlistPath) && fs.statSync(state.playlistPath).size > 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new HttpError(504, "Timeout aguardando FFmpeg criar a playlist HLS.");
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
