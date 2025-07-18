# Руководство пользователя

1. Откройте `test.html` в браузере или перейдите по ссылке из README.
2. Заполните справочники во вкладках **Принтеры**, **Общие материалы** и **Общие доп. расходы**.
3. На вкладке **Калькулятор** выберите принтер, материал и укажите время печати.
4. Нажмите **Рассчитать** чтобы увидеть итоговую стоимость. Доступна печать этикетки и сохранение в историю.
4.1 Поле **Скидка (%)** уменьшает итоговую цену. В результатах старая сумма отображается зачеркнутой.
5. Кнопка **Новый расчёт** удаляет модели из таблиц, сбрасывает клиента,
   код заказа, название и статус и устанавливает текущую дату начала.
5.1 При статусе «Завершён» доступно поле **Финальная цена**, где можно указать фактическую стоимость заказа.
5. Кнопка **Новый расчёт** очищает форму и позволяет начать с нуля.
5. Кнопка **Скачать все этикетки** формирует единый HTML-файл для всех моделей.
6. Во вкладке **История** можно фильтровать расчёты по дате и клиенту.
7. Раздел **Клиенты** позволяет хранить контакты и быстро выбирать их при расчётах.
8. В **Настройках** задаются ставки оператора, стоимость электроэнергии, налог, параметры этикетки и данные для облачной синхронизации.
9. В таблице моделей нажмите на иконку, чтобы загрузить миниатюру модели. Изображение обрезается по центру, сжимается в JPEG и сохраняется в Base64 размером 140×110.
10. Для массового удаления и изменения элементов используйте одноимённые кнопки на страницах списков.
10. После загрузки страницы история проверяется на ссылки на удалённые принтеры. Если такие записи найдены, появляется таблица для выбора замены.
11. При удалении принтера открывается то же окно для переноса моделей на другое устройство.
11. Профили материалов Orca загружаются через общий импорт и хранятся глобально. В окне материала можно выбрать один или несколько профилей.
12. Диалоги массового редактирования используют форму `showMultiPrompt` для удобного ввода нескольких параметров.

Импорт и экспорт выполняются через JSON‑файлы или сервис Supabase. Синхронизация создаёт уникальный `sync_id` и QR‑код для мобильных устройств.
13. При импорте моделей по ссылке материал ищется по названию профиля Orca. Если найдено несколько вариантов, отображается окно выбора.
14. Окно связи материалов показывает все доступные профили и выводит подсказку, если список пуст.
15. В таблице материалов есть колонка с названиями привязанных профилей.
16. Алгоритмы импорта устойчивы к отсутствию списка материалов у принтеров.
17. Обработчики проверяют наличие элементов, предотвращая ошибки при добавлении новой модели.
18. Модальное окно Orca-принтера позволяет лишь просматривать профили, привязать их к устройству или удалить.
19. В таблице материалов цвет ячейки имени отражает выбранный оттенок материала.
9. При загрузке страницы, если в истории встречаются расчёты с отсутствующими принтерами, показывается таблица с указанием модели и исходного названия. Можно выбрать несколько строк и назначить им принтер одним действием. Временные устройства при этом не создаются автоматически.
10. Профили материалов Orca доступны глобально. В окне настроек материала кнопка добавления позволяет выбрать существующий профиль из общего списка или создать новый.
11. При импорте из Orca или JSON новые принтеры не создаются автоматически. Добавляйте устройства заранее в разделе **Принтеры** и указывайте их в файле `printers`.
9. При загрузке страницы, если в истории встречаются расчёты с отсутствующими принтерами, показывается таблица с указанием модели и исходного названия. Можно выбрать несколько строк и назначить им принтер одним действием.
10. Профили материалов Orca доступны глобально. В окне настроек материала выпадающий список сразу показывает все доступные профили, их можно выбрать или создать новый через кнопку добавления.
9. Профили материалов Orca доступны глобально. В окне настроек материала кнопка добавления позволяет выбрать существующий профиль из общего списка или создать новый.
12. Диалоги массового редактирования используют форму `showMultiPrompt` для ввода нескольких параметров.

Импорт и экспорт данных выполняются через JSON‑файлы или сервис Supabase. При синхронизации создаётся уникальный `sync_id` и QR‑код для мобильных устройств.
13. При импорте моделей по ссылке материал ищется по профилю печати. Если найдено несколько вариантов, появится окно выбора.
14. Материал можно связать с профилем Orca через кнопку "Профиль" в таблице материалов. Список профилей управляется через кнопку "Профили Orca".
15. После выбора профилей нажмите кнопку "Применить" для сохранения связи.
16. Исправлена ошибка импорта, возникавшая если у принтеров отсутствовал список материалов.
17. Обработчики кнопок профилей проверяют наличие элементов, исключая ошибку при импорте новой модели.
18. Исправлена инициализация полей OrcaSlicer: модальное окно принтера всегда отображает настройки.
19. Исправлено отображение окон связывания профилей — добавлен закрывающий тег в `test.html`.
20. Профили принтеров хранятся глобально. Кнопка "Профили принтеров" открывает список для просмотра и удаления.
21. В менеджере профилей можно переназначить профиль другому принтеру.
22. Исправлена ошибка поиска материала по профилю Orca при загрузке по ссылке 
    — функция `findMaterialsByProfile` корректно обрабатывает числовые значения 
    и не вызывает исключений.
23. На страницу test.html можно перетащить подготовленные gcode-файлы (созданные через `open_calc.py`). Модели добавятся автоматически.
24. После расчёта доступна кнопка "Скачать итоговую карточку". Она создаёт отдельный HTML-файл со сводкой заказа и QR‑кодом поддержки. Основной вывод на странице остаётся прежним.
25. Сводка заказа отображает суммарный вес пластика и итоговую стоимость. В моделях поле 'Требуется' показывает время печати.
26. Ошибка "htmlRes is not defined" больше не появляется при генерации сводки.
24. После расчёта общий результат выводится в виде карточки с данными заказа и QR‑кодом поддержки, а рядом отображается сетка моделей с параметрами.
27. Добавлена кнопка отправки чека в сервис «Мой Налог»
28. Во вкладке **Настройки** появился раздел «Мой Налог». Там можно сохранить токен и проверить статус подключения.
29. Кнопка «Сформировать счёт» отправляет данные заказа в сервис «Мой Налог» для выставления счёта.
30. При успешной операции отображается ID чека или счёта, полученный от сервиса.
31. Раздел «Мой Налог» теперь использует актуальные API `https://lknpd.nalog.ru`. Авторизация проходит через SMS‑челлендж (endpoint `api/v2`) и хранит refresh‑токен для автоматического продления сессии. Все URL собираются из переменной `MY_NALOG_API` в `test.html`.
32. Улучшена совместимость со старыми браузерами: обработчики назначаются без optional chaining.
33. Вход по SMS упрощён: пароль больше не требуется, нужен только номер телефона.
34. Исправлен формат запроса к сервису «Мой Налог» для чека и счёта — добавлены обязательные поля `client` и `ignoreMaxTotalIncomeRestriction`.
35. Кнопка «Скачать счёт» формирует HTML-файл счета с реквизитами, указанными в настройках брендинга.
36. После успешной отправки чека заказ помечается статусом «Оплачен», в итогах отображается ссылка на чек от сервиса.
37. Кнопки запроса и подтверждения SMS в разделе «Мой Налог» больше не выполняют двойных запросов.
38. Поле реквизитов переименовано в «Банковские реквизиты (р/с)». QR-код всегда ведёт на чат поддержки.

39. Оплаченные заказы учитываются в статистике как завершённые.
40. В таблице истории отображается ссылка на чек, если он был ранее сформирован.
41. При повторном нажатии «Отправить чек» можно принудительно перегенерировать чек.
42. Все сформированные чеки сохраняются в заказе, старые отображаются красным цветом.
43. Добавлена кнопка «Отменить чек» для аннулирования последнего чека через сервис «Мой Налог».
44. При повторной отправке чека предыдущий автоматически отменяется с причиной «ошибочное формирование». Отменённые чеки также выделяются красным.
