import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IMPORT_COLUMNS, type LogisticsRecord } from "./csv";
import { readRecords, saveRecords, summarize } from "./storage";

function record(id: string, received: string, status = "Delivering", delivered = ""): LogisticsRecord {
  const row = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, ""])) as LogisticsRecord;
  row["Order ID"] = id;
  row["Current Station Received Time"] = received;
  row.Status = status;
  row["Delivered Time"] = delivered;
  return row;
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("cloud-logistica");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe("armazenamento local", () => {
  it("atualiza o pedido sem duplicá-lo e soma a semana entre meses", async () => {
    await saveRecords([record("1", "30-11-2026 10:00")]);
    await saveRecords([record("1", "30-11-2026 10:00", "Delivered", "01-12-2026 12:00")]);
    const all = await readRecords();
    expect(all).toHaveLength(1);
    const summary = summarize(all, "2026-11", "2026-12-01");
    expect(summary.months).toEqual([{ month: "2026-11", count: 1 }]);
    expect(summary.records[0].Status).toBe("Delivered");
    expect(summary.days[0]).toEqual({ date: "2026-11-30", received: 1, delivered: 0 });
    expect(summary.days[1]).toEqual({ date: "2026-12-01", received: 0, delivered: 1 });
  });

  it("rejeita importações inválidas sem alterar o banco", async () => {
    const valid = record("1", "30-11-2026 10:00");
    await expect(saveRecords([valid, record("2", "31-11-2026 10:00")])).rejects.toThrow("Data de recebimento inválida");
    await expect(saveRecords([valid, valid])).rejects.toThrow("duplicado");
    await expect(saveRecords([])).rejects.toThrow("1 a 10.000");
    expect(await readRecords()).toEqual([]);
  });

  it("persiste apenas campos aprovados e conta somente status atual entregue", async () => {
    const first = { ...record("1", "30-11-2026 10:00", "Delivering", "01-12-2026 10:00"), "Buyer Address": "descartar" };
    await saveRecords([first, record("2", "30-11-2026 10:00", "Delivered", "01-12-2026 10:00")]);
    const all = await readRecords();
    expect(all[0]).not.toHaveProperty("Buyer Address");
    expect(summarize(all, "2026-11", "2026-12-01").days[1].delivered).toBe(1);
  });
});
