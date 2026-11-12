import type { StuckSnapshot } from "./stuck";

export const HISTORY_LIMIT = 7;

export type HistoryEntry = {
  id: string;
  importedAt: string;
  stuckName: string;
  updatedName: string;
  records: { tracking: string; status: string | null }[];
};

export function historyEntry(snapshot: StuckSnapshot): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    importedAt: snapshot.importedAt,
    stuckName: snapshot.files?.stuck.name ?? "Indisponível",
    updatedName: snapshot.files?.updated.name ?? "Indisponível",
    records: snapshot.records.map((record) => ({ tracking: record.tracking, status: record.updatedStatus })),
  };
}

export function compareHistory(current: HistoryEntry, previous: HistoryEntry) {
  const before = new Map(previous.records.map((record) => [record.tracking, record.status]));
  const after = new Map(current.records.map((record) => [record.tracking, record.status]));
  return {
    added: current.records.filter((record) => !before.has(record.tracking)).map((record) => record.tracking),
    removed: previous.records.filter((record) => !after.has(record.tracking)).map((record) => record.tracking),
    changed: current.records.filter((record) => before.has(record.tracking) && before.get(record.tracking) !== record.status)
      .map((record) => ({ tracking: record.tracking, before: before.get(record.tracking) ?? null, after: record.status })),
  };
}

export function parseHistoryBackup(text: string): HistoryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("O arquivo de backup não contém JSON válido.");
  }
  if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1 ||
      !("entries" in parsed) || !Array.isArray(parsed.entries) || parsed.entries.length > HISTORY_LIMIT) {
    throw new Error("O arquivo de backup do histórico é inválido ou excede o limite de sete importações.");
  }
  const ids = new Set<string>();
  const entries: HistoryEntry[] = [];
  for (const entry of parsed.entries as unknown[]) {
    if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string" || !entry.id ||
        ids.has(entry.id) || !("importedAt" in entry) || typeof entry.importedAt !== "string" ||
        !Number.isFinite(Date.parse(entry.importedAt)) || !("stuckName" in entry) || typeof entry.stuckName !== "string" ||
        !("updatedName" in entry) || typeof entry.updatedName !== "string" || !("records" in entry) ||
        !Array.isArray(entry.records) || entry.records.length < 1 || entry.records.length > 10_000) {
      throw new Error("O arquivo de backup contém uma importação inválida.");
    }
    ids.add(entry.id);
    const trackingNumbers = new Set<string>();
    const records: HistoryEntry["records"] = [];
    for (const record of entry.records as unknown[]) {
      if (!record || typeof record !== "object" || !("tracking" in record) || typeof record.tracking !== "string" ||
          !record.tracking.trim() || record.tracking !== record.tracking.trim() || trackingNumbers.has(record.tracking) ||
          !("status" in record) || (record.status !== null && (typeof record.status !== "string" || !record.status.trim() || record.status !== record.status.trim()))) {
        throw new Error("O arquivo de backup contém mercadorias inválidas ou duplicadas.");
      }
      trackingNumbers.add(record.tracking);
      records.push({ tracking: record.tracking, status: record.status });
    }
    entries.push({ id: entry.id, importedAt: entry.importedAt, stuckName: entry.stuckName, updatedName: entry.updatedName, records });
  }
  return entries;
}
