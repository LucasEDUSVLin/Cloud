import Database from "better-sqlite3";
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { IMPORT_COLUMNS, type LogisticsRecord } from "./csv";
import { csvDate } from "./dates";

export type MonthSummary = {
  month: string;
  count: number;
  lastImportedAt: string;
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function createDatabase(filePath: string) {
  if (filePath !== ":memory:") {
    const absolutePath = path.resolve(filePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
    try {
      closeSync(openSync(absolutePath, "wx", 0o600));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
    filePath = absolutePath;
  }

  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      ${IMPORT_COLUMNS.map((column) => `${quoteIdentifier(column)} TEXT NOT NULL DEFAULT ''`).join(",\n      ")},
      received_date TEXT NOT NULL,
      delivered_date TEXT,
      imported_at TEXT NOT NULL,
      PRIMARY KEY (${quoteIdentifier("Order ID")})
    );
    CREATE INDEX IF NOT EXISTS orders_received_date_idx ON orders (received_date);
    CREATE INDEX IF NOT EXISTS orders_delivered_date_idx ON orders (delivered_date);
  `);

  const fieldNames = IMPORT_COLUMNS.map(quoteIdentifier);
  const insert = db.prepare(`
    INSERT INTO orders (${fieldNames.join(", ")}, received_date, delivered_date, imported_at)
    VALUES (${[...IMPORT_COLUMNS.map(() => "?"), "?", "?", "?"].join(", ")})
    ON CONFLICT (${quoteIdentifier("Order ID")}) DO UPDATE SET
      ${IMPORT_COLUMNS.filter((column) => column !== "Order ID")
        .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
        .join(", ")},
      received_date = excluded.received_date,
      delivered_date = excluded.delivered_date,
      imported_at = excluded.imported_at
  `);

  const save = db.transaction((records: LogisticsRecord[]) => {
    const importedAt = new Date().toISOString();
    for (const record of records) {
      const received = csvDate(record["Current Station Received Time"]);
      const deliveredValue = record["Delivered Time"];
      const delivered = deliveredValue ? csvDate(deliveredValue) : null;
      if (!received || (deliveredValue && !delivered)) {
        throw new Error(`Data inválida para o pedido ${record["Order ID"]}.`);
      }
      insert.run(...IMPORT_COLUMNS.map((column) => record[column]), received, delivered, importedAt);
    }
  });

  return {
    close: () => db.close(),
    getRecords(month: string): LogisticsRecord[] {
      return db
        .prepare(
          `SELECT ${fieldNames.join(", ")} FROM orders WHERE substr(received_date, 1, 7) = ? ORDER BY received_date DESC, ${quoteIdentifier("Order ID")}`,
        )
        .all(month) as LogisticsRecord[];
    },
    listMonths(): MonthSummary[] {
      return db
        .prepare(
          `SELECT substr(received_date, 1, 7) AS month, COUNT(*) AS count, MAX(imported_at) AS lastImportedAt
           FROM orders GROUP BY substr(received_date, 1, 7) ORDER BY month DESC`,
        )
        .all() as MonthSummary[];
    },
    weeklyCounts(start: string, end: string) {
      const received = db.prepare(
        "SELECT received_date AS day, COUNT(*) AS count FROM orders WHERE received_date >= ? AND received_date <= ? GROUP BY received_date",
      ).all(start, end) as { day: string; count: number }[];
      const delivered = db.prepare(
        `SELECT delivered_date AS day, COUNT(*) AS count FROM orders
         WHERE delivered_date >= ? AND delivered_date <= ? AND lower(trim(Status)) = 'delivered'
         GROUP BY delivered_date`,
      ).all(start, end) as { day: string; count: number }[];
      return { received, delivered };
    },
    saveRecords(records: LogisticsRecord[]) {
      save(records);
    },
  };
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDatabase() {
  if (!database) {
    database = createDatabase(process.env.DB_PATH || "./data/cloud.sqlite");
  }
  return database;
}
