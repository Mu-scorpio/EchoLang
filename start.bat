@echo off
setlocal EnableExtensions
cd /d "%~dp0EchoLang-Desktop"

echo.
echo Starting EchoLang Tauri desktop application...
echo.

where node >nul 2>nul
if errorlevel 1 goto :missing_node

where npm >nul 2>nul
if errorlevel 1 goto :missing_npm

if not exist "node_modules" goto :install_dependencies
goto :start_desktop

:install_dependencies
echo [1/2] Installing dependencies for the first run...
call npm install
if errorlevel 1 goto :install_failed

:start_desktop
echo [2/2] Starting the Tauri desktop shell...
call npm run dev
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
echo EchoLang has stopped.
pause
