import { describe, expect, it } from 'vitest';
import { enableSessionStorage, saveExpense, getExpenses, deleteExpense, replaceExpenses, sessionOnly } from '../src/db';
import type { Expense } from '../src/domain';

const expense: Expense = {
  id: 'session-one', date: '2026-11-10', merchant: 'Solo en memoria', amount: 5000,
  category: 'otros', currency: 'MXN', notes: '', createdAt: '2026-11-10T12:00:00Z',
};
describe('modo temporal explícito', () => {
  it('funciona sin IndexedDB, permite editar y no expone referencias mutables', async () => {
    enableSessionStorage();
    expect(sessionOnly).toBe(true);
    await saveExpense(expense);
    const snapshot = await getExpenses();
    snapshot[0].amount = 999;
    expect((await getExpenses())[0].amount).toBe(5000);
    await saveExpense({ ...expense, amount: 2000 });
    expect(await getExpenses()).toEqual([{ ...expense, amount: 2000 }]);
    await deleteExpense(expense.id);
    expect(await getExpenses()).toEqual([]);
  });
  it('restaura sin almacenamiento y no reemplaza datos si un registro es inválido', async () => {
    enableSessionStorage();
    await replaceExpenses([expense]);
    await expect(replaceExpenses([{ ...expense, amount: 0 }])).rejects.toThrow();
    expect(await getExpenses()).toEqual([expense]);
  });
});
