import { describe, expect, it } from "vitest";
import { delivered, extractTrackingNumbers, processStuckFiles, risk } from "./stuck";

const stuckHeader = "Operação,Cidade,Entegador,TN,Status,Dias parados,Valor,Palavra Chave,Avaria";
const statusHeader = "Order ID,Status,Driver Name,Driver Phone,Current Station,Current Station Received Time,Delivered Time";
const stuckRow = (id: string, days: string) => `OP,Cidade,Motorista,${id},Hub_Received,${days},22.41,null,Não`;
const statusRow = (id: string, status: string) => `${id},${status},Pessoa,,Estação,,`;

describe("relatórios STUCK", () => {
  it("cruza por TN e Order ID, conserva apenas a lista STUCK e distingue entregues", () => {
    const snapshot = processStuckFiles(
      [stuckHeader, stuckRow("A", "15"), stuckRow("B", "16"), stuckRow("C", "3")].join("\n"),
      [statusHeader, statusRow("A", "Delivered"), statusRow("B", "OnHold"), statusRow("D", "Delivered")].join("\n"),
    );
    expect(snapshot.records).toHaveLength(3);
    expect(delivered(snapshot.records[0])).toBe(true);
    expect(delivered(snapshot.records[1])).toBe(false);
    expect(snapshot.records[2].updatedStatus).toBeNull();
    expect(snapshot.unmatchedUpdates).toBe(1);
    expect(risk(snapshot.records[0])).toBe("15 dias");
    expect(risk(snapshot.records[1])).toBe("Acima de 15 dias");
    expect(risk(snapshot.records[2])).toBe("Abaixo de 15 dias");
  });

  it("rejeita cabeçalho errado, IDs repetidos e dias inválidos", () => {
    const status = [statusHeader, statusRow("A", "Delivered")].join("\n");
    expect(() => processStuckFiles("TN,Status\nA,Delivered", status)).toThrow("faltam as colunas");
    expect(() => processStuckFiles([stuckHeader, stuckRow("A", "3"), stuckRow("A", "4")].join("\n"), status)).toThrow("duplicado");
    expect(() => processStuckFiles([stuckHeader, stuckRow("A", "3,5")].join("\n"), status)).toThrow();
    expect(() => processStuckFiles([stuckHeader, stuckRow("A", "-1")].join("\n"), status)).toThrow("Dias parados inválido");
    expect(() => processStuckFiles([stuckHeader, stuckRow("A", "3")].join("\n"), [statusHeader, statusRow("A", "Delivered"), statusRow("A", "OnHold")].join("\n"))).toThrow("duplicado");
  });

  it("extrai os códigos TN do relatório STUCK", () => {
    expect(extractTrackingNumbers([stuckHeader, stuckRow("A", "1"), stuckRow("B", "2")].join("\n"))).toEqual(["A", "B"]);
  });
});
