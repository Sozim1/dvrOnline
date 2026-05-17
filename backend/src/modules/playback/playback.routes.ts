import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http";
import { getPlaybackSegments, seekPlayback } from "./playback.service";

export const playbackRoutes = Router();

playbackRoutes.get(
  "/playback/segments",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        cameraId: z.coerce.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(req.query);
    res.json(getPlaybackSegments(query.cameraId, query.date));
  })
);

playbackRoutes.get(
  "/playback/seek",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        cameraId: z.coerce.number().int().positive(),
        datetime: z.string().min(16)
      })
      .parse(req.query);
    res.json(seekPlayback(query.cameraId, query.datetime));
  })
);
