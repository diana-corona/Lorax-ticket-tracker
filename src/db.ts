import type { Expense } from './domain';
import { validateExpense } from './domain';

let connection: Promise<IDBDatabase> | undefined;
type StoredExpense = Omit<Expense, 'photo'> & { photoData?: ArrayBuffer; photoType?: string; photo?: Blob };
export let sessionOnly = false;
let sessionExpenses: Expense[] = [];
export function enableSessionStorage() {
  sessionOnly = true;
  sessionExpenses = [];
}
function database(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mis-tickets', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('expenses', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Cierra otras pestañas de la app e inténtalo otra vez.'));
    }).catch(error => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('expenses', mode);
    const request = action(tx.objectStore('expenses'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error('No se pudo guardar el cambio.'));
    tx.onerror = () => reject(tx.error ?? request.error);
  });
}
export async function getExpenses(): Promise<Expense[]> {
  if (sessionOnly) return structuredClone(sessionExpenses);
  const records = await transaction<StoredExpense[]>('readonly', store => store.getAll());
  return records.map(({ photoData, photoType, photo, ...expense }) => ({
    ...expense,
    photo: photoData ? new Blob([photoData], { type: photoType ?? 'image/jpeg' }) : photo,
  }));
}
export async function saveExpense(expense: Expense): Promise<void> {
  validateExpense(expense);
  if (sessionOnly) {
    sessionExpenses = [...sessionExpenses.filter(item => item.id !== expense.id), structuredClone(expense)];
    return;
  }
  const record = await serializeExpense(expense);
  await transaction('readwrite', store => store.put(record));
}
async function serializeExpense(expense: Expense): Promise<StoredExpense> {
  const { photo, ...fields } = expense;
  // ArrayBuffer avoids WebKit failures persisting Blob data in some contexts.
  return photo
    ? { ...fields, photoData: await photo.arrayBuffer(), photoType: photo.type }
    : fields;
}
export async function deleteExpense(id: string): Promise<void> {
  if (sessionOnly) {
    sessionExpenses = sessionExpenses.filter(item => item.id !== id);
    return;
  }
  await transaction('readwrite', store => store.delete(id));
}
export async function replaceExpenses(expenses: Expense[]): Promise<void> {
  const ids = new Set<string>();
  for (const expense of expenses) {
    validateExpense(expense);
    if (ids.has(expense.id)) throw new Error('El respaldo contiene identificadores duplicados.');
    ids.add(expense.id);
  }
  if (sessionOnly) {
    sessionExpenses = structuredClone(expenses);
    return;
  }
  const records = await Promise.all(expenses.map(serializeExpense));
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('expenses', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('No se pudo restaurar el respaldo. Se conservaron los gastos anteriores.'));
    tx.onerror = () => reject(tx.error);
    try {
      const store = tx.objectStore('expenses');
      store.clear();
      for (const record of records) store.put(record);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}
