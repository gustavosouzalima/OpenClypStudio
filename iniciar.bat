@echo off
setlocal EnableExtensions EnableDelayedExpansion
title PixelTranscritor
cd /d "%~dp0"

call :find_free_port BACKEND_PORT 8000 20
if not defined BACKEND_PORT (
  echo Nao foi possivel encontrar uma porta livre para o backend.
  exit /b 1
)

call :find_free_port FRONTEND_PORT 3000 20
if not defined FRONTEND_PORT (
  echo Nao foi possivel encontrar uma porta livre para o frontend.
  exit /b 1
)

set "PIXEL_API_URL=http://127.0.0.1:%BACKEND_PORT%"
set "FRONTEND_URL=http://localhost:%FRONTEND_PORT%"

echo Iniciando Backend na porta %BACKEND_PORT%...
start "Backend - PixelTranscritor" powershell -NoExit -Command "Set-Location '%~dp0backend'; $env:PIXEL_PORT='%BACKEND_PORT%'; $env:PIXEL_PUBLIC_URL='%PIXEL_API_URL%'; $env:PIXEL_OPEN_BROWSER='0'; python main.py"

timeout /t 2 /nobreak >nul

echo Iniciando Frontend na porta %FRONTEND_PORT%...
start "Frontend - PixelTranscritor" powershell -NoExit -Command "Set-Location '%~dp0frontend'; $env:NEXT_PUBLIC_PIXEL_API_BASE_URL='%PIXEL_API_URL%'; bun run dev -- --port %FRONTEND_PORT%"

echo Aguardando frontend subir...
timeout /t 5 /nobreak >nul

echo Abrindo navegador...
start "" "%FRONTEND_URL%"

echo.
echo Servidores iniciados!
echo   Backend:  %PIXEL_API_URL%
echo   Frontend: %FRONTEND_URL%
echo.
pause
exit /b 0

:find_free_port
setlocal EnableDelayedExpansion
set "OUTPUT_VAR=%~1"
set /a "START_PORT=%~2"
set /a "MAX_TRIES=%~3"
set /a "END_PORT=START_PORT+MAX_TRIES-1"

for /L %%P in (!START_PORT!,1,!END_PORT!) do (
  set "CANDIDATE=%%P"
  call :is_port_in_use !CANDIDATE!
  if errorlevel 1 (
    endlocal & set "%OUTPUT_VAR%=%%P" & exit /b 0
  )
)

endlocal
exit /b 1

:is_port_in_use
setlocal
set "PORT=%~1"
netstat -ano -p tcp | findstr /R /C:":%PORT% .*LISTENING" /C:":%PORT% .*ESCUTANDO" >nul
if errorlevel 1 (
  endlocal & exit /b 1
)

endlocal & exit /b 0
