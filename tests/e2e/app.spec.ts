import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('las tarjetas y encabezados vacíos abren Agrega un gasto con teclado y ratón', async ({ page }) => {
  await page.goto('./');
  for (const screen of ['Resumen', 'Gastos']) {
    for (const target of [screen === 'Resumen' ? 'Últimos movimientos' : 'Historial de gastos', '0 gastos: agrega un gasto', 'No hay gastos en esta selección']) {
      await page.getByRole('button', { name: screen, exact: true }).click();
      const button = page.getByRole('button', { name: target, exact: target !== 'No hay gastos en esta selección' });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Agrega un gasto', exact: true })).toBeFocused();
      await expect(page.getByText('UN TICKET, UN GASTO', { exact: true })).toBeVisible();
    }
  }
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await page.getByText('Agrega tu primer ticket o cambia los filtros.', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agrega un gasto', exact: true })).toBeVisible();
});

test('categorías personales: captura, persistencia, gráficas, respaldo y CSV', async ({ page }) => {
  const name = 'Educación <&">';
  const category = `custom:${name}`;
  await page.goto('./');
  await page.getByRole('button', { name: 'No hay gastos en esta selección' }).click();
  await page.getByLabel('Comercio', { exact: true }).fill('Escuela de prueba');
  await page.getByLabel('Importe (MXN)').fill('250.50');
  await page.getByText('Agregar categoría', { exact: true }).click();
  await page.getByLabel('Nombre de la categoría').fill(name);
  await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
  await expect(page.getByLabel('Comercio', { exact: true })).toHaveValue('Escuela de prueba');
  await expect(page.getByLabel('Importe (MXN)')).toHaveValue('250.50');
  await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue(category);
  await page.getByText('Agregar categoría', { exact: true }).click();
  await page.getByLabel('Nombre de la categoría').fill('EDUCACION <&">');
  await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Ya existe una categoría con ese nombre.');
  await page.getByLabel('Nombre de la categoría').fill('Viajes');
  await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption(category);
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await expect(page.getByText('Gasto guardado.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption(category);
  await expect(page.getByTestId('total')).toHaveText('$250.50');
  await expect(page.locator('.legend').getByText(name, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar selección CSV', exact: true }).click();
  const csv = await readFile((await (await csvDownload).path())!);
  await page.getByRole('button', { name: 'Mis datos', exact: true }).click();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar respaldo completo', exact: true }).click();
  const backup = await readFile((await (await backupDownload).path())!);

  const clearStorage = async () => {
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('mis-tickets');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }));
    await page.reload();
    await page.getByRole('button', { name: 'Mis datos', exact: true }).click();
  };
  await clearStorage();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-backup').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.getByRole('alert')).toHaveText('Respaldo restaurado con sus fotos.');
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('$250.50');
  await expect(page.locator('#category-filter option').filter({ hasText: 'Viajes' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar gasto de Escuela de prueba' }).click();
  await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue(category);
  await page.getByRole('button', { name: 'Mis datos', exact: true }).click();
  await clearStorage();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-csv').setInputFiles({ name: 'expenses.csv', mimeType: 'text/csv', buffer: csv });
  await expect(page.getByRole('alert')).toHaveText('1 gastos importados. Los gastos anteriores se conservaron.');
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.locator('.legend').getByText(name, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar gasto de Escuela de prueba' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar este gasto', exact: true }).click();
  await page.reload();
  await expect(page.locator('#category-filter option').filter({ hasText: name })).toHaveCount(1);
});

test('actualizar el almacenamiento anterior conserva los gastos existentes', async ({ page }) => {
  await page.goto('icon.svg');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('mis-tickets', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('expenses', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('expenses', 'readwrite');
      const today = new Date();
      tx.objectStore('expenses').put({
        id: 'legacy', merchant: 'Gasto anterior', date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
        amount: 12500, currency: 'MXN', category: 'otros', notes: '', createdAt: today.toISOString(),
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.goto('./');
  await expect(page.getByTestId('total')).toHaveText('$125.00');
  await page.getByRole('button', { name: 'Editar gasto de Gasto anterior' }).click();
  await page.getByText('Agregar categoría', { exact: true }).click();
  await page.getByLabel('Nombre de la categoría').fill('Mascotas');
  await page.getByRole('button', { name: 'Guardar categoría', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Categoría guardada.');
  await expect(page.getByLabel('Comercio', { exact: true })).toHaveValue('Gasto anterior');
});

test('captura manual, persistencia, filtros, edición, CSV y eliminación', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const homeScreen = await page.evaluate(async () => {
    const manifestUrl = (document.querySelector('link[rel="manifest"]') as HTMLLinkElement).href;
    const manifest = await (await fetch(manifestUrl)).json();
    const icons = await Promise.all(manifest.icons.filter((icon: { type: string }) => icon.type === 'image/png')
      .map(async (icon: { src: string }) => {
        const image = new Image();
        image.src = new URL(icon.src, manifestUrl).href;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }));
    return {
      start: new URL(manifest.start_url, manifestUrl).href,
      scope: new URL(manifest.scope, manifestUrl).href,
      display: manifest.display,
      icons,
    };
  });
  expect(homeScreen.start).toBe(page.url());
  expect(homeScreen.scope).toBe(page.url());
  expect(homeScreen.display).toBe('standalone');
  expect(homeScreen.icons).toEqual([{ width: 192, height: 192 }, { width: 512, height: 512 }]);
  await page.getByRole('button', { name: '+ Nuevo gasto', exact: true }).first().click();
  await page.getByLabel('Comercio', { exact: true }).fill('Súper de prueba');
  await page.getByLabel('Importe (MXN)').fill('123.45');
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('super');
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await expect(page.getByText('Gasto guardado.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('$123.45');
  for (const label of ['7 días', '28 días', '90 días', 'Mensual']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByTestId('total')).toHaveText('$123.45');
  }
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('gasolina');
  await expect(page.getByTestId('total')).toHaveText('$0.00');
  await page.getByRole('button', { name: 'No hay gastos en esta selección' }).click();
  await expect(page.getByRole('heading', { name: 'Agrega un gasto', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue('gasolina');
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('super');
  await page.getByRole('button', { name: 'Editar gasto de Súper de prueba' }).click();
  await page.getByLabel('Importe (MXN)').fill('200.10');
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar selección CSV' }).click();
  const download = await downloadEvent;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('"200.10","MXN"');
  expect(csv).toContain('Súper de prueba');
  await page.getByRole('button', { name: 'Editar gasto de Súper de prueba' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar este gasto' }).click();
  await expect(page.getByText('No hay gastos en esta selección')).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('OCR real sin internet, foto persistente y cero peticiones a terceros', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('./');
  await expect(page.locator('#offline-status')).toContainText('Lorax ticket tracker está listo', { timeout: 60_000 });
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: '+ Nuevo gasto', exact: true }).first().click();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">
    <rect width="1000" height="700" fill="white"/>
    <g font-family="Arial, sans-serif" font-size="65" fill="black">
      <text x="60" y="110">WALMART</text>
      <text x="60" y="220">10/11/2026</text>
      <text x="60" y="330">SUBTOTAL 100.00</text>
      <text x="60" y="440">TOTAL $116.00</text>
    </g></svg>`;
  await page.locator('#gallery').setInputFiles({
    name: 'ticket.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg),
  });
  await expect(page.getByRole('button', { name: 'Leer ticket', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leer ticket', exact: true }).click();
  await expect(page.getByLabel('Importe (MXN)')).toHaveValue('116.00', { timeout: 60_000 });
  await expect(page.getByLabel('Comercio', { exact: true })).toHaveValue(/WALMART/i);
  await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue('super');
  // Use today's date so the stored expense appears in the default month.
  await page.getByLabel('Fecha del gasto').fill(await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }));
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await expect(page.getByText('Gasto guardado.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Editar gasto de WALMART' }).click();
  await expect(page.getByAltText('Foto del ticket de este gasto')).toBeVisible();
  expect(requests.filter(url => !url.startsWith('http://localhost:4174/') && !url.startsWith('blob:') && !url.startsWith('data:'))).toEqual([]);
});
