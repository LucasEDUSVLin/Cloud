import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { processStuckFiles } from "./stuck";
import { readHistory, readSnapshot, readTrackingColors, readTreatments, replaceHistory, saveSnapshot, setTrackingColor, setTrackingTreatment } from "./stuck-storage";
import { compareHistory, parseHistoryBackup } from "./history";
import { TREATMENT_OPTIONS } from "./treatment";

const status = "Order ID,Status,Driver Name,Driver Phone,Current Station,Current Station Received Time,Delivered Time\nA,Delivered,,,Station,,";
const stuck = "Operação,Cidade,Entegador,TN,Status,Dias parados,Valor,Palavra Chave,Avaria\nX,Cidade,Nome,A,OnHold,3,10,null,Não";

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("stuck-monitor");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe("banco local de STUCK", () => {
  it("persiste e substitui somente após receber os dois arquivos válidos", async () => {
    const first = {
      ...processStuckFiles(stuck, status),
      files: { stuck: { name: "stuck.csv", contents: stuck }, updated: { name: "status.csv", contents: status } },
    };
    await saveSnapshot(first);
    expect(await readSnapshot()).toEqual(first);
    expect(() => processStuckFiles("invalido", status)).toThrow();
    expect(await readSnapshot()).toEqual(first);
    const second = processStuckFiles(stuck.replace(",3,", ",16,"), status.replace("A,Delivered,", "A,OnHold,"));
    await saveSnapshot(second);
    expect(await readSnapshot()).toEqual(second);
  });

  it("mantém o tratamento por TN mesmo quando sai da lista e retorna", async () => {
    await saveSnapshot(processStuckFiles(stuck, status));
    await setTrackingTreatment("A", "Em análise");
    expect(await readTreatments()).toEqual(new Map([["A", "Em análise"]]));
    await saveSnapshot(processStuckFiles(stuck.replace(",A,", ",B,"), status.replace("A,Delivered", "B,Delivered")));
    expect(await readTreatments()).toEqual(new Map([["A", "Em análise"]]));
    await saveSnapshot(processStuckFiles(stuck, status));
    expect(await readTreatments()).toEqual(new Map([["A", "Em análise"]]));
    await setTrackingTreatment("A", null);
    expect(await readTreatments()).toEqual(new Map());
    expect((await readSnapshot())?.records[0].tracking).toBe("A");
  });

  it("salva as marcações de TNs diferentes sem sobrescrever outras", async () => {
    await Promise.all([setTrackingTreatment("A", "Perdido"), setTrackingTreatment("B", "Entregue")]);
    expect(await readTreatments()).toEqual(new Map([["A", "Perdido"], ["B", "Entregue"]]));
    await setTrackingTreatment("A", null);
    expect(await readTreatments()).toEqual(new Map([["B", "Entregue"]]));
  });

  it("salva e altera cada uma das opções", async () => {
    for (const option of TREATMENT_OPTIONS) {
      await setTrackingTreatment("A", option);
      expect((await readTreatments()).get("A")).toBe(option);
    }
  });

  it("salva cores por TN, preserva outras cores e valida valores", async () => {
    await Promise.all([setTrackingColor("A", "#f4cccc"), setTrackingColor("B", "#6d9eeb")]);
    expect(await readTrackingColors()).toEqual(new Map([["A", "#f4cccc"], ["B", "#6d9eeb"]]));
    await setTrackingColor("A", null);
    expect(await readTrackingColors()).toEqual(new Map([["B", "#6d9eeb"]]));
    await expect(setTrackingColor("B", "red")).rejects.toThrow("Cor de marcação inválida");
  });

  it("guarda as sete últimas importações e compara novos, ausentes e mudanças de status", async () => {
    for (let i = 0; i < 7; i++) await saveSnapshot(processStuckFiles(stuck, status));
    const oldestId = (await readHistory())[6].id;
    const changed = processStuckFiles(`${stuck}\nX,Cidade,Nome,B,OnHold,4,10,null,Não`, status.replace("A,Delivered", "A,OnHold") + "\nB,Delivered,,,Station,,");
    await saveSnapshot(changed);
    const history = await readHistory();
    expect(history).toHaveLength(7);
    expect(history.some((entry) => entry.id === oldestId)).toBe(false);
    expect(compareHistory(history[0], history[1])).toEqual({
      added: ["B"], removed: [], changed: [{ tracking: "A", before: "Delivered", after: "OnHold" }],
    });
    expect(compareHistory(history[1], history[0]).removed).toEqual(["B"]);
    expect(await readSnapshot()).toEqual(changed);
  });

  it("não substitui o relatório quando o histórico armazenado é inválido", async () => {
    const original = processStuckFiles(stuck, status);
    await saveSnapshot(original);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("stuck-monitor", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put("inválido", "history");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    await expect(saveSnapshot(processStuckFiles(stuck.replace(",3,", ",16,"), status))).rejects.toThrow("histórico local está inválido");
    expect(await readSnapshot()).toEqual(original);
  });

  it("valida, restaura e apaga apenas o histórico", async () => {
    const snapshot = processStuckFiles(stuck, status);
    await saveSnapshot(snapshot);
    await setTrackingTreatment("A", "Em análise");
    const entries = await readHistory();
    const backup = JSON.stringify({ version: 1, entries });
    await replaceHistory([]);
    expect(await readHistory()).toEqual([]);
    await replaceHistory(parseHistoryBackup(backup));
    expect(await readHistory()).toEqual(entries);
    expect(await readSnapshot()).toEqual(snapshot);
    expect((await readTreatments()).get("A")).toBe("Em análise");
    expect(() => parseHistoryBackup("{")).toThrow("JSON válido");
    expect(() => parseHistoryBackup(JSON.stringify({ version: 1, entries: [...entries, entries[0]] }))).toThrow("inválida");
    expect(() => parseHistoryBackup(JSON.stringify({ version: 1, entries: Array(8).fill(entries[0]) }))).toThrow("limite");
  });

  it("remove somente as antigas marcações, sem apagar o relatório ou classificações novas", async () => {
    const snapshot = processStuckFiles(stuck, status);
    await saveSnapshot(snapshot);
    await setTrackingTreatment("B", "Débito base");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("stuck-monitor", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(true, "treated:A");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    expect(await readTreatments()).toEqual(new Map([["B", "Débito base"]]));
    const legacy = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("snapshots").objectStore("snapshots").get("treated:A");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    expect(legacy).toBeUndefined();
    expect(await readSnapshot()).toEqual(snapshot);
  });
});
