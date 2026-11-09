import Papa from "papaparse";

const STUCK_COLUMNS = ["Operação", "Cidade", "Entegador", "TN", "Status", "Dias parados", "Valor", "Palavra Chave", "Avaria"] as const;
const UPDATED_COLUMNS = ["Order ID", "Status", "Driver Name", "Driver Phone", "Current Station", "Current Station Received Time", "Delivered Time"] as const;

export type StuckRecord = {
  tracking: string;
  operation: string;
  city: string;
  driver: string;
  days: number;
  value: string;
  damage: string;
  stuckStatus: string;
  updatedStatus: string | null;
  updatedDriver: string;
  driverPhone: string;
  station: string;
  receivedTime: string;
  deliveredTime: string;
};

export type StuckSnapshot = {
  records: StuckRecord[];
  unmatchedUpdates: number;
  importedAt: string;
};

function parseFile(csv: string, columns: readonly string[], label: string) {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length) throw new Error(`${label}: ${parsed.errors[0].message}`);
  const fields = parsed.meta.fields ?? [];
  const missing = columns.filter((name) => !fields.includes(name));
  if (missing.length) throw new Error(`${label}: faltam as colunas ${missing.join(", ")}.`);
  if (parsed.meta.renamedHeaders && Object.keys(parsed.meta.renamedHeaders).length) {
    throw new Error(`${label}: o cabeçalho contém colunas duplicadas.`);
  }
  if (!parsed.data.length || parsed.data.length > 10_000) {
    throw new Error(`${label}: o arquivo deve conter de 1 a 10.000 registros.`);
  }
  return parsed.data;
}

function uniqueMap(rows: Record<string, string>[], column: string, label: string) {
  const result = new Map<string, Record<string, string>>();
  rows.forEach((row, index) => {
    const key = (row[column] ?? "").trim();
    if (!key) throw new Error(`${label}: ${column} obrigatório na linha ${index + 2}.`);
    if (result.has(key)) throw new Error(`${label}: ${column} duplicado na linha ${index + 2}.`);
    result.set(key, row);
  });
  return result;
}

export function processStuckFiles(stuckCsv: string, updatedCsv: string): StuckSnapshot {
  const stuckRows = parseFile(stuckCsv, STUCK_COLUMNS, "Arquivo STUCK");
  const updatedRows = parseFile(updatedCsv, UPDATED_COLUMNS, "Arquivo de status");
  const stuck = uniqueMap(stuckRows, "TN", "Arquivo STUCK");
  const updates = uniqueMap(updatedRows, "Order ID", "Arquivo de status");
  const records = [...stuck].map(([tracking, row], index): StuckRecord => {
    const rawDays = (row["Dias parados"] ?? "").trim();
    if (!/^\d+$/.test(rawDays) || !Number.isSafeInteger(Number(rawDays))) {
      throw new Error(`Arquivo STUCK: Dias parados inválido na linha ${index + 2}.`);
    }
    const update = updates.get(tracking);
    const status = (update?.Status ?? "").trim();
    return {
      tracking,
      operation: (row["Operação"] ?? "").trim(),
      city: (row.Cidade ?? "").trim(),
      driver: (row.Entegador ?? "").trim(),
      days: Number(rawDays),
      value: (row.Valor ?? "").trim(),
      damage: (row.Avaria ?? "").trim(),
      stuckStatus: (row.Status ?? "").trim(),
      updatedStatus: status || null,
      updatedDriver: (update?.["Driver Name"] ?? "").trim(),
      driverPhone: (update?.["Driver Phone"] ?? "").trim(),
      station: (update?.["Current Station"] ?? "").trim(),
      receivedTime: (update?.["Current Station Received Time"] ?? "").trim(),
      deliveredTime: (update?.["Delivered Time"] ?? "").trim(),
    };
  });
  return {
    records,
    unmatchedUpdates: [...updates.keys()].filter((id) => !stuck.has(id)).length,
    importedAt: new Date().toISOString(),
  };
}

export function extractTrackingNumbers(stuckCsv: string) {
  const rows = parseFile(stuckCsv, STUCK_COLUMNS, "Arquivo STUCK");
  return [...uniqueMap(rows, "TN", "Arquivo STUCK").keys()];
}

export function delivered(record: StuckRecord) {
  return record.updatedStatus?.toLowerCase() === "delivered";
}

export function risk(record: StuckRecord) {
  if (record.days > 15) return "Acima de 15 dias";
  if (record.days === 15) return "15 dias";
  return "Abaixo de 15 dias";
}
