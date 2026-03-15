# Verification Runbook — 3d-price

> **Date:** 2026-03-15  
> **Scope:** Pre-release verification checklist for `test.html` (browser) and Electron builds.

---

## 1. JS Syntax Check

Extract all inline `<script>` blocks from `test.html` and validate them with Node.js:

```powershell
cd L:\3d-price
node -e "
const fs = require('fs');
const src = fs.readFileSync('test.html', 'utf8');
const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0;
while ((m = re.exec(src)) !== null) {
  i++;
  try { new Function(m[1]); console.log('Block ' + i + ': OK'); }
  catch(e) { console.error('Block ' + i + ' SYNTAX ERROR: ' + e.message); process.exitCode = 1; }
}
console.log('Total script blocks checked: ' + i);
"
```

**Expected:** Every block prints `OK`. Any `SYNTAX ERROR` line must be fixed before release.

---

## 2. Calculation Invariants Check

Open `test.html` in a browser, open DevTools Console (`F12`), and run the invariant suite
described in [`docs/superpowers/specs/2026-03-15-multimaterial-design.md`](./2026-03-15-multimaterial-design.md).

Key invariants to verify manually or via console:
- Single-material cost = material weight × price/g + machine time cost + markup
- Multimaterial total = sum of per-material costs (no double-counting)
- Cost with 0 % markup equals base cost
- Negative or zero weight input is rejected / shows validation error
- Currency formatting matches selected locale

---

## 3. Migration Tests

Run against the local file URL so no server is required:

```powershell
cd L:\3d-price
$env:TEST_BASE_URL="file:///L:/3d-price/test.html"
python -m pytest testing/tests
python testing/run_migration_tests.py
```

`EXAMPLE.JSON` serves as the legacy-format fixture. Both commands must exit `0`.

---

## 4. Manual Smoke Checklist (Browser)

Open `test.html` in a modern browser (Chrome / Edge recommended). Run each step in order.

1. **Fresh load (no data)** — open in a clean profile or after clearing `localStorage`. Confirm the calculator loads with empty fields and default currency/language.
2. **Single material calculation** — enter filament type, weight, price, print time, markup. Confirm the estimate total updates correctly and the breakdown is visible.
3. **Multimaterial calculation** — add a second material slot. Confirm per-material costs and combined total are each correct.
4. **G-code drag-and-drop import** — drag the file  
   `g-codes\Стол_w14.0762g_t57m52s_ABS_K3D PROCH - KN ABS BLK - SKEW 09.08.2025 - 275 - XY COMP.gcode`  
   onto the drop zone. Confirm weight (≈14.08 g) and time (≈57 min 52 s) are auto-populated.
5. **History save / reopen / edit / delete** — save a calculation to history. Reload the page, reopen the saved entry, edit one field, save again, then delete it. Confirm all operations persist and the list updates correctly.
6. **Estimate download (PDF or print)** — click the export/download button. Confirm a PDF is generated or the browser print dialog opens with a correctly formatted estimate.
7. **Label generation** — generate a material label or model label. Confirm the label preview displays correct data and can be printed/downloaded.
8. **Language toggle EN/RU** — switch language. Confirm all visible UI strings change to the target language without page reload errors.
9. **Settings persistence (reload)** — change at least two settings (e.g., default markup, currency). Reload the page. Confirm the values are restored from `localStorage`.
10. **Analytics tab** — open the Analytics / Statistics tab. Confirm charts or summary data render without console errors.

---

## 5. Electron Smoke Verification

```bash
cd L:\3d-price\electronapp
npm install
npm run start
```

After the Electron window opens, repeat **all 10 steps** from the Manual Smoke Checklist above
inside the Electron window. Pay special attention to:

- Offline operation (no network): all features must work without an internet connection.
- Local backup: after saving history entries, confirm backup files appear in the expected directory.
- Window controls (minimize, maximize, close) work without crashing.

---

## 6. Evidence Required Before Release

| Gate | Command / Method | Expected Result | Evidence Location |
|------|-----------------|-----------------|-------------------|
| JS syntax | `node -e "..."` (Section 1) | All blocks `OK`, exit code 0 | Terminal output screenshot |
| Invariants | Browser console (Section 2) | No assertion failures | Console screenshot |
| Migration tests | `python -m pytest testing/tests` | All tests passed | `pytest` summary output |
| Migration script | `python testing/run_migration_tests.py` | Exit code 0, no errors | Terminal output screenshot |
| Browser smoke | Manual steps 1–10 (Section 4) | Each step passes | Annotated checklist (PDF/screenshot) |
| Electron smoke | Manual steps 1–10 (Section 5) | Each step passes | Annotated checklist (PDF/screenshot) |
| No console errors | DevTools Console during smoke | Zero uncaught errors | Console screenshot at end of session |

---

## 7. Release Checklist

**DO NOT release without completing all items above.**

- [ ] JS syntax check passed (Section 1)
- [ ] Calculation invariants verified (Section 2)
- [ ] Migration tests pass — `python -m pytest testing/tests` exits 0
- [ ] Migration script passes — `python testing/run_migration_tests.py` exits 0
- [ ] All 10 browser smoke steps completed and passed (Section 4)
- [ ] All 10 Electron smoke steps completed and passed (Section 5)
- [ ] Evidence collected and stored per Section 6 table
- [ ] `CHANGELOG.md` updated with release notes
- [ ] Version bumped in `electronapp/package.json` if applicable

---

*Runbook maintained alongside the production readiness plan at  
`docs/superpowers/plans/2026-03-15-production-readiness.md`.*
