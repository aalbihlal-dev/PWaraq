# Builds the Microsoft Store package (MSIX) from the release build in src-tauri/target/release. Prepare only:
# nothing is submitted. Needs the Windows 10/11 SDK (MakeAppx.exe); the Store signs the package itself, so no
# certificate is needed for an upload. For a local sideload test pass -SelfSign (makes a throw-away test
# certificate with New-SelfSignedCertificate and signs with SignTool; Windows must trust that certificate first).
#   powershell -ExecutionPolicy Bypass -File packaging/msix/build.ps1 [-NoBuild] [-SelfSign]
param([switch]$NoBuild, [switch]$SelfSign)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.*\x64\makeappx.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $sdk) { throw 'Windows SDK not found (MakeAppx.exe). Install "Windows 10 SDK" or "Windows 11 SDK" from Visual Studio Installer, then rerun.' }
$bin = $sdk.DirectoryName; "SDK: $bin"
$manifest = Get-Content (Join-Path $PSScriptRoot 'AppxManifest.xml') -Raw -Encoding utf8
if ($manifest -match 'PLACEHOLDER') { Write-Warning 'AppxManifest.xml still has PLACEHOLDER identity values (fill them from Partner Center → Product identity). The package builds, but the Store will reject it.' }

if (-not $NoBuild) {
  $env:Path = "C:\Program Files\nodejs;" + $env:Path
  Push-Location $root; try { corepack pnpm tauri build --no-bundle; if ($LASTEXITCODE) { throw 'tauri build failed' } } finally { Pop-Location }
}
$exe = Join-Path $root 'src-tauri\target\release\waraq.exe'
if (-not (Test-Path $exe)) { throw "no release build: $exe" }

# layout: exe + the Store marker (the app then leaves updates to the Store) + assets + manifest with the version
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version -replace '[^0-9.].*$', ''   # 1.0.0-dev -> 1.0.0
$layout = Join-Path $root 'src-tauri\target\msix'
if (Test-Path $layout) { Remove-Item -Recurse -Force $layout }
New-Item -ItemType Directory -Force "$layout\Assets" | Out-Null
Copy-Item $exe $layout
Set-Content -Path "$layout\store-build" -Value 'Installed from the Microsoft Store: updates come from the Store, not from pwaraq.com.' -Encoding ascii
Copy-Item (Join-Path $PSScriptRoot 'Assets\*') "$layout\Assets"
$manifest -creplace 'Version="[0-9.]+"', "Version=`"$version.0`"" | Set-Content -Path "$layout\AppxManifest.xml" -Encoding utf8
"Version: $version.0"

New-Item -ItemType Directory -Force (Join-Path $root 'release') | Out-Null
$out = Join-Path $root "release\Waraq_$version.msix"
& "$bin\makeappx.exe" pack /o /d $layout /p $out
if ($LASTEXITCODE) { throw 'makeappx failed' }
if ($SelfSign) {
  $cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=PLACEHOLDER-PUBLISHER-ID' -KeyUsage DigitalSignature -FriendlyName 'Waraq MSIX test' -CertStoreLocation 'Cert:\CurrentUser\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
  & "$bin\signtool.exe" sign /fd SHA256 /sha1 $cert.Thumbprint $out
  "Signed with the test certificate $($cert.Thumbprint). To sideload, import it into 'Trusted People' (Local Machine) first."
}
$sha = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
"$out`n$((Get-Item $out).Length) bytes  SHA-256 $sha"
