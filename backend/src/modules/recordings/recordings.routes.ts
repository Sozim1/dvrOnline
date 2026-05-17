import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../../shared/http";
import { recordingService } from "./recording.service";

export const recordingRoutes = Router();

const listQuerySchema = z.object({
  cameraId: z.coerce.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

recordingRoutes.get(
  "/recording/:cameraId/status",
  asyncHandler(async (req, res) => {
    res.json(recordingService.status(Number(req.params.cameraId)));
  })
);

recordingRoutes.post(
  "/recording/:cameraId/start",
  asyncHandler(async (req, res) => {
    res.json(recordingService.startRecording(Number(req.params.cameraId), "manual"));
  })
);

recordingRoutes.post(
  "/recording/:cameraId/stop",
  asyncHandler(async (req, res) => {
    res.json(recordingService.stopRecording(Number(req.params.cameraId)));
  })
);

recordingRoutes.get(
  "/recordings",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    res.json({ recordings: await recordingService.list(query) });
  })
);

recordingRoutes.patch(
  "/recordings/:recordingId/protect",
  asyncHandler(async (req, res) => {
    const body = z.object({ isProtected: z.boolean() }).parse(req.body);
    res.json({
      recording: recordingService.protectRecording(Number(req.params.recordingId), body.isProtected)
    });
  })
);

recordingRoutes.delete(
  "/recordings/:recordingId",
  asyncHandler(async (req, res) => {
    recordingService.deleteRecording(Number(req.params.recordingId));
    res.status(204).send();
  })
);

recordingRoutes.get(
  "/recordings/:recordingId/download",
  asyncHandler(async (req, res) => {
    const { filePath } = recordingService.getRecordingFilePath(Number(req.params.recordingId));
    res.download(filePath, path.basename(filePath));
  })
);

recordingRoutes.get(
  "/recordings/:recordingId/stream",
  asyncHandler(async (req, res) => {
    const { filePath } = recordingService.getRecordingFilePath(Number(req.params.recordingId));
    const stat = fs.statSync(filePath);
    const range = req.headers.range;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");

    if (!range) {
      res.setHeader("Content-Length", stat.size);
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) throw new HttpError(416, "Range invalido.");

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;

    if (start >= stat.size || end >= stat.size) {
      res.status(416).setHeader("Content-Range", `bytes */${stat.size}`).send();
      return;
    }

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  })
);
