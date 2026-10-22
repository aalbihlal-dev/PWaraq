# The owner's one-step signed build: the updater key and its password are read from Backups\keys-private for this
# build only (never printed, never saved anywhere else, cleared at the end), then the installer is built and signed.
# Run by the owner (double-click build-signed.cmd in the project folder); sessions do not load the key.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$keys = Join-Path (Split-Path -Parent $root) 'Backups\keys-private'
$key = Join-Path $keys 'waraq-updater.key'; $pass = Join-Path $keys 'waraq-updater.password.txt'
if (-not (Test-Path $key) -or -not (Test-Path $pass)) { throw "The updater key is not in $keys" }
Set-Location $root
$env:Path = "C:\Program Files\nodejs;" + $env:Path
try {
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $key
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content -Raw $pass).Trim()
  corepack pnpm desktop:build
  if ($LASTEXITCODE -ne 0) { throw "The build failed (exit $LASTEXITCODE)" }
} finally {
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}
$exe = Get-ChildItem (Join-Path $root 'release') -Filter '*-setup.exe' | Sort-Object LastWriteTime | Select-Object -Last 1
Write-Host "`nDone: $($exe.Name), $([math]::Round($exe.Length / 1MB, 1)) MB, signed. Tell Claude 'built'." -ForegroundColor Green
