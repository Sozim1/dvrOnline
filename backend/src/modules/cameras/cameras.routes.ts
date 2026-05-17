import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/http";
import { listCameras } from "./cameras.repository";
import { checkCameraStatus } from "./cameras.service";

export const cameraRoutes = Router();

const statusQuerySchema = z.object({
  stream: z.enum(["main", "sub"]).optional()
});

cameraRoutes.get("/cameras", (_req, res) => {
  res.json({ cameras: listCameras() });
});

cameraRoutes.get(
  "/cameras/:cameraId/status",
  asyncHandler(async (req, res) => {
    const cameraId = Number(req.params.cameraId);
    const query = statusQuerySchema.parse(req.query);
    res.json(await checkCameraStatus(cameraId, query.stream ?? "sub"));
  })
);
