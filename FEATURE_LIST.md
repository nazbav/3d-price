# План реализации

## 1. Раздел "Настройки"
- Создать вкладку "Настройки" в основном меню.
- Внутри использовать вертикальные `nav-pills` с тремя подпунктами:
  - **Брендинг** – ввод названия компании, ссылки на чат и часов работы.
  - **Калькуляция** – опции печати этикетки и поля для ставок (оператор, налог, кВт·ч).
  - **Облачный экспорт** – кнопки генерации ссылки/QR и сохранения или загрузки настроек из Supabase.
- Реализовать функции `saveBrandingSettings` и `saveCalcSettings` для сохранения настроек в `localStorage`.
- Для облака подключить Supabase SDK, реализовать `saveSettingsToCloud`, `loadSettingsFromCloud` и `generateSyncLinkAndQR`.

## 2. Фильтрация и сортировка таблиц
- Для всех таблиц добавить строку поиска и обработчик `filterTable`.
- Реализовать сортировку столбцов функцией `sortTable` по клику на заголовок.
- В истории расчётов добавить выбор дат "от" и "до" для фильтра `updateHistoryStats`.

## 3. Сущность клиентов
- Добавить отдельную вкладку "Клиенты" с таблицей и CRUD через модальное окно.
- Хранить клиентов в массиве `appData.clients` в `localStorage`.
- В калькуляторе поле клиента использует список `datalist` и кнопку `quickAddClient` для быстрого создания при расчёте.

## 4. Общие материалы и доп. расходы
- Материалы и расходы хранятся единым списком (`appData.materials`, `appData.additionalGlobal`).
- В каждой записи есть список `printers` (мульти‑селект), указывающий доступные принтеры.
- При инициализации обеспечивается наличие массива `printers` у старых записей для совместимости.
- При расчёте учитываются только те расходы/материалы, принтеры которых совпадают с текущим.
- В функции `migrateOldData` при импорте старые материалы и расходы из принтеров
  переносятся в общие таблицы, а клиенты создаются из истории расчётов.
- При загрузке данных из `localStorage` также применяется `migrateOldData` для автоматического обновления старых конфигураций.

## 5. Короткие идентификаторы
- Функция `generateUUID` выдаёт строку из 16 символов (буквы и цифры).
- Идентификаторы присваиваются принтерам, моделям, материалам, заказам и клиентам при создании.

## 6. Дополнения
- При редактировании истории материалы отображаются даже при нулевом остатке.
- В таблице истории и в итоговом выводе показан код заказа.

## 8. Синхронизация и история
- Скрипт `sync_orca.py` импортирует профили материалов отдельно от списка материалов.
- При загрузке приложения проверяются расчёты с удалёнными принтерами и предлагается выбрать замену через модальное окно.
- Автоматическое создание принтеров по записям истории отключено, отсутствующие устройства добавляются только вручную или через импорт.
- Кнопка добавления профиля Orca у материала открывает список общих профилей, позволяя назначать существующие.
- Выпадающий список профилей Orca в модальном окне материала показывает все доступные профили.
- Таблица сопоставления отсутствующих принтеров показывает модель и позволяет массово назначать выбранный принтер.
- При удалении принтера, к которому привязаны записи истории, появляется запрос на перенос моделей на другой принтер.
- `sync_orca.py` не создаёт новые принтеры из конфигураций Orca — добавляйте их заранее в файл `printers`.
- Временные принтеры при импорте истории больше не создаются; неизвестные устройства предлагается сопоставить вручную.
- Функция сопоставления удалённых принтеров убрана; история сохраняет исходные ID.


## 7. Документация
- Создать wiki в каталоге `docs/wiki` с руководством пользователя и справочными материалами.
- Добавить файл `AGENTS.md` с инструкциями для участников и требованием вести журналы изменений.
- README дополнен описанием переноса моделей при удалении принтера.

- Документировано использование формы `showMultiPrompt` для массового редактирования.
- В AGENTS.md добавлены инструкции по тестированию калькулятора в Ubuntu через test.html
- Материал при загрузке модели из ссылки выбирается по профилю печати; при нескольких совпадениях предлагается выбор.
- Простое связывание материала с профилем Orca и управление списком профилей через отдельное окно.
- Импорт моделей устойчив к отсутствию списка материалов у принтеров.
- В окне выбора профилей добавлена кнопка "Применить" для сохранения связки.
- Обработчики связывания профилей проверяют наличие элементов, предотвращая ошибку при импорте новой модели.
- Модальное окно OrcaSlicer заполняется корректно; атрибут data-inited больше не блокирует поля.
- Менеджер профилей Orca поддерживает только импорт JSON, привязку и удаление профилей.
- Таблица материалов показывает связанные профили Orca; поиск профиля не зависит от регистра
- Удален раздел с деталями принтера, упрощая интерфейс.
- Ячейка имени материала подсвечивается заданным цветом и автоматически выбирает контрастный цвет текста
- Синхронизация Orca больше не удаляет существующие принтеры при совпадении конфигураций.
- Модальное окно OrcaSlicer заполняется корректно; атрибут data-inited больше не блокирует поля.
- Исправлено отображение модальных окон "Профиль" и "Профили Orca" в test.html
- Профили принтеров вынесены в отдельный список с менеджером и уникальными идентификаторами.
- sync_orca.py интерактивно связывает профили Orca с принтерами и материалами.
- диалоги sync_orca пропускают лишние вопросы и позволяют менять существующие связи.
- Профиль можно перенести на другой принтер через менеджер профилей.
- material lookup by profile now robust to numeric ids; fixed toLowerCase error
- models table supports PNG thumbnail upload; image is resized to 140x110 and stored in Base64
- printer detail summary works correctly with thumbnail column

- Drag and drop prepared gcode files onto the page to automatically add models
- download combined thermo labels for all models via single button
- ability to download a modern summary card with order details and a model grid
- summary card shows total weight and cost with 'Требуется' field
- bugfix: summary card generation no longer throws htmlRes undefined error
- calculation results show a modern summary card with order details and a model grid
- кнопка "Новый расчёт" очищает модели и основные поля заказа
- скидка в процентах с выводом зачеркнутой цены и возможность задать финальную стоимость
- кнопка "Новый расчёт" сбрасывает форму калькулятора
- model thumbnail upload crops the image to fit 140x110 and saves compressed JPEG
- интеграция с сервисом 'Мой Налог' для формирования чеков
- отдельная вкладка настроек для хранения токена и проверки подключения к 'Мой Налог'
- возможность сформировать счёт через сервис 'Мой Налог'

- сервис возвращает подробный ответ и ID созданного чека или счёта
- авторизация по телефону и SMS для автоматического получения токена
- использование актуального API lknpd.nalog.ru и автоматическое продление токена
- константа MY_NALOG_API и проверка SMS через api/v2
- устранена ошибка двойного объявления phone
- устранена синтаксическая ошибка при инициализации событий (совместимость со старыми браузерами)
- упрощён вход по SMS: пароль больше не требуется
- исправлен формат JSON при отправке чека и счёта (добавлены `client` и `ignoreMaxTotalIncomeRestriction`)
- HTML-счёт со ссылкой на оплату и реквизитами из настроек брендинга
- новое поле брендинга для указания реквизитов оплаты
- при успешной отправке чека заказ автоматически получает статус "Оплачен" и отображается ссылка на чек
- убраны дублирующиеся обработчики кликов для кнопок скачивания и отправки чека
- устранены дублирующиеся запросы при работе со SMS в разделе «Мой Налог»
- поле реквизитов переименовано в "Банковские реквизиты (р/с)"
- корректная ссылка QR для оплаты через СБП
- при выборе СБП QR-код ведёт на чат поддержки
- при необходимости чек можно перегенерировать повторно
- все созданные чеки остаются в заказе, старые выделяются красным
- выбор метода оплаты удалён, QR-код всегда ведёт на чат поддержки
- поле банковских реквизитов теперь многострочное

- оплаченные заказы учитываются в разделе итоги как завершённые
- в истории расчётов отображается ссылка на чек, если он уже создан
- кнопка «Отменить чек» аннулирует последний отправленный чек
- при повторной генерации чека предыдущий автоматически отменяется и помечается красным
- интеграция со Spoolman переработана: приоритет импорта как основного источника данных
- локальная система теперь использует spoolman_id вместо создания external_id в Spoolman
- экспорт в Spoolman помечен как устаревший, рекомендуется использовать импорт
- обновлена логика дубликатов для работы на основе Spoolman ID
