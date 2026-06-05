@echo off
title ReliefHQ Server
color 0A
echo.
echo  ==========================================
echo    ReliefHQ Dual-Server Starting...
echo  ==========================================
echo.
echo  [1] Starting Node.js backend server...
echo  [2] Server will sync cloud data on startup
echo  [3] Excel will auto-update on every save
echo  [4] Press Ctrl+C to stop (auto-pushes to cloud)
echo.
cd /d "%~dp0"
node server.js
pause
