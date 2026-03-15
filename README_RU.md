# Калькулятор себестоимости 3D-печати

[English version](./README.md)

Основной интерфейс проекта находится в [index.html](./index.html). Старые `index*.html` всё ещё лежат в репозитории, но основным UI и точкой актуальной разработки больше не являются.

## Текущий фокус проекта

- Основное приложение собрано в одном файле `index.html` на Bootstrap и inline JavaScript.
- Данные по умолчанию живут локально в `localStorage` браузера.
- Есть обёртка Electron в [`electronapp/`](./electronapp/) для десктопного запуска, локальных бэкапов и доставки интерфейса.
- `index1.html`, `index2.html`, `index3.html` следует воспринимать как legacy-версии.

## Что умеет `index.html`

- Вести справочники принтеров, материалов, клиентов, накладных расходов и историю расчётов.
- Считать стоимость печати с учётом:
  - материалов
  - электричества
  - амортизации
  - обслуживания
  - времени оператора
  - простоя и подготовки
  - доставки
  - наценки, скидки и налога
  - печати этикеток и сметы
- Поддерживать профили срочности и рабочие графики по дням недели.
- Поддерживать мультиматериальную печать:
  - флаг на уровне принтера
  - состав материалов модели через модальное окно
  - общий вес модели как сумму всех материалов
- Импортировать G-code:
  - drag-and-drop в область калькулятора
  - внешний вызов из post-processing сценариев вроде `open_calc.py`
  - запоминание сопоставлений принтеров и материалов через локальную prompt-memory
- Парсить из G-code:
  - время печати
  - превью/thumbnail
  - подсказки профиля принтера
  - мультиматериальные инструменты и материалы
- Генерировать компактные термоэтикетки и печатные карточки/сметы заказа.
- Показывать расширенную сводку:
  - выручка
  - прибыль
  - структура затрат
  - расход материалов
  - загрузка принтеров
  - статистика по клиентам
  - графики по периодам
- Поддерживать JSON import/export и зашифрованные краткоживущие облачные ссылки/QR через Supabase.
- Поддерживать интеграцию со Spoolman для импорта материалов и обновления использования катушек.

## Основные разделы интерфейса

В `index.html` сейчас есть такие верхнеуровневые разделы:

- `Calculate`
- `History`
- `Clients`
- `Printers`
- `Materials`
- `Additional Costs`
- `Settings`
- `Summary`

В `Settings` находятся брендинг, правила калькуляции, облачная синхронизация, Spoolman, налоговые поля, язык интерфейса и валюта отображения.

## Быстрый старт

### В браузере

```bash
git clone https://github.com/nazbav/3d-price.git
cd 3d-price
```

После этого откройте `index.html` в современном браузере.

Обычный сценарий:

1. Добавить принтеры.
2. Добавить материалы и накладные расходы.
3. Открыть `Calculate`.
4. Добавить модели вручную или импортировать G-code.
5. Выполнить расчёт и сохранить его в историю.

### В Electron

```bash
cd electronapp
npm install
npm run start
```

Сборка:

```bash
npm run make
# или
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Подробности по десктопной части вынесены в [`electronapp/README.md`](./electronapp/README.md).

## Что важно про импорт G-code

Калькулятор умеет импортировать G-code прямо в строки моделей. Сейчас это включает:

- подбор принтера по данным из файла
- запоминание выбора принтера и материала в локальной prompt-memory
- разбор мультиматериальных файлов в набор отдельных material entries
- предупреждение, если в G-code несколько материалов, а принтер не помечен как мультиматериальный

Папка `g-codes/` может содержать примеры для разработки и отладки, но для работы калькулятора не обязательна.

## Хранение данных

- Основные данные лежат в `localStorage`.
- Из интерфейса доступны JSON import/export.
- Облачная синхронизация работает через зашифрованный payload и короткоживущую ссылку.
- В Electron поверх этого добавляются локальные резервные копии.

## Заметки для разработки

- Главный файл для изменений: [`index.html`](./index.html)
- Не стоит ориентироваться на legacy `index*.html` как на актуальный источник поведения.
- Корневой `test_offline.html` больше не является частью активного root-workflow.
- Для поиска UI/JS-регрессий лучше опираться на `lightpanda`, а не на старые устаревшие UI-тесты.

## Проверки

Практичные локальные проверки:

- открыть `index.html` в браузере
- прогнать точечные синтаксические проверки inline-скриптов
- использовать `lightpanda` для smoke/debug проверок UI и JavaScript, если окружение это позволяет
- отдельно запускать Electron, если изменения могут задеть desktop-обвязку

### Готовность к релизу

Полная процедура проверки перед релизом (синтаксическая проверка JS, миграционные тесты, ручной smoke-чеклист, проверка Electron и таблица доказательств) описана в runbook:

**[`docs/superpowers/specs/2026-03-15-verification-runbook.md`](./docs/superpowers/specs/2026-03-15-verification-runbook.md)**

> **НЕ ВЫПУСКАТЬ релиз без выполнения всех пунктов runbook.**

## Карта репозитория

- [`index.html`](./index.html): активный интерфейс калькулятора
- [`electronapp/`](./electronapp/): десктопная оболочка
- [`g-codes/`](./g-codes/): примеры и тестовые G-code, если присутствуют
- [`docs/`](./docs/): заметки и документация
- [`orcaslicer-calc/`](./orcaslicer-calc/): внешний slicer-related subtree/work area внутри репозитория

## Готовность к продакшену / Чеклист релиза

Полный чеклист: [`docs/superpowers/specs/2026-03-15-production-readiness-checklist.md`](./docs/superpowers/specs/2026-03-15-production-readiness-checklist.md)  
Матрица регрессионных сценариев: [`docs/superpowers/specs/2026-03-15-regression-scenarios.md`](./docs/superpowers/specs/2026-03-15-regression-scenarios.md)

Верхнеуровневые условия выпуска релиза:

- **Базовый расчёт** — корректный расчёт для одноматериальных и мультиматериальных заданий
- **История (IndexedDB)** — сохранение, перезагрузка, редактирование, удаление, экспорт/импорт
- **Импорт G-code** — drag-and-drop, post-processing bridge, парсинг метаданных
- **Мультиматериальное сопоставление** — полное/частичное/неизвестное совпадение; предупреждение при отсутствии флага ММ
- **Смета и этикетка** — корректный рендеринг, загрузка без обрезки содержимого
- **Английский UI** — нет утечки русских строк ни в одном критическом пути
- **Обёртка Electron** — shared path разрешается корректно; сборка даёт рабочий исполняемый файл
- **Все модули** — калькулятор, история, клиенты, принтеры, материалы, накладные расходы, аналитика, «Мой налог», Spoolman — все проверены

## Сигналы проекта

<p align="center">
  <a href="https://github.com/nazbav/3d-price/releases">
    <img src="https://img.shields.io/github/v/release/nazbav/3d-price?display_name=tag&style=flat-square" alt="Последний релиз">
  </a>
  <a href="https://github.com/nazbav/3d-price/releases">
    <img src="https://img.shields.io/github/downloads/nazbav/3d-price/total?style=flat-square" alt="Всего скачиваний">
  </a>
  <a href="https://github.com/nazbav/3d-price/pulse">
    <img src="https://img.shields.io/github/last-commit/nazbav/3d-price?style=flat-square" alt="Последний коммит">
  </a>
  <a href="https://github.com/nazbav/3d-price/stargazers">
    <img src="https://img.shields.io/github/stars/nazbav/3d-price?style=flat-square" alt="GitHub stars">
  </a>
  <a href="https://github.com/nazbav/3d-price/network/members">
    <img src="https://img.shields.io/github/forks/nazbav/3d-price?style=flat-square" alt="GitHub forks">
  </a>
</p>

<p align="center">
  <a href="https://github.com/nazbav/3d-price/releases">Releases</a> •
  <a href="https://github.com/nazbav/3d-price/pulse">Pulse</a> •
  <a href="https://github.com/nazbav/3d-price/graphs/contributors">Contributors</a> •
  <a href="https://github.com/nazbav/3d-price/graphs/traffic">Traffic</a> •
  <a href="https://github.com/nazbav/3d-price/network">Network</a>
</p>

<p align="center">
  <sub>
    GitHub Insights по активности, релизам, участникам и статистике скачиваний десктопных сборок.
  </sub>
</p>

## Лицензия

MIT
