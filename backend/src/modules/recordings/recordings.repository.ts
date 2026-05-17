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
  createdAt: string;
};

export type UpsertRecordingInput = {
  cameraId: number;
  filePath: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  fileSize: number;
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
    createdAt: row.created_at
  };
}

export function upsertRecording(input: UpsertRecordingInput): void {
  getDb()
    .prepare(
      `INSERT INTO recordings (
        camera_id, file_path, started_at, ended_at, duration_seconds, file_size
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        started_at = excluded.started_at,
        file_size = excluded.file_size,
        ended_at = excluded.ended_at,
        duration_seconds = excluded.duration_seconds`
    )
    .run(
      input.cameraId,
      input.filePath,
      input.startedAt,
      input.endedAt,
      input.durationSeconds,
      input.fileSize
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

export function deleteRecordingRow(id: number): void {
  getDb().prepare("DELETE FROM recordings WHERE id = ?").run(id);
}

export function setRecordingProtected(id: number, isProtected: boolean): PublicRecording | undefined {
  getDb()
    .prepare("UPDATE recordings SET is_protected = ? WHERE id = ?")
    .run(isProtected ? 1 : 0, id);
  return getRecordingById(id);
}
