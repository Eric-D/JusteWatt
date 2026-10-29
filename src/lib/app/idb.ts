/** Stockage clé → valeur dans IndexedDB (données volumineuses, restent sur l'appareil). */
const DB = 'justewatt';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const r = indexedDB.open(DB, 1);
		r.onupgradeneeded = () => r.result.createObjectStore(STORE);
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}

async function tx<T>(
	mode: IDBTransactionMode,
	fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const r = fn(db.transaction(STORE, mode).objectStore(STORE));
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}

export const idb = {
	get: <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined),
	set: (key: string, value: unknown) =>
		tx('readwrite', (s) => s.put(value, key)).catch(() => undefined),
	del: (key: string) => tx('readwrite', (s) => s.delete(key)).catch(() => undefined),
	clear: () => tx('readwrite', (s) => s.clear()).catch(() => undefined)
};
