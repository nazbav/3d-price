# 3D Print Cost Calculator

[Русская версия](./README_RU.md)

<p align="center">
  <a href="https://github.com/nazbav/3d-price/releases">
    <img src="https://img.shields.io/github/v/release/nazbav/3d-price?display_name=tag&style=flat-square" alt="Latest release">
  </a>
  <a href="https://github.com/nazbav/3d-price/releases">
    <img src="https://img.shields.io/github/downloads/nazbav/3d-price/total?style=flat-square" alt="Total downloads">
  </a>
  <a href="https://github.com/nazbav/3d-price/pulse">
    <img src="https://img.shields.io/github/last-commit/nazbav/3d-price?style=flat-square" alt="Last commit">
  </a>
  <a href="https://github.com/nazbav/3d-price/stargazers">
    <img src="https://img.shields.io/github/stars/nazbav/3d-price?style=flat-square" alt="GitHub stars">
  </a>
  <a href="https://github.com/nazbav/3d-price/network/members">
    <img src="https://img.shields.io/github/forks/nazbav/3d-price?style=flat-square" alt="GitHub forks">
  </a>
</p>

<p align="center">
  <a href="https://github.com/nazbav/3d-price">Repository</a> •
  <a href="https://github.com/nazbav/3d-price/releases">Releases</a> •
  <a href="https://github.com/nazbav/3d-price/pulse">Pulse</a> •
  <a href="https://github.com/nazbav/3d-price/graphs/contributors">Contributors</a> •
  <a href="https://github.com/nazbav/3d-price/graphs/traffic">Traffic</a>
</p>

<p align="center">
  <a href="https://github.com/nazbav/3d-price">
    <img src="https://github-readme-stats.vercel.app/api/pin/?username=nazbav&repo=3d-price&show_owner=true&theme=transparent" alt="3d-price repository card">
  </a>
</p>

<p align="center">
  <a href="https://star-history.com/#nazbav/3d-price&Date">
    <img src="https://api.star-history.com/svg?repos=nazbav/3d-price&type=Date" alt="Star History Chart">
  </a>
</p>

Browser-first calculator for estimating 3D printing jobs. The active application lives in [index.html](./index.html); legacy `index*.html` pages remain in the repository but are not the primary UI anymore.

## Current Scope

- Single-file app in `index.html` with Bootstrap-based UI and inline JavaScript.
- Local-first data model stored in browser `localStorage`.
- Optional Electron wrapper in [`electronapp/`](./electronapp/) for desktop usage, backup tooling, and remote/offline delivery.
- Legacy pages (`index1.html`, `index2.html`, `index3.html`) are historical snapshots, not the main development target.

## What `index.html` Does

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

`index.html` currently exposes these top-level sections:

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

Open `index.html` in a modern browser.

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

- Primary file to edit: [`index.html`](./index.html)
- Avoid treating legacy `index*.html` pages as the source of truth for new work.
- Root `test_offline.html` is no longer part of the active root workflow.
- For UI and JavaScript troubleshooting, prefer `lightpanda` smoke/debug runs over the old outdated UI tests.

## Verification

Useful local checks:

- open `index.html` in browser
- run targeted syntax checks for inline scripts
- use `lightpanda` for UI/JS regression hunting when environment allows it
- run Electron manually if changes may affect desktop behavior

### Production Readiness

Full pre-release verification procedure (JS syntax check, migration tests, manual smoke checklist, Electron smoke, and evidence gates) is documented in the runbook:

**[`docs/superpowers/specs/2026-03-15-verification-runbook.md`](./docs/superpowers/specs/2026-03-15-verification-runbook.md)**

> **DO NOT release without completing all items in the runbook.**

## Repository Map

- [`index.html`](./index.html): active calculator UI
- [`electronapp/`](./electronapp/): desktop wrapper
- [`g-codes/`](./g-codes/): example/import G-code files when present
- [`docs/`](./docs/): project notes and supporting documentation
- [`orcaslicer-calc/`](./orcaslicer-calc/): slicer-related external subtree/work area present in this repo

## Production Readiness / Release Checklist

Full checklist: [`docs/superpowers/specs/2026-03-15-production-readiness-checklist.md`](./docs/superpowers/specs/2026-03-15-production-readiness-checklist.md)  
Regression scenarios: [`docs/superpowers/specs/2026-03-15-regression-scenarios.md`](./docs/superpowers/specs/2026-03-15-regression-scenarios.md)

Top-level release gates:

- **Core calculation** — single and multimaterial cost computation is correct
- **History / storage** — save, reload, edit, delete, export/import all work with the current local-first storage model
- **G-code import** — drag-drop, post-processing bridge, metadata parsing
- **Multimaterial mapping** — full/partial/unknown material match; MM flag warning
- **Estimate / label output** — renders correctly, downloads without clipping
- **English UI** — no Russian leakage in any critical path
- **Electron wrapper** — shared path resolves; packaging produces a working build
- **All modules** — calculator, history, clients, printers, materials, overheads, analytics, My Tax, Spoolman each verified

## License

MIT
