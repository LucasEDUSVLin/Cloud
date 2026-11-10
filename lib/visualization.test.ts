import { describe, expect, it } from "vitest";
import { chartCounts } from "./visualization";
import type { Treatment } from "./treatment";

describe("contagens dos gráficos", () => {
  it("compara dias com o limite e conta somente classificações do relatório atual", () => {
    const records = [
      { tracking: "A", days: 14, updatedStatus: "OnHold" },
      { tracking: "B", days: 15, updatedStatus: "OnHold" },
      { tracking: "C", days: 16, updatedStatus: "Delivered" },
      { tracking: "D", days: 2, updatedStatus: null },
    ];
    const treatments = new Map<string, Treatment>([
      ["A", "Em análise"], ["B", "Em análise"], ["C", "Perdido"], ["fora", "Entregue"],
    ]);
    const result = chartCounts(records, treatments);
    expect(result.days).toEqual({ below: 2, atLimit: 1, above: 1 });
    expect(result.unclassified).toBe(1);
    expect(result.classification.get("Em análise")).toBe(2);
    expect(result.classification.get("Perdido")).toBe(1);
    expect(result.classification.get("Entregue")).toBe(0);
    expect([...result.classification.values()].reduce((sum, count) => sum + count, result.unclassified)).toBe(records.length);
    expect(result.byStatus.get("OnHold")).toEqual({ below: 1, atLimit: 1, above: 0 });
    expect(result.byStatus.get("Delivered")).toEqual({ below: 0, atLimit: 0, above: 1 });
    expect(result.byStatus.get("")).toEqual({ below: 1, atLimit: 0, above: 0 });
  });

  it("retorna contagens zeradas sem mercadorias", () => {
    const result = chartCounts([], new Map());
    expect(result.days).toEqual({ below: 0, atLimit: 0, above: 0 });
    expect(result.unclassified).toBe(0);
    expect([...result.classification.values()].every((count) => count === 0)).toBe(true);
    expect(result.byStatus.size).toBe(0);
  });
});
