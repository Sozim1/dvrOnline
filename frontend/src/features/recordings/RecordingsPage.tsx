import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Clock,
  Download,
  Eye,
  Lock,
  RefreshCw,
  SkipBack,
  SkipForward,
  Trash2,
  Unlock
} from "lucide-react";
import { DayTimeline } from "../../components/DayTimeline";
import { api, type Camera, type Recording } from "../../services/api";

const daySeconds = 24 * 60 * 60;

function todayInputValue(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string): { date: string; time: string } {
  const [date, time = ""] = value.split("T");
  const [yyyy, mm, dd] = date.split("-");
  return {
    date: `${dd}/${mm}/${yyyy}`,
    time: time.slice(0, 8)
  };
}

function formatDuration(seconds: number | null | undefined): string {
  const value = seconds ?? 0;
  if (value <= 0) return "-";
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  return `${hours}h ${minutes}min`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function secondsLabel(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

function endSeconds(recording: Recording): number {
  if (recording.endedAt) return secondsOfDay(recording.endedAt);
  return secondsOfDay(recording.startedAt) + (recording.durationSeconds ?? 0);
}

export function RecordingsPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraId, setCameraId] = useState<number | undefined>();
  const [date, setDate] = useState(todayInputValue());
  const [targetTime, setTargetTime] = useState("");
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [videoKey, setVideoKey] = useState("");
  const [seekSeconds, setSeekSeconds] = useState(0);
  const [currentDaySecond, setCurrentDaySecond] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sortedRecordings = useMemo(
    () => [...recordings].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [recordings]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const cameraResponse = await api.getCameras();
      setCameras(cameraResponse.cameras);
      const selectedCameraId = cameraId ?? cameraResponse.cameras[0]?.id;
      setCameraId(selectedCameraId);
      const recordingResponse = await api.getRecordings({
        cameraId: selectedCameraId,
        date: date || undefined
      });
      setRecordings(recordingResponse.recordings);
      setSelectedRecording((current) => {
        if (current && recordingResponse.recordings.some((recording) => recording.id === current.id)) return current;
        return recordingResponse.recordings[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar gravacoes.");
    } finally {
      setIsLoading(false);
    }
  }, [cameraId, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function selectRecording(recording: Recording, seconds = 0, nextNotice = "") {
    setSelectedRecording(recording);
    setSeekSeconds(seconds);
    setCurrentDaySecond(secondsOfDay(recording.startedAt) + seconds);
    setVideoKey(`${recording.id}-${Date.now()}`);
    setNotice(nextNotice);
  }

  async function seekPlayback(daySecond?: number) {
    const selectedCameraId = cameraId ?? cameras[0]?.id;
    if (!selectedCameraId || !date) return;
    setError("");
    setNotice("");

    const clock = typeof daySecond === "number" ? secondsToClock(daySecond) : targetTime;
    const normalizedClock = clock.length === 5 ? `${clock}:00` : clock;
    try {
      const response = await api.seekPlayback(selectedCameraId, `${date}T${normalizedClock}`);
      const targetSecond = typeof daySecond === "number" ? daySecond : secondsOfDay(`${date}T${normalizedClock}`);
      const recording = recordings.find((entry) => entry.id === response.recordingId);
      if (!recording) {
        await loadData();
        return;
      }

      const outside = targetSecond < secondsOfDay(recording.startedAt) || targetSecond > endSeconds(recording);
      selectRecording(
        recording,
        response.offsetSeconds,
        outside ? "Sem gravacao neste intervalo. Abrindo o trecho mais proximo." : ""
      );
      setTargetTime(normalizedClock);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel buscar o horario.");
    }
  }

  function seekTo(seconds: number) {
    const duration = selectedRecording?.durationSeconds ?? 0;
    const next = Math.max(0, Math.min(seconds, duration));
    setSeekSeconds(next);
    if (videoRef.current) videoRef.current.currentTime = next;
    if (selectedRecording) setCurrentDaySecond(secondsOfDay(selectedRecording.startedAt) + next);
  }

  async function skip(delta: number) {
    if (!selectedRecording) return;
    const next = seekSeconds + delta;
    const duration = selectedRecording.durationSeconds ?? 0;
    if (next >= 0 && next <= duration) {
      seekTo(next);
      return;
    }
    await seekPlayback(Math.max(0, Math.min(daySeconds - 1, secondsOfDay(selectedRecording.startedAt) + next)));
  }

  function playNextRecording() {
    if (!selectedRecording) return;
    const index = sortedRecordings.findIndex((recording) => recording.id === selectedRecording.id);
    const current = sortedRecordings[index];
    const next = sortedRecordings[index + 1];
    if (!next || !current) {
      setNotice("Fim das gravacoes disponiveis neste dia.");
      return;
    }
    const gap = secondsOfDay(next.startedAt) - endSeconds(current);
    selectRecording(next, 0, gap > 5 ? `Sem gravacao por ${formatDuration(gap)} antes do proximo trecho.` : "");
  }

  async function toggleProtected(recording: Recording) {
    setError("");
    try {
      await api.setRecordingProtected(recording.id, !recording.isProtected);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar protecao.");
    }
  }

  async function backupRecording(recording: Recording) {
    setError("");
    try {
      const response = await api.backupRecording(recording.id);
      setStatusMessage(response.result.message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao fazer backup.");
    }
  }

  async function backupDay() {
    if (!cameraId) return;
    setError("");
    try {
      const response = await api.backupDay(cameraId, date);
      const success = response.results.filter((result) => result.status === "backed_up").length;
      setStatusMessage(`Backup do dia executado. Sucesso em ${success} arquivo(s).`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao fazer backup do dia.");
    }
  }

  async function deleteRecording(recording: Recording) {
    if (!window.confirm(`Apagar a gravacao ${recording.filePath}?`)) return;
    setError("");
    try {
      await api.deleteRecording(recording.id);
      if (selectedRecording?.id === recording.id) {
        setSelectedRecording(null);
        setSeekSeconds(0);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar gravacao.");
    }
  }

  const totals = useMemo(() => {
    const totalSize = recordings.reduce((sum, recording) => sum + recording.fileSize, 0);
    const totalSeconds = recordings.reduce((sum, recording) => sum + (recording.durationSeconds ?? 0), 0);
    const protectedCount = recordings.filter((recording) => recording.isProtected).length;
    return { totalSize, totalSeconds, protectedCount };
  }, [recordings]);

  const selectedDuration = selectedRecording?.durationSeconds ?? 0;

  return (
    <main className="page-stack">
      <header className="page-header">
        <div>
          <h1>Gravacoes</h1>
          <p>Historico em formato DVR: escolha o dia, clique na timeline e o player troca de segmento sozinho.</p>
        </div>
        <button className="secondary-button" onClick={loadData} disabled={isLoading} type="button">
          <RefreshCw size={17} />
          Atualizar
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {statusMessage ? <div className="alert success">{statusMessage}</div> : null}

      <section className="panel filters-panel recordings-filters">
        <label>
          Camera
          <select
            value={cameraId ?? ""}
            onChange={(event) => {
              setCameraId(Number(event.target.value));
              setSelectedRecording(null);
              setSeekSeconds(0);
            }}
          >
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Data
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setSelectedRecording(null);
              setSeekSeconds(0);
            }}
          />
        </label>

        <label>
          Ir para horario
          <input type="time" step={1} value={targetTime} onChange={(event) => setTargetTime(event.target.value)} />
        </label>

        <button className="secondary-button" onClick={() => seekPlayback()} disabled={!targetTime || recordings.length === 0} type="button">
          <Clock size={17} />
          Ver horario
        </button>

        <button className="secondary-button" onClick={backupDay} disabled={!cameraId || recordings.length === 0} type="button">
          <Archive size={17} />
          Backup do dia
        </button>
      </section>

      <section className="status-grid recordings-summary">
        <div className="metric-panel">
          <span className="metric-label">Total gravado no dia</span>
          <strong>{formatDuration(totals.totalSeconds)}</strong>
          <span>{date}</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Arquivos</span>
          <strong>{recordings.length}</strong>
          <span>segmentos indexados</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Espaco usado</span>
          <strong>{formatSize(totals.totalSize)}</strong>
          <span>neste filtro</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Protegidos</span>
          <strong>{totals.protectedCount}</strong>
          <span>fora da retencao automatica</span>
        </div>
      </section>

      <section className="panel recording-player-panel">
        <div className="panel-heading compact">
          <div>
            <h2>{selectedRecording ? "Playback do dia" : "Nenhuma gravacao selecionada"}</h2>
            <p>{selectedRecording?.filePath ?? "Clique em um bloco da timeline ou escolha um horario."}</p>
          </div>
          {selectedRecording ? (
            <button
              className="secondary-button"
              onClick={() => window.open(api.withToken(`/api/recordings/${selectedRecording.id}/download`), "_blank")}
              type="button"
            >
              <Download size={17} />
              Baixar
            </button>
          ) : null}
        </div>

        {selectedRecording ? (
          <>
            <video
              key={videoKey || selectedRecording.id}
              ref={videoRef}
              className="recording-video"
              src={api.withToken(`/api/recordings/${selectedRecording.id}/stream`)}
              controls
              autoPlay
              onLoadedMetadata={() => {
                if (!videoRef.current) return;
                videoRef.current.currentTime = seekSeconds;
                videoRef.current.play().catch(() => undefined);
              }}
              onTimeUpdate={(event) => {
                const next = Math.floor(event.currentTarget.currentTime);
                setSeekSeconds(next);
                setCurrentDaySecond(secondsOfDay(selectedRecording.startedAt) + next);
              }}
              onEnded={playNextRecording}
            />

            <div className="player-tools">
              <button className="secondary-button" onClick={() => skip(-10)} type="button">
                <SkipBack size={17} />
                10s
              </button>
              <label className="seek-control">
                <span>{secondsLabel(seekSeconds)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, selectedDuration)}
                  value={Math.min(seekSeconds, Math.max(1, selectedDuration))}
                  onChange={(event) => seekTo(Number(event.target.value))}
                />
                <span>{secondsLabel(selectedDuration)}</span>
              </label>
              <button className="secondary-button" onClick={() => skip(10)} type="button">
                <SkipForward size={17} />
                10s
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">Nenhum video selecionado.</div>
        )}

        <DayTimeline
          date={date}
          segments={recordings}
          currentSecond={currentDaySecond}
          onSelect={(second) => {
            setTargetTime(secondsToClock(second));
            seekPlayback(second);
          }}
        />
        {notice ? <div className="timeline-notice">{notice}</div> : null}
      </section>

      <section className="panel table-panel">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Hora</th>
                <th>Duracao</th>
                <th>Tamanho</th>
                <th>Status</th>
                <th>Backup</th>
                <th>Protecao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((recording) => {
                const dateTime = formatDateTime(recording.startedAt);
                return (
                  <tr key={recording.id} className={selectedRecording?.id === recording.id ? "selected-row" : ""}>
                    <td>{dateTime.date}</td>
                    <td>{dateTime.time}</td>
                    <td>{formatDuration(recording.durationSeconds)}</td>
                    <td>{formatSize(recording.fileSize)}</td>
                    <td>{recording.status}{recording.isCurrentlyRecording ? " (gravando)" : ""}</td>
                    <td>{recording.backupStatus}</td>
                    <td>{recording.isProtected ? "Importante" : "Normal"}</td>
                    <td>
                      <div className="table-actions">
                        <button className="icon-button" onClick={() => selectRecording(recording)} type="button" title="Assistir">
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => window.open(api.withToken(`/api/recordings/${recording.id}/download`), "_blank")}
                          type="button"
                          title="Baixar"
                        >
                          <Download size={16} />
                        </button>
                        <button className="icon-button" onClick={() => backupRecording(recording)} type="button" title="Backup">
                          <Archive size={16} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => toggleProtected(recording)}
                          type="button"
                          title={recording.isProtected ? "Remover protecao" : "Marcar como importante"}
                        >
                          {recording.isProtected ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => deleteRecording(recording)}
                          type="button"
                          title="Apagar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && recordings.length === 0 ? (
          <div className="empty-state">
            Nenhuma gravacao encontrada para os filtros atuais.
          </div>
        ) : null}
      </section>
    </main>
  );
}
