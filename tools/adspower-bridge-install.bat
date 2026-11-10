@echo off
rem One-time setup: lets the "Start bridge" button in the Dashboard CRM
rem open the AdsPower bridge on this computer.
rem
rem What it changes: one entry in the registry of the CURRENT USER
rem (HKCU\Software\Classes\adsbridge). No administrator rights, nothing
rem system-wide. It tells Windows that a link starting with adsbridge://
rem runs adspower-bridge.bat from THIS folder, minimised.
rem
rem The link itself is never handed to the program: whatever a web page
rem writes after adsbridge:// is ignored, so a page cannot pass commands.
rem
rem Keep the three files together. Moved the folder? Run this again.
title AdsPower bridge - setup
cd /d "%~dp0"

if not exist "%~dp0adspower-bridge.bat" (
  echo adspower-bridge.bat is not in this folder.
  echo Put all three files into one folder and run this again.
  pause
  exit /b 1
)

echo  1 - Install: let the CRM button start the bridge
echo  2 - Remove:  undo it
echo.
choice /c 12 /n /m "Press 1 or 2: "
if errorlevel 2 goto remove

reg add "HKCU\Software\Classes\adsbridge" /ve /d "URL:AdsPower bridge" /f >nul
reg add "HKCU\Software\Classes\adsbridge" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\adsbridge\shell\open\command" /ve /d "cmd.exe /c start \"AdsPower bridge\" /min \"%~dp0adspower-bridge.bat\" protocol" /f >nul
if errorlevel 1 (
  echo Could not write the setting.
  pause
  exit /b 1
)
echo.
echo Done. In the CRM open a file, press AdsPower, then "Start bridge".
echo The browser will ask once whether to open AdsPower bridge - allow it.
pause
exit /b 0

:remove
reg delete "HKCU\Software\Classes\adsbridge" /f >nul 2>nul
echo.
echo Removed. The CRM button will no longer start the bridge.
pause
exit /b 0
