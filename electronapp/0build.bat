@echo off
setlocal

REM Если зависимостей нет:
REM call npm install

echo === Build Windows ===
call npm run dist:win
if errorlevel 1 (
  echo.
  echo [ERROR] dist:win failed. Build stopped.
  goto :end
)

echo.
echo === Build Linux (WSL) ===
REM WSL - это .exe, но call не мешает и сохраняет единый стиль
call wsl npm run dist:linux
if errorlevel 1 (
  echo.
  echo [ERROR] dist:linux failed.
  goto :end
)

:end
echo.
echo Done.
pause
endlocal
