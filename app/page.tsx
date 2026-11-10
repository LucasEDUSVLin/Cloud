"use client";

import { useEffect, useMemo, useState } from "react";
import { delivered, processStuckFiles, risk, type StuckRecord, type StuckSnapshot, extractTrackingNumbers, valueTotals, exportSelectedCsv } from "@/lib/stuck";
import { readSnapshot, saveSnapshot } from "@/lib/stuck-storage";

type Filter = "open" | "delivered" | "overdue" | "unmatched" | "all";
const PAGE_SIZE = 50;
const currencyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatCurrency(cents: number) {
  return currencyFormat.format(cents / 100);
}

function statusLabel(status: string | null) {
  return status || "Sem status atualizado";
}

function formatTime(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "Data indisponível" : parsed.toLocaleString("pt-BR");
}

function filterRecord(record: StuckRecord, filter: Filter) {
  if (filter === "open") return !delivered(record);
  if (filter === "delivered") return delivered(record);
  if (filter === "overdue") return !delivered(record) && record.days > 15;
  if (filter === "unmatched") return !record.updatedStatus;
  return true;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<StuckSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stuckFile, setStuckFile] = useState<File | null>(null);
  const [statusFile, setStatusFile] = useState<File | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    readSnapshot()
      .then((result) => { if (active) setSnapshot(result); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Falha ao ler o banco local."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => {
    const records = snapshot?.records ?? [];
    return {
      total: records.length,
      open: records.filter((row) => !delivered(row)).length,
      delivered: records.filter(delivered).length,
      overdue: records.filter((row) => !delivered(row) && row.days > 15).length,
      limit: records.filter((row) => !delivered(row) && row.days === 15).length,
      unmatched: records.filter((row) => !row.updatedStatus).length,
    };
  }, [snapshot]);
  const amounts = useMemo(() => valueTotals(snapshot?.records ?? []), [snapshot]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return (snapshot?.records ?? [])
      .filter((record) => filterRecord(record, filter) &&
      (statusFilter === null || (record.updatedStatus ?? "") === statusFilter) && (!query || [
        record.tracking, record.city, record.operation, record.driver, record.updatedDriver,
        record.updatedStatus ?? "", record.station,
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query))))
      .sort((a, b) => b.days - a.days || a.tracking.localeCompare(b.tracking));
  }, [snapshot, filter, search, statusFilter]);
  const statuses = useMemo(() => {
    const groups = new Map<string, number>();
    for (const record of snapshot?.records ?? []) {
      const key = record.updatedStatus ?? "";
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    return [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [snapshot]);
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedInFilter = filtered.filter((record) => selected.has(record.tracking)).length;
  const allFilteredSelected = filtered.length > 0 && selectedInFilter === filtered.length;

  async function handleCopyTn() {
    if (!stuckFile) return;
    setError("");
    setNotice("");
    try {
      const codes = extractTrackingNumbers(await stuckFile.text());
      await navigator.clipboard.writeText(codes.join("\n"));
      setNotice(`${codes.length} código(s) TN copiados.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível copiar os códigos TN.");
    }
  }

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!stuckFile || !statusFile) {
      setError("Selecione os dois arquivos CSV.");
      return;
    }
    if ([stuckFile, statusFile].some((file) => !file.name.toLowerCase().endsWith(".csv") || file.size > 10 * 1024 * 1024)) {
      setError("Selecione dois arquivos CSV de até 10 MB cada.");
      return;
    }
    setBusy(true);
    try {
      const [stuckCsv, statusCsv] = await Promise.all([stuckFile.text(), statusFile.text()]);
      const result = processStuckFiles(stuckCsv, statusCsv);
      await saveSnapshot(result);
      setSnapshot(result);
      setFilter("open");
      setStatusFilter(null);
      setSearch("");
      setPage(0);
      setSelected(new Set());
      setStuckFile(null);
      setStatusFile(null);
      setImportOpen(false);
      setNotice(`${result.records.length.toLocaleString("pt-BR")} mercadorias carregadas. O painel agora mostra somente o novo arquivo STUCK.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível importar os arquivos.");
    } finally {
      setBusy(false);
    }
  }

  function selectFilter(value: Filter) {
    setFilter(value);
    setStatusFilter(null);
    setPage(0);
  }

  function toggleFilteredSelection() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const record of filtered) {
        if (allFilteredSelected) next.delete(record.tracking);
        else next.add(record.tracking);
      }
      return next;
    });
  }

  function handleExport() {
    if (!snapshot) return;
    setError("");
    try {
      const csv = exportSelectedCsv(snapshot, selected);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "stuck-mercadorias-selecionadas.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível exportar as mercadorias.");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-icon" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="15" fill="#c94b2c" />
            <path d="M15 22 32 13l17 9v20L32 51 15 42V22Zm0 0 17 9 17-9M32 31v20M23 17.8l17 9" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
          </svg>
          <h1>STUCK</h1>
        </div>
        {snapshot && (
            <button type="button" className="secondary-button" aria-expanded={importOpen} disabled={busy}
              aria-controls="import-reports"
              onClick={() => {
                if (importOpen) {
                  setStuckFile(null);
                  setStatusFile(null);
                  setError("");
                  setNotice("");
                }
                setImportOpen(!importOpen);
              }}>
              {importOpen ? "Fechar importação" : "Atualizar relatórios"}
            </button>
        )}
      </header>
      <section className="content">
        <div className="privacy-note">
          Os dados do relatório STUCK e das linhas correspondentes do arquivo de status, inclusive eventuais dados pessoais, ficam neste navegador para permitir a exportação. Proteja também os arquivos CSV baixados.
        </div>

        {!loading && (!snapshot || importOpen) && <section id="import-reports" className="panel import-panel">
          <div>
            <h2>Importar relatórios</h2>
            <p className="muted">Selecione o relatório STUCK e o CSV com os status atualizados. Uma nova importação substitui a lista anterior.</p>
          </div>
          <form onSubmit={handleImport} className="import-form">
            <div className="file-row">
              <label className="file-field">
                <span>1. Relatório STUCK da Shopee</span>
                <input type="file" accept=".csv,text/csv" onChange={(event) => setStuckFile(event.target.files?.[0] ?? null)} disabled={busy} />
              </label>
              <button type="button" className="secondary-button" onClick={handleCopyTn} disabled={busy || !stuckFile}>Copiar TN (BR)</button>
            </div>
            <label className="file-field">
              <span>2. Status atualizado dos pedidos</span>
              <input type="file" accept=".csv,text/csv" onChange={(event) => setStatusFile(event.target.files?.[0] ?? null)} disabled={busy} />
            </label>
            <button type="submit" className="primary-button" disabled={busy || loading || !stuckFile || !statusFile}>
              {busy ? "Processando..." : "Analisar arquivos"}
            </button>
          </form>
        </section>}

        {error && <p className="error message" role="alert">{error}</p>}
        {notice && <p className="success message" role="status">{notice}</p>}
        {loading ? <p className="empty-state" role="status">Carregando dados salvos...</p> : snapshot ? (
          <>
            <div className="section-title">
              <div><h2>Visão geral</h2><p className="muted">Última importação neste navegador: {formatTime(snapshot.importedAt)}</p></div>
            </div>
            <div className="metric-grid">
              <Metric label="No relatório STUCK" value={counts.total} />
              <Metric label="Não entregues" value={counts.open} />
              <Metric label="Entregues" value={counts.delivered} />
              <Metric label="Acima de 15 dias (não entregues)" value={counts.overdue} />
              <Metric label="Valor total no relatório STUCK" value={formatCurrency(amounts.totalCents)} />
              <Metric label="Débito por status LOST" value={formatCurrency(amounts.lostCents)} />
            </div>
            <div className="summary-notes">
              <p><strong>{counts.limit}</strong> mercadoria(s) não entregues com exatamente 15 dias. <strong>{counts.unmatched}</strong> sem status atualizado correspondente.</p>
              {snapshot.unmatchedUpdates > 0 && <p>{snapshot.unmatchedUpdates} pedido(s) do arquivo de status não constam no relatório STUCK e foram ignorados.</p>}
              <p>Todos os valores exibidos vêm dos arquivos importados. Os dias são os do arquivo STUCK e não aumentam automaticamente. A comparação com 15 dias é apenas a regra informada por você.</p>
            </div>

            <section className="panel">
              <div className="records-heading">
                <div><h2>Status atualizados</h2><p className="muted">Distribuição dos pedidos do relatório STUCK, incluindo os entregues. Selecione um status para filtrar.</p></div>
                {statusFilter !== null && <button className="text-button" onClick={() => { setStatusFilter(null); setPage(0); }}>Limpar status</button>}
              </div>
              <div className="status-grid">
                {statuses.map(([status, count]) => (
                  <button key={status} className={`status-card ${statusFilter === status ? "active" : ""}`}
                    type="button" aria-pressed={statusFilter === status}
                    onClick={() => { setFilter("all"); setStatusFilter(statusFilter === status ? null : status); setPage(0); }}>
                    <span>{statusLabel(status || null)}</span><strong>{count.toLocaleString("pt-BR")}</strong>
                    <span className="status-value">Valor: {formatCurrency(amounts.byStatus.get(status) ?? 0)}</span>
                    <span className="status-track"><span style={{ width: `${count * 100 / counts.total}%` }} /></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel records-panel">
              <div className="records-heading">
                <div><h2>Mercadorias</h2><p className="muted">{filtered.length.toLocaleString("pt-BR")} registro(s) encontrados{statusFilter !== null ? ` — ${statusLabel(statusFilter || null)}` : ""}. Ordenados por dias parados.</p></div>
                <label className="search-field"><span className="sr-only">Buscar pedido, cidade, entregador ou status</span>
                  <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} type="search" placeholder="Buscar nas mercadorias" />
                </label>
              </div>
              <div className="filter-bar" aria-label="Filtros de mercadorias">
                {([
                  ["open", `Não entregues (${counts.open})`],
                  ["overdue", `Acima de 15 dias (${counts.overdue})`],
                  ["unmatched", `Sem status atualizado (${counts.unmatched})`],
                  ["delivered", `Entregues (${counts.delivered})`],
                  ["all", `Todos (${counts.total})`],
                ] as [Filter, string][]).map(([key, label]) => (
                  <button key={key} type="button" className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => selectFilter(key)}>{label}</button>
                ))}
              </div>
              <div className="selection-bar">
                <button type="button" className="secondary-button" disabled={!filtered.length || !snapshot.exportFields}
                  onClick={toggleFilteredSelection}>
                  {allFilteredSelected ? "Desmarcar resultados filtrados" : "Selecionar resultados filtrados"}
                </button>
                <span aria-live="polite">{selected.size.toLocaleString("pt-BR")} selecionada(s), incluindo outras páginas e filtros.</span>
                <button type="button" className="text-button" disabled={!selected.size} onClick={() => setSelected(new Set())}>Limpar seleção</button>
                <button type="button" className="primary-button" disabled={!selected.size || !snapshot.exportFields} onClick={handleExport}>Exportar selecionadas (CSV)</button>
              </div>
              {!snapshot.exportFields && <p className="export-note">Para exportar todas as colunas, clique em Atualizar relatórios e importe novamente os dois arquivos.</p>}
              {snapshot.exportFields && <p className="export-note">O CSV inclui todas as colunas dos dois relatórios. Valores que possam ser interpretados como fórmulas recebem um apóstrofo por segurança.</p>}
              {visible.length === 0 ? <p className="empty-state">Nenhuma mercadoria encontrada neste filtro.</p> : (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Selecionar</th><th>Rastreamento</th><th>Dias parados</th><th>Comparação com 15 dias</th><th>Status atualizado</th><th>Entregador (status)</th><th>Entregador (STUCK)</th><th>Cidade</th><th>Estação atual</th><th>Avaria</th><th>Valor</th></tr></thead>
                      <tbody>{visible.map((row) => (
                        <tr key={row.tracking}>
                          <td><input type="checkbox" aria-label={`Selecionar ${row.tracking}`} checked={selected.has(row.tracking)} disabled={!snapshot.exportFields}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelected((previous) => {
                                const next = new Set(previous);
                                if (checked) next.add(row.tracking);
                                else next.delete(row.tracking);
                                return next;
                              });
                            }} /></td>
                          <td className="order-id">{row.tracking}</td>
                          <td><strong>{row.days}</strong></td>
                          <td><span className={`risk-pill ${row.days > 15 && !delivered(row) ? "danger" : row.days === 15 && !delivered(row) ? "warning" : ""}`}>{delivered(row) ? "Delivered" : risk(row)}</span></td>
                          <td><span className="status-pill" title={row.updatedStatus ?? ""}>{statusLabel(row.updatedStatus)}</span></td>
                          <td>{row.updatedDriver || "—"}</td>
                          <td>{row.driver || "—"}</td>
                          <td>{row.city || "—"}</td>
                          <td>{row.station || "—"}</td>
                          <td>{row.damage || "—"}</td>
                          <td>{row.value || "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className="pagination">
                    <span>Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length.toLocaleString("pt-BR")}</span>
                    <div><button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Anterior</button>
                      <button disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
                  </div>
                </>
              )}
            </section>
          </>
        ) : !error && <p className="empty-state">Importe os dois relatórios para visualizar as mercadorias em STUCK.</p>}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <article className="metric-card"><p>{label}</p><strong>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</strong></article>;
}
