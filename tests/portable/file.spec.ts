import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const appUrl = pathToFileURL(resolve('lorax.html')).href;
async function backup(page: Page) {
  await page.getByRole('button', { name: 'Mis datos', exact: true }).first().click();
  await expect(page.locator('.privacy-note')).toContainText('Descarga un respaldo antes de cerrar Lorax ticket tracker,');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar respaldo completo' }).click();
  return readFile((await (await pending).path())!, 'utf8');
}
test('archivo local sin servidor ni red: OCR real, respaldo con foto y reapertura', async ({ page, context }) => {
  const network: string[] = [];
  const unexpectedFiles: string[] = [];
  const errors: string[] = [];
  context.on('request', request => {
    if (/^https?:/.test(request.url())) network.push(request.url());
    if (request.url().startsWith('file:') && request.url() !== appUrl) unexpectedFiles.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  await context.setOffline(true);
  await page.goto(appUrl);
  await expect(page.getByRole('link', { name: 'Lorax ticket tracker, inicio' })).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: '@diana-corona' }))
    .toHaveAttribute('href', 'https://github.com/diana-corona');
  await expect(page.locator('footer')).toContainText('Todos los derechos reservados.');
  await expect(page).toHaveTitle('Lorax ticket tracker');
  await expect(page.locator('body')).not.toContainText('Tu dinero, más claro');
  await expect(page.locator('body')).not.toContainText('UN POCO DE ORDEN, MUCHA TRANQUILIDAD');
  await expect(page.locator('body')).not.toContainText('Una visión clara de tu dinero.');
  await page.getByRole('button', { name: '+ Nuevo gasto', exact: true }).first().click();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">
    <rect width="1000" height="700" fill="white"/>
    <g font-family="Arial, sans-serif" font-size="65" fill="black">
      <text x="60" y="110">WALMART</text>
      <text x="60" y="220">10/11/2026</text>
      <text x="60" y="330">SUBTOTAL 100.00</text>
      <text x="60" y="440">TOTAL $116.00</text>
    </g></svg>`;
  await page.locator('#gallery').setInputFiles({ name: 'ticket.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await page.getByRole('button', { name: 'Leer ticket', exact: true }).click();
  await expect(page.getByLabel('Importe (MXN)')).toHaveValue('116.00', { timeout: 60_000 });
  await expect(page.getByLabel('Comercio', { exact: true })).toHaveValue('WALMART');
  await page.getByLabel('Fecha del gasto').fill(await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }));
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await expect(page.getByText('Gasto guardado.', { exact: true })).toBeVisible();
  const json = JSON.parse(await backup(page));
  expect(json.expenses).toHaveLength(1);
  expect(json.expenses[0].photo.type).toBe('image/jpeg');
  expect(json.expenses[0].photo.data.length).toBeGreaterThan(100);
  const reopened = await context.newPage();
  await reopened.goto(appUrl);
  await expect(reopened.getByTestId('total')).toHaveText('$116.00');
  await reopened.getByRole('button', { name: 'Editar gasto de WALMART' }).click();
  await expect(reopened.getByAltText('Foto del ticket de este gasto')).toBeVisible();
  await reopened.getByRole('button', { name: 'Quitar foto', exact: true }).click();
  await reopened.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await expect(reopened.getByText('Gasto guardado.', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: 'Mis datos', exact: true }).first().click();
  reopened.once('dialog', dialog => dialog.accept());
  await reopened.locator('#import-backup').setInputFiles({
    name: 'con-foto.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(reopened.getByText('Respaldo restaurado con sus fotos.', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: 'Gastos', exact: true }).click();
  await reopened.getByRole('button', { name: 'Editar gasto de WALMART' }).click();
  const photo = reopened.getByAltText('Foto del ticket de este gasto');
  await expect(photo).toBeVisible();
  await expect(photo).toHaveJSProperty('naturalWidth', 1000);
  expect(network).toEqual([]);
  expect(unexpectedFiles).toEqual([]);
  expect(errors).toEqual([]);
});

test('si Chrome deniega almacenamiento, advierte y permite recuperar respaldo entre sesiones', async ({ page, context }) => {
  await context.setOffline(true);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Access denied', 'SecurityError'); } });
  });
  await page.goto(appUrl);
  await expect(page.getByText('No se pueden guardar tus gastos automáticamente.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Nuevo gasto', exact: true }).first().click();
  await page.getByLabel('Comercio', { exact: true }).fill('Temporal');
  await page.getByLabel('Importe (MXN)').fill('20');
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await expect(page.getByText('Gasto conservado solo en esta sesión.', { exact: false })).toBeVisible();
  const json = await backup(page);
  await page.reload();
  await expect(page.getByTestId('total')).toHaveText('$0.00');
  await page.getByRole('button', { name: 'Mis datos', exact: true }).first().click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-backup').setInputFiles({
    name: 'respaldo.json', mimeType: 'application/json', buffer: Buffer.from(json),
  });
  await expect(page.getByText('Respaldo restaurado solo en esta sesión.', { exact: false })).toBeVisible();
  await page.locator('#import-backup').setInputFiles({
    name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByText('Respaldo inválido o incompatible.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('$20.00');
});

test('Lorax simplifica la interfaz e importa CSV sin borrar gastos ni aceptar archivos inválidos', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto(appUrl);
  await expect(page.locator('body')).not.toContainText(/archivo local|sin servidor|privado por diseño|sin cuentas|sin nube/i);
  await page.getByRole('button', { name: '+ Nuevo gasto', exact: true }).first().click();
  await page.getByLabel('Comercio', { exact: true }).fill('Gasto existente');
  await page.getByLabel('Importe (MXN)').fill('10');
  await page.getByRole('button', { name: 'Guardar gasto', exact: true }).click();
  await page.getByRole('button', { name: 'Mis datos', exact: true }).first().click();
  await expect(page.locator('#persist')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/almacenamiento del navegador|almacenamiento persistente/i);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar todos a CSV', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^lorax-todos-/);
  const csv = await readFile((await download.path())!, 'utf8');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-csv').setInputFiles({
    name: 'gastos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.getByText('1 gastos importados. Los gastos anteriores se conservaron.', { exact: true })).toBeVisible();
  await page.locator('#import-csv').setInputFiles({
    name: 'invalido.csv', mimeType: 'text/csv', buffer: Buffer.from('invalid,headers'),
  });
  await expect(page.getByRole('alert')).toContainText('Usa un CSV de Lorax');
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('$20.00');
  await expect(page.locator('body')).not.toContainText(/archivo local|sin servidor|privado por diseño/i);
});
