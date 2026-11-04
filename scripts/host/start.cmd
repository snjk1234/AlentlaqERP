@echo off
setlocal
cd /d "%~dp0"
"%~dp0runtime\node.exe" "%~dp0start-host.js"
if errorlevel 1 (
  echo.
  echo Server failed. Read the error above before closing this window.
  pause
)
