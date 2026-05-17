import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http";
import { clearOldLogs, listLogs } from "./logs.service";

export const logsRoutes = Router();

const listLogsSchema = z.object({
  type: z.enum(["recording", "backup", "retention", "storage", "ffmpeg", "system"]).optional(),
  level: z.enum(["info", "warning", "error"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

logsRoutes.get(
  "/logs",
  asyncHandler(async (req, res) => {
    res.json({ logs: listLogs(listLogsSchema.parse(req.query)) });
  })
);

logsRoutes.delete(
  "/logs/old",
  asyncHandler(async (req, res) => {
    const body = z.object({ days: z.number().int().min(1).max(3650).default(30) }).parse(req.body ?? {});
    res.json({ deleted: clearOldLogs(body.days) });
  })
);
