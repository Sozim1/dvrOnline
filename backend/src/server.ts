import { app } from "./app";
import { env } from "./config/env";
import { initDatabase } from "./db/database";
import { startBackupScheduler } from "./modules/backups/backup.service";
import { liveStreamService } from "./modules/live/live.service";
import { recordingService } from "./modules/recordings/recording.service";
import { runRetention, startRetentionScheduler } from "./modules/retention/retention.service";

initDatabase();
recordingService.startScanner();
startRetentionScheduler();
startBackupScheduler();

const server = app.listen(env.port, env.host, () => {
  console.log(`Backend DVR rodando em http://${env.host}:${env.port}`);
  recordingService.startAutoRecordings();
  runRetention().catch((error) => {
    console.error("[retention] falha ao executar rotina inicial", error);
  });
});

function shutdown(): void {
  console.log("Encerrando processos de FFmpeg...");
  liveStreamService.stopAll();
  recordingService.stopAll();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
