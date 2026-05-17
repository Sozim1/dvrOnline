import type { StreamKind } from "../../config/env";
import { getDb } from "../../db/database";

export type RecordingSettings = {
  segmentSeconds: number;
  retentionDays: number;
  retentionAutoDeleteEnabled: boolean;
  retentionRequireBackup: boolean;
  autoRecordingEnabled: boolean;
  recordingStream: StreamKind;
  defaultStream: StreamKind;
  motionStream: StreamKind;
};

export type StorageSettings = {
  recordingsPath: string;
  backupPath: string;
  snapshotsPath: string;
  retentionDays: number;
  retentionAutoDeleteEnabled: boolean;
  retentionRequireBackup: boolean;
  backupEnabled: boolean;
  backupSchedule: "manual" | "daily" | "weekly";
  backupTime: string;
  backupKeepStructure: boolean;
  backupMode: "copy" | "move";
  backupCompress: boolean;
  diskAlertPercent: number;
  storageMaxBytes: number | null;
};

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, value);
}

export function getRecordingSettings(): RecordingSettings {
  return {
    segmentSeconds: Number(getSetting("segment_seconds") ?? "300"),
    retentionDays: Number(getSetting("retention_days") ?? "7"),
    retentionAutoDeleteEnabled: getSetting("retention_auto_delete_enabled") !== "false",
    retentionRequireBackup: getSetting("retention_require_backup") === "true",
    autoRecordingEnabled: getSetting("auto_recording_enabled") === "true",
    recordingStream: getSetting("recording_stream") === "sub" ? "sub" : "main",
    defaultStream: getSetting("default_stream") === "main" ? "main" : "sub",
    motionStream: getSetting("motion_stream") === "main" ? "main" : "sub"
  };
}

export function getStorageSettings(): StorageSettings {
  const backupSchedule = getSetting("backup_schedule");
  const backupMode = getSetting("backup_mode");
  const maxBytes = Number(getSetting("storage_max_bytes") ?? "");

  return {
    recordingsPath: getSetting("recordings_path") ?? "./storage/recordings",
    backupPath: getSetting("backup_path") ?? "./storage/backups",
    snapshotsPath: getSetting("snapshots_path") ?? "./storage/snapshots",
    retentionDays: Number(getSetting("retention_days") ?? "7"),
    retentionAutoDeleteEnabled: getSetting("retention_auto_delete_enabled") !== "false",
    retentionRequireBackup: getSetting("retention_require_backup") === "true",
    backupEnabled: getSetting("backup_enabled") === "true",
    backupSchedule:
      backupSchedule === "daily" || backupSchedule === "weekly" ? backupSchedule : "manual",
    backupTime: getSetting("backup_time") ?? "02:00",
    backupKeepStructure: getSetting("backup_keep_structure") !== "false",
    backupMode: backupMode === "move" ? "move" : "copy",
    backupCompress: getSetting("backup_compress") === "true",
    diskAlertPercent: Number(getSetting("disk_alert_percent") ?? "85"),
    storageMaxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : null
  };
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings ORDER BY key ASC").all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
