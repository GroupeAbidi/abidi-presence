@echo off
chcp 65001 >nul
title Install - Abidi Presence
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Please install Node.js LTS 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)
call npm.cmd install
if errorlevel 1 (
  echo Installation failed. Check your internet connection and Node.js version.
  pause
  exit /b 1
)
echo Installation completed successfully.
pause
