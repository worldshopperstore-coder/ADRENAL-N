@echo off
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%
echo === Building main.ts ===
call npx.cmd esbuild main.ts --bundle --platform=node --outfile=dist/main.cjs --format=cjs --external:electron
echo === Building preload.ts ===
call npx.cmd esbuild preload.ts --bundle --platform=node --outfile=dist/preload.cjs --format=cjs --external:electron
echo === Build complete ===
