import { describe, expect, it } from 'vitest';
import { exportCsv, importCsv } from '../src/csv';
import { createCustomCategory, filterExpenses, type Expense } from '../src/domain';

const expense: Expense = {
  id: 'csv', date: '2026-11-10', merchant: 'Café "Sol", Centro', amount: 12005,
  category: 'restaurantes', currency: 'MXN', notes: 'Primera línea\nSegunda línea',
  createdAt: '2026-11-10T12:00:00Z', photo: new Blob(['private photo']),
};
describe('exportación CSV local', () => {
  it('conserva UTF-8, escapa textos e incluye el importe decimal, no fotos ni identificadores', () => {
    const csv = exportCsv([expense]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Café ""Sol"", Centro"');
    expect(csv).toContain('"120.05","MXN"');
    expect(csv).toContain('"Primera línea\nSegunda línea"');
    expect(csv).not.toContain('private photo');
    expect(csv).not.toContain('createdAt');
  });
  describe('importación CSV', () => {
    it('recupera categorías personales y neutraliza sus fórmulas', () => {
      const category = createCustomCategory('=Mascotas <&">');
      const csv = exportCsv([{ ...expense, category }]);
      expect(csv).toContain(`"'=Mascotas <&"">"`);
      expect(importCsv(csv)[0].category).toBe(category);
    });
    it('reutiliza categorías personales conocidas sin distinguir acentos ni mayúsculas', () => {
      const category = createCustomCategory('Educación');
      const csv = exportCsv([{ ...expense, category: 'custom:educacion' }]);
      expect(importCsv(csv, [category])[0].category).toBe(category);
      expect(importCsv(exportCsv([
        { ...expense, category }, { ...expense, category: 'custom:EDUCACION' },
      ])).map(item => item.category)).toEqual([category, category]);
    });
    it.each(['', 'x'.repeat(41), 'Una\ncategoría'])('rechaza nombres de categoría inválidos del CSV: %s', name => {
      expect(() => importCsv(exportCsv([{ ...expense, category: `custom:${name}` }]))).toThrow('No se importó');
    });
    it('recupera un CSV exportado con acentos, comillas, comas y saltos de línea, sin fotos', () => {
      const [imported] = importCsv(exportCsv([expense]));
      expect(imported).toMatchObject({
        date: expense.date, merchant: expense.merchant, amount: expense.amount,
        category: expense.category, notes: expense.notes, currency: 'MXN',
      });
      expect(imported.photo).toBeUndefined();
      expect(imported.id).not.toBe(expense.id);
    });
    it('admite encabezados reordenados, LF y filas sin comillas', () => {
      expect(importCsv('moneda,importe,categoría,comercio,fecha,notas\nMXN,12.34,Súper,Tienda,2026-11-11,\n')[0])
        .toMatchObject({ merchant: 'Tienda', amount: 1234, category: 'super', notes: '' });
    });
    it('restaura los textos neutralizados y mantiene la protección al volver a exportar', () => {
      const [imported] = importCsv(exportCsv([{ ...expense, merchant: '=1+1', notes: '\n@formula' }]));
      expect(imported.merchant).toBe('=1+1');
      expect(imported.notes).toBe('\n@formula');
      expect(exportCsv([imported])).toContain(`"'=1+1"`);
    });
    it('admite archivos vacíos de gastos y asigna ids diferentes a filas idénticas', () => {
      expect(importCsv(exportCsv([]))).toEqual([]);
      const rows = importCsv(exportCsv([expense, expense]));
      expect(rows[0].id).not.toBe(rows[1].id);
    });
    it.each([
      '', 'fecha,comercio', 'fecha,comercio,categoria,importe,moneda,moneda',
      'fecha,comercio,categoria,importe,moneda,notas\n"sin cerrar',
      'fecha,comercio,categoria,importe,moneda,notas\n"texto"x,resto',
      'fecha,comercio,categoria,importe,moneda,notas\n2026-11-11,Tienda,Otros,12,MXN',
    ])('rechaza CSV mal formado: %s', csv => expect(() => importCsv(csv)).toThrow());
    it.each([
      { date: '2026-02-30' }, { amount: -1 }, { merchant: '' },
      { currency: 'USD' as Expense['currency'] }, { notes: 'x'.repeat(2001) },
    ])('rechaza todas las filas si una contiene datos inválidos: %j', override => {
      expect(() => importCsv(exportCsv([expense, { ...expense, ...override }]))).toThrow('No se importó ningún gasto');
    });
  });
  it.each(['=SUM(A1)', '+cmd', '-formula', '@SUM(A1)', '  =1+1', '\tformula', '\n=1'])(
    'neutraliza fórmulas: %s', merchant => {
      expect(exportCsv([{ ...expense, merchant }])).toContain(`"'${merchant}"`);
    },
  );
  it('exporta únicamente los registros del conjunto filtrado', () => {
    const filtered = filterExpenses([expense, { ...expense, id: 'old', date: '2026-09-01', merchant: 'No exportar' }],
      { period: '7', month: '2026-11', category: 'restaurantes', search: '' }, new Date(2026, 10, 10));
    const csv = exportCsv(filtered);
    expect(csv).toContain('Café');
    expect(csv).not.toContain('No exportar');
  });
  it('produce encabezados válidos sin registros', () => {
    expect(exportCsv([])).toBe('\uFEFF"fecha","comercio","categoria","importe","moneda","notas"\r\n');
  });
});
