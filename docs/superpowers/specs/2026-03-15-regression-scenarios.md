# Regression Scenario Matrix — 3d-price

> Date: 2026-03-15  
> Related checklist: `docs/superpowers/specs/2026-03-15-production-readiness-checklist.md`

---

## Available G-code Test Files

From `g-codes/` directory (as of 2026-03-15):

| File | Notes |
|------|-------|
| `Стол_w14.0762g_t57m52s_ABS_K3D PROCH - KN ABS BLK - SKEW 09.08.2025 - 275 - XY COMP.gcode` | Single-material ABS print, ~14g, ~57m52s print time, OrcaSlicer-style metadata |

> Add new files to this table as they are placed in `g-codes/`.

---

## Scenario 1 — Empty Fresh Start

**Goal:** Verify the app is usable immediately after first open with no prior data.

**Steps:**
1. Clear all `localStorage` and wipe IndexedDB (DevTools → Application → Clear storage).
2. Open `index.html`.
3. Observe: no console errors, no broken UI elements.
4. Verify all sections (Calculate, History, Clients, Printers, Materials, Additional Costs, Settings, Summary) are navigable.

**Pass criteria:**
- No JS errors in console.
- All sections open without crashes.
- Calculator shows an empty row or an "add model" prompt.
- History shows empty state message.

---

## Scenario 2 — Single-Material Manual Calculation

**Goal:** End-to-end cost calculation for one model using one material.

**Steps:**
1. Add one printer (e.g. "Test Printer", 220W power, 0.1 kWh price).
2. Add one material (e.g. "PLA White", 0.025 $/g).
3. Open Calculate. Add a model row.
4. Fill in: model name, weight 50g, print time 1h, select printer and material.
5. Click Calculate.
6. Check that all cost components appear and total is non-zero.
7. Save to history.

**Pass criteria:**
- Material cost = 50 × 0.025 = 1.25 (or equivalent in configured currency).
- Electricity cost = 220W × 1h = 0.022 kWh, priced at configured kWh rate.
- Total cost is positive and consistent.
- History shows the new saved item.

---

## Scenario 3 — Multimaterial Manual Calculation

**Goal:** Cost calculation using the multimaterial modal.

**Prerequisites:** A printer with "Мультиматериальная печать" (multimaterial) flag enabled.

**Steps:**
1. Add a printer with multimaterial flag ON.
2. Add at least 2 materials (e.g. "PLA White" and "PLA Black").
3. Open Calculate. Add a model row, select the multimaterial printer.
4. Open the material composition modal for the row.
5. Add both materials with weights: 30g and 20g.
6. Close modal. Verify total weight shown = 50g.
7. Click Calculate.

**Pass criteria:**
- Total model weight = sum of all material entries.
- Each material's cost is computed and summed.
- No missing or NaN cost line.
- Save and reopen from history restores both material entries.

---

## Scenario 4 — Drag-and-Drop G-code Import

**Goal:** Import a `.gcode` file by dragging it into the calculator area.

**Test file:** `g-codes/Стол_w14.0762g_t57m52s_ABS_K3D PROCH - KN ABS BLK - SKEW 09.08.2025 - 275 - XY COMP.gcode`

**Steps:**
1. Ensure at least one printer and one material (ABS) exist in the catalog.
2. Open Calculate.
3. Drag the `.gcode` file from the file manager onto the calculator drop zone.
4. Observe parsing: print time, weight, thumbnail extraction.
5. Complete any printer/material mapping prompt if shown.
6. Click Calculate.

**Pass criteria:**
- File is accepted (no "unsupported file" error).
- Print time parsed as ~57m52s (3472 seconds).
- Weight parsed as ~14.0762g.
- Thumbnail visible in the row (if embedded in file).
- Cost calculated without errors.

---

## Scenario 5 — External Post-Processing Import

**Goal:** Verify the `open_calc.py` bridge can pass a G-code file to the app.

**Steps:**
1. Confirm `open_calc.py` exists at repo root.
2. Run: `python open_calc.py "g-codes/<test_file>.gcode"` (adjust path as needed).
3. Observe: browser/Electron opens and the file is loaded into a calculator row.

**Pass criteria:**
- App opens with the G-code pre-loaded (not empty).
- Parse results match Scenario 4 expectations.
- No Python or browser-side errors.

---

## Scenario 6 — Import into Printer Without Multimaterial Flag

**Goal:** Warn user when importing multimaterial G-code into a non-MM printer.

**Prerequisites:** A printer without the multimaterial flag.

**Steps:**
1. Have a printer with multimaterial flag OFF.
2. Import the test G-code (if single-material file is used, substitute a multimaterial `.gcode` if available).
3. Observe whether a warning is shown about printer not being multimaterial.

**Pass criteria:**
- Warning modal or notification appears.
- User can dismiss the warning and continue.
- Row is created (possibly with only one material entry) without crashing.

---

## Scenario 7 — Save / Reopen History Item

**Goal:** Verify round-trip save → reload → reopen of a history entry.

**Steps:**
1. Complete Scenario 2 (single-material calculation) and save.
2. Reload the page (F5).
3. Open History tab.
4. Click on the saved item.
5. Verify all fields match what was entered.
6. Edit the model name. Save again.
7. Verify the name update is reflected in history (no duplicate).
8. Delete the item. Verify it disappears.

**Pass criteria:**
- Data survives page reload.
- Edit updates the existing record, does not create a duplicate.
- Delete removes the record permanently.

---

## Scenario 8 — Estimate Download

**Goal:** Verify estimate generation and download/print flow.

**Steps:**
1. Complete a calculation (any scenario above).
2. Click the "Estimate" / "Смета" button.
3. Observe the estimate card/modal.
4. Trigger print or PDF save.

**Pass criteria:**
- Estimate renders all cost line items.
- Branding (if configured) appears.
- Currency symbol matches settings.
- No content is clipped in the printable output.
- No JS errors during generation.

---

## Scenario 9 — Label Generation On / Off

**Goal:** Verify label toggle in settings controls label output.

**Steps:**
1. Go to Settings. Enable label generation.
2. Complete a calculation. Verify label is available/rendered.
3. Go to Settings. Disable label generation.
4. Complete or re-open a calculation. Verify label is NOT generated or shown.

**Pass criteria:**
- Label appears when enabled.
- Label does not appear when disabled.
- Setting persists after page reload.

---

## Scenario 10 — English UI Smoke Pass

**Goal:** Confirm no visible Russian strings leak into the English UI.

**Steps:**
1. Open `index.html`.
2. If a language switcher exists, select English (or confirm English is default).
3. Navigate through all sections: Calculate, History, Clients, Printers, Materials, Additional Costs, Settings, Summary.
4. Open each major modal: multimaterial editor, estimate card, label preview, G-code import prompt, cloud sync, Spoolman, printer edit, material edit, client edit.
5. Trigger at least one error/warning (e.g. try to save with missing fields).

**Pass criteria:**
- All visible UI text is in English.
- No Cyrillic characters appear in labels, buttons, headers, placeholders, or error messages.
- Console logs may still contain Russian diagnostic strings (acceptable), but UI strings must be English.

---

## Notes

- Run Scenarios 1–10 before any release tag.
- Scenarios 2, 3, 4, 7 are the minimum blocking set.
- Scenarios 5, 6, 8, 9, 10 are high-priority but may be deferred to a follow-up patch if confirmed non-breaking.
- When new G-code files are added to `g-codes/`, update the table at the top of this document.
