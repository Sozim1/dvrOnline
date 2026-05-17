import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleStop, Play, RefreshCw, Save, Settings2, Video } from "lucide-react";
import { HlsPlayer } from "../../components/HlsPlayer";
import {
  api,
  type Camera,
  type RecordingSettings,
  type RecordingStatus,
  type StreamKind
} from "../../services/api";

const segmentOptions = [60, 300, 600, 1800];

function withCacheBust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

export function DashboardPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedStream, setSelectedStream] = useState<StreamKind>("sub");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [settings, setSettings] = useState<RecordingSettings | null>(null);
  const [segmentSeconds, setSegmentSeconds] = useState(300);
  const [recordingStream, setRecordingStream] = useState<StreamKind>("main");
  const [autoRecordingEnabled, setAutoRecordingEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isLiveLoading, setIsLiveLoading] = useState(false);

  const camera = cameras[0];

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

  const loadInitialData = useCallback(async () => {
    setError("");
    try {
      const cameraResponse = await api.getCameras();
      const activeCamera = cameraResponse.cameras[0];
      setCameras(cameraResponse.cameras);

      const settingsResponse = await api.getSettings();
      setSettings(settingsResponse.recording);
      setSegmentSeconds(settingsResponse.recording.segmentSeconds);
      setRecordingStream(settingsResponse.recording.recordingStream);
      setAutoRecordingEnabled(settingsResponse.recording.autoRecordingEnabled);

      if (activeCamera) {
        const stream = activeCamera.defaultStream;
        setSelectedStream(stream);
        await startLiveForCamera(activeCamera.id, stream);
        setRecordingStatus(await api.getRecordingStatus(activeCamera.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dashboard.");
    }
  }, [startLiveForCamera]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

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
      setStatusMessage(next.isRunning ? "Gravação iniciada." : "Gravação parada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar gravação.");
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
        autoRecordingEnabled
      });
      setSettings(response.recording);
      if (camera) setRecordingStatus(await api.getRecordingStatus(camera.id));
      setStatusMessage("Configuração de gravação salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configuração.");
    } finally {
      setIsBusy(false);
    }
  }

  const currentSegmentLabel = useMemo(() => {
    if (segmentSeconds < 60) return `${segmentSeconds}s`;
    if (segmentSeconds % 60 === 0) return `${segmentSeconds / 60} min`;
    return `${segmentSeconds}s`;
  }, [segmentSeconds]);

  return (
    <main className="page-stack">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Live view local, controle de stream e gravação segmentada.</p>
        </div>
        <button className="secondary-button" onClick={loadInitialData} disabled={isBusy || isLiveLoading} type="button">
          <RefreshCw size={17} />
          Atualizar
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {statusMessage ? <div className="alert success">{statusMessage}</div> : null}

      <section className="status-grid">
        <div className="metric-panel">
          <span className="metric-label">Câmera</span>
          <strong>{camera?.name ?? "Sem câmera"}</strong>
          <span>Live automática no painel</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Gravação</span>
          <strong>{recordingStatus?.isRunning ? "Ativa" : "Parada"}</strong>
          <span>{recordingStatus?.stream ?? recordingStream} · {currentSegmentLabel}</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Automática</span>
          <strong>{settings?.autoRecordingEnabled ? "Ligada" : "Desligada"}</strong>
          <span>Continua mesmo fora da tela</span>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel live-panel">
          <div className="panel-heading">
            <div>
              <h2>Live view</h2>
              <p>O player conecta automaticamente ao abrir o dashboard.</p>
            </div>
            <div className="segmented-control" aria-label="Selecionar stream">
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
        </div>

        <div className="side-column">
          <section className="panel">
            <div className="panel-heading compact">
              <div>
                <h2>Gravação</h2>
                <p>Usa FFmpeg com `-rtsp_transport tcp`.</p>
              </div>
              <Video size={20} />
            </div>

            <dl className="definition-list">
              <div>
                <dt>Processo</dt>
                <dd>{recordingStatus?.isRunning ? `PID ${recordingStatus.pid}` : "sem processo ativo"}</dd>
              </div>
              <div>
                <dt>Pasta atual</dt>
                <dd>{recordingStatus?.outputDir ?? "aguardando início"}</dd>
              </div>
            </dl>

            <button
              className={recordingStatus?.isRunning ? "danger-button full" : "primary-button full"}
              onClick={toggleRecording}
              disabled={isBusy || !camera}
              type="button"
            >
              {recordingStatus?.isRunning ? <CircleStop size={17} /> : <Play size={17} />}
              {recordingStatus?.isRunning ? "Parar gravação" : "Iniciar gravação"}
            </button>
          </section>

          <section className="panel">
            <div className="panel-heading compact">
              <div>
                <h2>Configuração</h2>
                <p>Aplicada na gravação atual ao salvar.</p>
              </div>
              <Settings2 size={20} />
            </div>

            <div className="form-grid">
              <label>
                Segmentação
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
                Stream de gravação
                <select
                  value={recordingStream}
                  onChange={(event) => setRecordingStream(event.target.value as StreamKind)}
                >
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
                Gravação automática ao iniciar backend
              </label>
            </div>

            <button className="secondary-button full" onClick={saveRecordingSettings} disabled={isBusy} type="button">
              <Save size={17} />
              Salvar configuração
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}
