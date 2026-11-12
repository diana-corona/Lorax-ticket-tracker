import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = resolve('tickets-test');
const samples = existsSync(directory) ? readdirSync(directory).filter(file => /\.jpe?g$/i.test(file)) : [];
const expectationsPath = resolve(directory, 'expected.json');
const expected: Record<string, { amount: string; date: string }> = existsSync(expectationsPath)
  ? JSON.parse(readFileSync(expectationsPath, 'utf8')) : {};

test('muestras personales disponibles para las pruebas de fotos', () => {
  test.skip(!samples.some(name => expected[name]), 'Las fotos personales no se distribuyen con el repositorio.');
});

for (const [index, file] of samples.filter(name => expected[name]).entries()) {
  test(`ticket real ${index + 1}`, async ({ page, context }) => {
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
