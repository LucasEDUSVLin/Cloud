import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { processStuckFiles } from "./stuck";
import { readSnapshot, readTreatedTracking, saveSnapshot, setTrackingTreated } from "./stuck-storage";

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
    const first = processStuckFiles(stuck, status);
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
    await setTrackingTreated("A", true);
    expect(await readTreatedTracking()).toEqual(new Set(["A"]));
    await saveSnapshot(processStuckFiles(stuck.replace(",A,", ",B,"), status.replace("A,Delivered", "B,Delivered")));
    expect(await readTreatedTracking()).toEqual(new Set(["A"]));
    await saveSnapshot(processStuckFiles(stuck, status));
    expect(await readTreatedTracking()).toEqual(new Set(["A"]));
    await setTrackingTreated("A", false);
    expect(await readTreatedTracking()).toEqual(new Set());
    expect((await readSnapshot())?.records[0].tracking).toBe("A");
  });

  it("salva as marcações de TNs diferentes sem sobrescrever outras", async () => {
    await Promise.all([setTrackingTreated("A", true), setTrackingTreated("B", true)]);
    expect(await readTreatedTracking()).toEqual(new Set(["A", "B"]));
    await setTrackingTreated("A", false);
    expect(await readTreatedTracking()).toEqual(new Set(["B"]));
  });
});
