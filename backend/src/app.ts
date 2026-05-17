import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRoutes } from "./modules/auth/auth.routes";
import { authenticate } from "./modules/auth/auth.middleware";
import { cameraRoutes } from "./modules/cameras/cameras.routes";
import { liveRoutes } from "./modules/live/live.routes";
import { recordingRoutes } from "./modules/recordings/recordings.routes";
import { settingsRoutes } from "./modules/settings/settings.routes";
import { errorHandler, notFoundHandler } from "./shared/http";

export const app = express();

const allowedOrigins = env.frontendOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origem nao permitida: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api", authenticate, cameraRoutes);
app.use("/api", authenticate, settingsRoutes);
app.use("/api", authenticate, liveRoutes);
app.use("/api", authenticate, recordingRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
