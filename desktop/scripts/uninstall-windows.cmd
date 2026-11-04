@echo off
rem Remove Mihrab for Windows (the desktop preview), with its settings. In Command Prompt:
rem
rem   curl -fsSLo "%TEMP%\mihrab-remove.cmd" https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/uninstall-windows.cmd && "%TEMP%\mihrab-remove.cmd"
rem
rem Quits Mihrab, runs its uninstaller, and takes away its start-at-login
rem entry and its settings (%APPDATA%\Mihrab). `install-windows.cmd uninstall`
rem does the same; keep the two in step (the Desktop workflow runs this one).
setlocal
set "APPDIR=%LOCALAPPDATA%\Programs\Mihrab"
echo Removing Mihrab...
taskkill /im Mihrab.exe /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v com.prayer_times.desktop /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" /v com.prayer_times.desktop /f >nul 2>&1
if exist "%APPDIR%\Uninstall Mihrab.exe" "%APPDIR%\Uninstall Mihrab.exe" /S _?=%APPDIR%
rmdir /s /q "%APPDIR%" >nul 2>&1
rmdir /s /q "%APPDATA%\Mihrab" >nul 2>&1
if exist "%APPDIR%\Mihrab.exe" (
  echo Mihrab could not be removed. Close it and run this again.
  exit /b 1
)
echo Mihrab is removed, with its settings.
exit /b 0
