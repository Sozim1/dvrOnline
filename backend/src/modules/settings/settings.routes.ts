import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http";
import { updateCameraStreams } from "../cameras/cameras.repository";
import { recordingService } from "../recordings/recording.service";
import { getAllSettings, getRecordingSettings, setSetting } from "./settings.repository";

export const settingsRoutes = Router();

const recordingSettingsSchema = z.object({
  segmentSeconds: z.number().int().min(10).max(86400),
  recordingStream: z.enum(["main", "sub"]),
  autoRecordingEnabled: z.boolean().optional()
});

settingsRoutes.get("/settings", (_req, res) => {
  res.json({
    settings: getAllSettings(),
    recording: getRecordingSettings()
  });
});

settingsRoutes.post(
  "/settings/recording",
  asyncHandler(async (req, res) => {
    const body = recordingSettingsSchema.parse(req.body);
    setSetting("segment_seconds", String(body.segmentSeconds));
    setSetting("recording_stream", body.recordingStream);
    updateCameraStreams(1, { recordingStream: body.recordingStream });

    if (typeof body.autoRecordingEnabled === "boolean") {
      setSetting("auto_recording_enabled", String(body.autoRecordingEnabled));
    }

    await recordingService.restartIfRunning(1);
    if (body.autoRecordingEnabled === true && !recordingService.status(1).isRunning) {
      recordingService.startRecording(1, "auto");
    }
    res.json({ recording: getRecordingSettings() });
  })
);
