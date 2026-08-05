@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo Starting EchoLang Desktop...
echo.

where node >nul 2>nul
if errorlevel 1 goto :missing_node

where npm >nul 2>nul
if errorlevel 1 goto :missing_npm

if not exist "node_modules\electron\dist\electron.exe" goto :install_desktop_dependencies
if not exist "..\node_modules\mammoth" goto :install_backend_dependencies
goto :start_app

:install_desktop_dependencies
echo [1/3] Installing Electron...
call npm install
if errorlevel 1 goto :install_failed

:install_backend_dependencies
echo [2/3] Installing EchoLang backend dependencies...
pushd ..
call npm install
popd
if errorlevel 1 goto :install_failed

:start_app
echo [3/3] Starting EchoLang...
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
echo EchoLang has stopped.
