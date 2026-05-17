import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { env } from "../config/env";
import { ensureDir } from "../shared/paths";

let db: Database.Database | null = null;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cameras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rtsp_main TEXT NOT NULL,
  rtsp_sub TEXT NOT NULL,
  default_stream TEXT NOT NULL CHECK(default_stream IN ('main', 'sub')),
  recording_stream TEXT NOT NULL CHECK(recording_stream IN ('main', 'sub')),
  motion_stream TEXT NOT NULL CHECK(motion_stream IN ('main', 'sub')),
  is_active INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'offline',
  last_status_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER,
  file_size INTEGER NOT NULL DEFAULT 0,
  is_protected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  backup_status TEXT NOT NULL DEFAULT 'pending',
  backup_path TEXT,
  deleted_at TEXT,
  is_currently_recording INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS motion_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  points_json TEXT NOT NULL,
  sensitivity INTEGER NOT NULL DEFAULT 25,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS motion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER NOT NULL,
  zone_id INTEGER,
  detected_at TEXT NOT NULL,
  motion_score REAL NOT NULL,
  snapshot_path TEXT,
  recording_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE,
  FOREIGN KEY (zone_id) REFERENCES motion_zones(id) ON DELETE SET NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backup_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  message TEXT,
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recordings_camera_started ON recordings(camera_id, started_at);
CREATE INDEX IF NOT EXISTS idx_motion_events_camera_detected ON motion_events(camera_id, detected_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at);
`;

export function initDatabase(): Database.Database {
  if (db) return db;

  ensureDir(path.dirname(env.databasePath));
  ensureDir(env.recordingsPath);
  ensureDir(env.backupPath);
  ensureDir(env.hlsPath);
  ensureDir(env.snapshotsPath);

  db = new Database(env.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(schema);
  migrateDatabase(db);
  seedInitialData(db);
  return db;
}

export function getDb(): Database.Database {
  return initDatabase();
}

function seedInitialData(database: Database.Database): void {
  const userCount = database.prepare("SELECT COUNT(*) as total FROM users").get() as { total: number };
  if (userCount.total === 0) {
    database.prepare(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)"
    ).run(env.adminEmail, bcrypt.hashSync(env.adminPassword, 10));
  }

  database.prepare(`
    INSERT INTO cameras (
      id, name, rtsp_main, rtsp_sub, default_stream, recording_stream, motion_stream, is_active, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      rtsp_main = excluded.rtsp_main,
      rtsp_sub = excluded.rtsp_sub,
      default_stream = excluded.default_stream,
      recording_stream = excluded.recording_stream,
      motion_stream = excluded.motion_stream,
      updated_at = datetime('now')
  `).run(
    env.cameraName,
    env.rtspMain,
    env.rtspSub,
    env.defaultStream,
    env.recordingStream,
    env.motionStream
  );

  const defaults: Array<[string, string]> = [
    ["segment_seconds", String(env.segmentSeconds)],
    ["retention_days", String(env.retentionDays)],
    ["retention_auto_delete_enabled", "true"],
    ["retention_require_backup", "false"],
    ["auto_recording_enabled", String(env.autoRecordingEnabled)],
    ["recording_stream", env.recordingStream],
    ["default_stream", env.defaultStream],
    ["motion_stream", env.motionStream],
    ["motion_enabled", String(env.motionEnabled)],
    ["motion_sensitivity", String(env.motionSensitivity)],
    ["recordings_path", env.recordingsPath],
    ["snapshots_path", env.snapshotsPath],
    ["backup_enabled", "false"],
    ["backup_schedule", "manual"],
    ["backup_time", "02:00"],
    ["backup_path", env.backupPath],
    ["backup_keep_structure", "true"],
    ["backup_mode", "copy"],
    ["backup_compress", "false"],
    ["disk_alert_percent", "85"],
    ["storage_max_bytes", ""]
  ];

  const insert = database.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  const transaction = database.transaction((entries: Array<[string, string]>) => {
    for (const entry of entries) insert.run(entry[0], entry[1]);
  });
  transaction(defaults);
}

function migrateDatabase(database: Database.Database): void {
  addColumnIfMissing(database, "recordings", "status", "TEXT NOT NULL DEFAULT 'available'");
  addColumnIfMissing(database, "recordings", "backup_status", "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing(database, "recordings", "backup_path", "TEXT");
  addColumnIfMissing(database, "recordings", "deleted_at", "TEXT");
  addColumnIfMissing(database, "recordings", "is_currently_recording", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(database, "backup_logs", "context_json", "TEXT");
}

function addColumnIfMissing(
  database: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
