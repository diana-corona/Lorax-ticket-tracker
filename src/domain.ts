export const categories = [
  'gasolina', 'super', 'restaurantes', 'transporte', 'servicios',
  'salud', 'compras', 'entretenimiento', 'otros',
] as const;
export type Category = typeof categories[number];
export const labels: Record<Category, string> = {
  gasolina: 'Gasolina', super: 'Súper', restaurantes: 'Restaurantes',
  transporte: 'Transporte', servicios: 'Servicios', salud: 'Salud',
  compras: 'Compras', entretenimiento: 'Entretenimiento', otros: 'Otros',
};
export const colors: Record<Category, string> = {
  gasolina: '#d48730', super: '#35775a', restaurantes: '#bd5d48',
  transporte: '#5084a1', servicios: '#8b73ab', salud: '#388e86',
  compras: '#b4678b', entretenimiento: '#8a8b33', otros: '#737d83',
};
export interface Expense {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  currency: 'MXN';
  category: Category;
  notes: string;
  createdAt: string;
  photo?: Blob;
}
export type Period = 'month' | '7' | '28' | '90';
export interface Filters {
  period: Period;
  month: string;
  category: Category | '';
  search: string;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function fromDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(fromDate(value)) === value;
}
export function periodBounds(filters: Pick<Filters, 'period' | 'month'>, today = new Date()) {
  if (filters.period === 'month') {
    const [year, month] = filters.month.split('-').map(Number);
    return {
      start: localDate(new Date(year, month - 1, 1, 12)),
      end: localDate(new Date(year, month, 0, 12)),
    };
  }
  const end = localDate(today);
  const start = fromDate(end);
  start.setDate(start.getDate() - (Number(filters.period) - 1));
  return { start: localDate(start), end };
}
export function filterExpenses(expenses: Expense[], filters: Filters, today = new Date()): Expense[] {
  const { start, end } = periodBounds(filters, today);
  const query = normalize(filters.search.trim());
  return expenses.filter(expense =>
    expense.date >= start && expense.date <= end &&
    (!filters.category || expense.category === filters.category) &&
    (!query || normalize(expense.merchant).includes(query)),
  ).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
export function parseAmount(value: string): number | null {
  const cleaned = value.trim().replace(/(?:MXN|M\.?N\.?|\$|\s)/gi, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.replaceAll(',', '').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
export function money(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount / 100);
}
export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
export function dailyTotals(expenses: Expense[], start: string, end: string) {
  const totals = new Map<string, number>();
  for (const expense of expenses) totals.set(expense.date, (totals.get(expense.date) ?? 0) + expense.amount);
  const days: { date: string; amount: number }[] = [];
  const current = fromDate(start);
  while (localDate(current) <= end) {
    const date = localDate(current);
    days.push({ date, amount: totals.get(date) ?? 0 });
    current.setDate(current.getDate() + 1);
  }
  return days;
}
export function categoryTotals(expenses: Expense[]) {
  return categories.map(category => ({
    category, amount: expenses.filter(e => e.category === category).reduce((sum, e) => sum + e.amount, 0),
  })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
}
export function validateExpense(expense: Expense): void {
  if (!validDate(expense.date)) throw new Error('Selecciona una fecha válida.');
  if (!expense.merchant.trim()) throw new Error('Escribe el nombre del comercio.');
  if (!Number.isSafeInteger(expense.amount) || expense.amount <= 0) throw new Error('Escribe un importe válido mayor que cero.');
  if (!categories.includes(expense.category)) throw new Error('Selecciona una categoría válida.');
  if (expense.currency !== 'MXN') throw new Error('Esta versión utiliza pesos mexicanos.');
}
