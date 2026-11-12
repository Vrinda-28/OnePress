const STORE = 'notices';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('onepress-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other OnePress tabs and try again.'));
  });
}

async function transaction(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const listNotices = () => transaction('readonly', (store) => store.getAll());
export const saveNotice = (notice) => transaction('readwrite', (store) => store.put(notice));
export const deleteNotice = (id) => transaction('readwrite', (store) => store.delete(id));

export function download(content, name, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
