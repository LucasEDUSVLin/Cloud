"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { processStuckFiles, risk, type StuckRecord, type StuckSnapshot, extractTrackingNumbers, valueTotals, exportSelectedCsv, exportFilename, formatCurrency } from "@/lib/stuck";
import { readSnapshot, readTrackingColors, readTreatments, saveSnapshot, setTrackingColor, setTrackingTreatment } from "@/lib/stuck-storage";
import { isTreatment, TREATMENT_OPTIONS, type Treatment } from "@/lib/treatment";
import { chartCounts, matchesChartFilter, type ChartFilter, type DayCounts } from "@/lib/visualization";

type Filter = "unclassified" | "classified" | "overdue" | "unmatched" | "all";
const PAGE_SIZE = 50;
const CHART_COLORS = ["#6c63ff", "#ff6b6b", "#f7b731", "#20bf6b", "#45aaf2", "#a55eea", "#fd79a8", "#26de81", "#2bcbba", "#fa8231"];
const DAY_LABELS: Record<keyof DayCounts, string> = {
  below: "Abaixo de 15 dias",
  atLimit: "Exatamente 15 dias",
  above: "Acima de 15 dias",
};
const MARK_COLORS = [
  ["#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc", "#e6b8af"],
  ["#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd", "#dd7e6b"],
  ["#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0", "#cc4125"],
  ["#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79", "#a61c00"],
  ["#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47", "#85200c"],
];

function statusLabel(status: string | null) {
  return status || "Sem status atualizado";
}

function formatTime(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "Data indisponível" : parsed.toLocaleString("pt-BR");
}

async function readCsv(file: File) {
  try {
    return await file.text();
  } catch (caught) {
    throw new Error(`Não foi possível ler ${file.name}. Selecione o arquivo novamente.`, { cause: caught });
  }
}

function readableTextColor(hex: string) {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16));
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#202a35" : "#ffffff";
}

function filterRecord(record: StuckRecord, filter: Filter, treatments: ReadonlyMap<string, Treatment>) {
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
  const [chartFilter, setChartFilter] = useState<ChartFilter | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [treatments, setTreatments] = useState<Map<string, Treatment>>(() => new Map());
  const [trackingColors, setTrackingColors] = useState<Map<string, string>>(() => new Map());
  const [treatmentReady, setTreatmentReady] = useState(false);
  const [savingTreatment, setSavingTreatment] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeError, setThemeError] = useState("");
  const recordsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("stuck-theme");
      // Read the browser-only preference after hydration to avoid a server/client mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {
      setThemeError("Não foi possível carregar o tema salvo.");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("stuck-theme", next);
      setThemeError("");
    } catch {
      setThemeError("Não foi possível salvar o tema. Tente novamente.");
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
      unclassified: records.filter((row) => !treatments.has(row.tracking)).length,
      classified: records.filter((row) => treatments.has(row.tracking)).length,
      overdue: records.filter((row) => row.days > 15).length,
      limit: records.filter((row) => row.days === 15).length,
      unmatched: records.filter((row) => !row.updatedStatus).length,
    };
  }, [snapshot, treatments]);
  const amounts = useMemo(() => {
    try {
      return { values: valueTotals(snapshot?.records ?? []), error: "" };
    } catch (caught) {
      return { values: null, error: caught instanceof Error ? caught.message : "Não foi possível calcular os valores." };
    }
  }, [snapshot]);
  const charts = useMemo(() => chartCounts(snapshot?.records ?? [], treatments), [snapshot, treatments]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return (snapshot?.records ?? [])
      .filter((record) => filterRecord(record, filter, treatments) &&
      (chartFilter === null || matchesChartFilter(record, treatments.get(record.tracking), chartFilter)) &&
      (statusFilter === null || (record.updatedStatus ?? "") === statusFilter) && (!query || [
        record.tracking, record.city, record.operation, record.updatedDriver,
        record.updatedStatus ?? "", record.station,
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query))))
      .sort((a, b) => b.days - a.days || a.tracking.localeCompare(b.tracking));
  }, [snapshot, filter, search, statusFilter, chartFilter, treatments]);
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
      const contents = stuckFile ? await readCsv(stuckFile) : snapshot?.files?.stuck.contents;
      if (contents === undefined) throw new Error("Selecione o relatório STUCK.");
      const codes = extractTrackingNumbers(contents);
      try {
        await navigator.clipboard.writeText(codes.join("\n"));
      } catch (caught) {
        throw new Error("Não foi possível copiar os BRs. Verifique a permissão de cópia do navegador.", { cause: caught });
      }
      setNotice(`${codes.length.toLocaleString("pt-BR")} BR${codes.length === 1 ? "" : "s"} copiado${codes.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível copiar os BRs.");
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
    const invalidExtension = [stuckFile, statusFile].find((file) => file && !file.name.toLowerCase().endsWith(".csv"));
    if (invalidExtension) {
      setError(`${invalidExtension.name}: selecione um arquivo CSV.`);
      return;
    }
    const tooLarge = [stuckFile, statusFile].find((file) => file && file.size > 10 * 1024 * 1024);
    if (tooLarge) {
      setError(`${tooLarge.name}: o limite é 10 MB por arquivo.`);
      return;
    }
    setBusy(true);
    try {
      const stuck = stuckFile ? { name: stuckFile.name, contents: await readCsv(stuckFile) } : snapshot?.files?.stuck;
      const updated = statusFile ? { name: statusFile.name, contents: await readCsv(statusFile) } : snapshot?.files?.updated;
      if (!stuck || !updated) throw new Error("Selecione os dois arquivos CSV.");
      const imported = { ...processStuckFiles(stuck.contents, updated.contents), files: { stuck, updated } };
      await saveSnapshot(imported);
      setSnapshot(imported);
      setFilter("all");
      setStatusFilter(null);
      setChartFilter(null);
      setSearch("");
      setPage(0);
      setSelected(new Set());
      setStuckFile(null);
      setStatusFile(null);
      setImportOpen(false);
      setNotice(`Análise concluída: ${imported.records.length.toLocaleString("pt-BR")} mercadoria${imported.records.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível importar os arquivos.");
    } finally {
      setBusy(false);
    }
  }

  function selectFilter(value: Filter) {
    setFilter(value);
    setStatusFilter(null);
    setChartFilter(null);
    setPage(0);
    setSelected(new Set());
  }

  function selectStatus(status: string) {
    setFilter("all");
    setStatusFilter(statusFilter === status ? null : status);
    setChartFilter(null);
    setPage(0);
    setSelected(new Set());
  }

  function selectChartFilter(value: ChartFilter) {
    setFilter("all");
    setStatusFilter(null);
    setChartFilter(value);
    setSearch("");
    setPage(0);
    setSelected(new Set());
    recordsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleTreatment(record: StuckRecord, value: string) {
    setError("");
    setNotice("");
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
      const leavesFilter = (filter === "unclassified" && treatment !== null)
        || (filter === "classified" && treatment === null)
        || (chartFilter !== null && !matchesChartFilter(record, treatment ?? undefined, chartFilter));
      if (leavesFilter) {
        setSelected((previous) => {
          const next = new Set(previous);
          next.delete(record.tracking);
          return next;
        });
        if (visible.length === 1 && page > 0) setPage((previous) => previous - 1);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o tratamento.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function handleTrackingColor(tracking: string, color: string | null) {
    setError("");
    setNotice("");
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
    setNotice("");
    let csv: string;
    try {
      csv = exportSelectedCsv(snapshot, selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível exportar as mercadorias.");
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFilename(new Date());
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Não foi possível baixar o CSV. Tente novamente.");
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
                setError("");
                setNotice("");
                if (importOpen) {
                  setStuckFile(null);
                  setStatusFile(null);
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
          Arquivos e marcações ficam neste navegador e podem ser apagados ao limpar os dados do site. Proteja os CSVs baixados: podem conter dados pessoais.
        </div>
        {themeError && <p className="error message" role="alert">{themeError}</p>}
        {error && <div className="feedback feedback-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Fechar mensagem de erro">×</button></div>}
        {amounts.error && <p className="error message" role="alert">{amounts.error} Importe relatórios com valores válidos.</p>}
        {notice && <div className="feedback feedback-success" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fechar mensagem">×</button></div>}

        {!loading && (!snapshot || importOpen) && <section id="import-reports" className="panel import-panel">
          <div>
            <h2>Importar relatórios</h2>
            <p className="muted">Selecione o relatório principal, copie os BRs e, após consultar os status, selecione o arquivo atualizado.</p>
          </div>
          <form onSubmit={handleImport} className="import-form">
            <div className="file-row">
              <label className="file-field">
                <span>1. Relatório principal (STUCK)</span>
                {snapshot?.files?.stuck && <span className="saved-file">Salvo: {snapshot.files.stuck.name}</span>}
                <input type="file" accept=".csv,text/csv" onChange={(event) => { setStuckFile(event.target.files?.[0] ?? null); setError(""); setNotice(""); }} disabled={busy} />
              </label>
              <button type="button" className="secondary-button" onClick={handleCopyTn} disabled={busy || (!stuckFile && !snapshot?.files?.stuck)}>Copiar BRs</button>
            </div>
            <label className="file-field">
              <span>2. Arquivo de status atualizado</span>
              {snapshot?.files?.updated && <span className="saved-file">Salvo: {snapshot.files.updated.name}</span>}
              <input type="file" accept=".csv,text/csv" onChange={(event) => { setStatusFile(event.target.files?.[0] ?? null); setError(""); setNotice(""); }} disabled={busy} />
            </label>
            <button type="submit" className="primary-button" disabled={busy || loading || savingTreatment || !treatmentReady || (!stuckFile && !snapshot?.files?.stuck) || (!statusFile && !snapshot?.files?.updated) || (!stuckFile && !statusFile)}>
              {busy ? "Processando..." : "Analisar arquivos"}
            </button>
          </form>
        </section>}

        {loading ? <p className="empty-state" role="status">Carregando dados salvos...</p> : snapshot ? (
          <>
            <div className="section-title">
              <div><h2>Visão geral</h2><p className="muted">Última análise: {formatTime(snapshot.importedAt)}</p></div>
            </div>
            <div className="metric-grid">
              <Metric label="Mercadorias" value={counts.total} />
              <Metric label="Sem classificação" value={counts.unclassified} />
              <Metric label="Classificadas" value={counts.classified} />
              <Metric label="Valor total" value={amounts.values ? formatCurrency(amounts.values.totalCents) : "Indisponível"} />
            </div>
            <div className="summary-notes">
              <p><strong>{counts.limit.toLocaleString("pt-BR")}</strong> com exatamente 15 dias · <strong>{counts.unmatched.toLocaleString("pt-BR")}</strong> sem status atualizado</p>
              {snapshot.unmatchedUpdates > 0 && <p>{snapshot.unmatchedUpdates.toLocaleString("pt-BR")} {snapshot.unmatchedUpdates === 1 ? "pedido extra ignorado" : "pedidos extras ignorados"} no arquivo de status.</p>}
              <p>Classificação manual · Novas análises substituem a lista</p>
            </div>

            <section className="panel charts-panel">
              <div className="records-heading">
                <div><h2>Visualização dos STUCKs</h2><p className="muted">Selecione uma informação para ver as mercadorias.</p></div>
              </div>
              <div className="charts-grid">
                <div>
                  <h3>Dias parados</h3>
                  <p className="chart-description">Distribuição por comparação com 15 dias.</p>
                  <DaysLine days={charts.days} total={counts.total} selected={chartFilter} onSelect={selectChartFilter} />
                  <p className="chart-description">Os dias não determinam status LOST ou débito.</p>
                </div>
                <div>
                  <h3>Classificação</h3>
                  <p className="chart-description">Classificações manuais salvas neste navegador; não indicam conclusão.</p>
                  <TreatmentBars items={[
                    { value: null, label: "Sem classificação", count: charts.unclassified },
                    ...TREATMENT_OPTIONS.map((option) => ({ value: option, label: option, count: charts.classification.get(option) ?? 0 })),
                  ]} selected={chartFilter} onSelect={selectChartFilter} />
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="records-heading">
                <div><h2>Status atualizados</h2><p className="muted">Status do arquivo atualizado. Selecione um status para filtrar.</p></div>
                {statusFilter !== null && <button className="text-button" onClick={() => { setStatusFilter(null); setPage(0); setSelected(new Set()); }}>Limpar status</button>}
              </div>
              <div className="status-grid">
                {statuses.map(([status, count]) => (
                  <button key={status} className={`status-card ${statusFilter === status ? "active" : ""}`}
                    type="button" aria-pressed={statusFilter === status}
                    onClick={() => selectStatus(status)}>
                    <span>{statusLabel(status || null)}</span><strong>{count.toLocaleString("pt-BR")}</strong>
                    <span className="status-value">Valor: {amounts.values ? formatCurrency(amounts.values.byStatus.get(status) ?? 0) : "Indisponível"}</span>
                    <span className="status-track"><span style={{ width: `${count * 100 / counts.total}%` }} /></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel records-panel" ref={recordsRef}>
              <div className="records-heading">
                <div><h2>Mercadorias</h2><p className="muted">{filtered.length.toLocaleString("pt-BR")} registro(s) encontrados{statusFilter !== null ? ` — ${statusLabel(statusFilter || null)}` : ""}. Ordenados por dias parados.</p></div>
                <label className="search-field"><span className="sr-only">Buscar pedido, cidade, entregador ou status</span>
                  <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); setSelected(new Set()); }} type="search" placeholder="Buscar nas mercadorias" />
                </label>
              </div>
              <div className="filter-bar" aria-label="Filtros de mercadorias">
                {([
                  ["unclassified", `Sem classificação (${counts.unclassified})`],
                  ["classified", `Classificadas (${counts.classified})`],
                  ["overdue", `Acima de 15 dias (${counts.overdue})`],
                  ["unmatched", `Sem status atualizado (${counts.unmatched})`],
                  ["all", `Todos (${counts.total})`],
                ] as [Filter, string][]).map(([key, label]) => (
                  <button key={key} type="button" className={filter === key && chartFilter === null ? "active" : ""} aria-pressed={filter === key && chartFilter === null} onClick={() => selectFilter(key)}>{label}</button>
                ))}
              </div>
              {chartFilter && <div className="chart-filter-note" role="status">
                <span>Filtro do gráfico: <strong>{chartFilter.kind === "days" ? DAY_LABELS[chartFilter.value] : chartFilter.value ?? "Sem classificação"}</strong></span>
                <button type="button" className="text-button" onClick={() => { setChartFilter(null); setPage(0); setSelected(new Set()); }}>Limpar filtro do gráfico</button>
              </div>}
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
              {snapshot.exportFields && <p className="export-note">O CSV usa os dados do arquivo de status. BRs sem correspondência impedem a exportação. Possíveis fórmulas recebem um apóstrofo.</p>}
              {visible.length === 0 ? <p className="empty-state">Nenhuma mercadoria encontrada neste filtro.</p> : (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th><span className="sr-only">Selecionar para exportação</span></th><th>Rastreamento</th><th>Marcação</th><th>Tratamento</th><th>Dias parados</th><th>Comparação com 15 dias</th><th>Status atualizado</th><th>Entregador</th><th>Cidade</th><th>Estação atual</th><th>Avaria</th><th>Valor</th></tr></thead>
                      <tbody>{visible.map((row) => (
                        <tr key={row.tracking} className={trackingColors.has(row.tracking) ? "marked-row" : undefined}
                          style={trackingColors.has(row.tracking) ? ({ "--row-color": trackingColors.get(row.tracking), "--row-text": readableTextColor(trackingColors.get(row.tracking)!) } as React.CSSProperties) : undefined}>
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
                          <td className="order-id">
                            {row.tracking}
                          </td>
                          <td>
                            <div className="color-picker">
                              <button type="button" className="color-picker-button" popoverTarget={`palette-${encodeURIComponent(row.tracking)}`}
                                aria-label={`Escolher cor para ${row.tracking}`} title={trackingColors.get(row.tracking) ?? "Escolher cor"}>
                                <span className={`color-picker-current ${trackingColors.has(row.tracking) ? "has-color" : ""}`}
                                  style={{ backgroundColor: trackingColors.get(row.tracking) ?? "transparent" }} />
                              </button>
                              <div id={`palette-${encodeURIComponent(row.tracking)}`} popover="auto" className="color-palette" role="group" aria-label={`Paleta de cores para ${row.tracking}`}>
                                <span className="color-palette-title">Marcação: {row.tracking}</span>
                                <button type="button" className="color-palette-close" aria-label="Fechar paleta" popoverTarget={`palette-${encodeURIComponent(row.tracking)}`} popoverTargetAction="hide">×</button>
                                <button type="button" className="color-swatch no-color" aria-label={`Remover cor de ${row.tracking}`} title="Sem cor"
                                  popoverTarget={`palette-${encodeURIComponent(row.tracking)}`} popoverTargetAction="hide" onClick={() => handleTrackingColor(row.tracking, null)} />
                                {MARK_COLORS.flat().map((color) => (
                                  <button key={color} type="button" className={`color-swatch ${trackingColors.get(row.tracking) === color ? "selected" : ""}`}
                                    style={{ backgroundColor: color }} aria-label={`Marcar ${row.tracking} com ${color}`} aria-pressed={trackingColors.get(row.tracking) === color}
                                    title={color} popoverTarget={`palette-${encodeURIComponent(row.tracking)}`} popoverTargetAction="hide"
                                    onClick={() => handleTrackingColor(row.tracking, color)} />
                                ))}
                              </div>
                            </div>
                          </td>
                          <td><select className="treatment-control" aria-label={`Tratamento ${row.tracking}`}
                            value={treatments.get(row.tracking) ?? ""} disabled={savingTreatment || busy}
                            onChange={(event) => handleTreatment(row, event.target.value)}>
                            <option value="">Sem classificação</option>
                            {TREATMENT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select></td>
                          <td><strong>{row.days}</strong></td>
                          <td><span className={`risk-pill ${row.days > 15 ? "danger" : row.days === 15 ? "warning" : "below"}`}>{risk(row)}</span></td>
                          <td><span className="status-pill" title={row.updatedStatus ?? ""}>{statusLabel(row.updatedStatus)}</span></td>
                          <td>{row.updatedDriver || "—"}</td>
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

function DaysLine({ days, total, selected, onSelect }: { days: DayCounts; total: number; selected: ChartFilter | null; onSelect: (filter: ChartFilter) => void }) {
  const items = (["below", "atLimit", "above"] as const).map((value) => ({
    value, label: DAY_LABELS[value], count: days[value],
  }));
  const max = Math.max(...items.map((item) => item.count));
  const points = items.map((item, index) => ({
    x: (index + 0.5) * 100 / items.length,
    y: 88 - (max ? item.count * 76 / max : 0),
  }));
  return (
    <div className="days-chart">
      <div className="days-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="88" x2="100" y2="88" className="days-baseline" vectorEffect="non-scaling-stroke" />
          <polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} className="days-line" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map(({ x, y }, index) => (
          <button type="button" className="days-point" key={items[index].value} style={{ left: `${x}%`, top: `${y}%` }}
            aria-label={`${items[index].label}: ${items[index].count.toLocaleString("pt-BR")} mercadoria${items[index].count === 1 ? "" : "s"}`}
            aria-pressed={selected?.kind === "days" && selected.value === items[index].value}
            onClick={() => onSelect({ kind: "days", value: items[index].value })} />
        ))}
      </div>
      <ul className="days-labels">{items.map(({ value, label, count }) => (
        <li key={value}><button type="button" aria-pressed={selected?.kind === "days" && selected.value === value}
          onClick={() => onSelect({ kind: "days", value })}>
          <span>{label}</span><strong>{count.toLocaleString("pt-BR")} ({(total ? count * 100 / total : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</strong>
        </button></li>
      ))}</ul>
    </div>
  );
}

function TreatmentBars({ items, selected, onSelect }: { items: { value: Treatment | null; label: string; count: number }[]; selected: ChartFilter | null; onSelect: (filter: ChartFilter) => void }) {
  const max = Math.max(0, ...items.map((item) => item.count));
  return (
    <div className="vertical-chart-scroll">
      <div className="vertical-chart" aria-label="Quantidade por classificação de tratamento">
        {items.map(({ value, label, count }, index) => (
          <button type="button" className="vertical-item" key={label}
            aria-pressed={selected?.kind === "treatment" && selected.value === value}
            onClick={() => onSelect({ kind: "treatment", value })}>
            <span className="vertical-plot"><strong>{count.toLocaleString("pt-BR")}</strong><span className="vertical-bar" style={{ height: `${max ? count * 145 / max : 0}px`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
