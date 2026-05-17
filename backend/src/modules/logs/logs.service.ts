import { getDb } from "../../db/database";

export type LogType = "recording" | "backup" | "retention" | "storage" | "ffmpeg" | "system";
export type LogLevel = "info" | "warning" | "error";

export type SystemLog = {
  id: number;
  type: LogType;
  level: LogLevel;
  message: string;
  contextJson: string | null;
  createdAt: string;
};

type SystemLogRow = {
  id: number;
  type: LogType;
  level: LogLevel;
  message: string;
  context_json: string | null;
  created_at: string;
};

export function writeLog(
  type: LogType,
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  getDb()
    .prepare(
      `INSERT INTO system_logs (type, level, message, context_json)
       VALUES (?, ?, ?, ?)`
    )
    .run(type, level, message, context ? JSON.stringify(context) : null);
}

export function listLogs(filters: {
  type?: LogType;
  level?: LogLevel;
  date?: string;
  search?: string;
  limit?: number;
}): SystemLog[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.type) {
    where.push("type = ?");
    params.push(filters.type);
  }

  if (filters.level) {
    where.push("level = ?");
    params.push(filters.level);
  }

  if (filters.date) {
    where.push("substr(created_at, 1, 10) = ?");
    params.push(filters.date);
  }

  if (filters.search) {
    where.push("(message LIKE ? OR context_json LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const rows = getDb()
    .prepare(
      `SELECT *
       FROM system_logs
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(...params, filters.limit ?? 300) as SystemLogRow[];

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    level: row.level,
    message: row.message,
    contextJson: row.context_json,
    createdAt: row.created_at
  }));
}

export function clearOldLogs(days: number): number {
  const result = getDb()
    .prepare("DELETE FROM system_logs WHERE datetime(created_at) < datetime('now', ?)")
    .run(`-${days} days`);
  return result.changes;
}
