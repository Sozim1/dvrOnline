import type { StreamKind } from "../../config/env";
import { getDb } from "../../db/database";

export type RecordingSettings = {
  segmentSeconds: number;
  retentionDays: number;
  autoRecordingEnabled: boolean;
  recordingStream: StreamKind;
  defaultStream: StreamKind;
  motionStream: StreamKind;
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
    autoRecordingEnabled: getSetting("auto_recording_enabled") === "true",
    recordingStream: getSetting("recording_stream") === "sub" ? "sub" : "main",
    defaultStream: getSetting("default_stream") === "main" ? "main" : "sub",
    motionStream: getSetting("motion_stream") === "main" ? "main" : "sub"
  };
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings ORDER BY key ASC").all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
