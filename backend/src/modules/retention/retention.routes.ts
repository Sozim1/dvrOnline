import { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { runRetention } from "./retention.service";

export const retentionRoutes = Router();

retentionRoutes.post(
  "/retention/run",
  asyncHandler(async (_req, res) => {
    res.json({ result: await runRetention() });
  })
);
