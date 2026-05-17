import { getDb } from "../../db/database";

export type RecordingRow = {
  id: number;
  camera_id: number;
  file_path: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  file_size: number;
  is_protected: number;
  status: string;
  backup_status: string;
  backup_path: string | null;
  deleted_at: string | null;
  is_currently_recording: number;
  created_at: string;
  camera_name?: string;
};

export type PublicRecording = {
  id: number;
  cameraId: number;
  cameraName?: string;
  filePath: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  fileSize: number;
  isProtected: boolean;
  status: string;
  backupStatus: string;
  backupPath: string | null;
  deletedAt: string | null;
  isCurrentlyRecording: boolean;
  createdAt: string;
};

export type UpsertRecordingInput = {
  cameraId: number;
  filePath: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  fileSize: number;
  status?: string;
  isCurrentlyRecording?: boolean;
};

export function toPublicRecording(row: RecordingRow): PublicRecording {
  return {
    id: row.id,
    cameraId: row.camera_id,
    cameraName: row.camera_name,
    filePath: row.file_path,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    fileSize: row.file_size,
    isProtected: Boolean(row.is_protected),
    status: row.status,
    backupStatus: row.backup_status,
    backupPath: row.backup_path,
    deletedAt: row.deleted_at,
    isCurrentlyRecording: Boolean(row.is_currently_recording),
    createdAt: row.created_at
  };
}

export function upsertRecording(input: UpsertRecordingInput): void {
  getDb()
    .prepare(
      `INSERT INTO recordings (
        camera_id, file_path, started_at, ended_at, duration_seconds, file_size, status, is_currently_recording
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        started_at = excluded.started_at,
        file_size = excluded.file_size,
        ended_at = excluded.ended_at,
        duration_seconds = excluded.duration_seconds,
        status = CASE WHEN recordings.status IN ('deleted', 'missing') THEN 'available' ELSE recordings.status END,
        is_currently_recording = excluded.is_currently_recording`
    )
    .run(
      input.cameraId,
      input.filePath,
      input.startedAt,
      input.endedAt,
      input.durationSeconds,
      input.fileSize,
      input.status ?? "available",
      input.isCurrentlyRecording ? 1 : 0
    );
}

export function listRecordings(filters: {
  cameraId?: number;
  date?: string;
}): PublicRecording[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.cameraId) {
    where.push("r.camera_id = ?");
    params.push(filters.cameraId);
  }

  if (filters.date) {
    where.push("substr(r.started_at, 1, 10) = ?");
    params.push(filters.date);
  }

  where.push("r.status != 'deleted'");

  const sql = `
    SELECT r.*, c.name as camera_name
    FROM recordings r
    JOIN cameras c ON c.id = r.camera_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY r.started_at DESC
    LIMIT 500
  `;

  return (getDb().prepare(sql).all(...params) as RecordingRow[]).map(toPublicRecording);
}

export function getRecordingById(id: number): PublicRecording | undefined {
  const row = getDb()
    .prepare(
      `SELECT r.*, c.name as camera_name
       FROM recordings r
       JOIN cameras c ON c.id = r.camera_id
       WHERE r.id = ?`
    )
    .get(id) as RecordingRow | undefined;
  return row ? toPublicRecording(row) : undefined;
}

export function getRecordingRowById(id: number): RecordingRow | undefined {
  return getDb().prepare("SELECT * FROM recordings WHERE id = ?").get(id) as RecordingRow | undefined;
}

export function listRecordingRows(filters: {
  cameraId?: number;
  date?: string;
  includeDeleted?: boolean;
}): RecordingRow[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.cameraId) {
    where.push("camera_id = ?");
    params.push(filters.cameraId);
  }

  if (filters.date) {
    where.push("substr(started_at, 1, 10) = ?");
    params.push(filters.date);
  }

  if (!filters.includeDeleted) {
    where.push("status != 'deleted'");
  }

  return getDb()
    .prepare(
      `SELECT *
       FROM recordings
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY started_at ASC`
    )
    .all(...params) as RecordingRow[];
}

export function deleteRecordingRow(id: number): void {
  getDb().prepare("DELETE FROM recordings WHERE id = ?").run(id);
}

export function setRecordingProtected(id: number, isProtected: boolean): PublicRecording | undefined {
  getDb()
    .prepare("UPDATE recordings SET is_protected = ? WHERE id = ?")
    .run(isProtected ? 1 : 0, id);
  return getRecordingById(id);
}

export function updateRecordingBackup(
  id: number,
  backupStatus: "pending" | "backed_up" | "failed",
  backupPath?: string | null
): void {
  getDb()
    .prepare(
      `UPDATE recordings
       SET backup_status = ?, backup_path = COALESCE(?, backup_path)
       WHERE id = ?`
    )
    .run(backupStatus, backupPath ?? null, id);
}

export function markRecordingDeleted(id: number): void {
  getDb()
    .prepare(
      `UPDATE recordings
       SET status = 'deleted', deleted_at = datetime('now'), is_currently_recording = 0
       WHERE id = ?`
    )
    .run(id);
}

export function markRecordingMissing(id: number): void {
  getDb()
    .prepare("UPDATE recordings SET status = 'missing', is_currently_recording = 0 WHERE id = ?")
    .run(id);
}

export function clearCurrentRecordingFlags(cameraId: number): void {
  getDb()
    .prepare("UPDATE recordings SET is_currently_recording = 0 WHERE camera_id = ?")
    .run(cameraId);
}
