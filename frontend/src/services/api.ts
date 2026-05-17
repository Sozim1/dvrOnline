export type StreamKind = "main" | "sub";

export type User = {
  id: number;
  email: string;
};

export type Camera = {
  id: number;
  name: string;
  defaultStream: StreamKind;
  recordingStream: StreamKind;
  motionStream: StreamKind;
  isActive: boolean;
  status: string;
  lastStatusCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

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

export type WorkerStatus = {
  cameraId: number;
  running: boolean;
  pid: number | null;
  uptimeSeconds: number;
  currentOutputPath: string | null;
  lastSegmentAt: string | null;
  restartCount: number;
  lastError: string | null;
  segmentSeconds: number;
  stream: StreamKind;
};

export type LiveStatus = {
  cameraId: number;
  stream: StreamKind;
  isRunning: boolean;
  startedAt?: string;
  playlistPath: string;
};

export type Recording = {
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

export type PlaybackSegment = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  fileSize: number;
  isProtected: boolean;
  backupStatus: string;
  status: string;
  url: string;
};

export type PlaybackSeekResult = {
  recordingId: number;
  offsetSeconds: number;
  url: string;
  nextRecordingId: number | null;
  segment: PlaybackSegment;
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

export type StoragePathTest = {
  path: string;
  resolvedPath: string;
  exists: boolean;
  created: boolean;
  canWrite: boolean;
  freeSpaceBytes: number | null;
  totalSpaceBytes: number | null;
  success: boolean;
  warnings: string[];
};

export type StorageStatus = {
  settings: StorageSettings;
  recordings: StoragePathTest & { usedBytes: number };
  backups: StoragePathTest & { usedBytes: number };
  snapshots: StoragePathTest & { usedBytes: number };
  totalUsedBytes: number;
  docker: boolean;
};

export type RetentionResult = {
  scanned: number;
  deleted: number;
  skipped: number;
  missing: number;
  logs: string[];
};

export type BackupResult = {
  recordingId: number;
  status: "backed_up" | "skipped" | "failed";
  message: string;
  sourcePath?: string;
  backupPath?: string;
};

export type BackupLog = {
  id: number;
  cameraId: number | null;
  recordingId: number | null;
  status: string;
  message: string;
  sourcePath: string | null;
  backupPath: string | null;
  contextJson: string | null;
  createdAt: string;
};

export type SystemLog = {
  id: number;
  type: "recording" | "backup" | "retention" | "storage" | "ffmpeg" | "system";
  level: "info" | "warning" | "error";
  message: string;
  contextJson: string | null;
  createdAt: string;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "camera_nvr_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function tokenHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    ...tokenHeaders(),
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...init.headers
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(data?.message ?? `Erro HTTP ${response.status}`);
  }

  return data as T;
}

function queryString(values: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const api = {
  baseUrl: API_BASE,

  withToken(path: string): string {
    const token = getStoredToken();
    const separator = path.includes("?") ? "&" : "?";
    return `${API_BASE}${path}${token ? `${separator}token=${encodeURIComponent(token)}` : ""}`;
  },

  async login(email: string, password: string) {
    return request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },

  async me() {
    return request<{ user: User }>("/api/auth/me");
  },

  async getCameras() {
    return request<{ cameras: Camera[] }>("/api/cameras");
  },

  async checkCameraStatus(cameraId: number, stream: StreamKind) {
    return request<{ status: "online" | "offline"; details?: string }>(
      `/api/cameras/${cameraId}/status?stream=${stream}`
    );
  },

  async getSettings() {
    return request<{ settings: Record<string, string>; recording: RecordingSettings }>("/api/settings");
  },

  async updateRecordingSettings(values: {
    segmentSeconds: number;
    recordingStream: StreamKind;
    autoRecordingEnabled?: boolean;
  }) {
    return request<{ recording: RecordingSettings }>("/api/settings/recording", {
      method: "POST",
      body: JSON.stringify(values)
    });
  },

  async startLive(cameraId: number, stream: StreamKind) {
    return request<LiveStatus>(`/api/live/${cameraId}/start`, {
      method: "POST",
      body: JSON.stringify({ stream })
    });
  },

  async stopLive(cameraId: number, stream: StreamKind) {
    return request<LiveStatus>(`/api/live/${cameraId}/stop`, {
      method: "POST",
      body: JSON.stringify({ stream })
    });
  },

  async getRecordingStatus(cameraId: number) {
    return request<RecordingStatus>(`/api/recording/${cameraId}/status`);
  },

  async startRecording(cameraId: number) {
    return request<RecordingStatus>(`/api/recording/${cameraId}/start`, { method: "POST" });
  },

  async stopRecording(cameraId: number) {
    return request<RecordingStatus>(`/api/recording/${cameraId}/stop`, { method: "POST" });
  },

  async getWorkerStatus() {
    return request<WorkerStatus>("/api/recordings/worker/status");
  },

  async restartWorker() {
    return request<RecordingStatus>("/api/recordings/worker/restart", { method: "POST" });
  },

  async getRecordings(filters: { cameraId?: number; date?: string }) {
    return request<{ recordings: Recording[] }>(`/api/recordings${queryString(filters)}`);
  },

  async setRecordingProtected(recordingId: number, isProtected: boolean) {
    return request<{ recording: Recording }>(`/api/recordings/${recordingId}/protect`, {
      method: "PATCH",
      body: JSON.stringify({ isProtected })
    });
  },

  async deleteRecording(recordingId: number) {
    return request<void>(`/api/recordings/${recordingId}`, { method: "DELETE" });
  },

  async getPlaybackSegments(cameraId: number, date: string) {
    return request<PlaybackSegment[]>(`/api/playback/segments${queryString({ cameraId, date })}`);
  },

  async seekPlayback(cameraId: number, datetime: string) {
    return request<PlaybackSeekResult>(`/api/playback/seek${queryString({ cameraId, datetime })}`);
  },

  async getStorageStatus() {
    return request<StorageStatus>("/api/settings/storage");
  },

  async getStorageSettings() {
    return request<{ settings: StorageSettings }>("/api/settings/storage/raw");
  },

  async saveStorageSettings(settings: StorageSettings) {
    return request<{ settings: StorageSettings }>("/api/settings/storage", {
      method: "POST",
      body: JSON.stringify(settings)
    });
  },

  async testStoragePath(path: string) {
    return request<StoragePathTest>("/api/settings/storage/test", {
      method: "POST",
      body: JSON.stringify({ path })
    });
  },

  async runRetention() {
    return request<{ result: RetentionResult }>("/api/retention/run", { method: "POST" });
  },

  async runBackup(filters: { cameraId?: number; date?: string } = {}) {
    return request<{ results: BackupResult[] }>("/api/backups/run", {
      method: "POST",
      body: JSON.stringify(filters)
    });
  },

  async backupRecording(recordingId: number) {
    return request<{ result: BackupResult }>(`/api/backups/recording/${recordingId}`, { method: "POST" });
  },

  async backupDay(cameraId: number, date: string) {
    return request<{ results: BackupResult[] }>("/api/backups/day", {
      method: "POST",
      body: JSON.stringify({ cameraId, date })
    });
  },

  async getBackupLogs() {
    return request<{ logs: BackupLog[] }>("/api/backups/logs");
  },

  async getLogs(filters: {
    type?: SystemLog["type"];
    level?: SystemLog["level"];
    date?: string;
    search?: string;
    limit?: number;
  } = {}) {
    return request<{ logs: SystemLog[] }>(`/api/logs${queryString(filters)}`);
  },

  async clearOldLogs(days: number) {
    return request<{ deleted: number }>("/api/logs/old", {
      method: "DELETE",
      body: JSON.stringify({ days })
    });
  }
};
