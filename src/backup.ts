import { validateCustomCategories, validateExpense, type CustomCategory, type Expense } from './domain';

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
interface BackupExpense extends Omit<Expense, 'photo'> {
  photo?: { type: string; data: string };
}
function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  }
  return btoa(chunks.join(''));
}
export async function exportBackup(expenses: Expense[], customCategories: CustomCategory[] = []): Promise<string> {
  customCategories = [...new Set([...customCategories, ...expenses.map(expense => expense.category)
    .filter((category): category is CustomCategory => category.startsWith('custom:'))])];
  validateCustomCategories(customCategories);
  const records: BackupExpense[] = [];
  for (const { photo, ...expense } of expenses) {
    records.push({
      ...expense,
      ...(photo ? { photo: { type: photo.type, data: base64(new Uint8Array(await photo.arrayBuffer())) } } : {}),
    });
  }
  const result = JSON.stringify({ format: 'mis-tickets', version: 1, createdAt: new Date().toISOString(), customCategories, expenses: records });
  if (new Blob([result]).size > MAX_BACKUP_BYTES) throw new Error('El respaldo supera 100 MB. Exporta también tus registros a CSV.');
  return result;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function importBackup(text: string): Expense[] {
  return importBackupData(text).expenses;
}
export function importBackupData(text: string): { expenses: Expense[]; customCategories: CustomCategory[] } {
  try {
    if (new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error();
    const backup: unknown = JSON.parse(text);
    if (!object(backup) || backup.format !== 'mis-tickets' || backup.version !== 1 ||
      !Array.isArray(backup.expenses) || backup.expenses.length > 10_000) throw new Error();
    const customCategories = backup.customCategories === undefined ? [] : backup.customCategories;
    validateCustomCategories(customCategories);
    const ids = new Set<string>();
    const expenses = backup.expenses.map((record: unknown): Expense => {
      if (!object(record) ||
        typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(record.id) || ids.has(record.id) ||
        typeof record.merchant !== 'string' || record.merchant.length > 160 ||
        typeof record.notes !== 'string' || record.notes.length > 2000 ||
        typeof record.date !== 'string' || typeof record.amount !== 'number' ||
        typeof record.category !== 'string' || record.currency !== 'MXN' ||
        typeof record.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(record.createdAt) ||
        !Number.isFinite(Date.parse(record.createdAt))) throw new Error();
      ids.add(record.id);
      const expense: Expense = {
        id: record.id, merchant: record.merchant, notes: record.notes,
        date: record.date, amount: record.amount, currency: 'MXN',
        category: record.category as Expense['category'], createdAt: record.createdAt,
      };
      validateExpense(expense);
      if (record.photo !== undefined) {
        const photo = record.photo;
        if (!object(photo) || typeof photo.type !== 'string' ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) ||
          typeof photo.data !== 'string' || !photo.data || photo.data.length > 36 * 1024 * 1024 ||
          !/^[a-zA-Z0-9+/]*={0,2}$/.test(photo.data)) throw new Error();
        const bytes = Uint8Array.from(atob(photo.data), char => char.charCodeAt(0));
        expense.photo = new Blob([bytes], { type: photo.type });
      }
      return expense;
    });
    const restoredCategories = [...new Set([...customCategories, ...expenses.map(expense => expense.category)
      .filter((category): category is CustomCategory => category.startsWith('custom:'))])];
    validateCustomCategories(restoredCategories);
    return { expenses, customCategories: restoredCategories };
  } catch {
    throw new Error('Respaldo inválido o incompatible. Selecciona un respaldo de Lorax ticket tracker (versión 1, máximo 100 MB). No se cambió ningún gasto.');
  }
}
