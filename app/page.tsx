"use client";

import { useEffect, useMemo, useState } from "react";
import { parseLogisticsCsv, type LogisticsRecord } from "@/lib/csv";
import { addDays, mondayOfWeek } from "@/lib/dates";
import { readRecords, saveRecords, summarize } from "@/lib/storage";
const PAGE_SIZE = 50;

const statusNames: Record<string, string> = {
  delivered: "Entregue",
  delivering: "Em entrega",
  onhold: "Em espera",
  hub_received: "Recebido no hub",
  hub_assigned: "Atribuído no hub",
  hub_assigning: "Em atribuição no hub",
  hub_lharrived: "Chegou ao hub",
  sp_ready_collection: "Pronto para coleta",
  sp_collection_reminder1: "Aguardando coleta",
  sp_collection_collected: "Coletado",
  soc_lhtransported: "Transportado",
  transporting_to_sp: "Em transporte",
};

function statusLabel(status: string) {
  return statusNames[status.toLowerCase()] ?? (status || "Não informado");
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, value - 1, 1)));
}

function dateLabel(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function formatCsvDate(value: string) {
  return value ? value.replace(/^(\d{2})-(\d{2})-(\d{4})\s/, "$1/$2/$3 ") : "—";
}

export default function Home() {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [weekDate, setWeekDate] = useState(today);
  const [allRecords, setAllRecords] = useState<LogisticsRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [importing, setImporting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    readRecords()
      .then((data) => { if (active) { setAllRecords(data); setUnavailable(false); } })
      .catch((caught) => {
        if (active) {
          setUnavailable(true);
          setError(caught instanceof Error ? caught.message : "Falha ao ler o banco local.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const { months, records, days: week } = useMemo(
    () => summarize(allRecords, month, weekDate), [allRecords, month, weekDate],
  );

  const delivered = records.filter((row) => row.Status.toLowerCase() === "delivered").length;
  const statuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      const key = record.Status.trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [records]);
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return records.filter((record) =>
      (statusFilter === null || record.Status.trim() === statusFilter) &&
      (!query || [
        record["Order ID"], record["Buyer Name"], record["Driver Name"],
        record.Status, statusLabel(record.Status), record["Current Station"], record["Postal Code"],
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query))),
    );
  }, [records, search, statusFilter]);
  const pageCount = Math.ceil(filteredRecords.length / PAGE_SIZE);
  const visibleRecords = filteredRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const maxWeekly = Math.max(1, ...week.flatMap((day) => [day.received, day.delivered]));
  const weekStart = mondayOfWeek(weekDate);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 10 * 1024 * 1024) {
      setError("Selecione um arquivo CSV de até 10 MB.");
      input.value = "";
      return;
    }
    setImporting(true);
    try {
      const selectedRecords = parseLogisticsCsv(await file.text());
      const imported = await saveRecords(selectedRecords);
      setRevision((value) => value + 1);
      setNotice(`${imported.toLocaleString("pt-BR")} registros importados ou atualizados neste navegador. Cada pedido aparece no mês de recebimento.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao importar o CSV.");
    } finally {
      setImporting(false);
      input.value = "";
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark small">C</span><span>Cloud</span></div>
        <span className="topbar-caption">ANÁLISE LOGÍSTICA</span>
      </header>
      <section className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PAINEL DE OPERAÇÕES</p>
            <h1>Acompanhamento de mercadorias</h1>
            <p className="muted">Do recebimento à entrega, acompanhe a operação a cada dia.</p>
          </div>
          <label className={`primary-button upload-button ${importing ? "disabled" : ""}`}>
            {importing ? "Importando..." : "Importar CSV"}
            <input accept=".csv,text/csv" disabled={importing} onChange={handleFile} type="file" />
          </label>
        </div>
        <div className="privacy-note">
          Os dados ficam somente neste navegador e não são compartilhados. Limpar os dados do navegador pode apagá-los. Importe os arquivos em ordem cronológica.
        </div>
        {error && <p className="error import-error" role="alert">{error}</p>}
        {notice && <p className="success" role="status">{notice}</p>}

        <div className="section-title">
          <div><h2>Visão do mês</h2><p className="muted">Pedidos recebidos na estação no mês escolhido.</p></div>
          <label className="month-field"><span>Mês de recebimento</span>
            <input aria-label="Mês de recebimento" type="month" value={month}
              onChange={(event) => {
                if (!event.target.value) return;
                setMonth(event.target.value); setStatusFilter(null); setPage(0); setError("");
              }} />
          </label>
        </div>
        {loading ? <p className="empty-state" role="status">Carregando indicadores do mês...</p> : unavailable ? (
          <p className="empty-state">Indicadores indisponíveis: falha ao ler o banco local.</p>
        ) : (
          <>
            <div className="metric-grid">
              <Metric label="Recebidos no mês" value={records.length} />
              <Metric label="Entregues atualmente" value={delivered} />
              <Metric label="Ainda não entregues" value={records.length - delivered} />
              <Metric label="Taxa de entrega atual" value={records.length ? `${(delivered * 100 / records.length).toFixed(1).replace(".", ",")}%` : "—"} />
            </div>
            <section className="panel">
              <div className="records-heading">
                <div><h2>Status das mercadorias</h2><p className="muted">Situação atual conforme a última importação de cada pedido. Selecione um status para filtrar a lista.</p></div>
                {statusFilter !== null && <button className="text-button" onClick={() => { setStatusFilter(null); setPage(0); }}>Limpar filtro</button>}
              </div>
              {statuses.length ? (
                <div className="status-grid">
                  {statuses.map(([status, count]) => (
                    <button className={`status-card ${statusFilter === status ? "active" : ""}`} key={status}
                      aria-pressed={statusFilter === status}
                      onClick={() => { setStatusFilter(statusFilter === status ? null : status); setPage(0); }}>
                      <span>{statusLabel(status)}</span><strong>{count.toLocaleString("pt-BR")}</strong>
                      <span className="status-track"><span style={{ width: `${count * 100 / records.length}%` }} /></span>
                    </button>
                  ))}
                </div>
              ) : <p className="empty-state">Nenhum pedido recebido neste mês.</p>}
            </section>
          </>
        )}

        <section className="panel">
          <div className="records-heading">
            <div><h2>Evolução semanal</h2><p className="muted">Recebimentos e entregas por data do evento, de segunda a domingo, considerando todos os meses.</p></div>
            <label className="month-field"><span>Escolha uma data da semana</span>
              <input aria-label="Data da semana" type="date" value={weekDate}
                onChange={(event) => { if (event.target.value) setWeekDate(event.target.value); }} />
            </label>
          </div>
          <div className="week-controls">
            <button onClick={() => setWeekDate(addDays(weekStart, -7))}>Semana anterior</button>
            <strong>{dateLabel(weekStart)}/{weekStart.slice(0, 4)} a {dateLabel(addDays(weekStart, 6))}/{addDays(weekStart, 6).slice(0, 4)}</strong>
            <button onClick={() => setWeekDate(addDays(weekStart, 7))}>Próxima semana</button>
          </div>
          <p className="chart-caption"><span className="legend received" /> Recebidos <span className="legend delivered" /> Entregues</p>
          {loading ? <p className="empty-state">Carregando semana...</p> : unavailable ? (
            <p className="empty-state">Evolução indisponível: falha ao ler o banco local.</p>
          ) : (
            <div className="week-chart">
              {week.map((day) => (
                <div className="week-day" key={day.date}>
                  <div className="chart-bars">
                    <div className="bar received-bar" style={{ height: `${day.received * 100 / maxWeekly}%` }} title={`${day.received} recebidos`} />
                    <div className="bar delivered-bar" style={{ height: `${day.delivered * 100 / maxWeekly}%` }} title={`${day.delivered} entregues`} />
                  </div>
                  <strong>{dateLabel(day.date)}</strong>
                  <span>{day.received} receb.</span><span>{day.delivered} entreg.</span>
                </div>
              ))}
            </div>
          )}
          <p className="chart-footnote">Entregas contam pedidos com status atual Delivered e data de entrega preenchida. Não é um histórico de mudanças de status.</p>
        </section>

        <section className="panel records-panel">
          <div className="records-heading">
            <div><h2>Pedidos de {monthLabel(month)}</h2><p className="muted">{loading ? "Carregando..." : unavailable ? "Dados indisponíveis" : `${filteredRecords.length.toLocaleString("pt-BR")} registros encontrados`}</p></div>
            <label className="search-field"><span className="sr-only">Buscar pedido, pessoa ou estação</span>
              <input onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar nos registros" type="search" value={search} />
            </label>
          </div>
          {loading ? <p className="empty-state">Carregando...</p> : unavailable ? (
            <p className="empty-state">Pedidos indisponíveis: falha ao ler o banco local.</p>
          ) : filteredRecords.length === 0 ? (
            <p className="empty-state">Nenhum pedido encontrado para os filtros selecionados.</p>
          ) : (
            <>
              <div className="table-scroll"><table>
                <thead><tr><th>Pedido</th><th>Comprador</th><th>Status atual</th><th>Entregador</th><th>Estação atual</th><th>Recebido na estação</th><th>Entregue em</th></tr></thead>
                <tbody>{visibleRecords.map((record) => (
                  <tr key={record["Order ID"]}>
                    <td className="order-id">{record["Order ID"]}</td>
                    <td>{record["Buyer Name"] || "—"}</td>
                    <td><span className="status-pill" title={record.Status}>{statusLabel(record.Status)}</span></td>
                    <td>{record["Driver Name"] || "—"}</td>
                    <td>{record["Current Station"] || "—"}</td>
                    <td>{formatCsvDate(record["Current Station Received Time"])}</td>
                    <td>{formatCsvDate(record["Delivered Time"])}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              <div className="pagination">
                <span>Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredRecords.length)} de {filteredRecords.length.toLocaleString("pt-BR")}</span>
                <div><button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Anterior</button>
                  <button disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
              </div>
            </>
          )}
        </section>
        <section className="archive-note"><strong>Meses armazenados</strong>
          <span>{loading ? "Carregando..." : unavailable ? "Dados indisponíveis" : months.length ? months.map((item) => `${monthLabel(item.month)} (${item.count.toLocaleString("pt-BR")})`).join(" · ") : "Nenhuma importação salva ainda"}</span>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <article className="metric-card"><p>{label}</p><strong>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</strong></article>;
}
