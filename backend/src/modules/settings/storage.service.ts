import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir } from "../../shared/paths";
import { getStorageSettings, setSetting, type StorageSettings } from "./settings.repository";
import { writeLog } from "../logs/logs.service";

export type StoragePathTest = {
  success: boolean;
  path: string;
  resolvedPath: string;
  exists: boolean;
  canWrite: boolean;
  freeSpaceBytes: number | null;
  totalSpaceBytes: number | null;
  warnings: string[];
  message?: string;
};

export type StorageStatus = {
  settings: StorageSettings;
  recordings: StoragePathTest & { usedBytes: number };
  backups: StoragePathTest & { usedBytes: number };
  snapshots: StoragePathTest & { usedBytes: number };
  totalUsedBytes: number;
  docker: boolean;
};

export function resolveStoragePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

export function testStoragePath(inputPath: string, createIfMissing = true): StoragePathTest {
  const resolvedPath = resolveStoragePath(inputPath);
  const warnings: string[] = [];
  const docker = isDocker();

  try {
    if (!fs.existsSync(resolvedPath)) {
      if (createIfMissing) {
        ensureDir(resolvedPath);
      } else {
        return {
          success: false,
          path: inputPath,
          resolvedPath,
          exists: false,
          canWrite: false,
          freeSpaceBytes: null,
          totalSpaceBytes: null,
          warnings,
          message: "Pasta nao existe."
        };
      }
    }

    if (!fs.statSync(resolvedPath).isDirectory()) {
      return {
        success: false,
        path: inputPath,
        resolvedPath,
        exists: true,
        canWrite: false,
        freeSpaceBytes: null,
        totalSpaceBytes: null,
        warnings,
        message: "Caminho nao e uma pasta."
      };
    }

    const testFile = path.join(resolvedPath, `.write-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.writeFileSync(testFile, "ok");
    fs.rmSync(testFile, { force: true });

    if (docker && !resolvedPath.startsWith("/app")) {
      warnings.push("Rodando em Docker: confirme que este caminho esta montado como volume no docker-compose.");
    }

    const statFs = getFsStats(resolvedPath);

    return {
      success: true,
      path: inputPath,
      resolvedPath,
      exists: true,
      canWrite: true,
      freeSpaceBytes: statFs.freeSpaceBytes,
      totalSpaceBytes: statFs.totalSpaceBytes,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      path: inputPath,
      resolvedPath,
      exists: fs.existsSync(resolvedPath),
      canWrite: false,
      freeSpaceBytes: null,
      totalSpaceBytes: null,
      warnings,
      message: error instanceof Error ? error.message : "Falha ao validar pasta."
    };
  }
}

export function getStorageStatus(): StorageStatus {
  const settings = getStorageSettings();
  const recordings = testStoragePath(settings.recordingsPath, true);
  const backups = testStoragePath(settings.backupPath, true);
  const snapshots = testStoragePath(settings.snapshotsPath, true);
  const recordingsUsedBytes = getFolderSize(recordings.resolvedPath);
  const backupsUsedBytes = getFolderSize(backups.resolvedPath);
  const snapshotsUsedBytes = getFolderSize(snapshots.resolvedPath);

  return {
    settings,
    recordings: { ...recordings, usedBytes: recordingsUsedBytes },
    backups: { ...backups, usedBytes: backupsUsedBytes },
    snapshots: { ...snapshots, usedBytes: snapshotsUsedBytes },
    totalUsedBytes: recordingsUsedBytes + backupsUsedBytes + snapshotsUsedBytes,
    docker: isDocker()
  };
}

export function saveStorageSettings(settings: StorageSettings): StorageSettings {
  const paths = [settings.recordingsPath, settings.backupPath, settings.snapshotsPath];
  const failures = paths.map((entry) => testStoragePath(entry, true)).filter((result) => !result.success);
  if (failures.length) {
    throw new Error(`Configuracao de storage invalida: ${failures[0].message ?? failures[0].path}`);
  }

  setSetting("recordings_path", settings.recordingsPath);
  setSetting("backup_path", settings.backupPath);
  setSetting("snapshots_path", settings.snapshotsPath);
  setSetting("retention_days", String(settings.retentionDays));
  setSetting("retention_auto_delete_enabled", String(settings.retentionAutoDeleteEnabled));
  setSetting("retention_require_backup", String(settings.retentionRequireBackup));
  setSetting("backup_enabled", String(settings.backupEnabled));
  setSetting("backup_schedule", settings.backupSchedule);
  setSetting("backup_time", settings.backupTime);
  setSetting("backup_keep_structure", String(settings.backupKeepStructure));
  setSetting("backup_mode", settings.backupMode);
  setSetting("backup_compress", String(settings.backupCompress));
  setSetting("disk_alert_percent", String(settings.diskAlertPercent));
  setSetting("storage_max_bytes", settings.storageMaxBytes ? String(settings.storageMaxBytes) : "");
  writeLog("storage", "info", "Configuracao de storage atualizada.", settings);
  return getStorageSettings();
}

function getFsStats(dirPath: string): { freeSpaceBytes: number | null; totalSpaceBytes: number | null } {
  try {
    const stat = fs.statfsSync(dirPath);
    return {
      freeSpaceBytes: Number(stat.bavail) * Number(stat.bsize),
      totalSpaceBytes: Number(stat.blocks) * Number(stat.bsize)
    };
  } catch {
    return { freeSpaceBytes: os.freemem(), totalSpaceBytes: os.totalmem() };
  }
}

function getFolderSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += getFolderSize(fullPath);
    if (entry.isFile()) total += fs.statSync(fullPath).size;
  }
  return total;
}

function isDocker(): boolean {
  return fs.existsSync("/.dockerenv") || process.env.DOCKER_CONTAINER === "true";
}
