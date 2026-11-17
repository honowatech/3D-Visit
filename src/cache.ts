/**
 * Mémoire locale des sondes de lumière (IndexedDB) : une fois calculé sur un appareil,
 * l'éclairage d'une heure du jour se recharge au lieu d'être recalculé.
 * Tout échec (navigation privée, quota…) est silencieux : on recalcule, voilà tout.
 */
const DB = 'visite-3d', STORE = 'sondes';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadProbes(key: string): Promise<Uint16Array | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result instanceof Uint16Array ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Enregistre un éclairage et oublie ceux d'une version antérieure de la maison (`prefix` différent). */
export async function saveProbes(prefix: string, key: string, data: Uint16Array) {
  try {
    const db = await open();
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    store.put(data, key);
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      for (const k of keys.result) if (typeof k === 'string' && !k.startsWith(prefix)) store.delete(k);
    };
  } catch { /* stockage indisponible */ }
}
