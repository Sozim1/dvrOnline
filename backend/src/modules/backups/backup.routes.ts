import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http";
import { backupDay, backupRecording, listBackupLogs, runBackup } from "./backup.service";

export const backupRoutes = Router();

backupRoutes.post(
  "/backups/run",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        cameraId: z.number().int().positive().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      })
      .parse(req.body ?? {});
    res.json({ results: await runBackup(body) });
  })
);

backupRoutes.post(
  "/backups/recording/:id",
  asyncHandler(async (req, res) => {
    res.json({ result: backupRecording(Number(req.params.id)) });
  })
);

backupRoutes.post(
  "/backups/day",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        cameraId: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(req.body);
    res.json({ results: backupDay(body.cameraId, body.date) });
  })
);

backupRoutes.get("/backups/logs", (_req, res) => {
  res.json({ logs: listBackupLogs() });
});
