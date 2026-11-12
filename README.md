# Lorax-ticket-tracker

**Lorax ticket tracker** helps you photograph receipts, organize expenses, and
review spending in Mexican pesos (MXN).

- Receipt reading with suggested merchant, date, total, and category.
- Monthly, last 7, 28, and 90 days views with charts and filters.
- CSV import/export and full backup/restore, including receipt photos.
- Expense editing and deletion.

## Build the Android file

Requires Node.js 22.12+ in the 22.x release line, or a newer Vite-compatible
Node.js release.

```sh
npm ci
npm run build:portable
```

This generates **`lorax.html`** with the interface, OCR engine, and Spanish
language model included. Send that single file to an Android phone and open it
in Chrome. No server, publishing, or installation is required to run this
version. Chrome may not offer an install or home-screen shortcut for local files.

Android file providers can restrict JavaScript, file opening, or saved data.
Desktop mobile emulation does not guarantee compatibility with every phone.
Review the extracted fields before saving a receipt.

## Keep your expenses

Under **Mis datos**, download a full backup before closing the app or replacing,
moving, or renaming its HTML file. If expenses are missing when reopening, use
**Restaurar respaldo**. If automatic saving is unavailable, the app displays a
warning and keeps expenses only until the tab is closed or refreshed.

CSV import adds expenses without deleting existing ones; importing the same
file twice duplicates its records. CSV does not include photos. Full backup
restore replaces current expenses after confirmation and includes photos.
Backups are not encrypted; keep them somewhere safe.

## Development

```sh
npm run dev
```

The optional hosted-web build is available with `npm run build` and
`npm run preview`. `index.html` is a required build source, not a second Android
deliverable. Generated HTML, build directories, and dependencies are not tracked.

## Tests

```sh
npm test
npx playwright install chromium webkit
npm run build:portable
npm run test:portable
npm run build
npm run test:e2e
```

Unit tests cover date ranges, money, filters, receipt parsing, CSV,
backup/restore, and storage transactions. Browser tests exercise the standalone
file without a server or internet, including actual OCR.

Personal receipt photos in `tickets-test/` are excluded from Git. Additional
photo tests run when the known local samples are present; otherwise the photo
suite is skipped. Synthetic OCR tests still run without those photos. Never
commit receipt photos, expense exports, backups, or test reports containing them.

## Rights

© 2026 [@diana-corona](https://github.com/diana-corona).
All rights reserved. Third-party dependencies retain their respective licenses.
