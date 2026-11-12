import type { StuckSnapshot } from "./stuck";
import { HISTORY_LIMIT, historyEntry, parseHistoryBackup, type HistoryEntry } from "./history";
import { isTreatment, type Treatment } from "./treatment";

const DATABASE = "stuck-monitor";
const STORE = "snapshots";
const LEGACY_TREATMENT_PREFIX = "treated:";
const TREATMENT_PREFIX = "treatment:";
const COLOR_PREFIX = "color:";

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error("Não foi possível abrir o banco local."));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Feche outras abas do STUCK e tente novamente."));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) return db.close();
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export async function saveSnapshot(snapshot: StuckSnapshot): Promise<HistoryEntry[]> {
  const entry = historyEntry(snapshot);
  const db = await openDatabase();
  try {
    return await new Promise<HistoryEntry[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      let updatedHistory: HistoryEntry[] = [];
      let abortMessage = "Não foi possível salvar. Verifique o espaço no navegador.";
      transaction.oncomplete = () => resolve(updatedHistory);
      transaction.onabort = () => reject(new Error(abortMessage));
      const store = transaction.objectStore(STORE);
      const request = store.get("history");
      request.onsuccess = () => {
        try {
          const history = request.result === undefined ? [] : parseHistoryBackup(JSON.stringify({ version: 1, entries: request.result }));
          store.put(snapshot, "current");
          updatedHistory = [entry, ...history].slice(0, HISTORY_LIMIT);
          store.put(updatedHistory, "history");
        } catch {
          abortMessage = "Não foi possível salvar: o histórico local está inválido. Restaure ou apague o histórico.";
          transaction.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}

export async function readHistory(): Promise<HistoryEntry[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get("history");
      request.onsuccess = () => {
        try {
          resolve(request.result === undefined ? [] : parseHistoryBackup(JSON.stringify({ version: 1, entries: request.result })));
        } catch {
          reject(new Error("Não foi possível ler o histórico salvo. Verifique os dados do navegador."));
        }
      };
      request.onerror = () => reject(new Error("Não foi possível ler o histórico salvo."));
      transaction.onabort = () => reject(new Error("A leitura do histórico foi interrompida."));
    });
  } finally {
    db.close();
  }
}

export async function replaceHistory(entries: HistoryEntry[]): Promise<void> {
  const validated = parseHistoryBackup(JSON.stringify({ version: 1, entries }));
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(validated, "history");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error("Não foi possível salvar o histórico. Verifique o espaço no navegador."));
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

export async function readTreatments(): Promise<Map<string, Treatment>> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const treatments = new Map<string, Treatment>();
      const transaction = db.transaction(STORE, "readwrite");
      const request = transaction.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = cursor.key;
        if (typeof key === "string" && key.startsWith(LEGACY_TREATMENT_PREFIX)) {
          cursor.delete();
        } else if (typeof key === "string" && key.startsWith(TREATMENT_PREFIX)) {
          if (!isTreatment(cursor.value)) {
            transaction.abort();
            return;
          }
          treatments.set(key.slice(TREATMENT_PREFIX.length), cursor.value);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(treatments);
      transaction.onabort = () => reject(new Error("Não foi possível ler os tratamentos salvos. Verifique os dados do navegador."));
    });
  } finally {
    db.close();
  }
}

export async function readTrackingColors(): Promise<Map<string, string>> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const colors = new Map<string, string>();
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = cursor.key;
        if (typeof key === "string" && key.startsWith(COLOR_PREFIX)) {
          if (!isHexColor(cursor.value)) {
            transaction.abort();
            return;
          }
          colors.set(key.slice(COLOR_PREFIX.length), cursor.value);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(colors);
      transaction.onabort = () => reject(new Error("Não foi possível ler as cores salvas. Verifique os dados do navegador."));
    });
  } finally {
    db.close();
  }
}

export async function setTrackingColor(tracking: string, color: string | null): Promise<void> {
  if (color !== null && !isHexColor(color)) throw new Error("Cor de marcação inválida.");
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      if (color !== null) store.put(color, COLOR_PREFIX + tracking);
      else store.delete(COLOR_PREFIX + tracking);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error("Não foi possível salvar a cor. Verifique o espaço no navegador."));
    });
  } finally {
    db.close();
  }
}

export async function setTrackingTreatment(tracking: string, treatment: Treatment | null): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      if (treatment !== null) store.put(treatment, TREATMENT_PREFIX + tracking);
      else store.delete(TREATMENT_PREFIX + tracking);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error("Não foi possível salvar o tratamento. Verifique o espaço no navegador."));
    });
  } finally {
    db.close();
  }
}
