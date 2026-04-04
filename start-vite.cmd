@echo off
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%
echo === Starting Vite Dev Server ===
call npx.cmd vite --host 127.0.0.1 --port 5173
