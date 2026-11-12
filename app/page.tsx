"use client";

import { useEffect, useMemo, useState } from "react";
import { mergeStuckSnapshots, processStuckFiles, risk, type StuckRecord, type StuckSnapshot, extractTrackingNumbers, valueTotals, exportSelectedCsv, exportFilename } from "@/lib/stuck";
import { readSnapshot, readTrackingColors, readTreatments, removeSnapshotRecord, saveSnapshot, setTrackingColor, setTrackingTreatment } from "@/lib/stuck-storage";
import { isTreatment, TREATMENT_OPTIONS, type Treatment } from "@/lib/treatment";
import { chartCounts } from "@/lib/visualization";

type Filter = "new" | "unclassified" | "classified" | "overdue" | "unmatched" | "all";
const PAGE_SIZE = 50;
const currencyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const CHART_COLORS = ["#6c63ff", "#ff6b6b", "#f7b731", "#20bf6b", "#45aaf2", "#a55eea", "#fd79a8", "#26de81", "#2bcbba", "#fa8231"];
const MARK_COLORS = [
  ["#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc", "#e6b8af"],
  ["#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd", "#dd7e6b"],
  ["#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0", "#cc4125"],
  ["#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79", "#a61c00"],
  ["#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47", "#85200c"],
];

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

function readableTextColor(hex: string) {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16));
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#202a35" : "#ffffff";
}

function filterRecord(record: StuckRecord, filter: Filter, treatments: ReadonlyMap<string, Treatment>) {
  if (filter === "new") return Boolean(record.isNew) && !treatments.has(record.tracking);
  if (filter === "unclassified") return !treatments.has(record.tracking);
  if (filter === "classified") return treatments.has(record.tracking);
  if (filter === "overdue") return record.days > 15;
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
  const [filter, setFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [treatments, setTreatments] = useState<Map<string, Treatment>>(() => new Map());
  const [trackingColors, setTrackingColors] = useState<Map<string, string>>(() => new Map());
  const [treatmentReady, setTreatmentReady] = useState(false);
  const [savingTreatment, setSavingTreatment] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeError, setThemeError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("stuck-theme");
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {
      setThemeError("Não foi possível carregar a preferência de tema neste navegador.");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("stuck-theme", next);
      setThemeError("");
    } catch {
      setThemeError("Não foi possível salvar a preferência de tema neste navegador.");
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([readSnapshot(), readTreatments(), readTrackingColors()])
      .then(([result, savedTreatments, savedColors]) => {
        if (active) {
          setSnapshot(result);
          setTreatments(savedTreatments);
          setTrackingColors(savedColors);
          setTreatmentReady(true);
        }
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Falha ao ler o banco local."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => {
    const records = snapshot?.records ?? [];
    return {
      total: records.length,
      new: records.filter((row) => row.isNew && !treatments.has(row.tracking)).length,
      absentFromLatest: records.filter((row) => row.lastSeenAt && row.lastSeenAt !== snapshot?.importedAt).length,
      unclassified: records.filter((row) => !treatments.has(row.tracking)).length,
      classified: records.filter((row) => treatments.has(row.tracking)).length,
      overdue: records.filter((row) => row.days > 15).length,
      limit: records.filter((row) => row.days === 15).length,
      unmatched: records.filter((row) => !row.updatedStatus).length,
    };
  }, [snapshot, treatments]);
  const amounts = useMemo(() => valueTotals(snapshot?.records ?? []), [snapshot]);
  const charts = useMemo(() => chartCounts(snapshot?.records ?? [], treatments), [snapshot, treatments]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return (snapshot?.records ?? [])
      .filter((record) => filterRecord(record, filter, treatments) &&
      (statusFilter === null || (record.updatedStatus ?? "") === statusFilter) && (!query || [
        record.tracking, record.city, record.operation, record.updatedDriver,
        record.updatedStatus ?? "", record.station,
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query))))
      .sort((a, b) => b.days - a.days || a.tracking.localeCompare(b.tracking));
  }, [snapshot, filter, search, statusFilter, treatments]);
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
    if (!stuckFile && !snapshot?.files?.stuck) return;
    setError("");
    setNotice("");
    try {
      const contents = stuckFile ? await stuckFile.text() : snapshot?.files?.stuck.contents;
      if (contents === undefined) throw new Error("Selecione o relatório STUCK.");
      const codes = extractTrackingNumbers(contents);
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
    if ((!stuckFile && !snapshot?.files?.stuck) || (!statusFile && !snapshot?.files?.updated)) {
      setError("Selecione os dois arquivos CSV.");
      return;
    }
    if ([stuckFile, statusFile].some((file) => file && (!file.name.toLowerCase().endsWith(".csv") || file.size > 10 * 1024 * 1024))) {
      setError("Selecione dois arquivos CSV de até 10 MB cada.");
      return;
    }
    setBusy(true);
    try {
      const stuck = stuckFile ? { name: stuckFile.name, contents: await stuckFile.text() } : snapshot?.files?.stuck;
      const updated = statusFile ? { name: statusFile.name, contents: await statusFile.text() } : snapshot?.files?.updated;
      if (!stuck || !updated) throw new Error("Selecione os dois arquivos CSV.");
      const imported = { ...processStuckFiles(stuck.contents, updated.contents), files: { stuck, updated } };
      const previous = await readSnapshot();
      const previousTrackings = new Set(previous?.records.map((record) => record.tracking) ?? []);
      const result = mergeStuckSnapshots(previous, imported);
      await saveSnapshot(result);
      setSnapshot(result);
      setFilter("all");
      setStatusFilter(null);
      setSearch("");
      setPage(0);
      setSelected(new Set());
      setStuckFile(null);
      setStatusFile(null);
      setImportOpen(false);
      const newCount = imported.records.filter((record) => !previousTrackings.has(record.tracking)).length;
      const retainedCount = result.records.filter((record) => record.lastSeenAt !== result.importedAt).length;
      setNotice(`Importação concluída: ${newCount.toLocaleString("pt-BR")} nova(s), ${retainedCount.toLocaleString("pt-BR")} mercadoria(s) fora do arquivo de hoje mantida(s) e ${result.records.length.toLocaleString("pt-BR")} no histórico.`);
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
    setSelected(new Set());
  }

  function selectStatus(status: string) {
    setFilter("all");
    setStatusFilter(statusFilter === status ? null : status);
    setPage(0);
    setSelected(new Set());
  }

  async function handleRemoveRecord(record: StuckRecord) {
    if (!snapshot || !window.confirm(`Remover ${record.tracking} do histórico salvo? Esta ação também apaga a classificação de tratamento.`)) return;
    setError("");
    setNotice("");
    try {
      await removeSnapshotRecord(snapshot, record.tracking);
      setSnapshot({ ...snapshot, records: snapshot.records.filter((item) => item.tracking !== record.tracking) });
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(record.tracking);
        return next;
      });
      setTreatments((previous) => {
        const next = new Map(previous);
        next.delete(record.tracking);
        return next;
      });
      setTrackingColors((previous) => {
        const next = new Map(previous);
        next.delete(record.tracking);
        return next;
      });
      setNotice(`${record.tracking} foi removido do histórico salvo.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível remover a mercadoria.");
    }
  }

  async function handleTreatment(record: StuckRecord, value: string) {
    setError("");
    if (value !== "" && !isTreatment(value)) {
      setError("Classificação de tratamento inválida.");
      return;
    }
    const treatment = value === "" ? null : value;
    setSavingTreatment(true);
    try {
      await setTrackingTreatment(record.tracking, treatment);
      setTreatments((previous) => {
        const next = new Map(previous);
        if (treatment !== null) next.set(record.tracking, treatment);
        else next.delete(record.tracking);
        return next;
      });
      if (((filter === "new" && treatment !== null) || (filter === "unclassified" && treatment !== null) || (filter === "classified" && treatment === null)) && visible.length === 1 && page > 0) {
        setPage((previous) => previous - 1);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o tratamento.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function handleTrackingColor(tracking: string, color: string | null) {
    setError("");
    try {
      await setTrackingColor(tracking, color);
      setTrackingColors((previous) => {
        const next = new Map(previous);
        if (color) next.set(tracking, color);
        else next.delete(tracking);
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar a cor da mercadoria.");
    }
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
      link.download = exportFilename(new Date());
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível exportar as mercadorias.");
    }
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="brand">
          <svg className="brand-icon" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="15" fill="#c94b2c" />
            <path d="M15 22 32 13l17 9v20L32 51 15 42V22Zm0 0 17 9 17-9M32 31v20M23 17.8l17 9" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
          </svg>
          <h1>STUCK</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="secondary-button theme-toggle" onClick={toggleTheme} aria-label={`Mudar para tema ${theme === "light" ? "escuro" : "claro"}`}>
            {theme === "light" ? "Tema escuro" : "Tema claro"}
          </button>
        {snapshot && (
            <button type="button" className="secondary-button" aria-expanded={importOpen} disabled={busy || savingTreatment}
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
        </div>
      </header>
      <section className="content">
        <div className="privacy-note">
          Os relatórios e as marcações de tratamento ficam somente neste navegador. Não são compartilhados e podem ser apagados ao limpar os dados do site. Proteja os arquivos CSV baixados, que podem conter dados pessoais.
        </div>
        {themeError && <p className="error message" role="alert">{themeError}</p>}

        {!loading && (!snapshot || importOpen) && <section id="import-reports" className="panel import-panel">
          <div>
            <h2>Importar relatórios</h2>
            <p className="muted">Selecione o relatório STUCK e o CSV com os status atualizados. Os arquivos salvos podem ser reutilizados; selecione apenas os que deseja substituir.</p>
          </div>
          <form onSubmit={handleImport} className="import-form">
            <div className="file-row">
              <label className="file-field">
                <span>1. Relatório STUCK da Shopee</span>
                {snapshot?.files?.stuck && <span className="saved-file">Salvo: {snapshot.files.stuck.name}</span>}
                <input type="file" accept=".csv,text/csv" onChange={(event) => setStuckFile(event.target.files?.[0] ?? null)} disabled={busy} />
              </label>
              <button type="button" className="secondary-button" onClick={handleCopyTn} disabled={busy || (!stuckFile && !snapshot?.files?.stuck)}>Copiar TN (BR)</button>
            </div>
            <label className="file-field">
              <span>2. Status atualizado dos pedidos</span>
              {snapshot?.files?.updated && <span className="saved-file">Salvo: {snapshot.files.updated.name}</span>}
              <input type="file" accept=".csv,text/csv" onChange={(event) => setStatusFile(event.target.files?.[0] ?? null)} disabled={busy} />
            </label>
            <button type="submit" className="primary-button" disabled={busy || loading || savingTreatment || !treatmentReady || (!stuckFile && !snapshot?.files?.stuck) || (!statusFile && !snapshot?.files?.updated) || (!stuckFile && !statusFile)}>
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
              <Metric label="No histórico salvo" value={counts.total} />
              <Metric label="Novas sem classificação" value={counts.new} />
              <Metric label="Sem classificação" value={counts.unclassified} />
              <Metric label="Classificadas" value={counts.classified} />
              <Metric label="Acima de 15 dias" value={counts.overdue} />
              <Metric label="Valor total no histórico" value={formatCurrency(amounts.totalCents)} />
              <Metric label="Débito por status LOST" value={formatCurrency(amounts.lostCents)} />
            </div>
            <div className="summary-notes">
              <p><strong>{counts.limit}</strong> mercadoria(s) com exatamente 15 dias segundo o último STUCK em que apareceram. <strong>{counts.unmatched}</strong> sem status atualizado conhecido.</p>
              <p><strong>{counts.absentFromLatest}</strong> mercadoria(s) mantida(s) no histórico, mas ausente(s) do último relatório STUCK. Os dados delas são os últimos importados.</p>
              {snapshot.unmatchedUpdates > 0 && <p>{snapshot.unmatchedUpdates} pedido(s) do arquivo de status não constam no relatório STUCK e foram ignorados.</p>}
              <p>O tratamento é classificado manualmente e não depende do status da Shopee. Para registros antigos, os dias, valores e status são os últimos dados importados; não aumentam automaticamente.</p>
            </div>

            <section className="panel charts-panel">
              <div className="records-heading">
                <div><h2>Visualização dos STUCKs</h2><p className="muted">Distribuição de todo o histórico salvo, independentemente dos filtros.</p></div>
              </div>
              <div className="charts-grid">
                <div>
                  <h3>Dias parados</h3>
                  <p className="chart-description">Distribuição por comparação com 15 dias.</p>
                  <DaysPie days={charts.days} total={counts.total} />
                  <p className="chart-description">As cores indicam apenas a comparação de dias; não determinam status LOST ou débito.</p>
                </div>
                <div>
                  <h3>Classificação de tratamento</h3>
                  <p className="chart-description">Classificações manuais salvas neste navegador; não indicam conclusão.</p>
                  <TreatmentBars items={[
                    { label: "Sem classificação", count: charts.unclassified },
                    ...TREATMENT_OPTIONS.map((option) => ({ label: option, count: charts.classification.get(option) ?? 0 })),
                  ]} />
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="records-heading">
                <div><h2>Status atualizados</h2><p className="muted">Último status conhecido no histórico. Selecione um status para filtrar.</p></div>
                {statusFilter !== null && <button className="text-button" onClick={() => { setStatusFilter(null); setPage(0); setSelected(new Set()); }}>Limpar status</button>}
              </div>
              <div className="status-grid">
                {statuses.map(([status, count]) => (
                  <button key={status} className={`status-card ${statusFilter === status ? "active" : ""}`}
                    type="button" aria-pressed={statusFilter === status}
                    onClick={() => selectStatus(status)}>
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
                  <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); setSelected(new Set()); }} type="search" placeholder="Buscar nas mercadorias" />
                </label>
              </div>
              <div className="filter-bar" aria-label="Filtros de mercadorias">
                {([
                  ["new", `Novas (${counts.new})`],
                  ["unclassified", `Sem classificação (${counts.unclassified})`],
                  ["classified", `Classificadas (${counts.classified})`],
                  ["overdue", `Acima de 15 dias (${counts.overdue})`],
                  ["unmatched", `Sem status atualizado (${counts.unmatched})`],
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
                <span aria-live="polite">{selected.size.toLocaleString("pt-BR")} selecionada(s) no filtro atual, incluindo outras páginas.</span>
                <button type="button" className="text-button" disabled={!selected.size} onClick={() => setSelected(new Set())}>Limpar seleção</button>
                <button type="button" className="primary-button" disabled={!selected.size || !snapshot.exportFields} onClick={handleExport}>Exportar selecionadas (CSV)</button>
              </div>
              {!snapshot.exportFields && <p className="export-note">Para exportar, clique em Atualizar relatórios e importe novamente os dois arquivos.</p>}
              {snapshot.exportFields && <p className="export-note">O CSV inclui apenas as colunas do arquivo de status atualizado. Mercadorias sem correspondência impedem a exportação. Valores que possam ser interpretados como fórmulas recebem um apóstrofo por segurança.</p>}
              {visible.length === 0 ? <p className="empty-state">Nenhuma mercadoria encontrada neste filtro.</p> : (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th><span className="sr-only">Selecionar para exportação</span></th><th>Rastreamento</th><th>Marcação</th><th>Tratamento</th><th>Dias parados</th><th>Comparação com 15 dias</th><th>Status atualizado</th><th>Última aparição</th><th>Entregador</th><th>Cidade</th><th>Estação atual</th><th>Avaria</th><th>Valor</th><th>Ação</th></tr></thead>
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
                          <td className="order-id" style={trackingColors.has(row.tracking) ? { backgroundColor: trackingColors.get(row.tracking), color: readableTextColor(trackingColors.get(row.tracking)!) } : undefined}>
                            {row.tracking}{row.isNew && !treatments.has(row.tracking) && <span className="new-badge">NOVA</span>}
                          </td>
                          <td>
                            <details className="color-picker">
                              <summary aria-label={`Escolher cor para ${row.tracking}`} title={trackingColors.get(row.tracking) ?? "Escolher cor"}>
                                <span className={`color-picker-current ${trackingColors.has(row.tracking) ? "has-color" : ""}`}
                                  style={{ backgroundColor: trackingColors.get(row.tracking) ?? "transparent" }} />
                              </summary>
                              <div className="color-palette" role="group" aria-label={`Paleta de cores para ${row.tracking}`}>
                                <button type="button" className="color-swatch no-color" aria-label={`Remover cor de ${row.tracking}`} title="Sem cor" onClick={() => handleTrackingColor(row.tracking, null)} />
                                {MARK_COLORS.flat().map((color) => (
                                  <button key={color} type="button" className={`color-swatch ${trackingColors.get(row.tracking) === color ? "selected" : ""}`}
                                    style={{ backgroundColor: color }} aria-label={`Marcar ${row.tracking} com ${color}`} aria-pressed={trackingColors.get(row.tracking) === color}
                                    title={color} onClick={() => handleTrackingColor(row.tracking, color)} />
                                ))}
                              </div>
                            </details>
                          </td>
                          <td><select className="treatment-control" aria-label={`Tratamento ${row.tracking}`}
                            value={treatments.get(row.tracking) ?? ""} disabled={savingTreatment || busy}
                            onChange={(event) => handleTreatment(row, event.target.value)}>
                            <option value="">Sem classificação</option>
                            {TREATMENT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select></td>
                          <td><strong>{row.days}</strong></td>
                          <td><span className={`risk-pill ${row.days > 15 ? "danger" : row.days === 15 ? "warning" : "below"}`}>{risk(row)}</span></td>
                          <td><span className="status-pill" title={row.updatedStatus ?? ""}>{statusLabel(row.updatedStatus)}</span>{row.lastUpdatedAt && <small className="cell-note">Lido em {formatTime(row.lastUpdatedAt)}</small>}</td>
                          <td>{row.lastSeenAt ? formatTime(row.lastSeenAt) : "Data desconhecida"}</td>
                          <td>{row.updatedDriver || "—"}</td>
                          <td>{row.city || "—"}</td>
                          <td>{row.station || "—"}</td>
                          <td>{row.damage || "—"}</td>
                          <td>{row.value || "—"}</td>
                          <td><button type="button" className="text-button remove-button" disabled={busy || savingTreatment} onClick={() => handleRemoveRecord(row)}>Remover</button></td>
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

function DaysPie({ days, total }: { days: { below: number; atLimit: number; above: number }; total: number }) {
  const slices = [
    { label: "Abaixo de 15 dias", count: days.below, color: "#20bf6b" },
    { label: "Exatamente 15 dias", count: days.atLimit, color: "#f7b731" },
    { label: "Acima de 15 dias", count: days.above, color: "#ff6b6b" },
  ];
  const below = total ? days.below * 100 / total : 0;
  const atLimit = total ? (days.below + days.atLimit) * 100 / total : 0;
  return (
    <div className="pie-layout">
      <div className="pie-chart" aria-hidden="true" style={{ background: total ? `conic-gradient(#20bf6b 0% ${below}%, #f7b731 ${below}% ${atLimit}%, #ff6b6b ${atLimit}% 100%)` : "#dce3eb" }} />
      <ul className="pie-legend">{slices.map(({ label, count, color }) => (
        <li key={label}><span className="pie-swatch" style={{ background: color }} aria-hidden="true" /><span>{label}<br /><strong>{count.toLocaleString("pt-BR")} ({(total ? count * 100 / total : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</strong></span></li>
      ))}</ul>
    </div>
  );
}

function TreatmentBars({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(0, ...items.map((item) => item.count));
  return (
    <div className="vertical-chart-scroll">
      <div className="vertical-chart" aria-label="Quantidade por classificação de tratamento">
        {items.map(({ label, count }, index) => (
          <div className="vertical-item" key={label}>
            <div className="vertical-plot"><strong>{count.toLocaleString("pt-BR")}</strong><div className="vertical-bar" style={{ height: `${max ? count * 145 / max : 0}px`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /></div>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
