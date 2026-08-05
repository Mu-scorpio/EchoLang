@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo Starting EchoLang Paragraph Translation Desk...
echo.

where node >nul 2>nul
if errorlevel 1 goto :missing_node

where npm >nul 2>nul
if errorlevel 1 goto :missing_npm

if not exist "node_modules" goto :install_dependencies
goto :start_server

:install_dependencies
echo [1/2] Installing dependencies for the first run...
call npm install
if errorlevel 1 goto :install_failed

:start_server
echo [2/2] Starting the local server...
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:4173'"
call npm start
goto :done

:missing_node
echo [ERROR] Node.js was not found.
echo Install Node.js 20 or newer from https://nodejs.org/
pause
exit /b 1

:missing_npm
echo [ERROR] npm was not found.
echo Reinstall Node.js and make sure npm is available in PATH.
pause
exit /b 1

:install_failed
echo [ERROR] Dependency installation failed.
echo Check your network connection and try again.
pause
exit /b 1

:done
echo.
echo The server has stopped.
pause
