import functools
import requests
from .schemas import ProfileStorage


def refresh_token():
    url = "https://lknpd.nalog.ru/api/v1/auth/token"

    data = ProfileStorage.get()

    if data.refreshToken:
        req = {
            "refreshToken": data.refreshToken,
            "deviceInfo": {
                "sourceDeviceId": data.sourceDeviceId,
                "sourceType": "WEB",
                "appVersion": "1.0.0",
                "metaDetails": {
                    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15"
                }
            }
        }

        response = requests.post(url, json=req)
        if response.status_code == 200:
            response = response.json()
            data.refreshToken = response['refreshToken']
            data.token = response['token']
            data.save()
            print("Token refreshed successfully.")
        else:
            raise Exception("Что то пошло не так.\nДля устранения проблемы попробуйте удалить файл profile.json и заново пройти аутентификацию.\nДля этого запустите команду 'python auth.py'")





def token_refresh_decorator(func):
    @functools.wraps(func)
    def wrapper(self, **kwargs):
        print(f"{func.__name__.upper()} request with data: {kwargs}")

        # Первая попытка выполнения запроса
        response = func(self, **kwargs)
        print(response)

        # Если токен истек, обновляем его и повторяем запрос
        try:
            if response.get('code') == 'authentication.failed.expired.token':
                print("Token expired. Refreshing...")
                refresh_token()

                # Обновляем заголовки аутентификации самого объекта self
                if hasattr(self, 'auth'):
                    profile = ProfileStorage.get()
                    self.auth = {"Authorization": "Bearer " + profile.token}

                # Повторяем запрос с обновленным токеном
                response = func(self, **kwargs)
        except (AttributeError, TypeError, ValueError, KeyError):
            pass  # Если ответ не в формате JSON или нет нужного ключа

        return response
    return wrapper


def apply_token_refresh(cls):
    """Декоратор для автоматического применения token_refresh_decorator к методам класса"""
    # Получаем атрибуты только непосредственно этого класса (без унаследованных)
    for name, attr in cls.__dict__.items():
        # Пропускаем приватные методы и не-функции
        if name.startswith('_') or not callable(attr):
            continue

        # Применяем декоратор
        setattr(cls, name, token_refresh_decorator(attr))

    return cls



