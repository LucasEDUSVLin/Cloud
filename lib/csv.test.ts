import { describe, expect, it } from "vitest";
import { parseLogisticsCsv } from "./csv";

describe("parseLogisticsCsv", () => {
  it("imports only approved columns and drops the rest", () => {
    const csv = [
      "Order ID,Buyer Name,Location Type,Postal Code,Driver ID,Driver Name,Driver Phone,Current Station Received Time,Delivered Time,OnHold Time,Status,Current Station,Buyer Address,Latitude",
      "A-1,Nome,Home,00000-000,12,Maria,11999999999,09-11-2026 10:00,09-11-2026 12:00,0,Delivered,Station,Private address,-10.0",
    ].join("\n");

    const [record] = parseLogisticsCsv(csv);

    expect(record["Order ID"]).toBe("A-1");
    expect(Object.keys(record)).toHaveLength(12);
    expect(record).not.toHaveProperty("Buyer Address");
    expect(record).not.toHaveProperty("Latitude");
  });

  it("rejects CSV files missing required columns", () => {
    expect(() => parseLogisticsCsv("Order ID,Status\nA-1,Delivered")).toThrow(
      "Colunas obrigatórias ausentes",
    );
  });

  it("rejects rows without an order ID", () => {
    const csv = "Order ID,Buyer Name,Location Type,Postal Code,Driver ID,Driver Name,Driver Phone,Current Station Received Time,Delivered Time,OnHold Time,Status,Current Station\n,Nome,Home,00000-000,12,Maria,11999999999,,,,Delivered,Station";
    expect(() => parseLogisticsCsv(csv)).toThrow("não contém Order ID");
  });
});
