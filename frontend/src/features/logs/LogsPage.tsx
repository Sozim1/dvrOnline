import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { api, type SystemLog } from "../../services/api";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function parseContext(contextJson: string | null): string {
  if (!contextJson) return "";
  try {
    return JSON.stringify(JSON.parse(contextJson), null, 2);
  } catch {
    return contextJson;
  }
}

export function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [type, setType] = useState<SystemLog["type"] | "">("");
  const [level, setLevel] = useState<SystemLog["level"] | "">("");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await api.getLogs({
        type: type || undefined,
        level: level || undefined,
        date: date || undefined,
        search: search || undefined,
        limit: 300
      });
      setLogs(response.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar logs.");
    } finally {
      setIsLoading(false);
    }
  }, [date, level, search, type]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  async function clearOldLogs() {
    if (!window.confirm("Limpar logs com mais de 30 dias?")) return;
    setError("");
    try {
      const response = await api.clearOldLogs(30);
      setMessage(`${response.deleted} log(s) antigo(s) removido(s).`);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar logs.");
    }
  }

  return (
    <main className="page-stack">
      <header className="page-header">
        <div>
          <h1>Logs</h1>
          <p>Eventos operacionais de gravacao, FFmpeg, backup, retencao e storage.</p>
        </div>
        <button className="secondary-button" onClick={loadLogs} disabled={isLoading} type="button">
          <RefreshCw size={17} />
          Atualizar
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="panel log-filters">
        <label>
          Tipo
          <select value={type} onChange={(event) => setType(event.target.value as SystemLog["type"] | "")}>
            <option value="">todos</option>
            <option value="recording">recording</option>
            <option value="backup">backup</option>
            <option value="retention">retention</option>
            <option value="storage">storage</option>
            <option value="ffmpeg">ffmpeg</option>
            <option value="system">system</option>
          </select>
        </label>
        <label>
          Nivel
          <select value={level} onChange={(event) => setLevel(event.target.value as SystemLog["level"] | "")}>
            <option value="">todos</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
        </label>
        <label>
          Data
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          Busca
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="texto do log" />
        </label>
        <button className="secondary-button" onClick={loadLogs} type="button">
          <Search size={17} />
          Filtrar
        </button>
        <button className="secondary-button" onClick={clearOldLogs} type="button">
          <Trash2 size={17} />
          Limpar antigos
        </button>
      </section>

      <section className="panel table-panel">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Tipo</th>
                <th>Nivel</th>
                <th>Mensagem</th>
                <th>Contexto</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.type}</td>
                  <td>
                    <span className={`log-level ${log.level}`}>{log.level}</span>
                  </td>
                  <td>{log.message}</td>
                  <td>
                    <pre className="context-preview">{parseContext(log.contextJson)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && logs.length === 0 ? <div className="empty-state">Nenhum log encontrado.</div> : null}
      </section>
    </main>
  );
}
