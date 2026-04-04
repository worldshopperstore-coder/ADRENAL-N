@echo off
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%
set VITE_DEV_SERVER_URL=http://127.0.0.1:5173
echo === Starting Electron ===
call npx.cmd electron dist/main.cjs
