import type { StuckSnapshot } from "./stuck";

const DATABASE = "cloud-stuck";
const STORE = "snapshots";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error("Não foi possível abrir o banco local."));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Feche outras abas do Cloud e tente novamente."));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) return db.close();
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export async function saveSnapshot(snapshot: StuckSnapshot): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error("Não foi possível salvar. Verifique o espaço no navegador."));
      transaction.objectStore(STORE).put(snapshot, "current");
    });
  } finally {
    db.close();
  }
}

export async function readSnapshot(): Promise<StuckSnapshot | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get("current");
      request.onsuccess = () => resolve((request.result as StuckSnapshot | undefined) ?? null);
      request.onerror = () => reject(new Error("Não foi possível ler o banco local."));
      transaction.onabort = () => reject(new Error("A leitura do banco local foi interrompida."));
    });
  } finally {
    db.close();
  }
}
