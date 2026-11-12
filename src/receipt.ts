import type { Category } from './domain';
import { normalize, parseAmount, validDate } from './domain';

const rules: [Category, RegExp][] = [
  ['gasolina', /\b(pemex|gasolina|gasolinera|combustible|mobil|bp|shell)\b/],
  ['super', /\b(walmart|soriana|chedraui|supermercado|superama|bodega aurrera|heb|costco|sams|la comer)\b/],
  ['restaurantes', /\b(restaurante|restaurant|cafeteria|taqueria|starbucks|mcdonald|burger|pizza|cafe)\b/],
  ['transporte', /\b(uber|didi|taxi|autobus|metro|estacionamiento|peaje|caseta)\b/],
  ['salud', /\b(farmacia|farmacias|hospital|clinica|medico|laboratorio)\b/],
  ['servicios', /\b(cfe|telmex|izzi|internet|electricidad|telefonia)\b/],
  ['entretenimiento', /\b(cinepolis|cinemex|cine|teatro|netflix|spotify)\b/],
  ['compras', /\b(liverpool|palacio de hierro|coppel|suburbia|zara|ropa)\b/],
];
export function suggestCategory(text: string): Category {
  const normalized = normalize(text);
  return rules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? 'otros';
}
export interface ReceiptFields {
  merchant?: string;
  date?: string;
  amount?: number;
  category: Category;
}
export function parseReceipt(text: string): ReceiptFields {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const merchant = lines.slice(0, 8).some(line => /\boxxo\b/i.test(line)) ? 'OXXO' : lines.slice(0, 5).find(line =>
    /[a-záéíóúñ]{3}/i.test(line) &&
    !/\b(rfc|ticket|factura|fecha|folio|bienvenido)\b/i.test(line),
  );
  let date: string | undefined;
  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  const local = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : local ? [local[3], local[2], local[1]] : null;
  if (parts) {
    const candidate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    if (validDate(candidate)) date = candidate;
  }
  let amount: number | undefined;
  for (let index = 0; index < lines.length; index++) {
    const normalized = normalize(lines[index]);
    if (!/\b(?:total|importe a pagar)\b/.test(normalized) ||
      /\b(?:sub\s*total|subtotal|comision|ahorro|descuento|articulos|productos|recibido|cambio)\b/.test(normalized)) continue;
    const afterLabel = lines[index].replace(/^.*?(?:\btotal\b|importe a pagar)\s*:?\s*/i, '');
    const candidate = afterLabel || lines[index + 1] || '';
    const match = candidate.match(/(?:\$\s*)?(\d{1,3}(?:,\d{3})+[.:]\d{2}|\d+[.:]\d{2})(?!\d)/);
    if (match) amount = parseAmount(match[1].replace(':', '.')) ?? amount;
  }
  return { merchant, date, amount, category: suggestCategory(merchant ?? text) };
}
