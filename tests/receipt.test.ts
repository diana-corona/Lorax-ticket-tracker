import { describe, expect, it } from 'vitest';
import { parseReceipt, suggestCategory } from '../src/receipt';

describe('interpretación del ticket', () => {
  it('extrae comercio, fecha mexicana y total sin confundir subtotal, efectivo o cambio', () => {
    expect(parseReceipt('WALMART\nRFC ABC123\nFecha 10/11/2026\nSUBTOTAL 100.00\nIVA 16.00\nTOTAL $116.00\nEFECTIVO 200.00\nCAMBIO 84.00'))
      .toEqual({ merchant: 'WALMART', date: '2026-11-10', amount: 11600, category: 'super' });
  });
  it('admite fechas ISO y el total en la siguiente línea', () => {
    expect(parseReceipt('PEMEX\n2026-11-09\nTOTAL\n$1,234.50')).toEqual({
      merchant: 'PEMEX', date: '2026-11-09', amount: 123450, category: 'gasolina',
    });
  });
  it('no inventa un total con números de artículos, subtotales o fechas inválidas', () => {
    const fields = parseReceipt('Tienda local\n31/02/2026\nSUB TOTAL 80.00\nTOTAL ARTICULOS 3\nTOTAL AHORRO 12.00');
    expect(fields.amount).toBeUndefined();
    expect(fields.date).toBeUndefined();
    expect(fields.category).toBe('otros');
  });
  it('permite completar manualmente tickets vacíos o ilegibles', () => {
    expect(parseReceipt('')).toEqual({ category: 'otros', merchant: undefined, date: undefined, amount: undefined });
  });
  it.each([
    ['10/11/2026', '288.00', 28800, '2026-11-10'],
    ['23/05/2019', '4,010:00', 401000, '2019-05-23'],
    ['16/05/2020', '1,210.00', 121000, '2020-05-16'],
  ])('extrae el pago total de OXXO con fecha %s sin usar la comisión', (date, total, amount, expectedDate) => {
    // Minimal, anonymized text reproducing the provided receipts' layouts.
    const fields = parseReceipt(`Cadena Comercial Oxxo S.A. de C.V.\nCaja #1 ${date} 10:00\nMONTO M.N. $ 100.00\nCOMISION M.N. $ 8.62\nIVA DE COMISION M.N. $ 1.38\nTOTAL COMISION M.N. $ 10.00\nPAGO TOTAL M.N. $ ${total}`);
    expect(fields).toEqual({ merchant: 'OXXO', date: expectedDate, amount, category: 'otros' });
  });
  it('no usa una comisión como total si el pago total no es legible', () => {
    expect(parseReceipt('OXXO\nTOTAL COMISION M.N. $ 12.00\nPAGO TOTAL ILEGIBLE').amount).toBeUndefined();
  });
  it('da prioridad al comercio del encabezado y no al nombre de una sucursal', () => {
    expect(parseReceipt('Cadena Comercial OXXO\nDirección comercial\nSUCURSAL CENTRO\nTOTAL 25.00').merchant).toBe('OXXO');
  });
  it.each([
    ['Gasolinera Pemex', 'gasolina'], ['Farmacias del Ahorro', 'salud'],
    ['Cafetería del centro', 'restaurantes'], ['Cinépolis', 'entretenimiento'],
    ['Comercio desconocido', 'otros'],
  ])('sugiere categoría para %s', (text, category) => expect(suggestCategory(text)).toBe(category));
});
