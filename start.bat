@echo off
REM Double-click this to start AI Studio and open the Shorts generator.
cd /d %~dp0

if not exist node_modules (
    echo Installing dependencies the first time - this can take a minute...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install failed. Install Node.js from https://nodejs.org (LTS) and try again.
        pause
        exit /b 1
    )
)

if not exist .env (
    echo Creating .env from .env.example - open it and add your API keys, or use the
    echo Settings panel on the Shorts page instead.
    copy .env.example .env >nul
)

echo Starting AI Studio...
start "AI Studio" cmd /k "npm run dev"
timeout /t 6 /nobreak >nul
start "" http://localhost:3000/shorts
