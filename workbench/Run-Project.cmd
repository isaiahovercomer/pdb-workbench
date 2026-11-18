@echo off
setlocal
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy RemoteSigned -File "%~dp0Run-Project.ps1"
if errorlevel 1 pause
