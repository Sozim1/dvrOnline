import fs from "node:fs";
import { resolveStoredPath } from "../../shared/paths";
import { getStorageSettings } from "../settings/settings.repository";
import {
  listRecordingRows,
  markRecordingDeleted,
  markRecordingMissing,
  type RecordingRow
} from "../recordings/recordings.repository";
import { writeLog } from "../logs/logs.service";

export type RetentionResult = {
  checked: number;
  deleted: number;
  kept: number;
  skipped: Array<{ recordingId: number; reason: string }>;
};

let retentionTimer: NodeJS.Timeout | undefined;

export function startRetentionScheduler(): void {
  if (retentionTimer) return;
  retentionTimer = setInterval(() => {
    runRetention().catch((error) => {
      writeLog("retention", "error", "Retencao automatica falhou.", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, 60 * 60 * 1000);
  retentionTimer.unref?.();
}

export async function runRetention(): Promise<RetentionResult> {
  const settings = getStorageSettings();
  const result: RetentionResult = { checked: 0, deleted: 0, kept: 0, skipped: [] };

  if (!settings.retentionAutoDeleteEnabled) {
    writeLog("retention", "info", "Retencao ignorada: exclusao automatica desligada.", settings);
    return result;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - settings.retentionDays);
  const rows = listRecordingRows({ includeDeleted: false });
  writeLog("retention", "info", "Retencao iniciada.", { cutoff: cutoff.toISOString(), total: rows.length });

  for (const row of rows) {
    result.checked += 1;
    const decision = evaluateRetention(row, cutoff, settings.retentionRequireBackup);
    if (decision !== "delete") {
      result.kept += 1;
      result.skipped.push({ recordingId: row.id, reason: decision });
      writeLog("retention", decision === "protegido" ? "info" : "warning", `Retencao ignorou arquivo: ${decision}.`, {
        recordingId: row.id,
        filePath: row.file_path
      });
      continue;
    }

    const filePath = resolveStoredPath(row.file_path);
    if (!fs.existsSync(filePath)) {
      markRecordingMissing(row.id);
      result.kept += 1;
      writeLog("retention", "warning", "Arquivo ausente no disco durante retencao.", {
        recordingId: row.id,
        filePath
      });
      continue;
    }

    fs.rmSync(filePath, { force: true });
    markRecordingDeleted(row.id);
    result.deleted += 1;
    writeLog("retention", "info", "Arquivo apagado por retencao.", {
      recordingId: row.id,
      filePath
    });
  }

  writeLog("retention", "info", "Retencao concluida.", result);
  return result;
}

function evaluateRetention(row: RecordingRow, cutoff: Date, requireBackup: boolean): "delete" | string {
  if (row.is_protected) return "protegido";
  if (row.is_currently_recording) return "em gravacao";
  if (requireBackup && row.backup_status !== "backed_up") return "backup pendente";

  const ended = row.ended_at ? new Date(row.ended_at) : new Date(row.started_at);
  if (Number.isNaN(ended.getTime())) return "data invalida";
  if (ended >= cutoff) return "dentro da retencao";

  return "delete";
}
