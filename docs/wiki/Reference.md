# Структура данных и формулы

В `LocalStorage` хранится объект `appData` со следующими разделами:

- `printers` — список принтеров с параметрами стоимости, мощности и профилями Orca.
- `materials` — общие материалы с ценой за килограмм, остатком и производителем.
- `materialProfiles` — глобальный набор профилей материалов Orca, связываемых с материалами по `profileIds`. Любой профиль можно назначить нескольким материалам, а при редактировании материал может выбрать любой из них из общего списка.
- `additionalGlobal` — дополнительные расходы, распределяемые на часы печати.
- `clients` — база заказчиков.
- `calcHistory` — история всех расчётов.
- `calcSettings` — ставки оператора, цена кВт·ч, налог и другие опции.
- `spoolman` — параметры сервера Spoolman (url и token).

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
