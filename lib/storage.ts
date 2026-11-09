import { IMPORT_COLUMNS, type LogisticsRecord } from "./csv";
import { addDays, csvDate, mondayOfWeek } from "./dates";

const DATABASE_NAME = "cloud-logistica";
const STORE_NAME = "orders";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = () => reject(new Error("Não foi possível abrir o banco local do navegador."));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Feche outras abas do Cloud e tente novamente."));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export async function saveRecords(records: LogisticsRecord[]): Promise<number> {
  if (!records.length || records.length > 10_000) {
    throw new Error("A importação deve conter de 1 a 10.000 registros.");
  }
  const seen = new Set<string>();
  const safeRecords = records.map((record, index) => {
    const safeRecord = Object.fromEntries(IMPORT_COLUMNS.map((column) => {
      const value = record[column];
      if (typeof value !== "string" || value.length > 2048) {
        throw new Error(`Campo inválido "${column}" na linha ${index + 2}.`);
      }
      return [column, value.trim()];
    })) as LogisticsRecord;
    const id = safeRecord["Order ID"];
    if (!id) throw new Error(`Order ID obrigatório na linha ${index + 2}.`);
    if (seen.has(id)) throw new Error(`Order ID duplicado na linha ${index + 2}.`);
    seen.add(id);
    if (!csvDate(safeRecord["Current Station Received Time"])) {
      throw new Error(`Data de recebimento inválida na linha ${index + 2}; use DD-MM-AAAA HH:MM.`);
    }
    if (safeRecord["Delivered Time"] && !csvDate(safeRecord["Delivered Time"])) {
      throw new Error(`Data de entrega inválida na linha ${index + 2}; use DD-MM-AAAA HH:MM.`);
    }
    return safeRecord;
  });
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error("Não foi possível salvar os dados. Verifique o espaço disponível no navegador."));
      const store = transaction.objectStore(STORE_NAME);
      for (const record of safeRecords) store.put(record, record["Order ID"]);
    });
  } finally {
    db.close();
  }
  return safeRecords.length;
}

export async function readRecords(): Promise<LogisticsRecord[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as LogisticsRecord[]);
      request.onerror = () => reject(new Error("Não foi possível ler os dados salvos no navegador."));
      transaction.onabort = () => reject(new Error("A leitura do banco local foi interrompida."));
    });
  } finally {
    db.close();
  }
}

export function summarize(records: LogisticsRecord[], month: string, weekDate: string) {
  const counts = new Map<string, number>();
  const start = mondayOfWeek(weekDate);
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(start, index), received: 0, delivered: 0,
  }));
  const monthly: LogisticsRecord[] = [];
  for (const record of records) {
    const received = csvDate(record["Current Station Received Time"]);
    const delivered = csvDate(record["Delivered Time"]);
    if (!received) throw new Error("O banco local contém uma data de recebimento inválida.");
    if (record["Delivered Time"] && !delivered) throw new Error("O banco local contém uma data de entrega inválida.");
    const recordMonth = received.slice(0, 7);
    counts.set(recordMonth, (counts.get(recordMonth) ?? 0) + 1);
    if (recordMonth === month) monthly.push(record);
    const receivedDay = days.find((day) => day.date === received);
    if (receivedDay) receivedDay.received++;
    const deliveredDay = days.find((day) => day.date === delivered);
    if (deliveredDay && record.Status.trim().toLowerCase() === "delivered") deliveredDay.delivered++;
  }
  monthly.sort((a, b) =>
    (csvDate(b["Current Station Received Time"]) ?? "").localeCompare(csvDate(a["Current Station Received Time"]) ?? "") ||
    a["Order ID"].localeCompare(b["Order ID"]));
  return {
    months: [...counts].map(([value, count]) => ({ month: value, count })).sort((a, b) => b.month.localeCompare(a.month)),
    records: monthly,
    days,
  };
}
