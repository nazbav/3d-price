# 3D Print Cost Calculator

[Русская версия](./README_RU.md)

Browser-first calculator for estimating 3D printing jobs. The active application lives in [test.html](./test.html); legacy `index*.html` pages remain in the repository but are not the primary UI anymore.

## Current Scope

- Single-file app in `test.html` with Bootstrap-based UI and inline JavaScript.
- Local-first data model stored in browser `localStorage`.
- Optional Electron wrapper in [`electronapp/`](./electronapp/) for desktop usage, backup tooling, and remote/offline delivery.
- Legacy pages (`index1.html`, `index2.html`, `index3.html`) are historical snapshots, not the main development target.

## What `test.html` Does

- Maintains printers, materials, clients, global overheads, and calculation history.
- Calculates print cost using material, electricity, depreciation, maintenance, operator time, downtime, preparation, shipping, markup, discount, tax, and optional label/estimate printing costs.
- Supports urgency profiles with per-day work schedules.
- Supports per-printer multimaterial mode:
  - printer-level toggle `Мультиматериальная печать`
  - per-model material composition in a modal editor
  - total model weight derived from all material entries
- Imports G-code into calculator rows:
  - drag-and-drop into the calculator area
  - external post-processing flows such as `open_calc.py`
  - printer/material matching memory via local prompt memory
- Parses G-code metadata including print time, thumbnails, printer profile hints, and multimaterial tool usage.
- Generates compact thermal labels and printable estimate/order summary cards.
- Provides analytics in the Summary tab: revenue, profit, cost structure, material usage, printer load, client statistics, and period-based charts.
- Supports JSON import/export and encrypted short-lived cloud sync links/QR codes via Supabase.
- Supports optional Spoolman integration for material import and spool usage updates.

## Main UI Sections

`test.html` currently exposes these top-level sections:

- `Calculate`
- `History`
- `Clients`
- `Printers`
- `Materials`
- `Additional Costs`
- `Settings`
- `Summary`

Settings include branding, calculation rules, cloud sync, Spoolman integration, tax helper fields, interface language, and display currency.

## Quick Start

### Browser

```bash
git clone https://github.com/nazbav/3d-price.git
cd 3d-price
```

Open `test.html` in a modern browser.

Typical workflow:

1. Add printers.
2. Add materials and global overheads.
3. Open `Calculate`.
4. Add models manually or import G-code.
5. Run calculation and save it to history.

### Electron

```bash
cd electronapp
npm install
npm run start
```

Packaging commands:

```bash
npm run make
# or
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Electron-specific details live in [`electronapp/README.md`](./electronapp/README.md).

## G-code Import Notes

The calculator can import G-code and map it into model rows. Current import-related behavior includes:

- printer resolution by parsed printer/profile hints
- remembered material/printer choices in local prompt memory
- multimaterial parsing into per-material entries
- warnings when imported G-code contains multiple materials but the target printer is not marked as multimaterial

Sample files used during development may exist in `g-codes/`, but they are not required for normal app usage.

## Data Storage

- Main application data is stored in browser `localStorage`.
- JSON import/export is available from the UI.
- Cloud sync uses encrypted payloads and short-lived retrieval flow.
- Electron adds local backups on top of the browser data model.

## Development Notes

- Primary file to edit: [`test.html`](./test.html)
- Avoid treating legacy `index*.html` pages as the source of truth for new work.
- Root `test_offline.html` is no longer part of the active root workflow.
- For UI and JavaScript troubleshooting, prefer `lightpanda` smoke/debug runs over the old outdated UI tests.

## Verification

Useful local checks:

- open `test.html` in browser
- run targeted syntax checks for inline scripts
- use `lightpanda` for UI/JS regression hunting when environment allows it
- run Electron manually if changes may affect desktop behavior

## Repository Map

- [`test.html`](./test.html): active calculator UI
- [`electronapp/`](./electronapp/): desktop wrapper
- [`g-codes/`](./g-codes/): example/import G-code files when present
- [`docs/`](./docs/): project notes and supporting documentation
- [`orcaslicer-calc/`](./orcaslicer-calc/): slicer-related external subtree/work area present in this repo

## License

MIT
