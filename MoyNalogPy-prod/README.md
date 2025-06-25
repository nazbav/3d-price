# MoyNalogPy

MoyNalogPy - библиотека на Python для работы с API сервиса "Мой налог" ФНС России, предназначенная для самозанятых.

## Установка

```bash
pip install moy-nalog
```

## Перед началом работы

Для начала работы с библиотекой необходимо пройти аутентификацию:

```bash
python auth.py
```

После выполнения этой команды будут сохранены необходимые учетные данные для дальнейшей работы с API.

## Возможности

- Получение данных о профиле пользователя
- Работа с доходами и чеками
- Взаимодействие с сервисами и клиентами

## Использование

### Инициализация

```python
from MoyNalogPy import MoyNalog

# Инициализация клиента
api = MoyNalog(inn="ваш_инн", password="ваш_пароль")
```

### Получение данных профиля

```python
# Получить профиль пользователя
profile = api.get_user_profile()
print(profile)
```

### Работа с доходами

```python
# Получить список доходов
incomes = api.get_incomes()
print(incomes)
```

### Работа с чеками

```python

# Создание чека
from MoyNalogPy.schemas import Service, Client
from MoyNalogPy import MoyNalog

my_nalog = MoyNalog()

# Создаем объект услуги
service = Service(
    name="Консультация по программированию",
    quantity=1,
    amount=2000.0,
    serviceNumber=1
)

# Создаем объект клиента
client = Client(
    displayName="Иванов Иван Иванович",
    inn="7712345678",
    type="LEGAL_ENTITY"
)

# Вызываем метод создания чека
approvedReceiptUuid = my_nalog.create_invoice(
    operationTime='2023-10-01T12:00:00+03:00',
    svs=service,
    client=client
)

# Получаем URL чека для печати
receipt_url = my_nalog.get_receipt_url(approvedReceiptUuid)
print(receipt_url)


```
Так же можно получить сразу ссылку на чек:

```python

receipt_url = my_nalog.create_invoice(
    operationTime='2023-10-01T12:00:00+03:00',
    svs=service,
    client=client,
    return_recipt_url=True
)

## Требования

- Python 3.8+
- requests
- pydantic

## Лицензия

MIT

## Автор

senylar (senyvlar@gmail.com)

## Исходный код

GitHub: [https://github.com/senylar/MoyNalogPy](https://github.com/senylar/MoyNalogPy)