import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { api, type Camera, type Recording } from "../../services/api";

function todayInputValue(): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(value: string): { date: string; time: string } {
  const [date, time = ""] = value.split("T");
  const [yyyy, mm, dd] = date.split("-");
  return {
    date: `${dd}/${mm}/${yyyy}`,
    time: time.slice(0, 5)
  };
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function secondsLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function RecordingsPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraId, setCameraId] = useState<number | undefined>();
  const [date, setDate] = useState(todayInputValue());
  const [targetTime, setTargetTime] = useState("");
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [seekSeconds, setSeekSeconds] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      setSelectedRecording((current) => current ?? recordingResponse.recordings[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar gravações.");
    } finally {
      setIsLoading(false);
    }
  }, [cameraId, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function selectRecording(recording: Recording, seconds = 0) {
    setSelectedRecording(recording);
    setSeekSeconds(seconds);
    window.setTimeout(() => {
      if (videoRef.current) videoRef.current.currentTime = seconds;
    }, 0);
  }

  function seekTo(seconds: number) {
    const duration = selectedRecording?.durationSeconds ?? 0;
    const next = Math.max(0, Math.min(seconds, duration));
    setSeekSeconds(next);
    if (videoRef.current) videoRef.current.currentTime = next;
  }

  function selectByClockTime() {
    if (!date || !targetTime || recordings.length === 0) return;

    const target = new Date(`${date}T${targetTime.length === 5 ? `${targetTime}:00` : targetTime}`);
    if (Number.isNaN(target.getTime())) return;

    let closest: { recording: Recording; distance: number; offset: number } | undefined;

    for (const recording of recordings) {
      const start = toDate(recording.startedAt);
      const end = toDate(recording.endedAt);
      if (!start) continue;
      const fallbackEnd = new Date(start.getTime() + (recording.durationSeconds ?? 0) * 1000);
      const effectiveEnd = end ?? fallbackEnd;
      const offset = Math.max(0, Math.floor((target.getTime() - start.getTime()) / 1000));

      if (target >= start && target <= effectiveEnd) {
        selectRecording(recording, offset);
        return;
      }

      const distance = Math.abs(target.getTime() - start.getTime());
      if (!closest || distance < closest.distance) {
        closest = { recording, distance, offset: 0 };
      }
    }

    if (closest) selectRecording(closest.recording, closest.offset);
  }

  async function toggleProtected(recording: Recording) {
    setError("");
    try {
      await api.setRecordingProtected(recording.id, !recording.isProtected);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar proteção.");
    }
  }

  async function deleteRecording(recording: Recording) {
    if (!window.confirm(`Apagar a gravação ${recording.filePath}?`)) return;
    setError("");
    try {
      await api.deleteRecording(recording.id);
      if (selectedRecording?.id === recording.id) {
        setSelectedRecording(null);
        setSeekSeconds(0);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar gravação.");
    }
  }

  const totalSize = useMemo(
    () => recordings.reduce((sum, recording) => sum + recording.fileSize, 0),
    [recordings]
  );

  const selectedDuration = selectedRecording?.durationSeconds ?? 0;

  return (
    <main className="page-stack">
      <header className="page-header">
        <div>
          <h1>Gravações</h1>
          <p>Escolha uma data, selecione um horário e assista pelo player da página.</p>
        </div>
        <button className="secondary-button" onClick={loadData} disabled={isLoading} type="button">
          <RefreshCw size={17} />
          Atualizar
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel filters-panel">
        <label>
          Câmera
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
          Ir para horário
          <input type="time" value={targetTime} onChange={(event) => setTargetTime(event.target.value)} />
        </label>

        <button className="secondary-button" onClick={selectByClockTime} disabled={!targetTime || recordings.length === 0} type="button">
          <Clock size={17} />
          Ver horário
        </button>

        <div className="filter-summary">
          <strong>{recordings.length}</strong>
          <span>arquivos · {formatSize(totalSize)}</span>
        </div>
      </section>

      <section className="panel recording-player-panel">
        <div className="panel-heading compact">
          <div>
            <h2>{selectedRecording ? "Player da gravação" : "Nenhuma gravação selecionada"}</h2>
            <p>{selectedRecording?.filePath ?? "Selecione um arquivo na tabela ou escolha um horário."}</p>
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
              ref={videoRef}
              className="recording-video"
              src={api.withToken(`/api/recordings/${selectedRecording.id}/stream`)}
              controls
              autoPlay
              onLoadedMetadata={() => seekTo(seekSeconds)}
              onTimeUpdate={(event) => setSeekSeconds(Math.floor(event.currentTarget.currentTime))}
            />

            <div className="player-tools">
              <button className="secondary-button" onClick={() => seekTo(seekSeconds - 10)} type="button">
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
              <button className="secondary-button" onClick={() => seekTo(seekSeconds + 10)} type="button">
                <SkipForward size={17} />
                10s
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">Nenhum vídeo selecionado.</div>
        )}
      </section>

      <section className="panel table-panel">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Hora</th>
                <th>Duração</th>
                <th>Tamanho</th>
                <th>Proteção</th>
                <th>Ações</th>
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
                        <button
                          className="icon-button"
                          onClick={() => toggleProtected(recording)}
                          type="button"
                          title={recording.isProtected ? "Remover proteção" : "Marcar como importante"}
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
            Nenhuma gravação encontrada para os filtros atuais.
          </div>
        ) : null}
      </section>
    </main>
  );
}
