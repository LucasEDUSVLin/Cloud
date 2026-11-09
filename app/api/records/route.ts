import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { IMPORT_COLUMNS, type LogisticsRecord } from "@/lib/csv";
import { csvDate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_RECORDS = 10_000;
const MAX_FIELD_LENGTH = 2_048;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host === host && ["http:", "https:"].includes(parsedOrigin.protocol);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!MONTH_PATTERN.test(month)) {
    return jsonError("Informe um mês válido no formato AAAA-MM.", 400);
  }

  return NextResponse.json(
    { records: getDatabase().getRecords(month) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError("Origem da solicitação inválida.", 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("O arquivo excede o limite de 10 MB.", 413);
  }

  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return jsonError("O arquivo excede o limite de 10 MB.", 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return jsonError("O conteúdo enviado não é um JSON válido.", 400);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("records" in payload)
  ) {
    return jsonError("Informe os registros para importar.", 400);
  }

  const { records } = payload;
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_RECORDS) {
    return jsonError(`A importação deve conter de 1 a ${MAX_RECORDS} registros.`, 400);
  }

  const safeRecords: LogisticsRecord[] = [];
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      return jsonError(`Registro inválido na linha ${index + 1}.`, 400);
    }

    const safeRecord = {} as LogisticsRecord;
    for (const column of IMPORT_COLUMNS) {
      const value = (record as Record<string, unknown>)[column];
      if (typeof value !== "string" || value.length > MAX_FIELD_LENGTH) {
        return jsonError(`Campo inválido "${column}" na linha ${index + 1}.`, 400);
      }
      safeRecord[column] = value.trim();
    }

    if (!safeRecord["Order ID"]) {
      return jsonError(`Order ID obrigatório na linha ${index + 1}.`, 400);
    }
    if (seen.has(safeRecord["Order ID"])) {
      return jsonError(`Order ID duplicado na linha ${index + 1}.`, 400);
    }
    seen.add(safeRecord["Order ID"]);
    if (!csvDate(safeRecord["Current Station Received Time"])) {
      return jsonError(`Data de recebimento inválida na linha ${index + 1}; use DD-MM-AAAA HH:MM.`, 400);
    }
    if (safeRecord["Delivered Time"] && !csvDate(safeRecord["Delivered Time"])) {
      return jsonError(`Data de entrega inválida na linha ${index + 1}; use DD-MM-AAAA HH:MM.`, 400);
    }
    safeRecords.push(safeRecord);
  }

  getDatabase().saveRecords(safeRecords);
  return NextResponse.json(
    { imported: safeRecords.length },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
