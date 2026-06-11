@echo off
cd /d "%~dp0"
echo Starting Cloud Dictionary...
echo.
echo Keep this window open while using the app.
echo The server will print the URL to open.
echo.
node server.js
pause
