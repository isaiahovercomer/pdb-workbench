@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference='Stop'; if(Test-Path -LiteralPath '.\Select-Engine.ps1'){try {. '.\Select-Engine.ps1'} catch {Write-Warning $_.Exception.Message}}; Add-Type -Path (Join-Path (Get-Location) 'Workbench.cs') -ReferencedAssemblies 'System.dll','System.Core.dll','System.Xml.dll','System.IO.Compression.dll'; [PdbWorkbench]::Run((Get-Location).Path)"
if errorlevel 1 pause
