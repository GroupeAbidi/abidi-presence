@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules\electron" (
 echo Please run install.bat first.
 pause
 exit /b 1
)
call npm.cmd start
if errorlevel 1 pause
