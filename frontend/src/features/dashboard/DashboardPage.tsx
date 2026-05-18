import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CircleStop,
  Clock,
  HardDrive,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  SkipBack,
  SkipForward,
  TimerReset,
  Video
} from "lucide-react";
import { DayTimeline } from "../../components/DayTimeline";
import { HlsPlayer } from "../../components/HlsPlayer";
import {
  api,
  type Camera,
  type PlaybackSegment,
  type RecordingSettings,
  type RecordingStatus,
  type StorageStatus,
  type StreamKind,
  type WorkerStatus
} from "../../services/api";

const segmentOptions = [60, 300, 600, 1800];
const daySeconds = 24 * 60 * 60;

function withCacheBust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

function todayInputValue(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeInputValue(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function secondsToClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.min(daySeconds - 1, Math.floor(totalSeconds)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function secondsOfDay(value: string | null): number {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function segmentEndSeconds(segment: PlaybackSegment): number {
  if (segment.endedAt) return secondsOfDay(segment.endedAt);
  return secondsOfDay(segment.startedAt) + (segment.durationSeconds ?? 0);
}

function formatBytes(bytes?: number | null): string {
  const value = bytes ?? 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDuration(seconds?: number | null): string {
  const value = seconds ?? 0;
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  return `${hours}h ${minutes}min`;
}

export function DashboardPage() {
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const [mode, setMode] = useState<"live" | "playback">("live");
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedStream, setSelectedStream] = useState<StreamKind>("sub");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [settings, setSettings] = useState<RecordingSettings | null>(null);
  const [segmentSeconds, setSegmentSeconds] = useState(300);
  const [recordingStream, setRecordingStream] = useState<StreamKind>("main");
  const [defaultStream, setDefaultStream] = useState<StreamKind>("main");
  const [autoRecordingEnabled, setAutoRecordingEnabled] = useState(false);
  const [playbackDate, setPlaybackDate] = useState(todayInputValue());
  const [playbackTime, setPlaybackTime] = useState(timeInputValue());
  const [playbackSegments, setPlaybackSegments] = useState<PlaybackSegment[]>([]);
  const [playbackSource, setPlaybackSource] = useState("");
  const [playbackKey, setPlaybackKey] = useState("");
  const [playbackOffset, setPlaybackOffset] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [playbackCurrentSecond, setPlaybackCurrentSecond] = useState<number | null>(null);
  const [playbackNotice, setPlaybackNotice] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isLiveLoading, setIsLiveLoading] = useState(false);

  const camera = cameras[0];

  const loadPlaybackSegments = useCallback(async (cameraId: number, date: string) => {
    setPlaybackSegments(await api.getPlaybackSegments(cameraId, date));
  }, []);

  const startLiveForCamera = useCallback(
    async (cameraId: number, stream: StreamKind, showMessage = false) => {
      setIsLiveLoading(true);
      setError("");
      try {
        const liveStatus = await api.startLive(cameraId, stream);
        setPlaylistUrl(withCacheBust(api.withToken(liveStatus.playlistPath)));
        setSelectedStream(stream);
        if (showMessage) setStatusMessage(`Live ${stream} reconectada.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar live.");
      } finally {
        setIsLiveLoading(false);
      }
    },
    []
  );

  const refreshOperationalStatus = useCallback(async (cameraId: number) => {
    const [recording, worker, storage] = await Promise.all([
      api.getRecordingStatus(cameraId),
      api.getWorkerStatus(),
      api.getStorageStatus()
    ]);
    setRecordingStatus(recording);
    setWorkerStatus(worker);
    setStorageStatus(storage);
  }, []);

  const loadInitialData = useCallback(async () => {
    setError("");
    try {
      const [cameraResponse, settingsResponse] = await Promise.all([api.getCameras(), api.getSettings()]);
      const activeCamera = cameraResponse.cameras[0];
      setCameras(cameraResponse.cameras);
      setSettings(settingsResponse.recording);
      setSegmentSeconds(settingsResponse.recording.segmentSeconds);
      setRecordingStream(settingsResponse.recording.recordingStream);
      setDefaultStream(settingsResponse.recording.defaultStream);
      setAutoRecordingEnabled(settingsResponse.recording.autoRecordingEnabled);

      if (activeCamera) {
        const stream = settingsResponse.recording.defaultStream ?? activeCamera.defaultStream;
        setSelectedStream(stream);
        await Promise.all([
          startLiveForCamera(activeCamera.id, stream),
          refreshOperationalStatus(activeCamera.id),
          loadPlaybackSegments(activeCamera.id, playbackDate)
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dashboard.");
    }
  }, [loadPlaybackSegments, playbackDate, refreshOperationalStatus, startLiveForCamera]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (camera) loadPlaybackSegments(camera.id, playbackDate).catch(() => undefined);
  }, [camera, loadPlaybackSegments, playbackDate]);

  function loadPlaybackSegment(segment: PlaybackSegment, offsetSeconds = 0, notice = "") {
    setMode("playback");
    setSelectedSegmentId(segment.id);
    setPlaybackOffset(offsetSeconds);
    setPlaybackSource(api.withToken(segment.url));
    setPlaybackKey(`${segment.id}-${Date.now()}`);
    setPlaybackCurrentSecond(secondsOfDay(segment.startedAt) + offsetSeconds);
    setPlaybackNotice(notice);
  }

  async function seekPlayback(daySecond?: number) {
    if (!camera || !playbackDate) return;
    setIsBusy(true);
    setError("");
    setPlaybackNotice("");

    const clock = typeof daySecond === "number" ? secondsToClock(daySecond) : playbackTime;
    const normalizedClock = clock.length === 5 ? `${clock}:00` : clock;
    const datetime = `${playbackDate}T${normalizedClock}`;

    try {
      const response = await api.seekPlayback(camera.id, datetime);
      const targetSecond = typeof daySecond === "number" ? daySecond : secondsOfDay(datetime);
      const startSecond = secondsOfDay(response.segment.startedAt);
      const endSecond = segmentEndSeconds(response.segment);
      const outsideSegment = targetSecond < startSecond || targetSecond > endSecond;
      loadPlaybackSegment(
        response.segment,
        response.offsetSeconds,
        outsideSegment ? "Sem gravacao neste intervalo. Abrindo o trecho mais proximo." : ""
      );
      setPlaybackTime(normalizedClock);
      await loadPlaybackSegments(camera.id, playbackDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel buscar a gravacao.");
    } finally {
      setIsBusy(false);
    }
  }

  function playNextSegment() {
    if (!selectedSegmentId) return;
    const sorted = [...playbackSegments].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const currentIndex = sorted.findIndex((segment) => segment.id === selectedSegmentId);
    const current = sorted[currentIndex];
    const next = sorted[currentIndex + 1];

    if (!next || !current) {
      setPlaybackNotice("Fim das gravacoes disponiveis neste dia.");
      return;
    }

    const gap = secondsOfDay(next.startedAt) - segmentEndSeconds(current);
    loadPlaybackSegment(
      next,
      0,
      gap > 5 ? `Sem gravacao por ${formatDuration(gap)} antes do proximo trecho.` : ""
    );
  }

  async function skipPlayback(deltaSeconds: number) {
    const selected = playbackSegments.find((segment) => segment.id === selectedSegmentId);
    const video = playbackVideoRef.current;
    if (!selected || !video) return;

    const nextOffset = Math.floor(video.currentTime + deltaSeconds);
    const duration = selected.durationSeconds ?? video.duration ?? 0;
    if (nextOffset >= 0 && nextOffset <= duration) {
      video.currentTime = nextOffset;
      setPlaybackCurrentSecond(secondsOfDay(selected.startedAt) + nextOffset);
      return;
    }

    const targetSecond = secondsOfDay(selected.startedAt) + nextOffset;
    await seekPlayback(Math.max(0, Math.min(daySeconds - 1, targetSecond)));
  }

  async function changeLiveStream(stream: StreamKind) {
    if (!camera || stream === selectedStream) return;
    await startLiveForCamera(camera.id, stream, true);
  }

  async function toggleRecording() {
    if (!camera) return;
    setIsBusy(true);
    setError("");
    try {
      const next = recordingStatus?.isRunning
        ? await api.stopRecording(camera.id)
        : await api.startRecording(camera.id);
      setRecordingStatus(next);
      setWorkerStatus(await api.getWorkerStatus());
      setStatusMessage(next.isRunning ? "Gravacao iniciada." : "Gravacao parada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar gravacao.");
    } finally {
      setIsBusy(false);
    }
  }

  async function restartWorker() {
    setIsBusy(true);
    setError("");
    try {
      const status = await api.restartWorker();
      setRecordingStatus(status);
      setWorkerStatus(await api.getWorkerStatus());
      setStatusMessage("Worker FFmpeg reiniciado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reiniciar worker.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveRecordingSettings() {
    setIsBusy(true);
    setError("");
    try {
      const response = await api.updateRecordingSettings({
        segmentSeconds,
        recordingStream,
        defaultStream,
        autoRecordingEnabled
      });
      setSettings(response.recording);
      if (camera) await refreshOperationalStatus(camera.id);
      setStatusMessage("Configuracao de gravacao salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configuracao.");
    } finally {
      setIsBusy(false);
    }
  }

  async function returnToLive() {
    setMode("live");
    setPlaybackNotice("");
    if (camera && !playlistUrl) await startLiveForCamera(camera.id, selectedStream);
  }

  const currentSegmentLabel = useMemo(() => {
    if (segmentSeconds < 60) return `${segmentSeconds}s`;
    if (segmentSeconds % 60 === 0) return `${segmentSeconds / 60} min`;
    return `${segmentSeconds}s`;
  }, [segmentSeconds]);

  const recordedSeconds = useMemo(
    () => playbackSegments.reduce((sum, segment) => sum + (segment.durationSeconds ?? 0), 0),
    [playbackSegments]
  );

  return (
    <main className="page-stack">
      <header className="page-header">
        <div>
          <h1>DVR Dashboard</h1>
          <p>Player principal com ao vivo, reproducao por horario e timeline do dia.</p>
        </div>
        <button className="secondary-button" onClick={loadInitialData} disabled={isBusy || isLiveLoading} type="button">
          <RefreshCw size={17} />
          Atualizar
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {statusMessage ? <div className="alert success">{statusMessage}</div> : null}

      <section className="status-grid dvr-status-grid">
        <div className="metric-panel">
          <span className="metric-label">Camera</span>
          <strong>{camera?.name ?? "Sem camera"}</strong>
          <span>Live local via HLS</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Gravacao</span>
          <strong>{recordingStatus?.isRunning ? "Ativa" : "Parada"}</strong>
          <span>{recordingStatus?.stream ?? recordingStream} · {currentSegmentLabel}</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Storage</span>
          <strong>{formatBytes(storageStatus?.totalUsedBytes)}</strong>
          <span>Livre: {formatBytes(storageStatus?.recordings.freeSpaceBytes)}</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Worker</span>
          <strong>{workerStatus?.running ? "Rodando" : "Parado"}</strong>
          <span>{workerStatus?.pid ? `PID ${workerStatus.pid}` : "sem processo"}</span>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel live-panel">
          <div className="panel-heading">
            <div>
              <h2>Player principal</h2>
              <p>{mode === "live" ? "Ao vivo ativo automaticamente." : "Reproducao de gravacoes segmentadas."}</p>
            </div>
            <div className="segmented-control" aria-label="Modo do player">
              <button className={mode === "live" ? "selected" : ""} onClick={returnToLive} type="button">
                Ao vivo
              </button>
              <button className={mode === "playback" ? "selected" : ""} onClick={() => setMode("playback")} type="button">
                Reproducao
              </button>
            </div>
          </div>

          {mode === "live" ? (
            <>
              <div className="player-toolbar">
                <span className="live-badge">LIVE</span>
                <div className="segmented-control compact" aria-label="Selecionar stream">
                  {(["sub", "main"] as StreamKind[]).map((stream) => (
                    <button
                      key={stream}
                      className={selectedStream === stream ? "selected" : ""}
                      onClick={() => changeLiveStream(stream)}
                      disabled={isLiveLoading || !camera}
                      type="button"
                    >
                      {stream}
                    </button>
                  ))}
                </div>
              </div>
              <HlsPlayer source={playlistUrl} label={`Live ${selectedStream}`} />
            </>
          ) : (
            <>
              <video
                key={playbackKey}
                ref={playbackVideoRef}
                className="recording-video"
                src={playbackSource}
                controls
                autoPlay
                onLoadedMetadata={() => {
                  if (!playbackVideoRef.current) return;
                  playbackVideoRef.current.currentTime = playbackOffset;
                  playbackVideoRef.current.play().catch(() => undefined);
                }}
                onTimeUpdate={(event) => {
                  const selected = playbackSegments.find((segment) => segment.id === selectedSegmentId);
                  if (selected) {
                    setPlaybackCurrentSecond(secondsOfDay(selected.startedAt) + Math.floor(event.currentTarget.currentTime));
                  }
                }}
                onEnded={playNextSegment}
              />
              {!playbackSource ? <div className="empty-state embedded">Escolha uma data/hora ou clique na timeline.</div> : null}
            </>
          )}

          <div className="playback-controls">
            <label>
              Data
              <input type="date" value={playbackDate} onChange={(event) => setPlaybackDate(event.target.value)} />
            </label>
            <label>
              Hora
              <input
                type="time"
                step={1}
                value={playbackTime}
                onChange={(event) => setPlaybackTime(event.target.value)}
              />
            </label>
            <button className="secondary-button" onClick={() => seekPlayback()} disabled={!camera || isBusy} type="button">
              <Clock size={17} />
              Ir para horario
            </button>
            <button className="secondary-button" onClick={() => skipPlayback(-10)} disabled={!playbackSource} type="button">
              <SkipBack size={17} />
              10s
            </button>
            <button className="secondary-button" onClick={() => skipPlayback(10)} disabled={!playbackSource} type="button">
              <SkipForward size={17} />
              10s
            </button>
            <button className="secondary-button" onClick={returnToLive} type="button">
              <RotateCcw size={17} />
              Voltar ao vivo
            </button>
          </div>

          <DayTimeline
            date={playbackDate}
            segments={playbackSegments}
            currentSecond={playbackCurrentSecond}
            onSelect={(second) => {
              setPlaybackTime(secondsToClock(second));
              seekPlayback(second);
            }}
          />

          {playbackNotice ? <div className="timeline-notice">{playbackNotice}</div> : null}
        </div>

        <div className="side-column">
          <section className="panel">
            <div className="panel-heading compact">
              <div>
                <h2>Worker FFmpeg</h2>
                <p>Status do processo de gravacao.</p>
              </div>
              <Activity size={20} />
            </div>

            <dl className="definition-list">
              <div>
                <dt>Status</dt>
                <dd>{workerStatus?.running ? "rodando" : "parado"}</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd>{formatDuration(workerStatus?.uptimeSeconds)}</dd>
              </div>
              <div>
                <dt>Ultimo segmento</dt>
                <dd>{workerStatus?.lastSegmentAt ?? "sem segmento indexado"}</dd>
              </div>
              <div>
                <dt>Reinicios</dt>
                <dd>{workerStatus?.restartCount ?? 0}</dd>
              </div>
            </dl>

            <div className="button-stack">
              <button
                className={recordingStatus?.isRunning ? "danger-button full" : "primary-button full"}
                onClick={toggleRecording}
                disabled={isBusy || !camera}
                type="button"
              >
                {recordingStatus?.isRunning ? <CircleStop size={17} /> : <Play size={17} />}
                {recordingStatus?.isRunning ? "Parar gravacao" : "Iniciar gravacao"}
              </button>
              <button className="secondary-button full" onClick={restartWorker} disabled={isBusy || !camera} type="button">
                <TimerReset size={17} />
                Reiniciar worker
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading compact">
              <div>
                <h2>Storage</h2>
                <p>Retencao e backup da Fase 2.</p>
              </div>
              <HardDrive size={20} />
            </div>

            <dl className="definition-list">
              <div>
                <dt>Gravado hoje</dt>
                <dd>{formatDuration(recordedSeconds)} em {playbackSegments.length} trechos</dd>
              </div>
              <div>
                <dt>Retencao</dt>
                <dd>{storageStatus?.settings.retentionDays ?? settings?.retentionDays ?? 0} dias</dd>
              </div>
              <div>
                <dt>Backup</dt>
                <dd>{storageStatus?.settings.backupEnabled ? storageStatus.settings.backupSchedule : "manual/desligado"}</dd>
              </div>
              <div>
                <dt>Pasta</dt>
                <dd>{storageStatus?.settings.recordingsPath ?? "storage/recordings"}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-heading compact">
              <div>
                <h2>Configuracao rapida</h2>
                <p>Aplicada no worker atual ao salvar.</p>
              </div>
              <Settings2 size={20} />
            </div>

            <div className="form-grid">
              <label>
                Segmentacao
                <select
                  value={segmentOptions.includes(segmentSeconds) ? segmentSeconds : "custom"}
                  onChange={(event) => {
                    if (event.target.value !== "custom") setSegmentSeconds(Number(event.target.value));
                  }}
                >
                  <option value={60}>1 minuto</option>
                  <option value={300}>5 minutos</option>
                  <option value={600}>10 minutos</option>
                  <option value={1800}>30 minutos</option>
                  <option value="custom">Customizado</option>
                </select>
              </label>

              <label>
                Segundos
                <input
                  type="number"
                  min={10}
                  max={86400}
                  value={segmentSeconds}
                  onChange={(event) => setSegmentSeconds(Number(event.target.value))}
                />
              </label>

              <label>
                Qualidade live padrao
                <select value={defaultStream} onChange={(event) => setDefaultStream(event.target.value as StreamKind)}>
                  <option value="main">main - melhor imagem</option>
                  <option value="sub">sub - mais leve</option>
                </select>
              </label>

              <label>
                Stream de gravacao
                <select value={recordingStream} onChange={(event) => setRecordingStream(event.target.value as StreamKind)}>
                  <option value="main">main</option>
                  <option value="sub">sub</option>
                </select>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={autoRecordingEnabled}
                  onChange={(event) => setAutoRecordingEnabled(event.target.checked)}
                />
                Gravacao automatica no backend
              </label>
            </div>

            <button className="secondary-button full" onClick={saveRecordingSettings} disabled={isBusy} type="button">
              <Save size={17} />
              Salvar configuracao
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}
