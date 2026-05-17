import fs from "node:fs";
import path from "node:path";
import { getDb } from "../../db/database";
import { ensureDir, resolveStoredPath, slugify, toStoredPath } from "../../shared/paths";
import { HttpError } from "../../shared/http";
import { getCameraById } from "../cameras/cameras.repository";
import {
  getRecordingRowById,
  listRecordingRows,
  updateRecordingBackup,
  type RecordingRow
} from "../recordings/recordings.repository";
import { getStorageSettings } from "../settings/settings.repository";
import { writeLog } from "../logs/logs.service";

export type BackupResult = {
  recordingId: number;
  status: "backed_up" | "skipped" | "failed";
  backupPath?: string;
  message: string;
};

let lastAutoRunKey: string | null = null;
let scheduler: NodeJS.Timeout | undefined;

export function startBackupScheduler(): void {
  if (scheduler) return;
  scheduler = setInterval(() => {
    const settings = getStorageSettings();
    if (!settings.backupEnabled || settings.backupSchedule === "manual") return;

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (hhmm !== settings.backupTime) return;

    const key = `${settings.backupSchedule}:${now.toISOString().slice(0, 10)}:${hhmm}`;
    if (lastAutoRunKey === key) return;
    if (settings.backupSchedule === "weekly" && now.getDay() !== 0) return;

    lastAutoRunKey = key;
    runBackup({}).catch((error) => {
      writeLog("backup", "error", "Backup automatico falhou.", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, 60_000);
  scheduler.unref?.();
}

export async function runBackup(filters: { cameraId?: number; date?: string }): Promise<BackupResult[]> {
  writeLog("backup", "info", "Backup iniciado.", filters);
  const rows = listRecordingRows({
    cameraId: filters.cameraId,
    date: filters.date
  }).filter((row) => row.status === "available");

  const results = rows.map((row) => backupRecordingRow(row));
  writeLog("backup", "info", "Backup concluido.", {
    ...filters,
    total: results.length,
    backedUp: results.filter((result) => result.status === "backed_up").length
  });
  return results;
}

export function backupRecording(recordingId: number): BackupResult {
  const row = getRecordingRowById(recordingId);
  if (!row) throw new HttpError(404, "Gravacao nao encontrada.");
  return backupRecordingRow(row);
}

export function backupDay(cameraId: number, date: string): BackupResult[] {
  return listRecordingRows({ cameraId, date })
    .filter((row) => row.status === "available")
    .map((row) => backupRecordingRow(row));
}

export function listBackupLogs(limit = 200) {
  return getDb()
    .prepare("SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}

function backupRecordingRow(row: RecordingRow): BackupResult {
  const startedAt = new Date(row.started_at);
  const ageMs = Date.now() - resolveStoredStatTime(row);
  if (row.is_currently_recording || ageMs < 30_000) {
    const result = { recordingId: row.id, status: "skipped" as const, message: "Arquivo ainda em gravacao." };
    writeLog("backup", "warning", "Backup ignorado: arquivo em gravacao.", { recordingId: row.id });
    return result;
  }

  if (row.backup_status === "backed_up" && row.backup_path && fs.existsSync(resolveStoredPath(row.backup_path))) {
    return {
      recordingId: row.id,
      status: "skipped",
      backupPath: row.backup_path,
      message: "Backup ja existe."
    };
  }

  const sourcePath = resolveStoredPath(row.file_path);
  if (!fs.existsSync(sourcePath)) {
    updateRecordingBackup(row.id, "failed", null);
    writeBackupLog("failed", "Arquivo origem nao encontrado.", { recordingId: row.id, sourcePath });
    return { recordingId: row.id, status: "failed", message: "Arquivo origem nao encontrado." };
  }

  const camera = getCameraById(row.camera_id);
  const settings = getStorageSettings();
  const cameraSlug = slugify(camera?.name ?? `camera-${row.camera_id}`);
  const dateFolder = row.started_at.slice(0, 10);
  const destinationDir = settings.backupKeepStructure
    ? path.join(settings.backupPath, cameraSlug, dateFolder)
    : settings.backupPath;
  ensureDir(destinationDir);

  const destinationPath = path.join(destinationDir, path.basename(sourcePath));
  try {
    if (!fs.existsSync(destinationPath)) {
      fs.copyFileSync(sourcePath, destinationPath);
    }

    const sourceSize = fs.statSync(sourcePath).size;
    const destinationSize = fs.statSync(destinationPath).size;
    if (sourceSize !== destinationSize) {
      throw new Error("Tamanho do arquivo copiado nao confere.");
    }

    const storedBackupPath = toStoredPath(destinationPath);
    updateRecordingBackup(row.id, "backed_up", storedBackupPath);
    writeBackupLog("success", "Backup de gravacao concluido.", {
      recordingId: row.id,
      sourcePath,
      destinationPath,
      startedAt
    });
    writeLog("backup", "info", "Backup de gravacao concluido.", { recordingId: row.id, destinationPath });

    if (settings.backupMode === "move") {
      fs.rmSync(sourcePath, { force: true });
    }

    return {
      recordingId: row.id,
      status: "backed_up",
      backupPath: storedBackupPath,
      message: "Backup concluido."
    };
  } catch (error) {
    updateRecordingBackup(row.id, "failed", null);
    const message = error instanceof Error ? error.message : "Backup falhou.";
    writeBackupLog("failed", message, { recordingId: row.id, sourcePath, destinationPath });
    writeLog("backup", "error", "Backup de gravacao falhou.", { recordingId: row.id, error: message });
    return { recordingId: row.id, status: "failed", message };
  }
}

function resolveStoredStatTime(row: RecordingRow): number {
  const sourcePath = resolveStoredPath(row.file_path);
  if (!fs.existsSync(sourcePath)) return 0;
  return fs.statSync(sourcePath).mtime.getTime();
}

function writeBackupLog(status: string, message: string, context: Record<string, unknown>) {
  getDb()
    .prepare(
      `INSERT INTO backup_logs (started_at, finished_at, status, message, context_json)
       VALUES (datetime('now'), datetime('now'), ?, ?, ?)`
    )
    .run(status, message, JSON.stringify(context));
}
