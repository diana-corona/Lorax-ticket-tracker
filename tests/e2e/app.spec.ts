import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('captura manual, persistencia, filtros, edición, CSV y eliminación', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
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
  await page.goto('/');
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
