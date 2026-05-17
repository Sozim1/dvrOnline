import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../../shared/http";
import { getStorageSettings } from "./settings.repository";
import { getStorageStatus, saveStorageSettings, testStoragePath } from "./storage.service";

export const storageRoutes = Router();

const storageSettingsSchema = z.object({
  recordingsPath: z.string().min(1),
  backupPath: z.string().min(1),
  snapshotsPath: z.string().min(1),
  retentionDays: z.number().int().min(1).max(3650),
  retentionAutoDeleteEnabled: z.boolean(),
  retentionRequireBackup: z.boolean(),
  backupEnabled: z.boolean(),
  backupSchedule: z.enum(["manual", "daily", "weekly"]),
  backupTime: z.string().regex(/^\d{2}:\d{2}$/),
  backupKeepStructure: z.boolean(),
  backupMode: z.enum(["copy", "move"]),
  backupCompress: z.boolean(),
  diskAlertPercent: z.number().int().min(1).max(100),
  storageMaxBytes: z.number().int().positive().nullable()
});

storageRoutes.get("/settings/storage", (_req, res) => {
  res.json(getStorageStatus());
});

storageRoutes.post(
  "/settings/storage",
  asyncHandler(async (req, res) => {
    try {
      res.json({ settings: saveStorageSettings(storageSettingsSchema.parse(req.body)) });
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Storage invalido.");
    }
  })
);

storageRoutes.post(
  "/settings/storage/test",
  asyncHandler(async (req, res) => {
    const body = z.object({ path: z.string().min(1) }).parse(req.body);
    res.json(testStoragePath(body.path, true));
  })
);

storageRoutes.get("/settings/storage/raw", (_req, res) => {
  res.json({ settings: getStorageSettings() });
});
