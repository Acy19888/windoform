@echo off
:: ═══════════════════════════════════════════════════════════
::  WINDOFORM — Netsis ↔ Firebase Sync Service starten
::  Doppelklick oder via Windows Task Scheduler ausführen
:: ═══════════════════════════════════════════════════════════

cd /d "%~dp0"

:: Node.js prüfen
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Node.js bulunamadi!
    echo Lutfen https://nodejs.org adresinden Node.js indirip kurun.
    pause
    exit /b 1
)

:: config.json prüfen
if not exist config.json (
    echo [HATA] config.json bulunamadi!
    echo config.example.json dosyasini config.json olarak kopyalayin ve doldurun.
    pause
    exit /b 1
)

:: node_modules prüfen — bei Bedarf installieren
if not exist node_modules (
    echo [BİLGİ] Paketler yukleniyor...
    call npm install node-fetch@2
)

echo ============================================
echo  WINDOFORM Netsis Sync Service baslatiliyor
echo  Durdurmak icin bu pencereyi kapatin
echo ============================================
echo.

node sync-netsis.js

:: Falls der Prozess abstürzt, warten
echo.
echo [HATA] Service beklenmedik sekilde durdu.
pause
