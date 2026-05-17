import { spawn } from "node:child_process";
import type { StreamKind } from "../../config/env";
import { env } from "../../config/env";
import { HttpError } from "../../shared/http";
import { getCameraById, updateCameraStatus } from "./cameras.repository";

export async function checkCameraStatus(
  cameraId: number,
  stream: StreamKind = "sub"
): Promise<{ status: "online" | "offline"; details?: string }> {
  const camera = getCameraById(cameraId);
  if (!camera) throw new HttpError(404, "Camera nao encontrada.");

  const url = stream === "main" ? camera.rtsp_main : camera.rtsp_sub;
  if (!url) {
    updateCameraStatus(cameraId, "offline");
    return { status: "offline", details: "URL RTSP nao configurada." };
  }

  return new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-rtsp_transport",
      "tcp",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height",
      "-of",
      "json",
      url
    ];

    const child = spawn(env.ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      updateCameraStatus(cameraId, "offline");
      resolve({ status: "offline", details: "Timeout ao consultar RTSP." });
    }, 8000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      updateCameraStatus(cameraId, "offline");
      resolve({ status: "offline", details: error.message });
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const status = code === 0 ? "online" : "offline";
      updateCameraStatus(cameraId, status);
      resolve({
        status,
        details: code === 0 ? undefined : stderr.trim() || `ffprobe saiu com codigo ${code}`
      });
    });
  });
}
