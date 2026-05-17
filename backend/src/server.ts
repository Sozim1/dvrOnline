import { app } from "./app";
import { env } from "./config/env";
import { initDatabase } from "./db/database";
import { liveStreamService } from "./modules/live/live.service";
import { recordingService } from "./modules/recordings/recording.service";

initDatabase();
recordingService.startScanner();

const server = app.listen(env.port, env.host, () => {
  console.log(`Backend DVR rodando em http://${env.host}:${env.port}`);
  recordingService.startAutoRecordings();
});

function shutdown(): void {
  console.log("Encerrando processos de FFmpeg...");
  liveStreamService.stopAll();
  recordingService.stopAll();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
