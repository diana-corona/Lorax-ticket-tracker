import type { Category, Expense } from './domain';
import { categories, categoryLabel, createCustomCategory, normalize, parseAmount, validateExpense } from './domain';

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
const header = ['fecha', 'comercio', 'categoria', 'importe', 'moneda', 'notas'];

function cell(value: string): string {
  // Spreadsheet programs may execute formulas even inside quoted CSV cells.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(expenses: Expense[]): string {
  return '\uFEFF' + [
    header.map(cell).join(','),
    ...expenses.map(expense => [
      expense.date, expense.merchant, categoryLabel(expense.category),
      (expense.amount / 100).toFixed(2), expense.currency, expense.notes,
    ].map(cell).join(',')),
  ].join('\r\n') + '\r\n';
}
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  const finishField = () => { row.push(field); field = ''; state = 'start'; };
  const finishRow = () => {
    finishField();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
    if (rows.length > 10_001) throw new Error('El CSV supera el límite de 10,000 gastos.');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else state = 'closed';
      } else field += char;
    } else if (char === ',') finishField();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"' && state === 'start') state = 'quoted';
    else if (state === 'closed' || char === '"') throw new Error('El CSV contiene comillas mal cerradas.');
    else { field += char; state = 'plain'; }
  }
  if (state === 'quoted') throw new Error('El CSV contiene comillas mal cerradas.');
  if (field || row.length || state === 'closed') finishRow();
  return rows;
}
function restoreText(value: string): string {
  return value.startsWith("'") && (/^[\s\u0000-\u001f]*[=+\-@]/.test(value.slice(1)) || /^[\t\r\n]/.test(value.slice(1)))
    ? value.slice(1) : value;
}
export function importCsv(text: string, knownCategories: readonly Category[] = categories): Expense[] {
  if (new Blob([text]).size > MAX_CSV_BYTES) throw new Error('El CSV supera el límite de 5 MB.');
  const [columns, ...rows] = parseRows(text.replace(/^\uFEFF/, ''));
  if (!columns || columns.length !== header.length || new Set(columns.map(value => normalize(value.trim()))).size !== header.length ||
    !header.every(name => columns.some(value => normalize(value.trim()) === name))) {
    throw new Error('Usa un CSV de Lorax ticket tracker con columnas: fecha, comercio, categoria, importe, moneda y notas.');
  }
  const indexes = header.map(name => columns.findIndex(value => normalize(value.trim()) === name));
  const createdAt = new Date().toISOString();
  const available = [...knownCategories];
  return rows.map((row, index) => {
    try {
      if (row.length !== columns.length) throw new Error('El número de columnas no coincide.');
      const [date, merchant, categoryText, amountText, currency, notes] = indexes.map(i => restoreText(row[i]));
      const category = available.find(value => normalize(categoryLabel(value)) === normalize(categoryText.trim()))
        ?? createCustomCategory(categoryText);
      if (!available.includes(category)) available.push(category);
      const amount = parseAmount(amountText);
      if (!category || amount === null || currency.trim() !== 'MXN') throw new Error('Revisa categoría, importe y moneda (MXN).');
      if (merchant.length > 160 || notes.length > 2000) throw new Error('El comercio o las notas superan la longitud permitida.');
      const expense: Expense = {
        id: globalThis.crypto?.randomUUID?.() ?? `csv-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2)}`,
        date: date.trim(), merchant, category, amount, currency: 'MXN', notes, createdAt,
      };
      validateExpense(expense);
      return expense;
    } catch (error) {
      throw new Error(`Registro ${index + 1}: ${error instanceof Error ? error.message : 'Datos inválidos.'} No se importó ningún gasto.`);
    }
  });
}
