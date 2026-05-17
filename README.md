# Camera NVR local para EZVIZ CS-CV206

Sistema web próprio para visualizar e gravar uma câmera EZVIZ via RTSP local, sem depender do cloud da EZVIZ.

Esta entrega implementa somente a **Fase 1**:

- Configuração da câmera via `.env`.
- Login simples com JWT.
- Live view no navegador via HLS gerado por FFmpeg.
- Alternância entre stream `main` e `sub`.
- Gravação segmentada com FFmpeg.
- Configuração de stream de gravação e tempo de segmento.
- Histórico de gravações por câmera/data.
- Assistir, baixar, apagar e marcar gravações como importantes.
- Schema SQLite preparado para motion zones, eventos, backups e settings futuras.

## Estrutura

```txt
camera-nvr/
  backend/
    src/
      modules/
        auth/
        cameras/
        live/
        recordings/
        settings/
  frontend/
    src/
      components/
      features/
      services/
  worker/
    README.md
  storage/
    data/
    hls/
    recordings/
    backups/
    snapshots/
  scripts/
  docker-compose.yml
  .env.example
  README.md
```

## Requisitos

- Node.js 20+ para rodar local sem Docker.
- FFmpeg e FFprobe instalados no PATH.
- Docker Desktop, se preferir rodar via Docker Compose.
- RTSP habilitado na câmera EZVIZ.

Teste FFmpeg no Windows:

```powershell
.\scripts\check-ffmpeg.ps1
```

## Configuração

Crie o `.env`:

```powershell
Copy-Item .env.example .env
```

Edite estes campos:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=troque-esta-senha

CAMERA_NAME=Camera Sala
RTSP_MAIN=rtsp://admin:CODIGO@192.168.0.50:554/ch1/main
RTSP_SUB=rtsp://admin:CODIGO@192.168.0.50:554/ch1/sub

DEFAULT_STREAM=sub
RECORDING_STREAM=main
SEGMENT_SECONDS=300
AUTO_RECORDING_ENABLED=true
```

Não coloque a senha real da câmera no código. Ela fica apenas no `.env` e no SQLite local criado pelo backend.

## Testar RTSP no VLC

Abra no VLC:

```txt
rtsp://admin:CODIGO@IP_DA_CAMERA:554/ch1/main
rtsp://admin:CODIGO@IP_DA_CAMERA:554/ch1/sub
```

Se não abrir no VLC, o sistema também não conseguirá abrir. Verifique IP, código/senha, porta 554 e se a câmera está na mesma rede.

## Rodar com Docker

```powershell
Copy-Item .env.example .env
# edite o .env
docker compose up --build
```

Acesse:

```txt
Frontend: http://localhost:3000
Backend:  http://localhost:4000/health
```

O container do backend já instala FFmpeg.

## Rodar local em desenvolvimento

Setup:

```powershell
.\scripts\setup-local.ps1
```

Iniciar backend e frontend:

```powershell
.\scripts\start-dev.ps1
```

Ou manualmente:

```powershell
cd backend
npm run dev

cd ..\frontend
npm run dev
```

## Como usar

1. Entre em `http://localhost:3000`.
2. Faça login com `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`.
3. Acesse `/dashboard`.
4. Clique em `Verificar RTSP` para validar o stream atual.
5. Clique em `Iniciar live` para gerar HLS e ver a câmera.
6. Alterne entre `sub` e `main` pelos botões do player.
7. Ajuste `Segmentação` e `Stream de gravação`.
8. Clique em `Iniciar gravação`.
9. Acesse `/recordings` para listar os arquivos.

## Gravação segmentada

O backend inicia FFmpeg com transporte TCP:

```bash
ffmpeg -rtsp_transport tcp -i "$RTSP_MAIN" \
  -an \
  -c copy \
  -f segment \
  -segment_time "$SEGMENT_SECONDS" \
  -reset_timestamps 1 \
  -strftime 1 \
  "storage/recordings/camera-sala/YYYY-MM-DD/%H-%M-%S.mp4"
```

Os arquivos são salvos por câmera e data:

```txt
storage/recordings/camera-sala/2026-05-17/14-00-00.mp4
storage/recordings/camera-sala/2026-05-17/14-05-00.mp4
```

O backend indexa os MP4 no SQLite automaticamente a cada 15 segundos e também quando a tela de gravações é aberta.

## Live view

O navegador não acessa RTSP direto. O backend cria HLS temporário em:

```txt
storage/hls/
```

O frontend consome playlists protegidas por JWT. O RTSP e a senha da câmera não são enviados ao navegador.

## Banco de dados

SQLite local:

```txt
storage/data/nvr.sqlite
```

Tabelas criadas:

- `users`
- `cameras`
- `recordings`
- `motion_zones`
- `motion_events`
- `settings`
- `backup_logs`

## Segurança

- Login com JWT.
- Senha do painel salva com hash bcrypt.
- RTSP não aparece no frontend.
- `.env` fica ignorado pelo Git.
- Por padrão, exponha isso só na rede local.
- Para acesso externo, use VPN/Tailscale/WireGuard em vez de abrir portas públicas.

## Fases futuras

Fase 2:

- Retenção automática por `RETENTION_DAYS`.
- Backup local diário/semanal/manual.
- Logs de limpeza e backup.

Fase 3:

- `/motion-zones` com canvas.
- Captura de frames do stream `sub`.
- Comparação de pixels por região.
- Eventos com snapshot.

Fase 4:

- WebSocket para eventos em tempo real.
- Telegram/e-mail/webhook.
- Reforços de segurança e usuários.
