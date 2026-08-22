@echo off
cd /d "%~dp0"
start "DQ4demo Server" cmd /k "python -m http.server 4173 --bind 127.0.0.1"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173/"
