import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup, importBackupData } from '../src/backup';
import type { Expense } from '../src/domain';

const expense: Expense = {
  id: 'backup-one', date: '2026-11-10', merchant: 'Café "Sol" <local>', amount: 12505,
  category: 'restaurantes', currency: 'MXN', notes: 'Primera línea\nSegunda línea',
  createdAt: '2026-11-10T12:00:00Z',
};
const document = (records: unknown[]) => JSON.stringify({ format: 'mis-tickets', version: 1, expenses: records });
describe('respaldo completo', () => {
  it('recupera los datos exactos y los bytes de una foto grande sin perder acentos', async () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
    const photo = new Blob([bytes], { type: 'image/jpeg' });
    const encoded = await exportBackup([{ ...expense, photo }]);
    const decoded = importBackup(encoded);
    expect(decoded[0]).toMatchObject(expense);
    expect(decoded[0].photo?.type).toBe('image/jpeg');
    expect(new Uint8Array(await decoded[0].photo!.arrayBuffer())).toEqual(bytes);
  });
  it('recupera gastos sin foto y permite un respaldo vacío', async () => {
    expect(importBackup(await exportBackup([expense]))).toEqual([expense]);
    expect(importBackup(await exportBackup([]))).toEqual([]);
  });
  it('conserva categorías personales usadas y sin gastos y admite respaldos antiguos', async () => {
    const customExpense: Expense = { ...expense, category: 'custom:Mascotas <&">' };
    const encoded = await exportBackup([customExpense], ['custom:Educación']);
    expect(importBackupData(encoded)).toEqual({
      expenses: [customExpense], customCategories: ['custom:Educación', 'custom:Mascotas <&">'],
    });
    expect(importBackupData(document([expense]))).toEqual({ expenses: [expense], customCategories: [] });
    expect(importBackupData(await exportBackup([], ['custom:Educación']))).toEqual({
      expenses: [], customCategories: ['custom:Educación'],
    });
  });
  it.each([null, 'Mascotas', ['invalid'], ['custom:'], ['custom:super'], ['custom:Educación', 'custom:educacion']])(
    'rechaza metadatos de categorías inválidos: %j', customCategories => {
      expect(() => importBackupData(JSON.stringify({
        format: 'mis-tickets', version: 1, expenses: [expense], customCategories,
      }))).toThrow('No se cambió ningún gasto');
    },
  );
  it.each([
    'not json', '{}', '{"format":"otra","version":1,"expenses":[]}',
    '{"format":"mis-tickets","version":2,"expenses":[]}',
  ])('rechaza documentos incompatibles: %s', text => {
    expect(() => importBackup(text)).toThrow('Respaldo inválido');
  });
  it.each([
    { amount: -1 }, { amount: 10.1 }, { date: '2026-02-30' },
    { category: 'invalid' }, { currency: 'USD' }, { notes: null },
    { merchant: 'x'.repeat(161) }, { createdAt: 'bad-date' },
    { id: 'x" onclick="alert(1)' },
    { photo: { type: 'text/html', data: 'PHNjcmlwdD4=' } },
    { photo: { type: 'image/jpeg', data: '%%%notbase64' } },
  ])('valida campos y fotos antes de restaurar: %j', override => {
    expect(() => importBackup(document([{ ...expense, ...override }]))).toThrow('No se cambió ningún gasto');
  });
  it('rechaza identificadores duplicados y un registro inválido entre registros válidos', () => {
    expect(() => importBackup(document([expense, expense]))).toThrow('Respaldo inválido');
    expect(() => importBackup(document([expense, { ...expense, id: 'two', amount: 0 }]))).toThrow('Respaldo inválido');
  });
});
