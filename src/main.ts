import './style.css';
import {
  categories, labels, colors, localDate, money, parseAmount, filterExpenses,
  periodBounds, dailyTotals, categoryTotals,
  type Expense, type Filters, type Category, type Period,
} from './domain';
import { getExpenses, saveExpense, deleteExpense, replaceExpenses, sessionOnly, enableSessionStorage } from './db';
import { exportCsv, importCsv, MAX_CSV_BYTES } from './csv';
import { exportBackup, importBackup, MAX_BACKUP_BYTES } from './backup';
import { parseReceipt } from './receipt';
import { registerOffline } from './offline';
import { readReceipt } from './ocr';

type View = 'home' | 'history' | 'form' | 'data';
type Draft = { id?: string; date: string; merchant: string; amount: string; category: Category; notes: string; photo?: Blob };
const root = document.querySelector<HTMLDivElement>('#app')!;
let expenses: Expense[] = [];
let view: View = 'home';
let filters: Filters = { period: 'month', month: localDate().slice(0, 7), category: '', search: '' };
let draft: Draft = emptyDraft();
let busy = false;
let dirty = false;
let photoUrl: string | undefined;
let offlineMessage = 'Preparando Lorax ticket tracker…';
let applyUpdate: (() => void) | undefined;
let storageError = '';
let backupNeeded = false;

function emptyDraft(): Draft {
  return { date: localDate(), merchant: '', amount: '', category: 'otros', notes: '' };
}
function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
function categoryOptions(selected: string, all = false): string {
  return `${all ? '<option value="">Todas las categorías</option>' : ''}${categories.map(category =>
    `<option value="${category}" ${selected === category ? 'selected' : ''}>${labels[category]}</option>`).join('')}`;
}
function selectedExpenses() { return filterExpenses(expenses, filters); }
function notify(message: string, error = false) {
  const notice = document.querySelector<HTMLElement>('#notice')!;
  notice.textContent = message;
  notice.className = `notice ${error ? 'error' : ''}`;
  notice.hidden = false;
}
function readableError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'No hay espacio suficiente. Exporta tus registros antes de liberar espacio y vuelve a intentar. No se guardó el cambio.';
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.';
}
function render() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = undefined;
  root.innerHTML = `
    <header class="topbar"><a class="brand" href="#" aria-label="Lorax ticket tracker, inicio"><img src="/icon.svg" width="38" height="38" alt="" /><span>Lorax ticket tracker</span></a><span class="brand-caption">Gastos bajo control.</span></header>
    <div class="workspace">
      <nav class="tabs" aria-label="Navegación principal">
        ${([['home', 'Resumen'], ['history', 'Gastos'], ['form', '+ Nuevo gasto'], ['data', 'Mis datos']] as const).map(([id, title]) =>
          `<button type="button" data-view="${id}" ${busy ? 'disabled' : ''} class="${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''}>${title}</button>`).join('')}
      </nav>
      <div id="notice" role="alert" class="notice" hidden></div>
      ${storageError ? `<p class="notice error">${escape(storageError)} No registres gastos hasta resolver el acceso al almacenamiento.</p>` : ''}
      ${sessionOnly ? `<aside class="notice error" role="status"><strong>No se pueden guardar tus gastos automáticamente.</strong> Los gastos y fotos se perderán al cerrar o recargar. Descarga un respaldo completo desde <button type="button" class="text-button" data-view="data">Mis datos</button> antes de cerrar.</aside>` : ''}
      <main id="main">${view === 'form' ? renderForm() : view === 'data' ? renderData() : renderOverview()}</main>
      <footer><span id="offline-status" role="status">${escape(offlineMessage)}</span><button id="update-app" class="text-button" ${applyUpdate ? '' : 'hidden'}>Actualizar Lorax ticket tracker</button><span class="copyright">© ${new Date().getFullYear()} <a href="https://github.com/diana-corona" target="_blank" rel="noopener noreferrer">@diana-corona</a> · Todos los derechos reservados.</span></footer>
    </div>`;
  bindNavigation();
  if (view === 'home' || view === 'history') bindOverview();
  if (view === 'form') bindForm();
  if (view === 'data') bindData();
  document.querySelector('#update-app')?.addEventListener('click', () => {
    if (!busy && (!dirty || confirm('Hay un gasto sin guardar. ¿Descartarlo y actualizar la app?'))) applyUpdate?.();
  });
}
function bindNavigation() {
  const navigate = (next: View) => {
    if (busy || (view === 'form' && dirty && !confirm('¿Salir sin guardar este gasto?'))) return;
    if (next === 'form') draft = emptyDraft();
    dirty = false;
    view = next;
    render();
  };
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    button.addEventListener('click', () => navigate(button.dataset.view as View));
  });
  document.querySelector('.brand')?.addEventListener('click', event => {
    event.preventDefault();
    navigate('home');
  });
}
function renderFilters() {
  const { start, end } = periodBounds(filters);
  return `<section class="filter-panel" aria-label="Filtros de gastos">
    <div class="periods" aria-label="Periodo">
      ${([['month', 'Mensual'], ['7', '7 días'], ['28', '28 días'], ['90', '90 días']] as const).map(([period, label]) =>
        `<button data-period="${period}" aria-pressed="${filters.period === period}" class="${filters.period === period ? 'selected' : ''}">${label}</button>`).join('')}
    </div>
    <div class="filter-fields">
      ${filters.period === 'month' ? `<label>Mes<input id="month" type="month" value="${filters.month}" required /></label>` : ''}
      <label>Categoría<select id="category-filter">${categoryOptions(filters.category, true)}</select></label>
      <label class="search">Comercio<input id="search" type="search" placeholder="Buscar comercio…" value="${escape(filters.search)}" /></label>
    </div>
    <div class="filter-caption"><span>${formatDate(start)} — ${formatDate(end)} · MXN</span><button id="export-filtered" class="text-button">Exportar selección CSV</button></div>
  </section>`;
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
}
function renderOverview() {
  const list = selectedExpenses();
  const total = list.reduce((sum, expense) => sum + expense.amount, 0);
  const { start, end } = periodBounds(filters);
  return `
    <section class="page-heading"><div><h1>${view === 'home' ? 'Así van tus gastos' : 'Cada gasto, en su lugar'}</h1><p>Tickets guardados aquí.</p></div><button class="primary" data-view="form">+ Nuevo gasto</button></section>
    ${renderFilters()}
    ${view === 'home' ? `<section class="summary" aria-label="Resumen del periodo">
      <article class="total-card"><p>Total del periodo</p><strong data-testid="total">${money(total)}</strong><span>Pesos mexicanos · filtros aplicados</span></article>
      <article class="count-card"><p>Gastos registrados</p><strong>${list.length}</strong><span>En el periodo seleccionado</span></article>
    </section>
    <section class="charts"><article class="panel"><div class="section-title"><h2>¿En qué se fue?</h2><span>Por categoría</span></div>${renderCategories(list)}</article>
    <article class="panel"><div class="section-title"><h2>Día a día</h2><span>${dailyTotals([], start, end).length} días</span></div>${renderDaily(list, start, end)}</article></section>` : ''}
    <section class="panel history-panel"><div class="section-title"><h2>${view === 'home' ? 'Últimos movimientos' : 'Historial de gastos'}</h2><span>${list.length} gastos</span></div>
    ${list.length ? `<ul class="expense-list">${(view === 'home' ? list.slice(0, 5) : list).map(expense => `
      <li><span class="category-mark" style="--category-color:${colors[expense.category]}" aria-hidden="true">${labels[expense.category].slice(0, 1)}</span><div class="expense-info"><strong>${escape(expense.merchant)}</strong><span>${labels[expense.category]} · ${formatDate(expense.date)}${expense.photo ? ' · Ticket adjunto' : ''}</span></div><div class="expense-right"><strong>${money(expense.amount)}</strong><button class="text-button edit-expense" data-id="${expense.id}" aria-label="Editar gasto de ${escape(expense.merchant)}">Ver / editar</button></div></li>`).join('')}</ul>` :
      '<div class="empty"><span class="empty-icon" aria-hidden="true">+</span><h3>No hay gastos en esta selección</h3><p>Agrega tu primer ticket o cambia los filtros.</p></div>'}
    </section>`;
}
function renderCategories(list: Expense[]): string {
  const totals = categoryTotals(list);
  if (!totals.length) return '<div class="empty small"><p>Las categorías aparecerán al guardar gastos.</p></div>';
  const total = totals.reduce((sum, item) => sum + item.amount, 0);
  let position = 0;
  const segments = totals.map(item => {
    const start = position;
    position += item.amount / total * 100;
    return `${colors[item.category]} ${start}% ${position}%`;
  });
  return `<div class="category-chart"><div class="donut" style="background:conic-gradient(${segments.join(',')})" role="img" aria-label="Distribución por categoría; importes en la lista adjunta"><div><span>${totals.length}</span><small>categorías</small></div></div><ul class="legend">${totals.map(item =>
    `<li><span class="dot" style="background:${colors[item.category]}"></span><span>${labels[item.category]}</span><strong>${money(item.amount)}</strong><small>${Math.round(item.amount / total * 100)} %</small></li>`).join('')}</ul></div>`;
}
function renderDaily(list: Expense[], start: string, end: string): string {
  if (!list.length) return '<div class="empty small"><p>Tu evolución diaria aparecerá aquí.</p></div>';
  const days = dailyTotals(list, start, end);
  const max = Math.max(...days.map(day => day.amount), 1);
  const width = 560;
  const step = width / days.length;
  return `<div class="daily-chart"><span class="chart-max">${money(max)}</span><svg viewBox="0 0 560 170" role="img" aria-label="Gasto diario del periodo; detalle en la tabla desplegable">
    <path d="M0 10H560 M0 85H560 M0 160H560" stroke="#e4e9e3" stroke-dasharray="4 5" />
    ${days.map((day, i) => {
      const height = day.amount / max * 145;
      return `<rect x="${i * step + step * 0.15}" y="${160 - height}" width="${step * 0.7}" height="${height}" rx="${Math.min(step * 0.2, 4)}" fill="#35775a"><title>${formatDate(day.date)}: ${money(day.amount)}</title></rect>`;
    }).join('')}
    </svg><div class="chart-axis"><span>${formatDate(start)}</span><span>${formatDate(end)}</span></div></div>
    <details class="daily-details"><summary>Ver importes por día</summary><div class="daily-table"><table><thead><tr><th>Fecha</th><th>Importe</th></tr></thead><tbody>${days.map(day =>
      `<tr><td>${formatDate(day.date)}</td><td>${money(day.amount)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function bindOverview() {
  document.querySelectorAll<HTMLButtonElement>('[data-period]').forEach(button => {
    button.addEventListener('click', () => {
      filters.period = button.dataset.period as Period;
      render();
    });
  });
  document.querySelector<HTMLInputElement>('#month')?.addEventListener('change', event => {
    const value = (event.target as HTMLInputElement).value;
    if (/^\d{4}-\d{2}$/.test(value)) { filters.month = value; render(); }
  });
  document.querySelector<HTMLSelectElement>('#category-filter')?.addEventListener('change', event => {
    filters.category = (event.target as HTMLSelectElement).value as Category | '';
    render();
  });
  document.querySelector<HTMLInputElement>('#search')?.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    const cursor = input.selectionStart;
    filters.search = input.value;
    render();
    const next = document.querySelector<HTMLInputElement>('#search')!;
    next.focus();
    if (cursor !== null) next.setSelectionRange(cursor, cursor);
  });
  document.querySelector('#export-filtered')?.addEventListener('click', () => downloadCsv(selectedExpenses(), 'seleccion'));
  document.querySelectorAll<HTMLButtonElement>('.edit-expense').forEach(button => {
    button.addEventListener('click', () => {
      const expense = expenses.find(item => item.id === button.dataset.id)!;
      draft = { ...expense, amount: (expense.amount / 100).toFixed(2) };
      view = 'form';
      dirty = false;
      render();
    });
  });
}
function renderForm(): string {
  if (draft.photo) photoUrl = URL.createObjectURL(draft.photo);
  return `<section class="page-heading"><div><p class="eyebrow">UN TICKET, UN GASTO</p><h1>${draft.id ? 'Revisa tu gasto' : 'Agrega un gasto'}</h1><p>Agrega tu ticket y revisa los datos antes de guardar.</p></div></section>
    <form id="expense-form" class="form-layout">
      <section class="panel receipt-panel"><h2>Tu ticket</h2><p class="muted">Toma la foto de frente, con buena luz y el total visible.</p>
        ${photoUrl ? `<img class="receipt-preview" src="${photoUrl}" alt="Foto del ticket de este gasto" />` : '<div class="photo-placeholder" aria-hidden="true"><span>▤</span><p>Una foto y listo.<br />También puedes capturarlo a mano.</p></div>'}
        <label class="file-button primary">Tomar foto<input id="camera" type="file" accept="image/*" capture="environment" /></label>
        <label class="file-button secondary">Elegir de galería<input id="gallery" type="file" accept="image/*" /></label>
        ${draft.photo ? '<div class="receipt-actions"><button type="button" id="read-ticket" class="secondary">Leer ticket</button><button type="button" id="remove-photo" class="text-button">Quitar foto</button></div>' : ''}
        <p id="ocr-status" class="ocr-status" role="status">Obtén los datos de tu ticket. Puede tardar unos segundos.</p>
      </section>
      <section class="panel form-fields"><h2>Datos del gasto</h2><p class="muted">Moneda: pesos mexicanos (MXN).</p>
        <label>Comercio<input name="merchant" value="${escape(draft.merchant)}" maxlength="160" placeholder="Ej. Súper de la esquina" autocomplete="organization" required /></label>
        <div class="field-row"><label>Fecha del gasto<input name="date" type="date" value="${draft.date}" required /></label>
        <label>Importe (MXN)<input name="amount" type="text" inputmode="decimal" value="${escape(draft.amount)}" placeholder="0.00" maxlength="16" required aria-describedby="amount-help" /></label></div>
        <small id="amount-help" class="muted">Usa punto para los centavos: 1234.50.</small>
        <label>Categoría<select name="category">${categoryOptions(draft.category)}</select></label>
        <label>Notas <span class="optional">(opcional)</span><textarea name="notes" rows="3" maxlength="2000" placeholder="Algo que quieras recordar…">${escape(draft.notes)}</textarea></label>
        <div class="form-buttons"><button id="save-expense" type="submit" class="primary" ${storageError ? 'disabled' : ''}>Guardar gasto</button><button type="button" id="cancel" class="secondary">Cancelar</button></div>
        ${draft.id ? '<button id="delete-expense" type="button" class="danger text-button">Eliminar este gasto</button>' : ''}
      </section>
    </form>`;
}
function readDraft() {
  const data = new FormData(document.querySelector<HTMLFormElement>('#expense-form')!);
  draft = { ...draft, merchant: String(data.get('merchant') ?? ''), date: String(data.get('date') ?? ''),
    amount: String(data.get('amount') ?? ''), category: data.get('category') as Category, notes: String(data.get('notes') ?? '') };
}
function setBusy(value: boolean) {
  busy = value;
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('button, input, select, textarea')
    .forEach(element => { element.disabled = value || (Boolean(storageError) && element.id === 'save-expense'); });
  document.querySelector('form')?.setAttribute('aria-busy', String(value));
}
async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona una imagen válida.');
  if (file.size > 25 * 1024 * 1024) throw new Error('La foto supera 25 MB. Elige una imagen más pequeña.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la foto. Puedes registrar el gasto manualmente.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('No se pudo preparar esta imagen.')),
      'image/jpeg', 0.9,
    ));
  } finally { URL.revokeObjectURL(url); }
}
function bindForm() {
  const form = document.querySelector<HTMLFormElement>('#expense-form')!;
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || storageError) return;
    readDraft();
    const amount = parseAmount(draft.amount);
    if (amount === null) { notify('Escribe un importe mayor que cero, con hasta dos decimales. Ejemplo: 1234.50.', true); return; }
    const existing = expenses.find(item => item.id === draft.id);
    const expense: Expense = {
      id: draft.id ?? (globalThis.crypto?.randomUUID?.() ?? `gasto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`),
      date: draft.date, merchant: draft.merchant.trim(),
      amount, currency: 'MXN', category: draft.category, notes: draft.notes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(), photo: draft.photo,
    };
    setBusy(true);
    try {
      await saveExpense(expense);
      expenses = [...expenses.filter(item => item.id !== expense.id), expense];
      backupNeeded = true;
      dirty = false;
      busy = false;
      view = 'history';
      render();
      const visible = selectedExpenses().some(item => item.id === expense.id);
      notify(sessionOnly ? 'Gasto conservado solo en esta sesión. Descarga el respaldo completo antes de cerrar.' :
        visible ? 'Gasto guardado.' : 'Gasto guardado. No aparece en la selección actual; cambia los filtros para verlo.');
    } catch (error) { notify(readableError(error), true); }
    finally { setBusy(false); }
  });
  for (const id of ['camera', 'gallery']) {
    document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', async event => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file || busy) return;
      readDraft();
      setBusy(true);
      try {
        draft.photo = await preparePhoto(file);
        dirty = true;
        busy = false;
        render();
      } catch { notify('No se pudo abrir la imagen. Prueba con JPG o PNG, de hasta 25 MB.', true); }
      finally { setBusy(false); }
    });
  }
  document.querySelector('#remove-photo')?.addEventListener('click', () => {
    readDraft(); draft.photo = undefined; dirty = true; render();
  });
  document.querySelector('#read-ticket')?.addEventListener('click', async () => {
    if (busy || !draft.photo) return;
    readDraft();
    if ((draft.merchant || draft.amount || draft.notes || draft.id) &&
      !confirm('La lectura puede reemplazar comercio, fecha, importe y categoría. ¿Continuar?')) return;
    setBusy(true);
    const status = document.querySelector<HTMLElement>('#ocr-status')!;
    status.textContent = 'Preparando lectura…';
    try {
      const text = await readReceipt(draft.photo, message => { status.textContent = message; });
      const fields = parseReceipt(text);
      draft = { ...draft, merchant: fields.merchant ?? draft.merchant, date: fields.date ?? draft.date,
        amount: fields.amount ? (fields.amount / 100).toFixed(2) : draft.amount, category: fields.category };
      dirty = true;
      busy = false;
      render();
      notify(fields.amount ? 'Lectura terminada. Verifica comercio, fecha, total y categoría antes de guardar.' :
        'No se identificó un total fiable. Revisa los datos y completa el importe manualmente.');
    } catch {
      notify('No se pudo leer el ticket. Usa una foto más clara o captura los datos manualmente.', true);
    } finally { setBusy(false); }
  });
  document.querySelector('#cancel')?.addEventListener('click', () => {
    if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return;
    dirty = false; view = 'history'; render();
  });
  document.querySelector('#delete-expense')?.addEventListener('click', async () => {
    if (busy || !draft.id || !confirm('¿Eliminar este gasto y su foto? No se puede deshacer.')) return;
    setBusy(true);
    try {
      await deleteExpense(draft.id);
      expenses = expenses.filter(item => item.id !== draft.id);
      backupNeeded = true;
      dirty = false; busy = false; view = 'history'; render();
      notify('Gasto eliminado.');
    } catch (error) { notify(readableError(error), true); }
    finally { setBusy(false); }
  });
}
function renderData(): string {
  return `<section class="page-heading"><div><p class="eyebrow">TODO EN ORDEN</p><h1>Tus gastos, a la mano.</h1><p>Exporta tus registros y conserva una copia de tus tickets.</p></div></section>
    <section class="panel"><h2>Llévate tus registros</h2><p>Exporta un CSV compatible con hojas de cálculo. Incluye fecha, comercio, categoría, importe, moneda y notas.</p>
    <p><strong>${expenses.length} gastos guardados</strong> · ${selectedExpenses().length} en la selección actual.</p>
    <div class="data-actions"><button id="export-all" class="primary">Exportar todos a CSV</button><button id="export-selection" class="secondary">Exportar selección actual</button><label class="file-button secondary">Importar CSV<input id="import-csv" type="file" accept=".csv,text/csv" ${storageError ? 'disabled' : ''} /></label></div>
    <p class="muted">Importa un CSV exportado por Lorax ticket tracker para agregar gastos sin borrar los actuales. Importar el mismo archivo otra vez duplicará sus registros. Máximo 5 MB y 10,000 gastos.</p>
    <p class="muted">El CSV no contiene fotos y no sirve para restaurar la app. Usa el respaldo completo para conservarlo todo.</p></section>
    <section class="panel backup-panel"><h2>Respaldo completo con fotos</h2><p>Descarga una copia para recuperar tus gastos y fotos cuando los necesites. Guárdala en un lugar seguro: cualquiera con acceso al respaldo podrá ver su contenido.</p>
    <div class="data-actions"><button id="export-backup" class="primary">Descargar respaldo completo</button><label class="file-button secondary">Restaurar respaldo<input id="import-backup" type="file" accept=".json,application/json" ${storageError ? 'disabled' : ''} /></label></div>
    <p class="muted">Restaurar reemplaza todos los gastos actuales después de confirmar. Máximo 100 MB. Verifica que el respaldo se haya descargado antes de cerrar.</p></section>
    <section class="privacy-note"><h2>No pierdas tus tickets</h2><p>Descarga un respaldo antes de cerrar Lorax ticket tracker, borrar datos o cambiar de teléfono. Si tus gastos no aparecen al volver, usa “Restaurar respaldo”.</p>
    <p>Antes de cambiar de nombre o mover Lorax ticket tracker, guarda también un respaldo para recuperar tus registros.</p></section>`;
}
function downloadCsv(list: Expense[], suffix: string) {
  if (!list.length) { notify('No hay gastos para exportar en esta selección.'); return; }
  downloadFile(new Blob([exportCsv(list)], { type: 'text/csv;charset=utf-8' }), `lorax-${suffix}-${localDate()}.csv`);
  notify('CSV generado. No incluye las fotos de los tickets.');
}
function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
function bindData() {
  document.querySelector<HTMLInputElement>('#import-csv')?.addEventListener('change', async event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || busy || storageError) return;
    setBusy(true);
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error('El CSV supera el límite de 5 MB.');
      const imported = importCsv(await file.text());
      if (!imported.length) { notify('El CSV no contiene gastos para importar.'); return; }
      if (!confirm(`¿Agregar ${imported.length} gastos? Se conservarán los actuales. Si ya importaste este archivo, sus gastos se duplicarán. El CSV no incluye fotos.`)) return;
      const combined = [...expenses, ...imported];
      await replaceExpenses(combined);
      expenses = combined;
      backupNeeded = true;
      busy = false;
      render();
      notify(sessionOnly ? 'Gastos importados solo en esta sesión. Descarga un respaldo antes de cerrar.' :
        `${imported.length} gastos importados. Los gastos anteriores se conservaron.`);
    } catch (error) { notify(readableError(error), true); }
    finally { input.value = ''; setBusy(false); }
  });
  document.querySelector('#export-all')?.addEventListener('click', () => downloadCsv(
    [...expenses].sort((a, b) => b.date.localeCompare(a.date)), 'todos',
  ));
  document.querySelector('#export-selection')?.addEventListener('click', () => downloadCsv(selectedExpenses(), 'seleccion'));
  document.querySelector('#export-backup')?.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      const json = await exportBackup(expenses);
      downloadFile(new Blob([json], { type: 'application/json' }), `lorax-respaldo-${localDate()}.json`);
      backupNeeded = false;
      notify('Respaldo generado con gastos y fotos. Verifica que se haya descargado antes de cerrar.');
    } catch (error) { notify(readableError(error), true); }
    finally { setBusy(false); }
  });
  document.querySelector<HTMLInputElement>('#import-backup')?.addEventListener('change', async event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || busy || storageError) return;
    setBusy(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('El respaldo supera el límite de 100 MB.');
      const restored = importBackup(await file.text());
      if (!confirm(`¿Restaurar ${restored.length} gastos y sus fotos? Se reemplazarán los ${expenses.length} gastos actuales. No se puede deshacer.`)) return;
      await replaceExpenses(restored);
      expenses = restored;
      backupNeeded = true;
      busy = false;
      render();
      notify(sessionOnly ? 'Respaldo restaurado solo en esta sesión. Descarga un nuevo respaldo al hacer cambios.' :
        'Respaldo restaurado con sus fotos.');
    } catch (error) { notify(readableError(error), true); }
    finally { input.value = ''; setBusy(false); }
  });
}
window.addEventListener('beforeunload', event => {
  if (dirty || busy || (__PORTABLE__ && backupNeeded)) { event.preventDefault(); event.returnValue = ''; }
});
async function start() {
  root.innerHTML = '<main class="loading" role="status">Abriendo Lorax ticket tracker…</main>';
  try { expenses = await getExpenses(); }
  catch {
    if (__PORTABLE__) enableSessionStorage();
    else storageError = 'No se pudieron abrir tus gastos. Revisa los permisos del navegador y vuelve a abrir Lorax ticket tracker.';
  }
  render();
  void registerOffline(message => {
    offlineMessage = message;
    const node = document.querySelector('#offline-status');
    if (node) node.textContent = message;
  }, apply => {
    applyUpdate = apply;
    const button = document.querySelector<HTMLButtonElement>('#update-app');
    if (button) button.hidden = false;
  });
}
void start();
