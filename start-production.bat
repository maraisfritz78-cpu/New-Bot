@echo off
REM Production startup for Windows with optimized GC

setlocal enabledelayedexpansion

set NODE_ENV=production
set NODE_OPTIONS=--max-old-space-size=4096 --expose-gc --trace-gc

REM Build if needed
if not exist ".next" (
  echo Building Next.js...
  call npm run build
  if !errorlevel! neq 0 (
    echo Build failed
    pause
    exit /b 1
  )
)

REM Install PM2 globally if not present
pm2 --version >nul 2>&1
if !errorlevel! neq 0 (
  echo Installing PM2 globally...
  npm install -g pm2
)

REM Start with PM2
echo Starting bot with PM2...
call npm run start:pm2

REM Display status
pm2 status
pm2 logs

pause
