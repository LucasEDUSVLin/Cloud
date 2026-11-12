import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { processStuckFiles } from "./stuck";
import { readSnapshot, readTrackingColors, readTreatments, saveSnapshot, setTrackingColor, setTrackingTreatment } from "./stuck-storage";
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

  it("não altera o histórico anterior nem impede a importação se ele for inválido", async () => {
    const snapshot = processStuckFiles(stuck, status);
    await saveSnapshot(snapshot);
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
    const updated = processStuckFiles(stuck.replace(",3,", ",16,"), status);
    await saveSnapshot(updated);
    expect(await readSnapshot()).toEqual(updated);
    const history = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("snapshots").objectStore("snapshots").get("history");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    expect(history).toBe("inválido");
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
