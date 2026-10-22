@echo off
rem Double-click: builds the Windows installer and signs it for the updater (the key stays in Backups\keys-private).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\dev\build-signed.ps1"
pause
