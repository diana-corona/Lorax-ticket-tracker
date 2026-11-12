import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = resolve('tickets-test');
const samples = existsSync(directory) ? readdirSync(directory).filter(file => /\.jpe?g$/i.test(file)) : [];
const expected: Record<string, { amount: string; date: string }> = {
  'WhatsApp Image 2026-11-10 at 17.34.58.jpeg': { amount: '288.00', date: '2026-11-10' },
  'WhatsApp Image 2026-11-10 at 17.35.26.jpeg': { amount: '288.00', date: '2026-11-10' },
  'photo_2026-11-11 16.25.43.jpeg': { amount: '4010.00', date: '2019-05-23' },
  'photo_2026-11-11 16.25.44.jpeg': { amount: '4010.00', date: '2019-05-23' },
  'photo_2026-11-11 16.25.45.jpeg': { amount: '1210.00', date: '2020-05-16' },
  'photo_2026-11-11 16.25.46.jpeg': { amount: '1210.00', date: '2020-05-16' },
  'photo_2026-11-11 16.25.47.jpeg': { amount: '1210.00', date: '2020-05-16' },
  'photo_2026-11-11 16.25.49.jpeg': { amount: '288.00', date: '2026-11-10' },
  'photo_2026-11-11 16.25.52.jpeg': { amount: '288.00', date: '2026-11-10' },
};

test('muestras personales disponibles para las pruebas de fotos', () => {
  test.skip(!samples.some(name => expected[name]), 'Las fotos personales no se distribuyen con el repositorio.');
});

for (const file of samples.filter(name => expected[name])) {
  test(`ticket real: ${file}`, async ({ page, context }) => {
    test.setTimeout(120_000);
    const requests: string[] = [];
    context.on('request', request => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await context.setOffline(true);
    await page.goto(pathToFileURL(resolve('lorax-ticket-tracker.html')).href);
    await page.getByRole('button', { name: '+ Nuevo gasto', exact: true }).first().click();
    await page.locator('#gallery').setInputFiles(resolve('tickets-test', file));
    await page.getByRole('button', { name: 'Leer ticket', exact: true }).click();
    await expect(page.locator('#notice')).toBeVisible({ timeout: 100_000 });
    await expect(page.getByRole('button', { name: 'Guardar gasto', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Importe (MXN)')).toHaveValue(expected[file].amount);
    await expect(page.getByLabel('Fecha del gasto')).toHaveValue(expected[file].date);
    await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue('otros');
    expect(requests).toEqual([]);
  });
}
