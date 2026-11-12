import { describe, expect, it } from 'vitest';
import {
  categoryTotals, dailyTotals, filterExpenses, localDate, parseAmount,
  periodBounds, validDate, validateExpense, type Expense, type Filters,
} from '../src/domain';

const today = new Date(2026, 10, 10, 23, 45);
const filters: Filters = { period: 'month', month: '2026-11', category: '', search: '' };
export function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'one', date: '2026-11-10', merchant: 'Súper Central', amount: 12345,
    category: 'super', currency: 'MXN', notes: '', createdAt: '2026-11-10T12:00:00Z',
    ...overrides,
  };
}
describe('periodos calendario locales', () => {
  it.each([
    ['7', '2026-11-04'], ['28', '2026-10-14'], ['90', '2026-08-13'],
  ] as const)('incluye hoy y exactamente %s días', (period, start) => {
    const bounds = periodBounds({ ...filters, period }, today);
    expect(bounds).toEqual({ start, end: '2026-11-10' });
    expect(dailyTotals([], bounds.start, bounds.end)).toHaveLength(Number(period));
  });
  it('admite meses anteriores y febrero bisiesto', () => {
    expect(periodBounds({ period: 'month', month: '2024-02' }, today))
      .toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });
  it('atraviesa un cambio de año', () => {
    expect(periodBounds({ ...filters, period: '7' }, new Date(2027, 0, 3)))
      .toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });
  it('cuenta días calendario aunque cambie el horario de verano', () => {
    const bounds = periodBounds({ ...filters, period: '7' }, new Date(2026, 2, 10, 0, 10));
    expect(bounds).toEqual({ start: '2026-03-04', end: '2026-03-10' });
    expect(dailyTotals([], bounds.start, bounds.end)).toHaveLength(7);
  });
  it('usa la fecha local y rechaza fechas inexistentes', () => {
    expect(localDate(new Date(2026, 10, 10, 23, 59))).toBe('2026-11-10');
    expect(validDate('2026-02-29')).toBe(false);
    expect(validDate('2024-02-29')).toBe(true);
    expect(validDate('2026-13-01')).toBe(false);
    expect(validDate('2026-1-1')).toBe(false);
  });
});
describe('selección compartida y gráficas', () => {
  it('incluye ambos límites y excluye días fuera del periodo y futuros', () => {
    const list = ['2026-11-03', '2026-11-04', '2026-11-10', '2026-11-11']
      .map(date => expense({ id: date, date }));
    expect(filterExpenses(list, { ...filters, period: '7' }, today).map(item => item.date))
      .toEqual(['2026-11-10', '2026-11-04']);
  });
  it('combina categoría y búsqueda sin acentos ni distinción de mayúsculas', () => {
    const list = [expense(), expense({ id: 'two', category: 'compras' }), expense({ id: 'three', merchant: 'Otro' })];
    expect(filterExpenses(list, { ...filters, category: 'super', search: ' SUPER ' }, today))
      .toEqual([list[0]]);
  });
  it('filtra por fecha de gasto en vez de fecha de captura', () => {
    expect(filterExpenses([expense({ date: '2026-10-20' })], filters, today)).toEqual([]);
  });
  it('suma centavos e incluye días con cero sin mutar los gastos', () => {
    const list = [expense({ amount: 10, date: '2026-11-02' }), expense({ amount: 20, date: '2026-11-02' })];
    expect(dailyTotals(list, '2026-11-01', '2026-11-03')).toEqual([
      { date: '2026-11-01', amount: 0 }, { date: '2026-11-02', amount: 30 }, { date: '2026-11-03', amount: 0 },
    ]);
    expect(categoryTotals(list)).toEqual([{ category: 'super', amount: 30 }]);
  });
  it('desempata movimientos por la fecha de captura más reciente', () => {
    const older = expense({ createdAt: '2026-11-10T12:00:00Z' });
    const newer = expense({ id: 'two', createdAt: '2026-11-10T13:00:00Z' });
    expect(filterExpenses([older, newer], filters, today)).toEqual([newer, older]);
  });
});
describe('importes y validación', () => {
  it.each([
    ['0.10', 10], ['0.29', 29], ['1234.5', 123450], ['$ 1,234.50 MXN', 123450], ['25', 2500],
  ])('convierte %s a centavos exactos', (value, expected) => {
    expect(parseAmount(value)).toBe(expected);
  });
  it.each(['', '0', '-10', '12.345', '1,23', 'NaN', '1e4', '99999999999999999999', '12 pesos'])(
    'rechaza importe ambiguo o inválido: %s', value => expect(parseAmount(value)).toBeNull(),
  );
  it('impide guardar fechas, categorías e importes inválidos', () => {
    expect(() => validateExpense(expense({ date: '2026-02-30' }))).toThrow('fecha');
    expect(() => validateExpense(expense({ merchant: '  ' }))).toThrow('comercio');
    expect(() => validateExpense(expense({ amount: 1.5 }))).toThrow('importe');
    expect(() => validateExpense(expense({ category: 'invalid' as Expense['category'] }))).toThrow('categoría');
  });
});
