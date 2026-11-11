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
  source?: {
    stuck: Record<string, string>;
    updated: Record<string, string> | null;
  };
};

export type StuckSnapshot = {
  records: StuckRecord[];
  unmatchedUpdates: number;
  importedAt: string;
  exportFields?: {
    stuck: string[];
    updated: string[];
    updatedOriginal?: string[];
  };
  files?: {
    stuck: { name: string; contents: string };
    updated: { name: string; contents: string };
  };
};

function parseFile(csv: string, columns: readonly string[], label: string) {
  const originalFields: string[] = [];
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header, index) => {
      originalFields[index] = header;
      return header.trim();
    },
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
  return { rows: parsed.data, fields, originalFields };
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
  const stuckFile = parseFile(stuckCsv, STUCK_COLUMNS, "Arquivo STUCK");
  const updatedFile = parseFile(updatedCsv, UPDATED_COLUMNS, "Arquivo de status");
  const stuck = uniqueMap(stuckFile.rows, "TN", "Arquivo STUCK");
  const updates = uniqueMap(updatedFile.rows, "Order ID", "Arquivo de status");
  const records = [...stuck].map(([tracking, row], index): StuckRecord => {
    const rawDays = (row["Dias parados"] ?? "").trim();
    if (!/^\d+$/.test(rawDays) || !Number.isSafeInteger(Number(rawDays))) {
      throw new Error(`Arquivo STUCK: Dias parados inválido na linha ${index + 2}.`);
    }
    const value = (row.Valor ?? "").trim();
    try {
      parseValueCents(value);
    } catch (caught) {
      throw new Error(`Arquivo STUCK: Valor inválido na linha ${index + 2}.`, { cause: caught });
    }
    const update = updates.get(tracking);
    const status = (update?.Status ?? "").trim();
    return {
      tracking,
      operation: (row["Operação"] ?? "").trim(),
      city: (row.Cidade ?? "").trim(),
      driver: (row.Entegador ?? "").trim(),
      days: Number(rawDays),
      value,
      damage: (row.Avaria ?? "").trim(),
      stuckStatus: (row.Status ?? "").trim(),
      updatedStatus: status || null,
      updatedDriver: (update?.["Driver Name"] ?? "").trim(),
      driverPhone: (update?.["Driver Phone"] ?? "").trim(),
      station: (update?.["Current Station"] ?? "").trim(),
      receivedTime: (update?.["Current Station Received Time"] ?? "").trim(),
      deliveredTime: (update?.["Delivered Time"] ?? "").trim(),
      source: { stuck: row, updated: update ?? null },
    };
  });
  return {
    records,
    unmatchedUpdates: [...updates.keys()].filter((id) => !stuck.has(id)).length,
    importedAt: new Date().toISOString(),
    exportFields: { stuck: stuckFile.fields, updated: updatedFile.fields, updatedOriginal: updatedFile.originalFields },
  };
}

export function extractTrackingNumbers(stuckCsv: string) {
  const file = parseFile(stuckCsv, STUCK_COLUMNS, "Arquivo STUCK");
  return [...uniqueMap(file.rows, "TN", "Arquivo STUCK").keys()];
}

export function exportFilename(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Stuck-${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}-${pad(date.getHours())}-${pad(date.getMinutes())}.csv`;
}

export function exportSelectedCsv(snapshot: StuckSnapshot, selected: ReadonlySet<string>) {
  const fields = snapshot.exportFields;
  if (!fields) throw new Error("Importe novamente os dois relatórios para exportar as informações atualizadas.");
  const records = snapshot.records.filter((record) => selected.has(record.tracking));
  if (!records.length) throw new Error("Selecione pelo menos uma mercadoria para exportar.");
  if (records.some((record) => !record.source)) throw new Error("Importe novamente os dois relatórios para exportar as informações atualizadas.");
  const missing = records.filter((record) => !record.source?.updated).map((record) => record.tracking);
  if (missing.length) throw new Error(`Sem dados atualizados para os seguintes BRs: ${missing.join(", ")}. Atualize o relatório de status antes de exportar.`);
  const data = records.map((record) => {
    const updated = record.source?.updated;
    if (!updated) throw new Error(`Sem dados atualizados para ${record.tracking}.`);
    return fields.updated.map((field) => updated[field] ?? "");
  });
  return "\uFEFF" + Papa.unparse({
    fields: fields.updatedOriginal ?? fields.updated,
    data,
  }, { delimiter: ";", newline: "\r\n", escapeFormulae: /^[\t\r\n]|^[\s]*[=+\-@]/ });
}

export function parseValueCents(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Valor deve ser um número não negativo com até duas casas decimais.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Valor excede o limite numérico permitido.");
  }
  return cents;
}

export function valueTotals(records: readonly StuckRecord[]) {
  const byStatus = new Map<string, number>();
  let totalCents = 0;
  let lostCents = 0;

  for (const record of records) {
    const cents = parseValueCents(record.value);
    const status = record.updatedStatus ?? "";
    totalCents += cents;
    byStatus.set(status, (byStatus.get(status) ?? 0) + cents);
    if (status.trim().toLocaleUpperCase("pt-BR") === "LOST") lostCents += cents;
  }

  return { totalCents, lostCents, byStatus };
}

export function delivered(record: StuckRecord) {
  return record.updatedStatus?.toLowerCase() === "delivered";
}

export function risk(record: StuckRecord) {
  if (record.days > 15) return "Acima de 15 dias";
  if (record.days === 15) return "15 dias";
  return "Abaixo de 15 dias";
}
