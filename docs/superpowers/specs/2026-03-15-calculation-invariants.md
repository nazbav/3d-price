# Calculation Invariants — 3d-price Calculator

**Date:** 2026-03-15  
**Source:** `test.html` (primary calculation logic, approximately lines 9144–10600)  
**Purpose:** Enumerate all invariants that must hold after every code change. Each invariant is accompanied by a browser-console JS snippet for manual or automated verification.

---

## Invariants

### INV-01 · Model weight equals sum of `materialEntries` weights (multimaterial mode)

**Rule:**  
When a model has one or more `materialEntries`, its stored `weight` is computed as
`sumMaterialEntriesWeight(entries)` — the arithmetic sum of every entry's `weight` field.
The weight field on the model row is set to this sum and is displayed read-only.

**Source:** `sumMaterialEntriesWeight` (line 9144):
```js
// function sumMaterialEntriesWeight(entries) {
//   return (entries || []).reduce((sum, entry) => sum + (parseFloat(entry && entry.weight) || 0), 0);
// }
```
Weight fallback at parse time (line 6908–6909):
```js
// if ((!weight || parseFloat(weight) <= 0) && materialEntries.length) {
//     weight = String(sumMaterialEntriesWeight(materialEntries));
// }
```

**Verification snippet:**
```js
// Run in browser console after a calculation with ≥1 multimaterial model.
// lastCalcDetails is the result object stored by the app in window or appData.
(function() {
  const printers = (window.lastCalcDetails || {}).detailsByPrinter || [];
  let passed = 0, failed = 0;
  printers.forEach(pr => {
    (pr.linesDetail || []).forEach(ln => {
      const entriesWeight = (ln.materialEntriesDetail || [])
        .reduce((s, e) => s + (parseFloat(e.weight) || 0), 0);
      const diff = Math.abs((ln.realWeight || 0) - entriesWeight);
      if (diff > 0.001) {
        console.error(`FAIL INV-01: model "${ln.name}" realWeight=${ln.realWeight} != entriesSum=${entriesWeight}`);
        failed++;
      } else { passed++; }
    });
  });
  console.log(`INV-01: ${passed} passed, ${failed} failed`);
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-02 · Per-model material cost equals sum of per-entry costs

**Rule:**  
`costMaterial` for a model = Σ `entry.costMaterial` over all entries.  
Each entry cost = `entry.weight × (material.costPerKg / 1000)`.  
Source: `getModelMaterialDetails` (line 9353), used in main loop at line 10365.

```js
// const rawMaterialCost = materialEntriesDetail.reduce((sum, entry) => sum + entry.costMaterial, 0);
```

**Verification snippet:**
```js
(function() {
  const printers = (window.lastCalcDetails || {}).detailsByPrinter || [];
  let passed = 0, failed = 0;
  printers.forEach(pr => {
    (pr.linesDetail || []).forEach(ln => {
      const entriesSum = (ln.materialEntriesDetail || [])
        .reduce((s, e) => s + (parseFloat(e.costMaterial) || 0), 0);
      const diff = Math.abs((ln.costMaterial || 0) - entriesSum);
      if (diff > 0.01) {
        console.error(`FAIL INV-02: model "${ln.name}" costMaterial=${ln.costMaterial} != entriesSum=${entriesSum}`);
        failed++;
      } else { passed++; }
    });
  });
  console.log(`INV-02: ${passed} passed, ${failed} failed`);
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-03 · Per-model subtotal equals sum of its four cost components

**Rule:**  
`subTotalModel = costPrinterPart + costMaterial + costElectric + costMaintenance`  
(line 10373). All four components are zeroed when `excludedFromTotals` is `true`.

**Verification snippet:**
```js
(function() {
  const printers = (window.lastCalcDetails || {}).detailsByPrinter || [];
  let passed = 0, failed = 0;
  printers.forEach(pr => {
    (pr.linesDetail || []).forEach(ln => {
      const computed = (ln.costPrinterPart || 0) + (ln.costMaterial || 0)
                     + (ln.costElectric || 0) + (ln.costMaintenance || 0);
      const diff = Math.abs((ln.subTotalModel || 0) - computed);
      if (diff > 0.01) {
        console.error(`FAIL INV-03: "${ln.name}" subTotalModel=${ln.subTotalModel} != sum=${computed}`);
        failed++;
      } else { passed++; }
    });
  });
  console.log(`INV-03: ${passed} passed, ${failed} failed`);
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-04 · Excluded models contribute zero to all cost totals

**Rule:**  
A model with `excludedFromTotals === true` has all four cost components set to `0`
(lines 10369–10372). Such models are also excluded from `totalWeight` (line 10589)
and from the label-count used for `totalLabelsCost`.

```js
// const costPrinterPart = includeModelTotals ? rawPrinterPart : 0;
// const costMaterial    = includeModelTotals ? rawMaterialCost : 0;
// const costElectric    = includeModelTotals ? rawElectric : 0;
// const costMaint       = includeModelTotals ? rawMaintenance : 0;
```

**Verification snippet:**
```js
(function() {
  const printers = (window.lastCalcDetails || {}).detailsByPrinter || [];
  let passed = 0, failed = 0;
  printers.forEach(pr => {
    (pr.linesDetail || []).forEach(ln => {
      if (!ln.excludedFromTotals) return;
      const costSum = (ln.costPrinterPart || 0) + (ln.costMaterial || 0)
                    + (ln.costElectric || 0) + (ln.costMaintenance || 0)
                    + (ln.subTotalModel || 0);
      if (costSum !== 0) {
        console.error(`FAIL INV-04: excluded model "${ln.name}" has non-zero costs: ${costSum}`);
        failed++;
      } else { passed++; }
    });
  });
  console.log(`INV-04: ${passed} passed, ${failed} failed`);
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-05 · Printer subTotal equals sum of non-excluded model subtotals

**Rule:**  
`detailsByPrinter[i].subTotal` (`prCostNoTax`) is the running sum of `subTotalModel`
for every model in that printer's list (line 10380). Excluded models contribute 0,
so they do not shift this sum.

**Verification snippet:**
```js
(function() {
  const printers = (window.lastCalcDetails || {}).detailsByPrinter || [];
  let passed = 0, failed = 0;
  printers.forEach(pr => {
    const computed = (pr.linesDetail || [])
      .reduce((s, ln) => s + (ln.subTotalModel || 0), 0);
    const diff = Math.abs((pr.subTotal || 0) - computed);
    if (diff > 0.01) {
      console.error(`FAIL INV-05: printer "${pr.printerName}" subTotal=${pr.subTotal} != modelSum=${computed}`);
      failed++;
    } else { passed++; }
  });
  console.log(`INV-05: ${passed} passed, ${failed} failed`);
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-06 · Label cost only applies when globally enabled AND per-model enabled

**Rule:**  
`totalLabelsCost` is non-zero only when **both**:
1. `appData.labelSettings.printLabels === true` (global toggle, line 10547), **AND**
2. the individual model row's checkbox (`data-role="model-label"`) is checked, which
   sets `model.includeLabel === true` (line 10404).

A model's `includeLabel` is permanently `false` when the global flag is off at
calculation time (line 10404):
```js
// includeLabel: !!(appData.labelSettings.printLabels && labelToggle && labelToggle.checked)
```

Label count for excluded/reject models is filtered at line 10551–10553:
```js
// models.filter(m => (includeRejectsInCost || (m.status !== 'reject')) && (m.includeLabel === true))
```

**Verification snippet:**
```js
(function() {
  const d = window.lastCalcDetails || {};
  const globalOn = !!(window.appData && window.appData.labelSettings && window.appData.labelSettings.printLabels);
  if (!globalOn) {
    const bad = Object.values(d.calcData || {}).flat()
      .some(m => m.includeLabel === true);
    if (bad) {
      console.error('FAIL INV-06: some models have includeLabel=true but global printLabels is off');
    } else {
      console.log('INV-06: passed (global off, no model has includeLabel=true)');
    }
    return;
  }
  // When global is on, totalLabelsCost must equal count(includeLabel==true) * costPerLabel
  const costPerLabel = (window.appData.labelSettings.costPerLabel) || 0;
  const countLabeled = Object.values(d.calcData || {}).flat()
    .filter(m => m.includeLabel === true).length;
  const expected = countLabeled * costPerLabel;
  const actual = d.totalLabelsCost || 0;
  const diff = Math.abs(actual - expected);
  if (diff > 0.01) {
    console.error(`FAIL INV-06: totalLabelsCost=${actual} != ${countLabeled}×${costPerLabel}=${expected}`);
  } else {
    console.log(`INV-06: passed (${countLabeled} labels × ${costPerLabel} = ${actual})`);
  }
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-07 · baseCost equals sum of all pre-markup cost components

**Rule:**  
`baseCost` (line 10591) is the floor used to compute profit and margin. It is defined as:

```
baseCost = sumWithoutTax + sumGlobalAdd + ship + totalOperatorCost
         + totalLabelsCost + estimatePrintCost + servicesTotal
```

This is **before** markup, discount and tax — identical to `subtotalBeforeTax` before
the markup multiplier is applied, plus `servicesTotal` (which is added after markup).

**Verification snippet:**
```js
(function() {
  const d = window.lastCalcDetails || {};
  const computed =
      (d.sumWithoutTax || 0)
    + (d.sumGlobalAdd  || 0)
    + (d.ship          || 0)
    + (d.totalOperatorCost  || 0)
    + (d.totalLabelsCost    || 0)
    + (d.estimatePrintCost  || 0)
    + (d.servicesTotal      || 0);
  const diff = Math.abs((d.baseCost || 0) - computed);
  if (diff > 0.01) {
    console.error(`FAIL INV-07: baseCost=${d.baseCost} != computed=${computed}`);
  } else {
    console.log(`INV-07: passed (baseCost=${d.baseCost})`);
  }
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-08 · finalSum derivation chain (markup → tax → discount → rounding)

**Rule:**  
The price pipeline (lines 10561–10586) is strictly ordered:

```
subtotalBeforeTax = sumWithoutTax + sumGlobalAdd + ship
                  + totalOperatorCost + totalLabelsCost + estimatePrintCost
subtotalBeforeTax *= (1 + markupPercent/100)          // if markupPercent > 0
subtotalBeforeTax += servicesTotal
totalBeforeDiscount = tPercent > 0
    ? subtotalBeforeTax / (1 - tPercent/100)          // tax-inclusive gross-up
    : subtotalBeforeTax
finalSum = totalBeforeDiscount * (1 - discountPercent/100)   // if discount > 0
// optional ceiling rounding applied here
taxAmount = finalSum * (tPercent / 100)               // if tPercent > 0
subtotal  = finalSum - taxAmount
```

When `manualFinalCost > 0` the entire computed `finalSum` is **replaced** by the
manual value (line 10573–10574); only this branch breaks the derivation chain above.

**Verification snippet:**
```js
(function() {
  const d = window.lastCalcDetails || {};
  if (d.manualFinalCost > 0) {
    console.log('INV-08: skipped — manual final cost override active');
    return;
  }
  let sub = (d.sumWithoutTax || 0) + (d.sumGlobalAdd || 0) + (d.ship || 0)
          + (d.totalOperatorCost || 0) + (d.totalLabelsCost || 0)
          + (d.estimatePrintCost || 0);
  const mp = d.markupPercent || 0;
  if (mp > 0) sub *= (1 + mp / 100);
  sub += (d.servicesTotal || 0);
  const tp = d.tPercent || 0;
  let gross = tp > 0 ? sub / (1 - tp / 100) : sub;
  const dp = d.discountPercent || 0;
  if (dp > 0) gross *= (1 - dp / 100);
  // allow rounding step
  const diff = Math.abs((d.finalSum || 0) - gross);
  const roundingStep = d.roundingInfo && d.roundingInfo.step > 0 ? d.roundingInfo.step : 0.01;
  if (diff > roundingStep + 0.01) {
    console.error(`FAIL INV-08: finalSum=${d.finalSum} vs recomputed=${gross.toFixed(4)} (diff=${diff.toFixed(4)})`);
  } else {
    console.log(`INV-08: passed (finalSum=${d.finalSum})`);
  }
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-09 · subtotal = finalSum − taxAmount

**Rule:**  
`subtotal` is strictly `finalSum − taxAmount` (line 10586).  
`taxAmount = finalSum × (tPercent / 100)` when `tPercent > 0`, otherwise `0`.

**Verification snippet:**
```js
(function() {
  const d = window.lastCalcDetails || {};
  const expected = (d.finalSum || 0) - (d.taxAmount || 0);
  const diff = Math.abs((d.subtotal || 0) - expected);
  if (diff > 0.01) {
    console.error(`FAIL INV-09: subtotal=${d.subtotal} != finalSum(${d.finalSum})-tax(${d.taxAmount})=${expected}`);
  } else {
    console.log(`INV-09: passed`);
  }
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-10 · Reject models excluded from costs unless `includeRejectsInCost` is set

**Rule:**  
`includeModelTotals = includeRejectsInCost || !isReject` (line 10346).  
When `includeRejectsInCost` is `false` and the model's status is `"reject"`,
`includeModelTotals` is `false`, so all cost components are zeroed and
`excludedFromTotals` is set to `true` on the line detail.

**Verification snippet:**
```js
(function() {
  const includeRejects = !!(window.appData && window.appData.calcSettings && window.appData.calcSettings.includeRejects);
  const printers = (window.lastCalcDetails || {}).detailsByPrinter || [];
  let passed = 0, failed = 0;
  printers.forEach(pr => {
    (pr.linesDetail || []).forEach(ln => {
      if (ln.status === 'reject' && !includeRejects) {
        if (!ln.excludedFromTotals) {
          console.error(`FAIL INV-10: reject model "${ln.name}" not excluded from totals`);
          failed++;
        } else { passed++; }
      }
    });
  });
  console.log(`INV-10: ${passed} passed, ${failed} failed`);
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-11 · Amortization and maintenance are zero when `includeAmortization` is off

**Rule:**  
`rawPrinterPart = includeAmortization ? h * costPH : 0` (line 10362).  
`rawMaintenance = includeAmortization ? pr.maintCostHour * h : 0` (line 10363).  
Both become 0 independently of the model's include/exclude status.

**Verification snippet:**
```js
(function() {
  const amortOff = !(window.appData && window.appData.calcSettings && window.appData.calcSettings.includeAmortization !== false);
  if (!amortOff) { console.log('INV-11: skipped — amortization is ON'); return; }
  const printers = (window.lastCalcDetails || {}).detailsByPrinter || [];
  let passed = 0, failed = 0;
  printers.forEach(pr => {
    (pr.linesDetail || []).forEach(ln => {
      if ((ln.costPrinterPart || 0) !== 0 || (ln.costMaintenance || 0) !== 0) {
        console.error(`FAIL INV-11: model "${ln.name}" has amortization/maintenance cost while toggle is OFF`);
        failed++;
      } else { passed++; }
    });
  });
  console.log(`INV-11: ${passed} passed, ${failed} failed`);
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-12 · totalWeight sums only non-excluded model weights

**Rule:**  
`totalWeight` (line 10589) is:
```js
detailsByPrinter.reduce((acc, printer) =>
  acc + printer.linesDetail.reduce(
    (sum, line) => sum + (line.excludedFromTotals ? 0 : line.realWeight), 0), 0)
```

**Verification snippet:**
```js
(function() {
  const d = window.lastCalcDetails || {};
  const printers = d.detailsByPrinter || [];
  const computed = printers.reduce((acc, pr) =>
    acc + (pr.linesDetail || []).reduce(
      (s, ln) => s + (ln.excludedFromTotals ? 0 : (ln.realWeight || 0)), 0), 0);
  const diff = Math.abs((d.totalWeight || 0) - computed);
  if (diff > 0.001) {
    console.error(`FAIL INV-12: totalWeight=${d.totalWeight} != computed=${computed}`);
  } else {
    console.log(`INV-12: passed (totalWeight=${d.totalWeight})`);
  }
})();
```

**Mandatory regression check:** ✅ YES

---

### INV-13 · Multi-material entries only allowed for printers that support it

**Rule:**  
If `materialEntries.length > 1` and `printerSupportsMultiMaterial(printerId)` returns
`false`, the import path collapses the entries to a single entry with summed weight
(lines 6993, 7132, 7281). A printer row must therefore never have more than one
`materialEntry` in `materialEntriesDetail` unless the printer has the multi-material
flag set.

**Verification snippet:**
```js
(function() {
  const printers = (window.lastCalcDetails || {}).detailsByPrinter || [];
  let passed = 0, failed = 0;
  printers.forEach(pr => {
    const supportsMulti = typeof printerSupportsMultiMaterial === 'function'
      ? printerSupportsMultiMaterial(pr.printerId) : true; // assume true if fn not accessible
    (pr.linesDetail || []).forEach(ln => {
      if (!supportsMulti && (ln.materialEntriesDetail || []).length > 1) {
        console.error(`FAIL INV-13: printer "${pr.printerName}" does not support multi-material but model "${ln.name}" has ${ln.materialEntriesDetail.length} entries`);
        failed++;
      } else { passed++; }
    });
  });
  console.log(`INV-13: ${passed} passed, ${failed} failed`);
})();
```

**Mandatory regression check:** ✅ YES

---

## Summary Table

| ID     | Invariant                                         | Mandatory |
|--------|---------------------------------------------------|-----------|
| INV-01 | Model weight = Σ materialEntry weights            | ✅        |
| INV-02 | Model costMaterial = Σ entry.costMaterial         | ✅        |
| INV-03 | subTotalModel = printer + material + electric + maintenance | ✅ |
| INV-04 | Excluded models → all costs zero                  | ✅        |
| INV-05 | Printer subTotal = Σ model subTotals              | ✅        |
| INV-06 | Label cost only when global AND per-model enabled | ✅        |
| INV-07 | baseCost = sum of all pre-markup components       | ✅        |
| INV-08 | finalSum derivation chain (markup→tax→discount)   | ✅        |
| INV-09 | subtotal = finalSum − taxAmount                   | ✅        |
| INV-10 | Reject models excluded unless `includeRejectsInCost` set | ✅ |
| INV-11 | Amortization/maintenance zero when toggle off     | ✅        |
| INV-12 | totalWeight sums only non-excluded models         | ✅        |
| INV-13 | Multi-material entries only on supporting printers | ✅       |

---

## How to Run Console Checks

1. Open `test.html` in a browser.
2. Configure a realistic calculation (add printers, materials, models).
3. Click **Рассчитать** to trigger the calculation.
4. Open DevTools → Console.
5. Paste any snippet above. Each prints `PASS` or a descriptive `FAIL` message.

> **Note:** The snippets depend on `window.lastCalcDetails` being populated with the
> result object from the main calculation function. If that global is not present,
> expose it by adding `window.lastCalcDetails = result;` at the end of the calculation
> function before running these checks.
