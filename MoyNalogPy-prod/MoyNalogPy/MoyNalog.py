import functools
import json
import os
import string
from datetime import timezone, timedelta, datetime
from http.client import HTTPResponse, HTTPException
from random import random

import requests
from MoyNalogPy.schemas import Service, Client, ProfileStorage, Incomes, Receipt, UserProfile
from MoyNalogPy.token_refresh import apply_token_refresh





@apply_token_refresh
class MoyNalog:

    def __init__(self, timezone_shift = None):

        self.timezone_shift = timezone_shift if timezone_shift else 3
        self.profile = ProfileStorage.get()
        self.auth = {"Authorization" : "Bearer " + self.profile.token}


    def __get_curtime(self):
        tz = timezone(timedelta(hours=self.timezone_shift))
        current_time = datetime.now(tz)
        formatted_time_1 = current_time.strftime("%Y-%m-%dT%H:%M:%S%z")
        return formatted_time_1


    def get_receipt_url(self,approvedReceiptUuid):
        url = f" https://lknpd.nalog.ru/api/v1/receipt/771551648410/{approvedReceiptUuid}/print"
        return url

    def create_invoice(self, operationTime,
                       svs: list[Service] | Service,
                       client: Client = Client,
                       paymentType: str = "CASH",
                       ignoreMaxTotalIncomeRestriction: bool = False,
                       return_recipt_url: bool = False):
        """
        Создает новый чек (invoice) для клиента.

        :param operationTime: Время операции в формате строки.
        :param svs: Список услуг или одна услуга (объект Service).
        :param client: Клиент, для которого создается чек (объект Client).
        :param paymentType: Тип оплаты ("CASH" или "CARD").
        :param ignoreMaxTotalIncomeRestriction: Игнорировать ограничение на максимальный доход (по умолчанию False).
        :param return_recipt_url: Возвращать URL чека (по умолчанию False).
        :return: Ответ от API в формате approvedReceiptUuid или URL чека, если return_recipt_url=True. В случае
        """

        url = "https://lknpd.nalog.ru/api/v1/income"

        # Преобразование услуг в формат для отправки
        services = [el.model_dump() for el in svs] if len(svs) > 1 else svs.model_dump()
        totalamount = sum([el.amount * el.quantity for el in svs]) if len(svs) > 1 else svs.amount * svs.quantity

        # Формирование тела запроса
        body = {
            "operationTime": operationTime,
            "requestTime": self.__get_curtime(),
            "services": services,
            "totalAmount": totalamount,
            "client": client.model_dump(),
            "paymentType": paymentType,
            "ignoreMaxTotalIncomeRestriction": ignoreMaxTotalIncomeRestriction
        }

        try:
            # Отправка POST-запроса на создание чека
            response = requests.post(url, headers=self.auth, json=body)

            if response.status_code == 200:
                if return_recipt_url:
                    approvedReceiptUuid = response.json()['approvedReceiptUuid']
                    return self.get_receipt_url(approvedReceiptUuid)

                return response.json().get("approvedReceiptUuid")

        except HTTPException as e:
            print(f"HTTP error: {e}")
            return None

    def get_profile(self):

        url = "https://lknpd.nalog.ru/api/v1/user"

        response = requests.get(url, headers=self.auth)
        if response.status_code == 200:
            response = response.json()
            profile = UserProfile(**response)
            return profile

        return response.json()

    def get_incomes(self,
                    startDate,
                    endDate,
                    offset = 0,
                    sortBy = "operation_time:desc",
                    limit=50):
        """
        Получает список доходов за указанный период.

        :param startDate: Дата начала периода (по умолчанию None).
        :param endDate: Дата окончания периода (по умолчанию None).
        :return: Ответ от API в формате JSON.
        """
        url = "https://lknpd.nalog.ru/api/v1/incomes"

        # Формирование параметров запроса
        params = {
            "from": startDate,
            "to": endDate,
            "offset": offset,
            "sortBy": sortBy,
            "limit": limit
        }

        try:
            response = requests.get(url, headers=self.auth, params=params)
            if response.status_code == 200:
                response = response.json()
                inc = Incomes(**response)
                return inc

            else:
                return response.json()

        except HTTPException as e:
            print(f"HTTP error: {e}")
            return None




