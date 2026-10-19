@echo off
rem One-click build of the all-in-one Windows installer for Waraq PDF Studio.
rem   BUILD-ALL-IN-ONE.cmd            Full build (with LibreOffice and LibreDWG, ~1 GB download the first time)
rem   BUILD-ALL-IN-ONE.cmd lite       Lite build (no Office or CAD conversion, ~150 MB)
rem Needs: Node.js 22+, pnpm, 7-Zip, internet access for the first run.
setlocal
set "PROJECT=%~dp0"
set "FETCHARGS="
if /i "%~1"=="lite" set "FETCHARGS=-SkipOffice"

where node >nul 2>nul || (echo Node.js 22+ is required: https://nodejs.org/ & exit /b 1)
where pnpm >nul 2>nul || (echo pnpm is required. Run: npm install -g pnpm & exit /b 1)

echo.
echo [1/4] Downloading and staging native engines...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT%tools\fetch-engines.ps1" -Project "%PROJECT%." %FETCHARGS% || exit /b 1

pushd "%PROJECT%" || exit /b 1
echo.
echo [2/4] Installing build tools...
call pnpm install --frozen-lockfile || (popd & exit /b 1)

echo.
echo [3/4] Testing...
node backend\test.cjs || (popd & exit /b 1)
node tests\color-tools-tests.cjs || (popd & exit /b 1)
node tests\waraq-tests.cjs || (popd & exit /b 1)
node tests\review-round2-tests.cjs || (popd & exit /b 1)
node tests\round3-tests.cjs || (popd & exit /b 1)
node tests\boundary-tests.cjs || (popd & exit /b 1)
node tests\update-tests.cjs || (popd & exit /b 1)
node tests\core-tests.cjs || (popd & exit /b 1)
node tests\more-tools-tests.cjs || (popd & exit /b 1)
node tests\advanced-tests.cjs || (popd & exit /b 1)
node tests\naming-tests.cjs || (popd & exit /b 1)
node tests\ocr-layer-tests.cjs || (popd & exit /b 1)
node tests\download-tests.cjs || (popd & exit /b 1)
node tests\crop-tests.cjs || (popd & exit /b 1)
node backend\test-sign.cjs || (popd & exit /b 1)
node backend\test-mupdf.cjs || (popd & exit /b 1)
node backend\test-native.cjs || (popd & exit /b 1)
node backend\test-office-cad.cjs || (popd & exit /b 1)
node desktop\verify-engines.cjs --require || (popd & exit /b 1)

echo.
echo [4/4] Building the installer...
call pnpm desktop:build:full || (popd & exit /b 1)
popd

echo.
echo Done. Installer: "%PROJECT%release-full"
endlocal
