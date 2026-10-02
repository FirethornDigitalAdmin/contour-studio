@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" start.py %*
  goto finished
)
py -3 -c "import sys; sys.exit(sys.version_info < (3, 12))" >nul 2>&1
if not errorlevel 1 (
  py -3 start.py %*
  goto finished
)
python -c "import sys; sys.exit(sys.version_info < (3, 12))" >nul 2>&1
if not errorlevel 1 (
  python start.py %*
  goto finished
)
echo Install Python 3.12 or newer from https://www.python.org/downloads/
echo Then run this launcher again. See START-HERE.md for setup help.
pause
exit /b 1
:finished
set "contour_status=%errorlevel%"
if not "%contour_status%"=="0" pause
exit /b %contour_status%
