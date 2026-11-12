import { describe, expect, it } from "vitest";
import { chartCounts, matchesChartFilter } from "./visualization";
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
  });

  it("retorna contagens zeradas sem mercadorias", () => {
    const result = chartCounts([], new Map());
    expect(result.days).toEqual({ below: 0, atLimit: 0, above: 0 });
    expect(result.unclassified).toBe(0);
    expect([...result.classification.values()].every((count) => count === 0)).toBe(true);
  });

  it("filtra as mesmas faixas de dias exibidas no gráfico", () => {
    const records = [14, 15, 16].map((days) => ({ tracking: String(days), days }));
    expect(records.filter((record) => matchesChartFilter(record, undefined, { kind: "days", value: "below" })).map((record) => record.days)).toEqual([14]);
    expect(records.filter((record) => matchesChartFilter(record, undefined, { kind: "days", value: "atLimit" })).map((record) => record.days)).toEqual([15]);
    expect(records.filter((record) => matchesChartFilter(record, undefined, { kind: "days", value: "above" })).map((record) => record.days)).toEqual([16]);
  });

  it("distingue uma classificação específica de mercadorias sem classificação", () => {
    const record = { tracking: "A", days: 15 };
    expect(matchesChartFilter(record, undefined, { kind: "treatment", value: null })).toBe(true);
    expect(matchesChartFilter(record, "Em análise", { kind: "treatment", value: null })).toBe(false);
    expect(matchesChartFilter(record, "Em análise", { kind: "treatment", value: "Em análise" })).toBe(true);
    expect(matchesChartFilter(record, "Perdido", { kind: "treatment", value: "Em análise" })).toBe(false);
  });
});
