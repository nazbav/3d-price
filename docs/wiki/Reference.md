# Структура данных и формулы

В `LocalStorage` хранится объект `appData` со следующими разделами:

- `printers` — список принтеров с параметрами стоимости, мощности и ссылками на профили по `profileIds`.
- `materials` — общие материалы с ценой за килограмм, остатком и производителем.
- `materialProfiles` — глобальный набор профилей материалов Orca, связываемых с материалами по `profileIds`. Любой профиль можно назначить нескольким материалам, а при редактировании материал может выбрать любой из них из общего списка.
- `printerProfiles` — глобальный список профилей принтеров Orca. Каждый профиль связан с одним принтером через `printerId`, но его можно переназначить другому устройству.
- `additionalGlobal` — дополнительные расходы, распределяемые на часы печати.
- `clients` — база заказчиков.
- `calcHistory` — история всех расчётов.
- `calcSettings` — ставки оператора, цена кВт·ч, налог и другие опции.

### Основные формулы

```text
costPerHourPrinter = cost / hoursToRecoup
costOperatorPart   = hours * operatorRate
realGrams          = grams * (1 + wastePercent / 100)
costPerGram        = costPerKg / 1000
costMaterialPart   = realGrams * costPerGram
costElectric       = (power / 1000) * hours * costKwh
costMaintenance    = maintCostHour * hours
subTotal = costPrinterPart + costOperatorPart + costMaterialPart +
           costAdditionalPart + costElectric + costMaintenance + shipping
costTax  = subTotal * (taxPercent / 100)
total    = subTotal + costTax
```

В разделе **Итоги** суммируются данные из `calcHistory` для расчёта прибыли и времени работы оборудования.
