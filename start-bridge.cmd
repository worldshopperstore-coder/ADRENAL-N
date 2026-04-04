@echo off
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%
echo === Bridge Restart ===
"%LOCALAPPDATA%\Microsoft\WindowsApps\python3.11.exe" pos_bridge.py
