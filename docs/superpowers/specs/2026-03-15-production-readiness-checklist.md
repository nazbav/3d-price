# Production Readiness Checklist — 3d-price

> Date: 2026-03-15  
> Primary target file: `index.html`  
> Related plans: `docs/superpowers/plans/2026-03-15-production-readiness.md`

---

## 1. Core Calculation

- [ ] Single-material job: all cost components (material, electricity, depreciation, maintenance, operator, downtime, preparation, shipping, markup, discount, tax) calculate correctly
- [ ] Multi-material job: per-material weights sum to total model weight; each material's cost is computed separately and aggregated
- [ ] Urgency profiles: per-day schedules affect time-based cost components
- [ ] Markup and discount interact correctly (order of operations matches spec)
- [ ] Tax is applied to the correct subtotal
- [ ] Zero-weight edge case does not divide by zero or produce NaN
- [ ] Very large weight/time values do not overflow or truncate display

---

## 2. History (IndexedDB)

- [ ] New calculation is saved to history via Save button
- [ ] History list loads on page open without errors
- [ ] Saved item can be reopened and all fields are restored correctly
- [ ] Saved item can be edited and re-saved (update, not duplicate)
- [ ] Saved item can be deleted; it disappears from the list
- [ ] History export produces valid JSON containing all saved items
- [ ] History import from exported JSON restores all items
- [ ] Import does not silently drop fields present in the file
- [ ] IndexedDB errors (quota exceeded, blocked) surface a user-visible message

---

## 3. G-code Import

- [ ] Drag-and-drop `.gcode` file onto calculator area is recognized
- [ ] File is parsed and print time, weight/filament estimate are extracted
- [ ] Thumbnail (if embedded) is rendered in the model row
- [ ] Printer profile hint in G-code is matched to a known printer (or user is prompted)
- [ ] Material hint is matched or user is prompted via local prompt memory
- [ ] Previously remembered printer/material mapping is recalled on second import of same profile
- [ ] Post-processing bridge (`open_calc.py`) can pass a G-code path and the app opens it correctly
- [ ] Malformed or zero-byte G-code file surfaces an error, does not crash the app
- [ ] File with no metadata parses gracefully (time/weight shown as 0 or unknown)

---

## 4. Multimaterial Import & Mapping

- [ ] Multimaterial G-code (multiple tool changes) is detected correctly
- [ ] Full match: all materials in G-code map to known global materials → no prompt shown
- [ ] Partial match: some materials unknown → user is prompted only for unknowns
- [ ] All unknown: user is prompted for every material
- [ ] Target printer does NOT have multimaterial flag → warning is shown before import
- [ ] Target printer HAS multimaterial flag → materials are imported as separate entries in the modal
- [ ] Per-material weights are parsed and stored correctly
- [ ] Cancelling the mapping dialog does not leave a corrupt partial row

---

## 5. Estimate / Report / Label Output

- [ ] Estimate card renders all cost line items in correct order
- [ ] Estimate download (PDF/print) does not clip or truncate content
- [ ] Thermal label renders correctly for single-material jobs
- [ ] Thermal label renders correctly for multimaterial jobs (all materials shown)
- [ ] Label on/off toggle in settings is respected; label is not generated when disabled
- [ ] Branding (logo, company name) from settings appears in estimate and label
- [ ] Currency symbol from settings is applied consistently in all outputs

---

## 6. English UI — No Russian Leakage

- [ ] All navigation tabs and section headers are in English
- [ ] All button labels are in English
- [ ] All modal titles and prompts are in English
- [ ] All error and warning messages are in English
- [ ] All placeholder text and tooltips are in English
- [ ] Column headers in calculator table are in English
- [ ] Column headers in history table are in English
- [ ] Column headers in clients/printers/materials/overheads tables are in English
- [ ] Analytics / Summary labels and chart axes are in English
- [ ] Settings section labels and field names are in English
- [ ] No hard-coded Russian strings appear in console logs during normal use

---

## 7. Electron Shared Path

- [ ] App launches via `npm run start` in `electronapp/` without errors
- [ ] `localStorage` / IndexedDB is accessible inside Electron (not blocked by file:// restrictions)
- [ ] Shared path (e.g. for Electron backup or file access) resolves correctly on Windows
- [ ] Electron backup writes/reads files without permission errors
- [ ] Packaging with `npm run make` (or `dist:win`) produces a working installer/executable
- [ ] Packaged app opens `index.html` correctly and all features function

---

## 8. Modules — Full Coverage

### 8a. Calculator
- [ ] Add row, remove row, reorder rows
- [ ] All input fields accept valid numeric values
- [ ] Invalid input (negative, non-numeric) is rejected or sanitised

### 8b. History
- [ ] See Section 2 above

### 8c. Clients
- [ ] Add, edit, delete client records
- [ ] Client selection in calculator row works
- [ ] Client list persists across page reload

### 8d. Printers
- [ ] Add, edit, delete printer records
- [ ] Multimaterial flag toggle saves and is read back correctly
- [ ] Printer selection in calculator row is consistent with saved printers

### 8e. Global Materials
- [ ] Add, edit, delete material records
- [ ] Material cost per gram updates calculator rows referencing it
- [ ] Spoolman import populates materials correctly

### 8f. Overheads (Additional Costs)
- [ ] Add, edit, delete overhead entries
- [ ] Overhead values are included in calculation total
- [ ] Overhead list persists across page reload

### 8g. Analytics / Summary
- [ ] Revenue, profit, cost structure totals match manual cross-check
- [ ] Material usage breakdown is correct
- [ ] Printer load chart renders without JS errors
- [ ] Client statistics table populates
- [ ] Period filter (date range) narrows results correctly

### 8h. My Tax
- [ ] Tax rate field saves and is applied to new calculations
- [ ] Tax total in estimate matches expected value
- [ ] Changing tax rate does not corrupt existing history items

### 8i. Spoolman
- [ ] Spoolman URL setting is saved and persists
- [ ] Import materials from Spoolman fetches and maps correctly
- [ ] Spool usage update sends correct payload
- [ ] Connection error surfaces a user-visible message

### 8j. G-code Import
- [ ] See Section 3 and Section 4 above

### 8k. Electron Wrapper
- [ ] See Section 7 above

---

## 9. Data Integrity & Edge Cases

- [ ] JSON export from UI is valid JSON (parse without error)
- [ ] JSON import from a previous version (legacy schema) migrates fields correctly
- [ ] Page reload does not lose unsaved in-progress calculation (or user is warned)
- [ ] Multiple browser tabs do not corrupt shared IndexedDB / localStorage data
- [ ] Very long model/client names do not break table layout

---

## 10. Release Gate Summary

All items in Sections 1–9 must be checked before a release is tagged.  
Blocking issues: Sections 1, 2, 3, 4, 5, 6.  
High priority (should not ship broken): Sections 7, 8, 9.
