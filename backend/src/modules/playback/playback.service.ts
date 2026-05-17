import { listRecordingRows, type RecordingRow } from "../recordings/recordings.repository";
import { HttpError } from "../../shared/http";

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

export function getPlaybackSegments(cameraId: number, date: string): PlaybackSegment[] {
  return listRecordingRows({ cameraId, date })
    .filter((recording) => recording.status === "available")
    .map(toSegment);
}

export function seekPlayback(cameraId: number, datetime: string): PlaybackSeekResult {
  const target = new Date(datetime);
  if (Number.isNaN(target.getTime())) throw new HttpError(400, "Data/hora invalida.");

  const date = datetime.slice(0, 10);
  const rows = listRecordingRows({ cameraId, date }).filter((recording) => recording.status === "available");
  if (rows.length === 0) throw new HttpError(404, "Nao ha gravacoes para esta data.");

  const exactIndex = rows.findIndex((recording) => {
    const start = new Date(recording.started_at);
    const end = recording.ended_at
      ? new Date(recording.ended_at)
      : new Date(start.getTime() + (recording.duration_seconds ?? 0) * 1000);
    return target >= start && target <= end;
  });

  const index = exactIndex >= 0 ? exactIndex : findClosestIndex(rows, target);
  const recording = rows[index];
  const start = new Date(recording.started_at);
  const offsetSeconds = exactIndex >= 0
    ? Math.max(0, Math.floor((target.getTime() - start.getTime()) / 1000))
    : 0;

  return {
    recordingId: recording.id,
    offsetSeconds,
    url: streamUrl(recording.id),
    nextRecordingId: rows[index + 1]?.id ?? null,
    segment: toSegment(recording)
  };
}

function findClosestIndex(rows: RecordingRow[], target: Date): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  rows.forEach((row, index) => {
    const distance = Math.abs(new Date(row.started_at).getTime() - target.getTime());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function toSegment(recording: RecordingRow): PlaybackSegment {
  return {
    id: recording.id,
    startedAt: recording.started_at,
    endedAt: recording.ended_at,
    durationSeconds: recording.duration_seconds,
    fileSize: recording.file_size,
    isProtected: Boolean(recording.is_protected),
    backupStatus: recording.backup_status,
    status: recording.status,
    url: streamUrl(recording.id)
  };
}

function streamUrl(recordingId: number): string {
  return `/api/recordings/${recordingId}/stream`;
}
