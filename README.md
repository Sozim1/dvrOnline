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

Motion zones, eventos de movimento e WebSocket ficam para Fase 3/Fase 4.

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

DEFAULT_STREAM=main
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
Backend:  http://localhost:3000/health
```

O backend do Docker ja instala FFmpeg. No Docker, o frontend Nginx encaminha `/api` e `/health` para o backend dentro da rede do Compose. Para WebRTC de baixa latencia, o MediaMTX tambem publica a porta `8889` TCP e a porta `8189` UDP.

O ao vivo usa WebRTC via MediaMTX por padrao. O HLS continua disponivel como fallback no dashboard.

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

## Notebook 24h e acesso externo

Para usar o notebook como DVR 24 horas, deixe o Docker subindo o sistema e exponha o painel pelo IP do notebook.

Configuracao recomendada no `.env`:

```env
BACKEND_BIND=127.0.0.1
FRONTEND_ORIGIN=http://localhost:3000
PUBLIC_API_URL=
PUBLIC_WEBRTC_URL=
PUBLIC_WEBRTC_MUTED=true
WEBRTC_HTTP_BIND=0.0.0.0
WEBRTC_HTTP_PORT=8889
WEBRTC_ADDITIONAL_HOSTS=IP_DO_NOTEBOOK
WEBRTC_UDP_PORT=8189
WEBRTC_AUDIO_BITRATE=32k
```

Com essa configuracao, o celular/PC acessa:

```txt
http://IP_DO_NOTEBOOK:3000
```

No roteador, aponte somente a porta do painel para o IP local do notebook:

```txt
porta externa 3000 -> IP_DO_NOTEBOOK:3000
```

Se tambem quiser WebRTC fora da LAN por redirecionamento de porta, encaminhe `8889/tcp` e `8189/udp` para o notebook. Se nao encaminhar essas portas, use HLS como fallback para acesso remoto.

Tambem libere a porta `3000` TCP, a porta `8889` TCP e a porta `8189` UDP no firewall. No Windows, como administrador:

```powershell
.\scripts\open-dvr-firewall.ps1
```

Nao exponha a porta RTSP `554` da camera na internet.

Se voce quiser usar uma porta externa diferente, por exemplo `8080`, configure o roteador assim:

```txt
porta externa 8080 -> IP_DO_NOTEBOOK:3000
```

Acesse:

```txt
http://SEU_IP_PUBLICO:8080
```

Para iniciar o DVR manualmente no notebook:

```powershell
.\scripts\start-dvr.ps1
```

Para instalar inicializacao automatica ao entrar no Windows:

```powershell
.\scripts\install-dvr-startup-task.ps1
```

Para remover a tarefa depois:

```powershell
.\scripts\uninstall-dvr-startup-task.ps1
```

Se o IP publico da internet muda, use DDNS ou um dominio com atualizacao automatica.

### Modo direto com API exposta

O modo recomendado acima expoe so o painel. Se voce realmente quiser expor a API separada, configure:

```env
BACKEND_BIND=0.0.0.0
FRONTEND_ORIGIN=http://localhost:3000,http://SEU_IP_PUBLICO:3000
PUBLIC_API_URL=http://SEU_IP_PUBLICO:4000
```

Depois de alterar `PUBLIC_API_URL`, reconstrua o frontend porque o Vite grava esse valor no build:

```powershell
docker compose up --build -d
```

No roteador, aponte as portas para o IP local do notebook:

```txt
porta externa 3000 -> IP_DO_NOTEBOOK:3000
porta externa 4000 -> IP_DO_NOTEBOOK:4000
```

Para internet aberta, use senha forte no painel e `JWT_SECRET` longo no `.env`. O ideal em producao e colocar HTTPS/reverse proxy na frente, mas o modo recomendado com apenas a porta `3000` ja deixa o acesso por IP externo mais simples.

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

Qualidade:

- `main` usa a melhor imagem da camera.
- `sub` e mais leve, mas a imagem e pior.
- A gravacao deve ficar em `main`.
- Se a live parecer ruim, selecione `main` no player e salve `Qualidade live padrao` como `main` na configuracao rapida.

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

## Live view, WebRTC e qualidade HLS

O navegador nao acessa RTSP direto. Para baixa latencia, o sistema usa MediaMTX para converter RTSP em WebRTC. Por padrao, o dashboard calcula a URL do MediaMTX usando o mesmo host do painel e a porta `8889`:

```txt
http://IP_DO_SERVIDOR:8889/main/
http://IP_DO_SERVIDOR:8889/sub/
```

Se precisar forcar outra URL publica para o player, configure `PUBLIC_WEBRTC_URL` e reconstrua o frontend. Para WebRTC funcionar de outro PC/celular da rede, configure:

```env
PUBLIC_WEBRTC_URL=http://IP_DO_SERVIDOR:8889
PUBLIC_WEBRTC_MUTED=true
WEBRTC_HTTP_BIND=0.0.0.0
WEBRTC_HTTP_PORT=8889
WEBRTC_ADDITIONAL_HOSTS=IP_DO_SERVIDOR
WEBRTC_UDP_PORT=8189
WEBRTC_AUDIO_BITRATE=32k
```

O live view publica os paths `main` e `sub` no MediaMTX por meio de relays FFmpeg. O video fica em copia direta (`-c:v copy`) e apenas o audio e convertido para Opus, porque muitas cameras RTSP enviam AAC/MPEG-4 Audio e navegadores WebRTC normalmente esperam Opus ou G.711. Por padrao o player inicia mutado para o autoplay funcionar no Chrome; use o controle de volume do player para ouvir. Se quiser tentar iniciar com som, configure `PUBLIC_WEBRTC_MUTED=false` e reconstrua o frontend.

No Linux, libere as portas se usar firewall:

```bash
sudo ufw allow 8889/tcp
sudo ufw allow 8189/udp
```

HLS fica como fallback. O backend cria HLS temporario em:

```txt
storage/hls/
```

O frontend consome playlists protegidas por JWT. O RTSP e a senha da camera nao sao enviados ao navegador.

Por padrao, o HLS usa `-c:v copy`, ou seja, nao recomprime o video. Se a camera/codec exigir transcodificacao, ligue:

```env
HLS_TRANSCODE=true
HLS_TRANSCODE_CRF=18
```

Quanto menor o `CRF`, melhor a imagem e maior o uso de CPU. Valores praticos:

```txt
18 = melhor qualidade
20 = bom equilibrio
23 = mais leve, qualidade menor
```

Se a live ficar travando depois de muitas horas, estes parametros controlam estabilidade e recuperacao:

```env
HLS_SEGMENT_SECONDS=2
HLS_LIST_SIZE=8
HLS_STALE_SECONDS=30
HLS_START_TIMEOUT_SECONDS=25
HLS_RTSP_TIMEOUT_MICROSECONDS=0
```

O backend considera a live travada quando a playlist HLS fica sem atualizar por `HLS_STALE_SECONDS`. O player tambem tenta recuperar buffer travado e, se nao voltar, pede para o backend reiniciar o FFmpeg da live.

Mantenha `HLS_RTSP_TIMEOUT_MICROSECONDS=0` se o FFmpeg do servidor encerrar antes de criar o HLS. Alguns builds de FFmpeg nao aceitam `-rw_timeout` no RTSP.

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
- Para acesso externo direto, prefira expor somente a porta `3000`; o Nginx encaminha `/api` para o backend internamente.
- Nao exponha RTSP/porta `554` da camera diretamente na internet.

## Limitacoes conhecidas

- Motion detection ainda nao foi implementado.
- Eventos de movimento e snapshots entram na Fase 3.
- Backup compactado `.zip` esta reservado como configuracao futura.
- Alterar path no Docker exige volume montado; o painel valida escrita, mas nao consegue montar disco do host sozinho.
