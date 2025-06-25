import requests

from schemas.schemas import ProfileStorage


class CustomRequests:

    def chek(self, response):
        if response.json().get('code') == 'authentication.failed.expired.token':
            print("Token expired. Refreshing...")
            refresh_token()
            return False
        return True

    def post(self, url, **kwargs):
        print(f"POST request to {url} with data: {kwargs}")

        response = requests.post(url, **kwargs)

        if not self.chek(response):
            # Если токен истек, повторяем запрос
            response = requests.post(url, **kwargs)

        return response

    def get(self, url, **kwargs):
        print(f"GET request to {url} with data: {kwargs}")

        response = requests.get(url, **kwargs)

        if not self.chek(response):
            # Если токен истек, повторяем запрос
            response = requests.get(url, **kwargs)

        return response