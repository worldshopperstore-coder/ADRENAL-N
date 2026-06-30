@echo off
chcp 65001 >nul
echo ================================================
echo   Adrenalin Dünyası - Kurulum
echo ================================================
echo.

:: POS Server klasörünü kopyala
echo [1/2] POS Server kuruluyor...
if not exist "C:\Atlantis\PosSetup" mkdir "C:\Atlantis\PosSetup"
xcopy /E /I /Y "%~dp0POS_Server" "C:\Atlantis\PosSetup\POS_Server" >nul
echo     Tamam.

:: Adrenalin Setup'ı çalıştır (klasördeki ilk Setup exe'yi bul)
echo [2/2] Adrenalin kuruluyor...
for %%f in ("%~dp0Adrenalin-Setup*.exe") do (
    start "" "%%f"
    goto done
)
:done

echo.
echo Kurulum tamamlandı!
pause
