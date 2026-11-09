import Papa from "papaparse";

export const IMPORT_COLUMNS = [
  "Order ID",
  "Buyer Name",
  "Location Type",
  "Postal Code",
  "Driver ID",
  "Driver Name",
  "Driver Phone",
  "Current Station Received Time",
  "Delivered Time",
  "OnHold Time",
  "Status",
  "Current Station",
] as const;

export type LogisticsRecord = Record<(typeof IMPORT_COLUMNS)[number], string>;

export function parseLogisticsCsv(csv: string): LogisticsRecord[] {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    throw new Error(`Não foi possível ler o CSV: ${parsed.errors[0].message}`);
  }

  const headers = parsed.meta.fields ?? [];
  const missingColumns = IMPORT_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Colunas obrigatórias ausentes: ${missingColumns.join(", ")}`);
  }

  return parsed.data.map((row, index) => {
    const record = Object.fromEntries(
      IMPORT_COLUMNS.map((column) => [column, (row[column] ?? "").trim()]),
    ) as LogisticsRecord;

    if (!record["Order ID"]) {
      throw new Error(`A linha ${index + 2} não contém Order ID.`);
    }

    return record;
  });
}
