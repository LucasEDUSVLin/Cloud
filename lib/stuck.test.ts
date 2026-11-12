import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { delivered, exportFilename, exportSelectedCsv, extractTrackingNumbers, formatCurrency, parseValueCents, processStuckFiles, risk, valueTotals } from "./stuck";

const stuckHeader = "Operação,Cidade,Entegador,TN,Status,Dias parados,Valor,Palavra Chave,Avaria";
const statusHeader = "Order ID,Status,Driver Name,Driver Phone,Current Station,Current Station Received Time,Delivered Time";
const stuckRow = (id: string, days: string) => `OP,Cidade,Motorista,${id},Hub_Received,${days},22.41,null,Não`;
const statusRow = (id: string, status: string) => `${id},${status},Pessoa,,Estação,,`;

describe("relatórios STUCK", () => {
  it("nomeia o arquivo usando a data e hora locais da exportação", () => {
    expect(exportFilename(new Date(2026, 10, 11, 12, 55))).toBe("Stuck-11-11-2026-12-55.csv");
    expect(exportFilename(new Date(2026, 0, 2, 3, 4))).toBe("Stuck-02-01-2026-03-04.csv");
  });

  it("cruza por TN e Order ID, conserva apenas a lista STUCK e distingue entregues", () => {
    const snapshot = processStuckFiles(
      [stuckHeader, stuckRow("A", "15"), stuckRow("B", "16"), stuckRow("C", "3")].join("\n"),
      [statusHeader, statusRow("A", "Delivered"), statusRow("B", "OnHold"), statusRow("D", "Delivered")].join("\n"),
    );
    expect(snapshot.records).toHaveLength(3);
    expect(delivered(snapshot.records[0])).toBe(true);
    expect(delivered(snapshot.records[1])).toBe(false);
    expect(snapshot.records[0].updatedStatus).toBe("Delivered");
    expect(snapshot.records[0].stuckStatus).toBe("Hub_Received");
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

  it("informa a linha física após linhas vazias e campos com quebras de linha", () => {
    const status = [statusHeader, statusRow("A", "Delivered"), statusRow("B", "OnHold")].join("\n");
    const csv = [stuckHeader, 'OP,"Cidade\nCentro",Motorista,A,Hub_Received,3,22.41,null,Não', "", stuckRow("B", "-1")].join("\n");
    expect(() => processStuckFiles(csv, status)).toThrow("Dias parados inválido na linha 5");
    expect(() => processStuckFiles(csv.replace(stuckRow("B", "-1"), stuckRow("A", "1")), status)).toThrow("TN duplicado na linha 5");
    expect(() => processStuckFiles(csv.replace(stuckRow("B", "-1"), "OP,Cidade"), status)).toThrow("Arquivo STUCK, linha 5: Número de colunas incorreto. Confira os separadores.");
  });

  it("apresenta erros de leitura do CSV em português", () => {
    const status = [statusHeader, statusRow("A", "Delivered")].join("\n");
    expect(() => processStuckFiles(`${stuckHeader}\nOP,"Cidade`, status)).toThrow("Arquivo STUCK: Aspas não fechadas. Confira o CSV.");
    expect(() => processStuckFiles([stuckHeader, stuckRow("A", "1").replace("22.41", "abc")].join("\n"), status))
      .toThrow("Valor inválido na linha 2. Use ponto decimal e até 2 casas.");
  });

  it("rejeita uma soma que ultrapasse a precisão inteira mesmo com valores individuais válidos", () => {
    const csv = [stuckHeader, stuckRow("A", "1").replace("22.41", "90071992547409.90"), stuckRow("B", "1").replace("22.41", "0.03")].join("\n");
    expect(() => processStuckFiles(csv, [statusHeader, statusRow("A", "LOST"), statusRow("B", "LOST")].join("\n"))).toThrow("soma dos valores excede");
  });

  it("formata centavos com precisão mesmo perto do limite seguro", () => {
    expect(formatCurrency(9007199254740991).replace(/\s/g, " ")).toBe("R$ 90.071.992.547.409,91");
    expect(formatCurrency(5).replace(/\s/g, " ")).toBe("R$ 0,05");
  });

  it("extrai os códigos TN do relatório STUCK", () => {
    expect(extractTrackingNumbers([stuckHeader, stuckRow("A", "1"), stuckRow("B", "2")].join("\n"))).toEqual(["A", "B"]);
  });

  it("soma os valores por status atualizado e considera LOST somente quando explícito", () => {
    const snapshot = processStuckFiles(
      [stuckHeader, stuckRow("A", "1"), stuckRow("B", "2"), stuckRow("C", "3")].join("\n"),
      [statusHeader, statusRow("A", "LOST"), statusRow("B", "lost"), statusRow("C", "OnHold")].join("\n"),
    );
    const totals = valueTotals(snapshot.records);
    expect(totals.totalCents).toBe(6723);
    expect(totals.lostCents).toBe(4482);
    expect(totals.byStatus.get("LOST")).toBe(2241);
    expect(totals.byStatus.get("lost")).toBe(2241);
    expect(totals.byStatus.get("OnHold")).toBe(2241);
    expect(() => parseValueCents("1,234.56")).toThrow();
  });

  it("rejeita valor vazio ou fora do formato numérico do CSV", () => {
    expect(() => processStuckFiles(
      [stuckHeader, stuckRow("A", "1").replace("22.41", "")].join("\n"),
      [statusHeader, statusRow("A", "LOST")].join("\n"),
    )).toThrow("Valor inválido");
    expect(parseValueCents("990")).toBe(99000);
    expect(parseValueCents("910.8")).toBe(91080);
  });

  it("exporta apenas os dados atualizados selecionados com os cabeçalhos originais", () => {
    const snapshot = processStuckFiles(
      `${stuckHeader}\n${stuckRow("A", "1")}\n${stuckRow("B", "2")}`,
      `${statusHeader}, Nota extra \n${statusRow("A", "Delivered")},"texto; com vírgula, aspas ""e quebra\nlinha"""`,
    );
    const csv = exportSelectedCsv(snapshot, new Set(["A"]));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const parsed = Papa.parse<Record<string, string>>(csv.slice(1), { header: true, delimiter: ";", skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.meta.fields).toEqual([...statusHeader.split(","), " Nota extra "]);
    expect(parsed.data[0][" Nota extra "]).toBe('texto; com vírgula, aspas "e quebra\nlinha"');
    expect(parsed.data[0].Status).toBe("Delivered");
    expect(parsed.data[0]["Order ID"]).toBe("A");
    expect(() => exportSelectedCsv(snapshot, new Set(["A", "B"]))).toThrow("B");
    expect(() => exportSelectedCsv(snapshot, new Set(["B"]))).toThrow("Sem dados atualizados");
    expect(() => exportSelectedCsv(snapshot, new Set())).toThrow("Selecione");
    expect(() => exportSelectedCsv({ ...snapshot, exportFields: undefined }, new Set(["A"]))).toThrow("Importe novamente");
    const legacy = { ...snapshot, exportFields: { stuck: snapshot.exportFields!.stuck, updated: snapshot.exportFields!.updated } };
    expect(Papa.parse(exportSelectedCsv(legacy, new Set(["A"])).slice(1), { header: true, delimiter: ";" }).meta.fields).toEqual([...statusHeader.split(","), "Nota extra"]);
  });

  it("protege células que possam ser interpretadas como fórmulas", () => {
    const snapshot = processStuckFiles(
      [stuckHeader, stuckRow("A", "1")].join("\n"),
      `${statusHeader},Extra1,Extra2,Extra3\n${statusRow("A", "OnHold")}, +1,\tvalor,-9`,
    );
    const parsed = Papa.parse<Record<string, string>>(exportSelectedCsv(snapshot, new Set(["A"])).slice(1), { header: true, delimiter: ";" });
    expect(parsed.data[0].Extra1).toBe("' +1");
    expect(parsed.data[0].Extra2).toBe("'\tvalor");
    expect(parsed.data[0].Extra3).toBe("'-9");
  });
});
