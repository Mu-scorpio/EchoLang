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
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$mutex = [Threading.Mutex]::new($false, 'Local\EchoLang-4173-Server'); if (-not $mutex.WaitOne(0)) { Write-Host '[INFO] EchoLang is already starting or running.'; exit 20 }; try { try { $existing = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 1; if ($existing.app -eq 'EchoLang') { Write-Host '[INFO] EchoLang is already running on port 4173.'; exit 20 } } catch {}; $waitCommand = '$ready = $false; for ($i = 0; $i -lt 100; $i++) { try { $health = Invoke-RestMethod -Uri ''http://127.0.0.1:4173/api/health'' -TimeoutSec 1; if ($health.app -eq ''EchoLang'') { $ready = $true; break } } catch {}; Start-Sleep -Milliseconds 150 }; if ($ready) { Start-Process ''http://127.0.0.1:4173'' }'; Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $waitCommand); & npm.cmd start; exit $LASTEXITCODE } finally { $mutex.ReleaseMutex(); $mutex.Dispose() }"
if errorlevel 20 goto :already_running
goto :done

:already_running
echo EchoLang already has one server instance. No second service was started.
echo Opening the existing EchoLang page...
start "" "http://127.0.0.1:4173"
exit /b 0

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
