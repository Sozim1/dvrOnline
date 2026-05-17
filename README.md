# Camera NVR local para EZVIZ CS-CV206

Sistema web proprio para visualizar, gravar e reproduzir uma camera EZVIZ via RTSP local, sem depender do cloud da EZVIZ.

Esta branch implementa a **Fase 2**:

- Dashboard em modo DVR com player principal para `Ao vivo` e `Reproducao`.
- Timeline diaria com blocos de gravacao.
- Busca por data/hora no dashboard.
- Playback continuo entre segmentos.
- Tela de gravacoes com resumo do dia, timeline e tabela tecnica.
- Storage configuravel pelo painel.
- Teste de escrita e espaco livre das pastas.
- Retencao automatica/manual respeitando arquivos protegidos.
- Backup local manual e agenda diaria/semanal preparada.
- Logs de gravacao, FFmpeg, backup, retencao e storage.
- Status e reinicio manual do worker FFmpeg.
- Restart automatico do FFmpeg com limite de tentativas.

Motion zones, eventos de movimento, Telegram/e-mail e WebSocket ficam para Fase 3/Fase 4.

## Estrutura

```txt
camera-nvr/
  backend/
    src/
      modules/
        auth/
        backups/
        cameras/
        live/
        logs/
        playback/
        recordings/
        retention/
        settings/
  frontend/
    src/
      components/
      features/
      services/
  worker/
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
- RTSP habilitado na camera EZVIZ.

Teste FFmpeg no Windows:

```powershell
.\scripts\check-ffmpeg.ps1
```

## Configuracao

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
TZ=America/Sao_Paulo
```

Nao coloque a senha real da camera no codigo. Ela fica apenas no `.env` e no SQLite local criado pelo backend.

## Testar RTSP no VLC

Abra no VLC:

```txt
rtsp://admin:CODIGO@IP_DA_CAMERA:554/ch1/main
rtsp://admin:CODIGO@IP_DA_CAMERA:554/ch1/sub
```

Se nao abrir no VLC, o sistema tambem nao conseguira abrir. Verifique IP, codigo/senha, porta 554 e se a camera esta na mesma rede.

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

O backend do Docker ja instala FFmpeg.

Volume padrao:

```yaml
volumes:
  - ./storage:/app/storage
```

Exemplo usando disco externo no host:

```yaml
services:
  backend:
    volumes:
      - /mnt/dvr-storage:/app/storage
```

Dentro do painel, use caminhos que existam dentro do container, por exemplo `/app/storage/recordings`. Se apontar para uma pasta aleatoria do host sem volume montado, o backend nao tera acesso.

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

## Dashboard DVR

Entre em `/dashboard`.

O player principal tem dois modos:

- `Ao vivo`: abre o HLS automaticamente, sem botao de iniciar live.
- `Reproducao`: toca gravacoes antigas no mesmo player.

No modo reproducao:

1. Escolha a data.
2. Escolha o horario.
3. Clique em `Ir para horario`.
4. Use a timeline para clicar em um ponto do dia.
5. Use `10s` para voltar/avancar.
6. Clique em `Voltar ao vivo` para retornar ao stream atual.

Quando um segmento termina, o player tenta carregar o proximo automaticamente. Se houver buraco entre arquivos, aparece um aviso discreto de intervalo sem gravacao.

## Gravacao segmentada

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

Arquivos:

```txt
storage/recordings/camera-sala/2026-05-17/14-00-00.mp4
storage/recordings/camera-sala/2026-05-17/14-05-00.mp4
```

O scanner indexa MP4 no SQLite a cada 15 segundos. Arquivos recentes/em gravacao sao marcados para nao entrarem em backup ou retencao.

## Tela de gravacoes

Entre em `/recordings`.

Ela mostra:

- Data escolhida.
- Timeline do dia.
- Total gravado.
- Quantidade de arquivos.
- Espaco usado.
- Quantidade protegida.
- Player com continuidade entre segmentos.
- Tabela tecnica com assistir, baixar, backup, proteger e apagar.

O usuario nao precisa pensar em MP4 para assistir. A tabela fica como detalhe operacional.

## Storage

Entre em `/settings/storage`.

Campos principais:

- Pasta de gravacoes.
- Pasta de backups.
- Pasta de snapshots.
- Dias de retencao.
- Apagar automaticamente.
- Apagar somente depois de backup.
- Backup automatico ligado/desligado.
- Agenda manual, diaria ou semanal.
- Horario do backup.
- Modo copiar/mover.
- Alerta de disco.

Antes de salvar uma pasta, use `Testar escrita`. O backend tenta criar a pasta, gravar um arquivo temporario e consultar espaco livre.

## Retencao

A retencao roda:

- Ao iniciar o backend.
- A cada 1 hora.
- Manualmente em `/settings/storage`.

Regras:

- Nunca apaga arquivo protegido.
- Nunca apaga arquivo ainda em gravacao.
- Se `Apagar somente depois de backup` estiver ligado, apaga apenas `backed_up`.
- Arquivos ausentes no disco sao marcados como `missing`.
- Arquivos apagados pela retencao ficam como `deleted` no banco.

## Backup local

O backup pode ser executado:

- Manualmente em `/settings/storage`.
- Por dia em `/recordings`.
- Por arquivo na tabela de `/recordings`.
- Automaticamente se `Backup automatico` estiver ligado.

Estrutura padrao:

```txt
storage/backups/
  camera-sala/
    2026-05-17/
      16-01-01.mp4
```

O sistema nao faz backup de arquivo ainda em gravacao e nao duplica backup ja concluido.

## Logs

Entre em `/logs`.

Tipos:

- `recording`
- `backup`
- `retention`
- `storage`
- `ffmpeg`
- `system`

Niveis:

- `info`
- `warning`
- `error`

Use filtros por tipo, nivel, data e texto. O botao `Limpar antigos` remove logs com mais de 30 dias.

## Worker FFmpeg

O dashboard mostra:

- Status atual.
- PID.
- Uptime.
- Ultimo segmento indexado.
- Quantidade de reinicios.
- Ultimo erro.

Se FFmpeg cair em gravacao automatica, o backend tenta reiniciar. O limite atual e 5 tentativas em 10 minutos para evitar loop infinito.

Endpoints principais:

```txt
GET  /api/recordings/worker/status
POST /api/recordings/worker/restart
GET  /api/playback/segments?cameraId=1&date=2026-05-17
GET  /api/playback/seek?cameraId=1&datetime=2026-05-17T16:03:20
POST /api/settings/storage/test
POST /api/retention/run
POST /api/backups/run
POST /api/backups/day
GET  /api/logs
```

## Banco de dados

SQLite local:

```txt
storage/data/nvr.sqlite
```

Tabelas principais:

- `users`
- `cameras`
- `recordings`
- `motion_zones`
- `motion_events`
- `settings`
- `backup_logs`
- `system_logs`

Na Fase 2, `recordings` ganhou campos de status, backup e exclusao logica para preservar historico operacional.

## Seguranca

- Login com JWT.
- Senha do painel salva com hash bcrypt.
- RTSP nao aparece no frontend.
- `.env` fica ignorado pelo Git.
- Por padrao, exponha isso so na rede local.
- Para acesso externo, use VPN/Tailscale/WireGuard em vez de abrir portas publicas.

## Limitacoes conhecidas

- Motion detection ainda nao foi implementado.
- Eventos de movimento e snapshots entram na Fase 3.
- Telegram/e-mail/webhook entram na Fase 4.
- Backup compactado `.zip` esta reservado como configuracao futura.
- Alterar path no Docker exige volume montado; o painel valida escrita, mas nao consegue montar disco do host sozinho.
