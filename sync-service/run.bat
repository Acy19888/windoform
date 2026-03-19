@echo off
REM ═══════════════════════════════════════════════════════════
REM  WINDOFORM Üretim Sync — Windows Task Scheduler için
REM  Her gün 20:00'de çalıştır
REM ═══════════════════════════════════════════════════════════

REM Node.js yolu (gerekirse düzenleyin)
SET NODE_PATH=C:\Program Files\nodejs\node.exe

REM Script dizini
SET SCRIPT_DIR=%~dp0

echo [%date% %time%] Sync başlıyor...

"%NODE_PATH%" "%SCRIPT_DIR%sync-production.js"

IF %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] Sync başarıyla tamamlandı.
) ELSE (
    echo [%date% %time%] HATA! Sync başarısız. Log: %SCRIPT_DIR%sync.log
)
