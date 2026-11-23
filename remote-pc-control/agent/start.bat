@echo off
setlocal
cd /d "%~dp0"
set PY=python
where py >nul 2>nul
if %errorlevel%==0 set PY=py
echo Starting Remote Pad agent...
%PY% pc_agent.py %*
echo.
echo Agent stopped.
pause
