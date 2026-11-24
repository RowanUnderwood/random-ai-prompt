@echo off
setlocal
set "APP=%~dp0output\desktop\Random AI Prompt Local.exe"
set "PENDING_APP=%~dp0output\desktop\Random AI Prompt Local.next.exe"
if exist "%PENDING_APP%" (
    move /y "%PENDING_APP%" "%APP%" >nul 2>&1
    if errorlevel 1 (
        echo Close Random AI Prompt Local, then run this launcher again to apply the update.
        pause
        exit /b 1
    )
)
if not exist "%APP%" (
    echo Desktop build not found. Run: npm run desktop:build:local
    pause
    exit /b 1
)
start "" "%APP%"
