import string
import random
import requests
import json

from schemas.schemas import ProfileStorage


def generate_device_id(length=16):
    """
    Генерирует случайный идентификатор устройства заданной длины

    Args:
        length: Длина идентификатора (по умолчанию 16 символов)

    Returns:
        Случайная строка из букв и цифр
    """
    # Создаем набор символов: буквы (a-z, A-Z) и цифры (0-9)
    characters = string.ascii_letters + string.digits

    # Генерируем случайную строку
    random_string = ''.join(random.choice(characters) for _ in range(length))

    return random_string


def authenticate():
    phone_number = input("Enter your phone number: ")
    req = {
        "phone": phone_number,
        "requireTpToBeActive": True
    }
    data_start = requests.post('https://lknpd.nalog.ru/api/v2/auth/challenge/sms/start', json=req)

    challengeToken = data_start.json()['challengeToken']

    code = input("Enter the code from sms: ")
    device_id = generate_device_id()

    req = {
        "phone": phone_number,
        "code": code,
        "challengeToken": challengeToken,
        "deviceInfo": {
            "sourceDeviceId": device_id,
            "sourceType": "WEB",
            "appVersion": "1.0.0",
            "metaDetails": {
                "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15"
            }
        }
    }

    data = requests.post('https://lknpd.nalog.ru/api/v1/auth/challenge/sms/verify', json=req)

    if data.status_code == 200:
        data = data.json()
        data.update({"sourceDeviceId": device_id})

        ds = ProfileStorage(**data)

        with open('MoyNalogPy/profile.json', 'w') as f:
            try:
                # Пробуем использовать model_dump() (Pydantic v2)
                f.write(json.dumps(ds.model_dump()))
            except AttributeError:
                # Запасной вариант для Pydantic v1
                f.write(json.dumps(ds.dict()))

        print("Authentication successful!, you can find your profile in 'profile.json'")

    else:
        print("Authentication failed, please try again.")
        print(data.json())


def main():
    authenticate()