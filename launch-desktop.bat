@echo off
setlocal
set "APP=%~dp0output\desktop\Random AI Prompt Local.exe"
if not exist "%APP%" (
    echo Desktop build not found. Run: npm run desktop:build:local
    pause
    exit /b 1
)
start "" "%APP%"
