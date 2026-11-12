"use client";

import { useState } from "react";
import { compareHistory, parseHistoryBackup, type HistoryEntry } from "@/lib/history";
import { replaceHistory } from "@/lib/stuck-storage";

function statusLabel(status: string | null) {
  return status ?? "Sem status atualizado";
}

export default function HistoryPanel({ entries, onChange, busy, setBusy, available }: {
  entries: HistoryEntry[];
  onChange: (entries: HistoryEntry[]) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  available: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const selectedIndex = Math.max(0, entries.findIndex((entry) => entry.id === selectedId));
  const selected = entries[selectedIndex];
  const previous = entries[selectedIndex + 1];
  const comparison = selected && previous ? compareHistory(selected, previous) : null;

  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ version: 1, entries })], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stuck-historico.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restoreBackup(file: File) {
    setError("");
    setBusy(true);
    try {
      const restored = parseHistoryBackup(await file.text());
      if (!window.confirm("Substituir o histórico atual pelo backup? O relatório atual e as marcações não serão alterados.")) return;
      await replaceHistory(restored);
      onChange(restored);
      setSelectedId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível restaurar o histórico.");
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (!window.confirm("Apagar todo o histórico? O relatório atual e as marcações serão mantidos.")) return;
    setError("");
    setBusy(true);
    try {
      await replaceHistory([]);
      onChange([]);
      setSelectedId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível apagar o histórico.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel history-panel">
      <div className="records-heading">
        <div><h2>Histórico de importações</h2><p className="muted">Até sete importações neste navegador. O backup contém TNs e status, não os arquivos originais nem as marcações.</p></div>
      </div>
      <div className="selection-bar">
        <button type="button" className="secondary-button" disabled={busy || !available || !entries.length} onClick={downloadBackup}>Baixar backup do histórico</button>
        <label className={`secondary-button upload-button ${busy ? "disabled" : ""}`}>
          Restaurar backup
          <input type="file" accept=".json,application/json" disabled={busy} aria-label="Restaurar backup do histórico"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void restoreBackup(file);
            }} />
        </label>
        <button type="button" className="text-button" disabled={busy || (available && !entries.length)} onClick={clearHistory}>Apagar histórico</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!available ? <p className="error">Histórico indisponível. Restaure um backup ou apague o histórico para continuar.</p> : !entries.length ? <p className="muted">Nenhuma importação no histórico. As importações anteriores a esta função não foram registradas.</p> : (
        <>
          <label className="history-select">Importação
            <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)} disabled={busy}>
              {entries.map((entry) => <option key={entry.id} value={entry.id}>{new Date(entry.importedAt).toLocaleString("pt-BR")} — {entry.records.length.toLocaleString("pt-BR")} mercadoria(s)</option>)}
            </select>
          </label>
          <p className="muted history-files">STUCK: {selected.stuckName} · Status: {selected.updatedName}</p>
          {comparison && previous ? (
            <div className="history-comparison">
              <p>Comparação com a importação anterior de {new Date(previous.importedAt).toLocaleString("pt-BR")}:</p>
              <details><summary>Novos: {comparison.added.length}</summary><ul>{comparison.added.map((tracking) => <li key={tracking}>{tracking}</li>)}</ul></details>
              <details><summary>Não presentes no novo relatório: {comparison.removed.length}</summary><ul>{comparison.removed.map((tracking) => <li key={tracking}>{tracking}</li>)}</ul></details>
              <details><summary>Alterações de status: {comparison.changed.length}</summary><ul>{comparison.changed.map((change) => <li key={change.tracking}>{change.tracking}: {statusLabel(change.before)} → {statusLabel(change.after)}</li>)}</ul></details>
              <p className="muted">A ausência no relatório não indica entrega ou conclusão do tratamento.</p>
            </div>
          ) : <p className="muted">Não há importação anterior neste histórico para comparação.</p>}
        </>
      )}
    </section>
  );
}
