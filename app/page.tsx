"use client";

import { signOut } from "firebase/auth";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getFirebaseAuth } from "@/lib/firebase";
import { parseLogisticsCsv, type LogisticsRecord } from "@/lib/csv";

function Login() {
  const { configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const auth = getFirebaseAuth();
    if (!auth) {
      setError("Firebase não está configurado. Preencha as variáveis de ambiente.");
      return;
    }

    setSubmitting(true);
    try {
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError("Não foi possível entrar. Verifique o e-mail e a senha.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">C</div>
        <p className="eyebrow">OPERAÇÃO LOGÍSTICA</p>
        <h1>Cloud</h1>
        <p className="muted">Entre para acompanhar seus indicadores.</p>
        {!configured && (
          <div className="notice" role="status">
            Configure o Firebase no arquivo <code>.env.local</code> para habilitar o login.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">E-mail</label>
          <input
            autoComplete="username"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <label htmlFor="password">Senha</label>
          <input
            autoComplete="current-password"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary-button full-width" disabled={submitting || !configured}>
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="login-footnote">Acesso somente para contas cadastradas.</p>
      </section>
    </main>
  );
}

function Dashboard({ email }: { email: string }) {
  const [records, setRecords] = useState<LogisticsRecord[]>([]);
  const [error, setError] = useState("");

  const metrics = useMemo(() => {
    const delivered = records.filter((row) => row.Status.toLowerCase() === "delivered").length;
    const onHold = records.filter((row) => row["OnHold Time"] && row["OnHold Time"] !== "0").length;
    const stations = new Set(records.map((row) => row["Current Station"]).filter(Boolean)).size;
    return { total: records.length, delivered, onHold, stations };
  }, [records]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setRecords([]);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Selecione um arquivo CSV.");
      event.target.value = "";
      return;
    }

    try {
      const csv = await file.text();
      setRecords(parseLogisticsCsv(csv));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao importar o CSV.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSignOut() {
    const auth = getFirebaseAuth();
    if (auth) await signOut(auth);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link aria-label="Cloud início" className="brand" href="/">
          <span className="brand-mark small">C</span>
          <span>Cloud</span>
        </Link>
        <div className="account">
          <span className="account-email">{email}</span>
          <button className="text-button" onClick={handleSignOut}>Sair</button>
        </div>
      </header>
      <section className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">VISÃO GERAL</p>
            <h1>Indicadores logísticos</h1>
            <p className="muted">Importe o relatório Shopee para analisar sua operação.</p>
          </div>
          <label className="primary-button upload-button">
            Importar CSV
            <input accept=".csv,text/csv" onChange={handleFile} type="file" />
          </label>
        </div>
        <div className="privacy-note">
          O arquivo é processado localmente neste navegador e não é enviado ou salvo pelo Cloud.
        </div>
        {error && <p className="error import-error" role="alert">{error}</p>}
        <div className="metric-grid">
          <Metric label="Pedidos no arquivo" value={metrics.total} />
          <Metric label="Entregues" value={metrics.delivered} />
          <Metric label="Com tempo em espera" value={metrics.onHold} />
          <Metric label="Estações identificadas" value={metrics.stations} />
        </div>
        <section className="panel">
          <div>
            <h2>Dados da importação</h2>
            <p className="muted">
              {records.length
                ? `${records.length.toLocaleString("pt-BR")} pedidos carregados nesta sessão.`
                : "Nenhum arquivo importado. Selecione o CSV de devoluções da Shopee."}
            </p>
          </div>
          {records.length > 0 && (
            <button className="text-button" onClick={() => setRecords([])}>
              Limpar dados
            </button>
          )}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value.toLocaleString("pt-BR")}</strong>
    </article>
  );
}

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return <main className="loading-screen">Carregando...</main>;
  }

  return user ? <Dashboard email={user.email ?? "Conta autenticada"} /> : <Login />;
}
