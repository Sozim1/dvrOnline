import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../../shared/http";
import { liveStreamService } from "./live.service";

export const liveRoutes = Router();

const streamSchema = z.enum(["main", "sub"]);
const startLiveSchema = z.object({
  stream: streamSchema.default("sub")
});

liveRoutes.post(
  "/live/:cameraId/start",
  asyncHandler(async (req, res) => {
    const cameraId = Number(req.params.cameraId);
    const body = startLiveSchema.parse(req.body ?? {});
    res.json(await liveStreamService.start(cameraId, body.stream));
  })
);

liveRoutes.post(
  "/live/:cameraId/stop",
  asyncHandler(async (req, res) => {
    const cameraId = Number(req.params.cameraId);
    const stream = streamSchema.parse(req.body?.stream ?? req.query.stream ?? "sub");
    res.json(liveStreamService.stop(cameraId, stream));
  })
);

liveRoutes.get(
  "/live/:cameraId/:stream/status",
  asyncHandler(async (req, res) => {
    const cameraId = Number(req.params.cameraId);
    const stream = streamSchema.parse(req.params.stream);
    res.json(liveStreamService.status(cameraId, stream));
  })
);

liveRoutes.get(
  "/live/:cameraId/:stream/index.m3u8",
  asyncHandler(async (req, res) => {
    const cameraId = Number(req.params.cameraId);
    const stream = streamSchema.parse(req.params.stream);
    const filePath = liveStreamService.getHlsFile(cameraId, stream, "index.m3u8");

    if (!fs.existsSync(filePath)) {
      throw new HttpError(404, "Playlist HLS ainda nao foi criada.");
    }

    let playlist = fs.readFileSync(filePath, "utf8");
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (token) {
      playlist = playlist.replace(/^([^#][^\r\n]+\.ts)$/gm, `$1?token=${encodeURIComponent(token)}`);
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    res.send(playlist);
  })
);

liveRoutes.get(
  "/live/:cameraId/:stream/:segment",
  asyncHandler(async (req, res) => {
    const cameraId = Number(req.params.cameraId);
    const stream = streamSchema.parse(req.params.stream);
    const segment = String(req.params.segment);

    if (!segment.endsWith(".ts")) {
      throw new HttpError(400, "Segmento HLS invalido.");
    }

    const filePath = liveStreamService.getHlsFile(cameraId, stream, segment);
    if (!fs.existsSync(filePath)) throw new HttpError(404, "Segmento HLS nao encontrado.");

    res.setHeader("Content-Type", "video/MP2T");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(filePath).pipe(res);
  })
);
