import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { env, type StreamKind } from "../../config/env";
import {
  assertInside,
  ensureDir,
  localDateFolder,
  localDateTime,
  resolveStoredPath,
  slugify,
  toStoredPath
} from "../../shared/paths";
import { HttpError } from "../../shared/http";
import {
  getCameraById,
  listActiveCameraRows,
  type CameraRow
} from "../cameras/cameras.repository";
import { getRecordingSettings } from "../settings/settings.repository";
import {
  deleteRecordingRow,
  getRecordingById,
  listRecordings,
  setRecordingProtected,
  upsertRecording,
  type PublicRecording
} from "./recordings.repository";

type RecordingProcessState = {
  cameraId: number;
  stream: StreamKind;
  startedAt: string;
  outputDir: string;
  segmentSeconds: number;
  reason: "manual" | "auto";
  process: ChildProcess;
};

export type RecordingStatus = {
  cameraId: number;
  isRunning: boolean;
  stream: StreamKind;
  startedAt?: string;
  outputDir?: string;
  segmentSeconds: number;
  autoRecordingEnabled: boolean;
  reason?: "manual" | "auto";
  pid?: number;
};

class RecordingService {
  private processes = new Map<number, RecordingProcessState>();
  private midnightTimers = new Map<number, NodeJS.Timeout>();
  private intentionalStopProcesses = new WeakSet<ChildProcess>();
  private scanTimer?: NodeJS.Timeout;

  startScanner(): void {
    if (this.scanTimer) return;
    this.scanTimer = setInterval(() => {
      this.scanAllRecordings().catch((error) => {
        console.error("[recording-scan] falha ao indexar gravacoes", error);
      });
    }, 15_000);
    this.scanTimer.unref?.();
  }

  startAutoRecordings(): void {
    const settings = getRecordingSettings();
    if (!settings.autoRecordingEnabled) return;

    for (const camera of listActiveCameraRows()) {
      try {
        this.startRecording(camera.id, "auto");
      } catch (error) {
        console.error(`[recording:${camera.id}] auto gravacao nao iniciou`, error);
      }
    }
  }

  async scanAllRecordings(): Promise<void> {
    for (const camera of listActiveCameraRows()) {
      this.scanCameraRecordings(camera);
    }
  }

  async list(filters: { cameraId?: number; date?: string }): Promise<PublicRecording[]> {
    await this.scanAllRecordings();
    return listRecordings(filters);
  }

  startRecording(cameraId: number, reason: "manual" | "auto" = "manual"): RecordingStatus {
    const existing = this.processes.get(cameraId);
    if (existing && this.isProcessRunning(existing.process)) {
      return this.toStatus(existing);
    }

    const camera = getCameraById(cameraId);
    if (!camera) throw new HttpError(404, "Camera nao encontrada.");

    const settings = getRecordingSettings();
    const stream = settings.recordingStream;
    const rtspUrl = stream === "main" ? camera.rtsp_main : camera.rtsp_sub;
    if (!rtspUrl) throw new HttpError(400, `Stream ${stream} nao configurado para gravacao.`);

    const dayDir = path.join(env.recordingsPath, slugify(camera.name), localDateFolder());
    ensureDir(dayDir);

    const outputPattern = path.join(dayDir, "%H-%M-%S.mp4");
    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-rtsp_transport",
      "tcp",
      "-i",
      rtspUrl,
      "-an",
      "-c",
      "copy",
      "-f",
      "segment",
      "-segment_time",
      String(settings.segmentSeconds),
      "-reset_timestamps",
      "1",
      "-strftime",
      "1",
      outputPattern
    ];

    const child = spawn(env.ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    const state: RecordingProcessState = {
      cameraId,
      stream,
      outputDir: dayDir,
      segmentSeconds: settings.segmentSeconds,
      startedAt: new Date().toISOString(),
      reason,
      process: child
    };

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.warn(`[recording:${cameraId}] ${text}`);
    });

    child.on("error", (error) => {
      console.error(`[recording:${cameraId}] falha ao iniciar ffmpeg`, error);
      this.clearProcess(cameraId);
    });

    child.on("close", (code) => {
      const wasIntentional = this.intentionalStopProcesses.has(child);
      console.warn(`[recording:${cameraId}] ffmpeg finalizado com codigo ${code}`);
      if (this.processes.get(cameraId)?.process === child) {
        this.clearProcess(cameraId);
      }
      this.scanCameraRecordings(camera);
      if (!wasIntentional && reason === "auto" && getRecordingSettings().autoRecordingEnabled) {
        this.scheduleAutoRestart(cameraId);
      }
    });

    this.processes.set(cameraId, state);
    this.scheduleMidnightRestart(cameraId);
    return this.toStatus(state);
  }

  stopRecording(cameraId: number): RecordingStatus {
    const existing = this.processes.get(cameraId);
    if (existing) {
      this.intentionalStopProcesses.add(existing.process);
      existing.process.kill("SIGTERM");
      this.clearProcess(cameraId);
    }

    const settings = getRecordingSettings();
    return {
      cameraId,
      isRunning: false,
      stream: settings.recordingStream,
      segmentSeconds: settings.segmentSeconds,
      autoRecordingEnabled: settings.autoRecordingEnabled
    };
  }

  async restartIfRunning(cameraId: number): Promise<void> {
    const existing = this.processes.get(cameraId);
    if (!existing || !this.isProcessRunning(existing.process)) return;
    const reason = existing.reason;
    this.stopRecording(cameraId);
    this.startRecording(cameraId, reason);
  }

  status(cameraId: number): RecordingStatus {
    const existing = this.processes.get(cameraId);
    if (existing && this.isProcessRunning(existing.process)) {
      return this.toStatus(existing);
    }

    const settings = getRecordingSettings();
    return {
      cameraId,
      isRunning: false,
      stream: settings.recordingStream,
      segmentSeconds: settings.segmentSeconds,
      autoRecordingEnabled: settings.autoRecordingEnabled
    };
  }

  stopAll(): void {
    for (const cameraId of this.processes.keys()) {
      this.stopRecording(cameraId);
    }
    if (this.scanTimer) clearInterval(this.scanTimer);
  }

  getRecordingFilePath(recordingId: number): { recording: PublicRecording; filePath: string } {
    const recording = getRecordingById(recordingId);
    if (!recording) throw new HttpError(404, "Gravacao nao encontrada.");

    const filePath = resolveStoredPath(recording.filePath);
    assertInside(filePath, env.recordingsPath);
    if (!fs.existsSync(filePath)) throw new HttpError(404, "Arquivo da gravacao nao encontrado.");

    return { recording, filePath };
  }

  deleteRecording(recordingId: number): void {
    const { filePath } = this.getRecordingFilePath(recordingId);
    fs.rmSync(filePath, { force: true });
    deleteRecordingRow(recordingId);
  }

  protectRecording(recordingId: number, isProtected: boolean): PublicRecording {
    const recording = setRecordingProtected(recordingId, isProtected);
    if (!recording) throw new HttpError(404, "Gravacao nao encontrada.");
    return recording;
  }

  private scanCameraRecordings(camera: CameraRow): void {
    const root = path.join(env.recordingsPath, slugify(camera.name));
    if (!fs.existsSync(root)) return;

    const settings = getRecordingSettings();
    const dateDirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());

    for (const dateDir of dateDirs) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir.name)) continue;
      const dirPath = path.join(root, dateDir.name);
      const files = fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) => entry.isFile());

      for (const file of files) {
        if (!/^\d{2}-\d{2}-\d{2}\.mp4$/.test(file.name)) continue;
        const fullPath = path.join(dirPath, file.name);
        const stat = fs.statSync(fullPath);
        if (stat.size <= 0) continue;

        const timing = getTimingFromFile(dateDir.name, file.name, stat, settings.segmentSeconds);

        upsertRecording({
          cameraId: camera.id,
          filePath: toStoredPath(fullPath),
          startedAt: timing.startedAt,
          endedAt: timing.endedAt,
          durationSeconds: settings.segmentSeconds,
          fileSize: stat.size
        });
      }
    }
  }

  private toStatus(state: RecordingProcessState): RecordingStatus {
    const settings = getRecordingSettings();
    return {
      cameraId: state.cameraId,
      isRunning: this.isProcessRunning(state.process),
      stream: state.stream,
      startedAt: state.startedAt,
      outputDir: state.outputDir,
      segmentSeconds: state.segmentSeconds,
      autoRecordingEnabled: settings.autoRecordingEnabled,
      reason: state.reason,
      pid: state.process.pid
    };
  }

  private scheduleMidnightRestart(cameraId: number): void {
    const current = this.midnightTimers.get(cameraId);
    if (current) clearTimeout(current);

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 1, 0);
    const delay = nextMidnight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      const existing = this.processes.get(cameraId);
      if (existing && this.isProcessRunning(existing.process)) {
        this.restartIfRunning(cameraId).catch((error) => {
          console.error(`[recording:${cameraId}] falha ao reiniciar na virada do dia`, error);
        });
      }
    }, delay);

    timer.unref?.();
    this.midnightTimers.set(cameraId, timer);
  }

  private scheduleAutoRestart(cameraId: number): void {
    setTimeout(() => {
      if (!getRecordingSettings().autoRecordingEnabled) return;
      if (this.processes.has(cameraId)) return;

      try {
        this.startRecording(cameraId, "auto");
      } catch (error) {
        console.error(`[recording:${cameraId}] falha ao reiniciar gravacao automatica`, error);
        this.scheduleAutoRestart(cameraId);
      }
    }, 5000).unref?.();
  }

  private clearProcess(cameraId: number): void {
    this.processes.delete(cameraId);
    const timer = this.midnightTimers.get(cameraId);
    if (timer) clearTimeout(timer);
    this.midnightTimers.delete(cameraId);
  }

  private isProcessRunning(process: ChildProcess): boolean {
    return process.exitCode === null && !process.killed;
  }
}

function getTimingFromFile(
  dateFolder: string,
  fileName: string,
  stat: fs.Stats,
  seconds: number
): { startedAt: string; endedAt: string } {
  const parsedStart = parseStartedAt(dateFolder, fileName);
  if (parsedStart) {
    const driftMs = stat.mtime.getTime() - parsedStart.getTime();
    const acceptedDriftMs = (seconds + 90) * 1000;
    if (driftMs >= -1000 && driftMs <= acceptedDriftMs) {
      return {
        startedAt: localDateTime(parsedStart),
        endedAt: localDateTime(new Date(parsedStart.getTime() + seconds * 1000))
      };
    }
  }

  const endedAt = stat.mtime;
  const startedAt = new Date(Math.max(0, endedAt.getTime() - seconds * 1000));
  return {
    startedAt: localDateTime(startedAt),
    endedAt: localDateTime(endedAt)
  };
}

function parseStartedAt(dateFolder: string, fileName: string): Date | undefined {
  const match = fileName.match(/^(\d{2})-(\d{2})-(\d{2})\.mp4$/);
  if (!match) return undefined;
  const date = new Date(`${dateFolder}T${match[1]}:${match[2]}:${match[3]}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export const recordingService = new RecordingService();
