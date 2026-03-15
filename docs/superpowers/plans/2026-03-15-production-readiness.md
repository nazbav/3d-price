# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `test.html` and the shared Electron-facing flow to a defensible production-ready state for day-to-day real use, with verified import, calculation, persistence, reporting, and localization behavior.

**Architecture:** Keep the current single-file architecture centered on `test.html`, but treat production-readiness as a hardening pass rather than a redesign. Work in focused slices: define release gates, close runtime/i18n/layout defects, verify core calculation and import paths on real data, then validate the shared browser/Electron behavior against a fixed regression checklist.

**Tech Stack:** Vanilla HTML/CSS/JS in `test.html`, browser `localStorage`, browser `indexedDB`, shared Electron wrapper in `electronapp/`, shell verification, real sample G-code files from `g-codes/`.

---

## Chunk 1: Define release gates and freeze the target behavior

### Task 1: Write the production-ready checklist

**Files:**
- Modify: `README.md`
- Modify: `README_RU.md`
- Create: `docs/superpowers/specs/2026-03-15-production-readiness-checklist.md`

- [ ] **Step 1: Write the release gate document**

Create a concrete checklist covering:
- core calculation works
- history works with `indexedDB`
- G-code import works
- multimaterial import/mapping works
- estimate/report/label output is stable
- English UI does not leak Russian in critical paths
- Electron shared path is not broken

- [ ] **Step 2: Mirror the production expectations in the README files**

Add a short “production readiness / release checklist” note in both README files so the repo documents what must be true before release.

- [ ] **Step 3: Review the checklist against actual current features**

Confirm the checklist covers:
- calculator
- history
- clients
- printers
- global materials
- overheads
- analytics
- My Tax
- Spoolman
- G-code import
- Electron wrapper

### Task 2: Freeze a regression scenario set

**Files:**
- Create: `docs/superpowers/specs/2026-03-15-regression-scenarios.md`
- Check: `g-codes/`

- [ ] **Step 1: Define a minimum scenario matrix**

Document named scenarios for:
- empty fresh start
- single-material manual calculation
- multimaterial manual calculation
- drag-and-drop G-code import
- external post-processing import
- import into printer without multimaterial flag
- save/reopen history item
- estimate download
- label generation on/off
- English UI smoke pass

- [ ] **Step 2: Attach exact sample data**

List the exact G-code files and sample model/material/printer setups that will be reused during the hardening pass.

---

## Chunk 2: Eliminate remaining critical runtime UI defects

### Task 3: Finish runtime localization coverage

**Files:**
- Modify: `test.html`

- [ ] **Step 1: Audit remaining dynamic text paths**

Search all remaining runtime producers:
- `showToastAuto`
- `showToast`
- `showMultiPrompt`
- `showConfirmModal`
- `textContent = ...`
- `innerHTML = ...`
- warning builders
- import prompts
- status banners

- [ ] **Step 2: Convert remaining critical paths to localization-safe output**

Ensure:
- prompt titles
- prompt labels/options/help
- dynamic warnings
- import errors
- schema migration status
- My Tax status text
- Spoolman status text
- history/status UI

all route through `translateUiText(...)` or a localized helper.

- [ ] **Step 3: Verify no Russian leaks in English mode for critical flows**

Run a targeted runtime smoke pass for:
- calculator
- analytics
- multimaterial modal
- import prompts
- history editing
- settings tabs

### Task 4: Close remaining layout/overflow regressions

**Files:**
- Modify: `test.html`

- [ ] **Step 1: Audit long-text surfaces**

Review and fix overflow behavior in:
- estimate card
- detailed result cards
- printer breakdown cards
- history table
- model materials modal
- warnings/alerts
- prompt modals
- label rendering

- [ ] **Step 2: Normalize compact display helpers**

Where appropriate, make long names/material descriptions use:
- compact display labels
- tooltip/full-title fallback
- wrapping for warning/details text

- [ ] **Step 3: Verify with long real-world names**

Use the long sample G-code filename and long material names to confirm the UI no longer breaks structure.

---

## Chunk 3: Harden calculation correctness and persistence

### Task 5: Lock down calculation invariants

**Files:**
- Modify: `test.html`
- Create: `docs/superpowers/specs/2026-03-15-calculation-invariants.md`

- [ ] **Step 1: Define invariants**

Document and verify invariants such as:
- total model weight equals sum of material entries in multimaterial mode
- total material consumption equals per-model material sums
- cost breakdown sums to subtotal/base cost within allowed rounding
- excluded models do not affect totals
- label cost only applies when enabled per model and globally

- [ ] **Step 2: Add shell-verifiable checks**

Create small JS verification snippets or debug helpers that can be run from the shell against `test.html` logic to confirm invariant behavior.

- [ ] **Step 3: Re-run after each production hardening slice**

Treat these invariants as mandatory regression checks before any release claim.

### Task 6: Verify history and persistence behavior

**Files:**
- Modify: `test.html`

- [ ] **Step 1: Audit all history read/write paths**

Review:
- `loadHistoryLayer`
- `persistHistoryLayerAsync`
- `saveToLocalStorage`
- import/export history
- history edit/delete/status flows

- [ ] **Step 2: Confirm strict `indexedDB` assumptions remain coherent**

Verify:
- no accidental fallback was added
- errors are understandable
- no code path silently discards history writes

- [ ] **Step 3: Validate reopen/edit/delete flows**

Check that a saved calculation can be:
- reopened
- edited
- status-changed
- deleted
- exported/imported back

without data drift.

---

## Chunk 4: Harden G-code import and multimaterial mapping

### Task 7: Validate all G-code entry points

**Files:**
- Modify: `test.html`
- Check: `g-codes/`

- [ ] **Step 1: Enumerate the import entry points**

Cover all paths:
- drag-and-drop
- direct G-code import
- incoming-link/import bridge
- external post-processing script path

- [ ] **Step 2: Verify each path uses the same material resolution logic**

Confirm all entry points converge through:
- parser
- material matching
- multimaterial entry creation
- warning behavior

- [ ] **Step 3: Validate partial-match and unknown-material behavior**

Test:
- fully matched multimaterial file
- partially matched file
- unknown material names/tools
- printer without multimaterial flag

Ensure nothing silently collapses to the first material.

### Task 8: Validate import naming and metadata rules

**Files:**
- Modify: `test.html`

- [ ] **Step 1: Recheck model-name normalization rules**

Confirm import display names prefer:
- parsed model name
- cleaned filename
- no `.gcode`
- no noisy technical tail where display should be human-readable

- [ ] **Step 2: Verify labels/estimate use compact names while details keep full names**

Check:
- model row
- estimate
- label
- detailed report

- [ ] **Step 3: Confirm thumbnails and printer resolution stay intact**

Make sure hardening work did not break:
- thumbnail import
- printer matching
- model ID uniqueness

---

## Chunk 5: Validate Electron-shared behavior explicitly

### Task 9: Audit Electron-sensitive assumptions

**Files:**
- Modify: `test.html`
- Modify: `electronapp/README.md`

- [ ] **Step 1: Identify browser-only assumptions used by `test.html`**

Review use of:
- `indexedDB`
- `localStorage`
- Blob downloads
- drag/drop
- file inputs
- popup/toast flows
- QR/export helpers

- [ ] **Step 2: Confirm Electron bridge compatibility**

Check that current UI hardening still works when:
- Electron toast path is used
- local file/electron-hosted path is used
- download/export path is used

- [ ] **Step 3: Update Electron docs**

Document the exact expectations and any known release caveats for Electron shared usage.

### Task 10: Run Electron smoke verification

**Files:**
- Check: `electronapp/`
- Check: `test.html`

- [ ] **Step 1: Start Electron in dev mode**

Run:
```bash
cd electronapp && npm install && npm run start
```

- [ ] **Step 2: Execute a manual smoke pass**

Verify:
- app boots
- calculator renders
- settings save
- history persists
- import still works
- toasts/status messages remain readable

- [ ] **Step 3: Record failures and fix only Electron-specific issues**

Do not mix unrelated refactors into this pass.

---

## Chunk 6: Build repeatable verification and release evidence

### Task 11: Create a repeatable verification runbook

**Files:**
- Create: `docs/superpowers/specs/2026-03-15-verification-runbook.md`
- Modify: `README.md`
- Modify: `README_RU.md`

- [ ] **Step 1: Write the exact verification commands**

Include:
- JS syntax check for inline scripts
- any shell JS invariant checks
- manual smoke checklist
- Electron smoke command
- exact real G-code file to test

- [ ] **Step 2: Define evidence required before release**

For each gate, require:
- command used
- expected result
- where the evidence is recorded

- [ ] **Step 3: Add a release checklist section to docs**

Make it obvious that “production-ready” requires evidence, not just subjective confidence.

### Task 12: Perform final production-readiness pass

**Files:**
- Modify: `test.html`
- Modify: `README.md`
- Modify: `README_RU.md`
- Modify: `electronapp/README.md`

- [ ] **Step 1: Re-run the full regression scenario matrix**

Use the scenario docs from Chunk 1 and confirm pass/fail line by line.

- [ ] **Step 2: Fix only confirmed remaining release blockers**

If an issue is not a release blocker, log it separately and do not expand scope blindly.

- [ ] **Step 3: Produce final release summary**

Write a short release note with:
- what was hardened
- what was verified
- residual known limits

- [ ] **Step 4: Commit and push only after fresh verification**

Example sequence:
```bash
git add test.html README.md README_RU.md electronapp/README.md docs/superpowers/specs/2026-03-15-production-readiness-checklist.md docs/superpowers/specs/2026-03-15-regression-scenarios.md docs/superpowers/specs/2026-03-15-calculation-invariants.md docs/superpowers/specs/2026-03-15-verification-runbook.md docs/superpowers/plans/2026-03-15-production-readiness.md
git commit -m "Довести проект до production-ready"
powershell.exe -NoProfile -Command "Set-Location 'L:\3d-price'; git push origin master"
```

---

## Notes for execution

- Do not redesign the app into modules during this pass. Production hardening first, refactor later.
- Treat `test.html` as the source of truth; avoid changing unrelated legacy pages.
- Do not weaken the current requirement that calculation history stays on `indexedDB`.
- Use real G-code files from `g-codes/` for import verification.
- If a bug cannot be reproduced with a documented scenario, do not “fix by assumption”.
- Before claiming production-ready, complete the release checklist with fresh evidence.
