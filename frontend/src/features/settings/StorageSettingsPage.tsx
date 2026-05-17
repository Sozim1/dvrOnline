import { useCallback, useEffect, useState } from "react";
import { Archive, Play, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { api, type StoragePathTest, type StorageSettings, type StorageStatus } from "../../services/api";

function formatBytes(bytes?: number | null): string {
  const value = bytes ?? 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function blankSettings(): StorageSettings {
  return {
    recordingsPath: "./storage/recordings",
    backupPath: "./storage/backups",
    snapshotsPath: "./storage/snapshots",
    retentionDays: 7,
    retentionAutoDeleteEnabled: true,
    retentionRequireBackup: false,
    backupEnabled: false,
    backupSchedule: "manual",
    backupTime: "02:00",
    backupKeepStructure: true,
    backupMode: "copy",
    backupCompress: false,
    diskAlertPercent: 85,
    storageMaxBytes: null
  };
}

type PathKey = "recordingsPath" | "backupPath" | "snapshotsPath";

export function StorageSettingsPage() {
  const [settings, setSettings] = useState<StorageSettings>(blankSettings());
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [pathTests, setPathTests] = useState<Partial<Record<PathKey, StoragePathTest>>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    setIsBusy(true);
    try {
      const storageStatus = await api.getStorageStatus();
      setStatus(storageStatus);
      setSettings(storageStatus.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar storage.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function update<K extends keyof StorageSettings>(key: K, value: StorageSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function testPath(key: PathKey) {
    setError("");
    try {
      const result = await api.testStoragePath(settings[key]);
      setPathTests((current) => ({ ...current, [key]: result }));
      setMessage(result.success ? "Pasta validada com escrita." : "Pasta nao passou na validacao.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar pasta.");
    }
  }

  async function saveSettings() {
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await api.saveStorageSettings(settings);
      setSettings(response.settings);
      setMessage("Configuracao de storage salva.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar storage.");
    } finally {
      setIsBusy(false);
    }
  }

  async function runRetention() {
    setIsBusy(true);
    setError("");
    try {
      const response = await api.runRetention();
      setMessage(`Retencao executada: ${response.result.deleted} apagado(s), ${response.result.skipped} ignorado(s).`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar retencao.");
    } finally {
      setIsBusy(false);
    }
  }

  async function runBackup() {
    setIsBusy(true);
    setError("");
    try {
      const response = await api.runBackup();
      const success = response.results.filter((result) => result.status === "backed_up").length;
      setMessage(`Backup executado. Sucesso em ${success} arquivo(s).`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar backup.");
    } finally {
      setIsBusy(false);
    }
  }

  function renderPathTest(key: PathKey) {
    const result = pathTests[key];
    if (!result) return null;
    return (
      <div className={result.success ? "path-test success" : "path-test error"}>
        <strong>{result.success ? "OK" : "Falhou"}</strong>
        <span>Escrita: {result.canWrite ? "sim" : "nao"} · Livre: {formatBytes(result.freeSpaceBytes)}</span>
        {result.warnings.length > 0 ? <small>{result.warnings.join(" ")}</small> : null}
      </div>
    );
  }

  return (
    <main className="page-stack">
      <header className="page-header">
        <div>
          <h1>Storage</h1>
          <p>Pastas, retencao, backup local e validacao de escrita do servidor.</p>
        </div>
        <button className="secondary-button" onClick={loadData} disabled={isBusy} type="button">
          <RefreshCw size={17} />
          Atualizar
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="status-grid recordings-summary">
        <div className="metric-panel">
          <span className="metric-label">Gravacoes</span>
          <strong>{formatBytes(status?.recordings.usedBytes)}</strong>
          <span>Livre: {formatBytes(status?.recordings.freeSpaceBytes)}</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Backups</span>
          <strong>{formatBytes(status?.backups.usedBytes)}</strong>
          <span>Livre: {formatBytes(status?.backups.freeSpaceBytes)}</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Snapshots</span>
          <strong>{formatBytes(status?.snapshots.usedBytes)}</strong>
          <span>Livre: {formatBytes(status?.snapshots.freeSpaceBytes)}</span>
        </div>
        <div className="metric-panel">
          <span className="metric-label">Total usado</span>
          <strong>{formatBytes(status?.totalUsedBytes)}</strong>
          <span>Alerta em {settings.diskAlertPercent}%</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <h2>Pastas do DVR</h2>
            <p>No Docker, o caminho precisa estar dentro de um volume montado para persistir no host.</p>
          </div>
          <ShieldCheck size={20} />
        </div>

        <div className="storage-grid">
          <label>
            Pasta de gravacoes
            <input value={settings.recordingsPath} onChange={(event) => update("recordingsPath", event.target.value)} />
            <button className="secondary-button" onClick={() => testPath("recordingsPath")} type="button">
              Testar escrita
            </button>
            {renderPathTest("recordingsPath")}
          </label>

          <label>
            Pasta de backups
            <input value={settings.backupPath} onChange={(event) => update("backupPath", event.target.value)} />
            <button className="secondary-button" onClick={() => testPath("backupPath")} type="button">
              Testar escrita
            </button>
            {renderPathTest("backupPath")}
          </label>

          <label>
            Pasta de snapshots
            <input value={settings.snapshotsPath} onChange={(event) => update("snapshotsPath", event.target.value)} />
            <button className="secondary-button" onClick={() => testPath("snapshotsPath")} type="button">
              Testar escrita
            </button>
            {renderPathTest("snapshotsPath")}
          </label>
        </div>
      </section>

      <section className="settings-grid">
        <div className="panel">
          <div className="panel-heading compact">
            <div>
              <h2>Retencao</h2>
              <p>Arquivos protegidos nunca entram na limpeza automatica.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Dias de retencao
              <input
                type="number"
                min={1}
                max={3650}
                value={settings.retentionDays}
                onChange={(event) => update("retentionDays", Number(event.target.value))}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.retentionAutoDeleteEnabled}
                onChange={(event) => update("retentionAutoDeleteEnabled", event.target.checked)}
              />
              Apagar arquivos antigos automaticamente
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.retentionRequireBackup}
                onChange={(event) => update("retentionRequireBackup", event.target.checked)}
              />
              Apagar somente depois de backup concluido
            </label>
          </div>

          <button className="secondary-button full" onClick={runRetention} disabled={isBusy} type="button">
            <Play size={17} />
            Executar retencao agora
          </button>
        </div>

        <div className="panel">
          <div className="panel-heading compact">
            <div>
              <h2>Backup local</h2>
              <p>Preparado para agenda diaria, semanal ou manual.</p>
            </div>
            <Archive size={20} />
          </div>

          <div className="form-grid">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.backupEnabled}
                onChange={(event) => update("backupEnabled", event.target.checked)}
              />
              Backup automatico ligado
            </label>
            <label>
              Agenda
              <select
                value={settings.backupSchedule}
                onChange={(event) => update("backupSchedule", event.target.value as StorageSettings["backupSchedule"])}
              >
                <option value="manual">manual</option>
                <option value="daily">diario</option>
                <option value="weekly">semanal</option>
              </select>
            </label>
            <label>
              Horario
              <input type="time" value={settings.backupTime} onChange={(event) => update("backupTime", event.target.value)} />
            </label>
            <label>
              Modo
              <select
                value={settings.backupMode}
                onChange={(event) => update("backupMode", event.target.value as StorageSettings["backupMode"])}
              >
                <option value="copy">copiar</option>
                <option value="move">mover</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.backupKeepStructure}
                onChange={(event) => update("backupKeepStructure", event.target.checked)}
              />
              Manter estrutura por camera/data
            </label>
          </div>

          <button className="secondary-button full" onClick={runBackup} disabled={isBusy} type="button">
            <Archive size={17} />
            Executar backup agora
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <h2>Limites e alerta</h2>
            <p>Use limite maximo apenas se quiser controlar crescimento antes da retencao.</p>
          </div>
        </div>
        <div className="storage-grid compact">
          <label>
            Alerta de disco (%)
            <input
              type="number"
              min={1}
              max={100}
              value={settings.diskAlertPercent}
              onChange={(event) => update("diskAlertPercent", Number(event.target.value))}
            />
          </label>
          <label>
            Tamanho maximo em bytes (opcional)
            <input
              type="number"
              min={1}
              value={settings.storageMaxBytes ?? ""}
              onChange={(event) => update("storageMaxBytes", event.target.value ? Number(event.target.value) : null)}
            />
          </label>
        </div>
        <button className="primary-button" onClick={saveSettings} disabled={isBusy} type="button">
          <Save size={17} />
          Salvar storage
        </button>
      </section>
    </main>
  );
}
