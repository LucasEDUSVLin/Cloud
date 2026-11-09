import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { processStuckFiles } from "./stuck";
import { readSnapshot, saveSnapshot } from "./stuck-storage";

const status = "Order ID,Status,Driver Name,Driver Phone,Current Station,Current Station Received Time,Delivered Time\nA,Delivered,,,Station,,";
const stuck = "Operação,Cidade,Entegador,TN,Status,Dias parados,Valor,Palavra Chave,Avaria\nX,Cidade,Nome,A,OnHold,3,10,null,Não";

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("cloud-stuck");
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
});
