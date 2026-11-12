import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteExpense, getExpenses, saveExpense, replaceExpenses, getCustomCategories, saveCustomCategories } from '../src/db';
import type { Expense } from '../src/domain';

function expense(): Expense {
  return {
    id: 'stored', date: '2026-11-10', merchant: 'Tienda', amount: 1500,
    currency: 'MXN', category: 'otros', notes: '', createdAt: '2026-11-10T12:00:00Z',
    photo: new Blob(['photo'], { type: 'image/jpeg' }),
  };
}
beforeEach(async () => {
  vi.restoreAllMocks();
  for (const item of await getExpenses()) await deleteExpense(item.id);
  await saveCustomCategories([]);
});
describe('persistencia local en IndexedDB', () => {
  it('guarda y recupera datos y foto después de finalizar la transacción', async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await saveExpense(expense());
    const record = put.mock.calls[0][0];
    expect(record.photo).toBeUndefined();
    expect(record.photoData).toBeInstanceOf(ArrayBuffer);
    expect(record.photoType).toBe('image/jpeg');
    const stored = await getExpenses();
    expect(stored).toHaveLength(1);
    expect(stored[0].amount).toBe(1500);
    expect(await stored[0].photo!.text()).toBe('photo');
  });
  it('actualiza sin duplicar y elimina gasto y foto juntos', async () => {
    await saveExpense(expense());
    await saveExpense({ ...expense(), amount: 1800, photo: undefined });
    expect(await getExpenses()).toEqual([{ ...expense(), amount: 1800, photo: undefined }]);
    await deleteExpense('stored');
    expect(await getExpenses()).toEqual([]);
  });
  it('rechaza datos inválidos antes de escribir', async () => {
    await expect(saveExpense({ ...expense(), amount: -1 })).rejects.toThrow('importe');
    expect(await getExpenses()).toEqual([]);
  });
  it('propaga errores de cuota en vez de informar éxito', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    await expect(saveExpense(expense())).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await getExpenses()).toEqual([]);
  });
  it('no confirma ni conserva una escritura cuya transacción fue abortada', async () => {
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = put.apply(this, args);
      this.transaction.abort();
      return request;
    });
    await expect(saveExpense(expense())).rejects.toBeDefined();
    expect(await getExpenses()).toEqual([]);
  });
  it('restaura todos los registros y fotos en vez de mezclarlos con los anteriores', async () => {
    await saveExpense(expense());
    await replaceExpenses([{ ...expense(), id: 'restored', amount: 2500 }]);
    const records = await getExpenses();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('restored');
    expect(await records[0].photo!.text()).toBe('photo');
    await replaceExpenses([]);
    expect(await getExpenses()).toEqual([]);
  });
  it('revierte también el borrado inicial si falla una escritura al restaurar', async () => {
    await saveExpense(expense());
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    await expect(replaceExpenses([{ ...expense(), id: 'new' }])).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect((await getExpenses()).map(item => item.id)).toEqual(['stored']);
  });
  it('no borra datos si el respaldo contiene un gasto inválido o duplicado', async () => {
    await saveExpense(expense());
    await expect(replaceExpenses([{ ...expense(), amount: -1 }])).rejects.toThrow();
    await expect(replaceExpenses([expense(), expense()])).rejects.toThrow('duplicados');
    expect(await getExpenses()).toHaveLength(1);
  });
  it('guarda categorías sin gastos y las reemplaza junto con el respaldo', async () => {
    await saveCustomCategories(['custom:Mascotas']);
    expect(await getCustomCategories()).toEqual(['custom:Mascotas']);
    await replaceExpenses([{ ...expense(), category: 'custom:Educación' }], ['custom:Educación']);
    expect(await getCustomCategories()).toEqual(['custom:Educación']);
    expect((await getExpenses())[0].category).toBe('custom:Educación');
    await replaceExpenses([], []);
    expect(await getCustomCategories()).toEqual([]);
  });
  it('revierte gastos y categorías juntos si falla el guardado de categorías', async () => {
    await saveExpense(expense());
    await saveCustomCategories(['custom:Mascotas']);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'settings') throw new DOMException('Storage full', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(replaceExpenses([{ ...expense(), id: 'new' }], ['custom:Educación'])).rejects.toThrow();
    expect((await getExpenses()).map(item => item.id)).toEqual(['stored']);
    expect(await getCustomCategories()).toEqual(['custom:Mascotas']);
  });
});
