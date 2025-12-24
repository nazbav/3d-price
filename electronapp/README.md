GCodeCalc Electron — Remote UI + офлайн сборка CDN

URL сайта (онлайн):
  https://c.n4v.ru/test.html
  (можно переопределить env: GCODECALC_REMOTE_URL=...)

Панель сверху (Electron) — кнопка "Создать офлайн версию":
- скачивает HTML
- скачивает ресурсы CDN (<script src>, <link rel=stylesheet/icon/manifest href>, <img src>, srcset, и url() в <style>)
- переписывает ссылки на локальные assets
- сохраняет в userData\offline\site\ (см. кнопку "Открыть папку")

Если интернет недоступен:
- если есть офлайн копия -> открывается офлайн index.html
- если нет -> заглушка offline_stub.html

Импорт из Orca:
  "...\GCodeCalc.exe" --pp --silent;

Сборка:
  CMD:
    npm install
    npm run dist

Безопасность:
- remote content идёт в BrowserView с nodeIntegration=false, contextIsolation=true, sandbox=true (рекомендуется Electron). citeturn0search0turn0search2turn0search13
- навигации/новые окна наружу блокируются, внешние ссылки открываются в браузере. citeturn0search2turn0search10turn0search17

Логи:
  %TEMP%\GCodeCalc-logs\latest.txt
