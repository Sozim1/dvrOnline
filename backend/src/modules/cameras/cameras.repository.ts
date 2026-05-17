import type { StreamKind } from "../../config/env";
import { getDb } from "../../db/database";

export type CameraRow = {
  id: number;
  name: string;
  rtsp_main: string;
  rtsp_sub: string;
  default_stream: StreamKind;
  recording_stream: StreamKind;
  motion_stream: StreamKind;
  is_active: number;
  status: string;
  last_status_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicCamera = {
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

export function toPublicCamera(camera: CameraRow): PublicCamera {
  return {
    id: camera.id,
    name: camera.name,
    defaultStream: camera.default_stream,
    recordingStream: camera.recording_stream,
    motionStream: camera.motion_stream,
    isActive: Boolean(camera.is_active),
    status: camera.status,
    lastStatusCheckedAt: camera.last_status_checked_at,
    createdAt: camera.created_at,
    updatedAt: camera.updated_at
  };
}

export function listCameras(): PublicCamera[] {
  const rows = getDb()
    .prepare("SELECT * FROM cameras ORDER BY id ASC")
    .all() as CameraRow[];
  return rows.map(toPublicCamera);
}

export function listActiveCameraRows(): CameraRow[] {
  return getDb()
    .prepare("SELECT * FROM cameras WHERE is_active = 1 ORDER BY id ASC")
    .all() as CameraRow[];
}

export function getCameraById(id: number): CameraRow | undefined {
  return getDb().prepare("SELECT * FROM cameras WHERE id = ?").get(id) as CameraRow | undefined;
}

export function updateCameraStatus(id: number, status: "online" | "offline"): void {
  getDb()
    .prepare(
      "UPDATE cameras SET status = ?, last_status_checked_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(status, id);
}

export function updateCameraStreams(
  id: number,
  values: Partial<{
    defaultStream: StreamKind;
    recordingStream: StreamKind;
    motionStream: StreamKind;
  }>
): void {
  const current = getCameraById(id);
  if (!current) return;

  getDb()
    .prepare(
      `UPDATE cameras
       SET default_stream = ?, recording_stream = ?, motion_stream = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      values.defaultStream ?? current.default_stream,
      values.recordingStream ?? current.recording_stream,
      values.motionStream ?? current.motion_stream,
      id
    );
}
