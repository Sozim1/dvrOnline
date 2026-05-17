# Worker

Na Fase 1, o worker de FFmpeg roda dentro do backend para manter a instalação simples:

- `backend/src/modules/live/live.service.ts`: converte RTSP em HLS para o navegador.
- `backend/src/modules/recordings/recording.service.ts`: grava segmentos MP4 com FFmpeg e indexa no SQLite.

A pasta `worker/` fica reservada para separar os processos em serviço próprio nas próximas fases, quando retenção, backup e detecção de movimento crescerem.
