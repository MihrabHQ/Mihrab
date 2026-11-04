@echo off
rem Mihrab for Windows, the desktop preview. In Command Prompt:
rem
rem   install:  curl -fsSLo "%TEMP%\mihrab.cmd" https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/install-windows.cmd && "%TEMP%\mihrab.cmd"
rem   remove:   curl -fsSLo "%TEMP%\mihrab-remove.cmd" https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/uninstall-windows.cmd && "%TEMP%\mihrab-remove.cmd"
rem             (or this script with `uninstall`: the same, kept in step)
rem
rem Installs for this user only (no administrator prompt) into
rem %LOCALAPPDATA%\Programs\Mihrab, with Start menu and desktop shortcuts.
rem Removing it quits Mihrab, takes away the app, its start-at-login entry
rem and its settings (%APPDATA%\Mihrab): a clean slate for the next test.
rem
rem The installers come from the desktop-preview pre-release, which the
rem Desktop workflow (.github/workflows/desktop.yml) refreshes. MIHRAB_FROM
rem set to a folder installs from those files instead (the workflow's test).
setlocal
set "BASE=https://github.com/MihrabHQ/Mihrab/releases/download/desktop-preview"
set "APPDIR=%LOCALAPPDATA%\Programs\Mihrab"
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"
set "SETUP=%TEMP%\Mihrab-Setup.exe"

taskkill /im Mihrab.exe /f >nul 2>&1

if /i "%~1"=="uninstall" (
  echo Removing Mihrab...
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
)

if defined MIHRAB_FROM (
  copy /y "%MIHRAB_FROM%\Mihrab-windows-%ARCH%.exe" "%SETUP%" >nul
) else (
  echo Downloading Mihrab for Windows ^(%ARCH%^)...
  curl -fL --progress-bar -o "%SETUP%" "%BASE%/Mihrab-windows-%ARCH%.exe"
)
if errorlevel 1 (
  echo The download failed.
  exit /b 1
)
echo Installing...
"%SETUP%" /S
del "%SETUP%" >nul 2>&1
if not exist "%APPDIR%\Mihrab.exe" (
  echo The installer did not finish.
  exit /b 1
)
echo Mihrab is installed.
if not defined MIHRAB_FROM start "" "%APPDIR%\Mihrab.exe"
echo To remove it again:
echo   curl -fsSLo "%%TEMP%%\mihrab-remove.cmd" https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/uninstall-windows.cmd ^&^& "%%TEMP%%\mihrab-remove.cmd"
exit /b 0
