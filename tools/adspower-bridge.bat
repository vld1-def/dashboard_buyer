@echo off
rem Starts the AdsPower bridge for the Dashboard CRM.
rem Keep this file next to adspower-bridge.py and keep the window open.
rem
rem Started by double click: the window stays open at the end, so a
rem message can be read. Started from the CRM button (the word
rem "protocol" is passed by the installer, never by a web page): the
rem window simply closes when the bridge stops or is already running.
title AdsPower bridge
cd /d "%~dp0"
set "FROM_CRM="
if /i "%~1"=="protocol" set "FROM_CRM=1"

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
if not defined FROM_CRM pause
