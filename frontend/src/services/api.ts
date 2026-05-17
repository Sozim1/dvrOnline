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

  async getRecordings(filters: { cameraId?: number; date?: string }) {
    const params = new URLSearchParams();
    if (filters.cameraId) params.set("cameraId", String(filters.cameraId));
    if (filters.date) params.set("date", filters.date);
    const query = params.toString();
    return request<{ recordings: Recording[] }>(`/api/recordings${query ? `?${query}` : ""}`);
  },

  async setRecordingProtected(recordingId: number, isProtected: boolean) {
    return request<{ recording: Recording }>(`/api/recordings/${recordingId}/protect`, {
      method: "PATCH",
      body: JSON.stringify({ isProtected })
    });
  },

  async deleteRecording(recordingId: number) {
    return request<void>(`/api/recordings/${recordingId}`, { method: "DELETE" });
  }
};
