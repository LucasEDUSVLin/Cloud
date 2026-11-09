import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "./database";
import { IMPORT_COLUMNS, type LogisticsRecord } from "./csv";

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function record(id: string, received: string, status = "Delivering", delivered = ""): LogisticsRecord {
  const result = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, ""])) as LogisticsRecord;
  result["Order ID"] = id;
  result["Current Station Received Time"] = received;
  result.Status = status;
  result["Delivered Time"] = delivered;
  return result;
}

describe("monthly database", () => {
  it("updates the same order across imports and groups by its receipt date", () => {
    const database = createDatabase(":memory:");
    databases.push(database);
    database.saveRecords([record("ORDER-1", "30-11-2026 10:00")]);
    database.saveRecords([record("ORDER-1", "30-11-2026 10:00", "Delivered", "01-12-2026 12:00")]);
    expect(database.getRecords("2026-11")).toHaveLength(1);
    expect(database.getRecords("2026-11")[0].Status).toBe("Delivered");
    expect(database.getRecords("2026-12")).toHaveLength(0);
    expect(database.listMonths().map(({ month, count }) => [month, count])).toEqual([["2026-11", 1]]);
    expect(database.weeklyCounts("2026-11-30", "2026-12-06")).toEqual({
      received: [{ day: "2026-11-30", count: 1 }],
      delivered: [{ day: "2026-12-01", count: 1 }],
    });
  });

  it("counts a delivered date only for orders whose current status is Delivered", () => {
    const database = createDatabase(":memory:");
    databases.push(database);
    database.saveRecords([
      record("ORDER-1", "30-11-2026 10:00", "Delivering", "01-12-2026 12:00"),
      record("ORDER-2", "30-11-2026 10:00", "Delivered", "01-12-2026 12:00"),
    ]);
    expect(database.weeklyCounts("2026-11-30", "2026-12-06").delivered)
      .toEqual([{ day: "2026-12-01", count: 1 }]);
  });

  it("rolls back the entire import on an invalid date", () => {
    const database = createDatabase(":memory:");
    databases.push(database);
    expect(() => database.saveRecords([
      record("ORDER-1", "30-11-2026 10:00"),
      record("ORDER-2", "31-11-2026 10:00"),
    ])).toThrow("Data inválida");
    expect(database.listMonths()).toEqual([]);
  });
});
