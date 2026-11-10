@echo off
rem Starts the AdsPower bridge for the Dashboard CRM.
rem Keep this file next to adspower-bridge.py and keep the window open.
title AdsPower bridge
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Install it from https://www.python.org/downloads/
    echo and tick "Add python.exe to PATH" in the installer.
    pause
    exit /b 1
  )
  py -3 adspower-bridge.py
) else (
  python adspower-bridge.py
)
pause
