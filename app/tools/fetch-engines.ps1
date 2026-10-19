<#
.SYNOPSIS
  Downloads official Windows x64 builds of the native PDF engines and stages them in <Project>\engines\win-x64
  so electron-builder can ship them inside the Waraq installer (all-in-one build).

.DESCRIPTION
  Engines and sources (latest stable is discovered at run time; override any URL with the parameters):
    qpdf        github.com/qpdf/qpdf releases (msvc64 zip)             Apache-2.0   ~10 MB
    MuPDF       mupdf.com downloads archive (windows zip, mutool.exe)  AGPL-3.0     ~50 MB
    Tesseract   UB Mannheim Windows build (NSIS installer, extracted)  Apache-2.0   ~80 MB
    LibreOffice download.documentfoundation.org (MSI, admin-extracted) MPL-2.0      ~700 MB  (skip with -SkipOffice)

  Arabic + English OCR models are reused from the app (dist\vendor\ocr\*.traineddata.gz), so no extra model
  download is needed. Every download's SHA-256 is recorded in engines\win-x64\ENGINE-SOURCES.json. When an
  upstream checksum is published (GitHub asset digest, LibreOffice .sha256) it is verified; a re-run with an
  existing lock file refuses files whose hash changed for the same URL.

  Requires: Windows 10/11, PowerShell 5.1+, internet access, 7-Zip (for the Tesseract installer).
  Nothing is installed system-wide and no administrator rights are needed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File fetch-engines.ps1
  powershell -ExecutionPolicy Bypass -File fetch-engines.ps1 -SkipOffice      # "Lite" bundle, ~150 MB
#>
[CmdletBinding()]
param(
  [string]$Project = (Join-Path $PSScriptRoot '..'),
  [switch]$SkipOffice,
  [switch]$Force,
  [string]$QpdfUrl,
  [string]$MuPdfUrl,
  [string]$TesseractUrl,
  [string]$LibreOfficeUrl,
  [string]$QpdfSha256,
  [string]$MuPdfSha256,
  [string]$TesseractSha256,
  [string]$LibreOfficeSha256,
  [string]$LibreDwgUrl,
  [string]$LibreDwgSha256,
  [string]$SevenZipPath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is many times slower with the progress bar in PS 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Project = (Resolve-Path $Project).Path
if (-not (Test-Path (Join-Path $Project 'package.json'))) { throw "Not the Waraq project folder: $Project" }
$EngineRoot = Join-Path $Project 'engines'
$FinalDest = Join-Path $EngineRoot 'win-x64'
$Cache = Join-Path $PSScriptRoot '..\engines-cache'
$Work = Join-Path $EngineRoot ('.build-' + [guid]::NewGuid().ToString('N'))
$Dest = Join-Path $Work 'staged'
New-Item -ItemType Directory -Force $Dest, $Cache | Out-Null
$Cache = (Resolve-Path $Cache).Path
$LockFile = Join-Path $FinalDest 'ENGINE-SOURCES.json'
$Lock = @{}
if (Test-Path $LockFile) {
  (Get-Content $LockFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $Lock[$_.Name] = $_.Value }
}
$Headers = @{ 'User-Agent' = 'waraq-engine-fetch' }

# Runs a tool that prints to stderr (mutool -v, tesseract --list-langs). Windows PowerShell 5.1 turns redirected
# stderr into an error record, which 'Stop' mode would treat as a failure; the exit code is what counts here.
function Invoke-Tool([string]$exe, [string[]]$toolArgs) {
  $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $exe @toolArgs 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $previous }
}

function Step($text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }

function Assert-ChildPath([string]$candidate, [string]$parent) {
  $resolved = [IO.Path]::GetFullPath($candidate)
  $prefix = [IO.Path]::GetFullPath($parent).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing a path outside $parent : $resolved" }
  # Refuse junctions/symlinks in managed trees rather than traversing them during cleanup or replacement.
  $walk = $resolved
  while ($walk -and $walk.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path -LiteralPath $walk) {
      if ((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing a reparse point: $walk" }
    }
    $walk = [IO.Path]::GetDirectoryName($walk)
  }
  return $resolved
}

function Remove-Tree([string]$candidate, [string]$parent) {
  $checked = Assert-ChildPath $candidate $parent
  if (Test-Path -LiteralPath $checked) { Remove-Item -LiteralPath $checked -Recurse -Force }
}

function Get-Links([string]$pageUrl) {
  $page = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -Headers $Headers
  $base = [Uri]$pageUrl
  $page.Links | ForEach-Object { $_.href } | Where-Object { $_ } | ForEach-Object { ([Uri]::new($base, $_)).AbsoluteUri } | Select-Object -Unique
}

function Pick-Latest($links, [string]$pattern) {
  # Highest version wins; the first capture group must be a dotted version number.
  $best = $null; $bestVer = $null
  foreach ($l in $links) {
    $m = [regex]::Match($l, $pattern)
    if (-not $m.Success) { continue }
    $parts = $m.Groups[1].Value.Split('.') | Select-Object -First 4
    try { $v = [version]($parts -join '.') } catch { continue }
    if (-not $bestVer -or $v -gt $bestVer) { $bestVer = $v; $best = $l }
  }
  if (-not $best) { throw "No download matching $pattern was found. Pass the URL explicitly." }
  return $best
}

function Get-File([string]$name, [string]$url, [string]$expectedSha) {
  $uri = [Uri]$url
  if ($uri.Scheme -ne 'https' -or $uri.UserInfo) { throw "$name download must use an HTTPS URL without credentials." }
  if ($expectedSha -and $expectedSha -notmatch '^[0-9a-fA-F]{64}$') { throw "$name requires a 64-character SHA-256 value." }
  $leaf = [IO.Path]::GetFileName($uri.AbsolutePath)
  if (-not $leaf -or $leaf.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) { throw 'Invalid download filename.' }
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $urlHash = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($url)))).Replace('-','').Substring(0,16).ToLower() } finally { $hasher.Dispose() }
  $file = Assert-ChildPath (Join-Path $Cache ($name + '-' + $urlHash + '-' + $leaf)) $Cache
  if ($Force -or -not (Test-Path $file)) {
    Write-Host "  downloading $url"
    Invoke-WebRequest -Uri $url -OutFile "$file.part" -UseBasicParsing -Headers $Headers
    Move-Item -LiteralPath "$file.part" -Destination $file -Force
  } else { Write-Host "  cached $file" }
  $sha = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower()
  if ($expectedSha -and $sha -ne $expectedSha.ToLower()) {
    Remove-Item -LiteralPath $file -Force
    throw "$name checksum mismatch. Expected $expectedSha, got $sha. The file was deleted."
  }
  $previous = $Lock[$name]
  if ($previous -and $previous.url -eq $url -and $previous.sha256 -ne $sha) {
    throw "$name changed since it was first recorded ($($previous.sha256) -> $sha) for the same URL. Investigate before continuing."
  }
  $Lock[$name] = [ordered]@{ url = $url; sha256 = $sha; bytes = (Get-Item $file).Length; verified = [bool]$expectedSha; fetched = (Get-Date).ToString('s') }
  Write-Host ("  sha256 {0} {1}" -f $sha, $(if ($expectedSha) { '(verified against upstream)' } else { '(recorded; no upstream checksum)' }))
  return $file
}

function Reset-Dir([string]$path) { Remove-Tree $path $Work; New-Item -ItemType Directory -Force $path | Out-Null }

function Find-7Zip {
  if ($SevenZipPath) { if (Test-Path -LiteralPath $SevenZipPath -PathType Leaf) { return (Resolve-Path -LiteralPath $SevenZipPath).Path }; throw 'SevenZipPath does not name an executable.' }
  $c = Get-Command 7z.exe -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe")) { if ($p -and (Test-Path $p)) { return $p } }
  throw '7-Zip is required to unpack the Tesseract installer without running it. Install it from https://www.7-zip.org/ and re-run.'
}

try {
  # ---------------------------------------------------------------- qpdf
  Step 'qpdf'
  $qSha = $QpdfSha256
  if (-not $QpdfUrl) {
    $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/qpdf/qpdf/releases/latest' -Headers $Headers
    $asset = $rel.assets | Where-Object { $_.name -match 'msvc64\.zip$' } | Select-Object -First 1
    if (-not $asset) { throw 'No qpdf msvc64 zip in the latest release.' }
    $QpdfUrl = $asset.browser_download_url
    if (-not $qSha -and $asset.digest -and $asset.digest -like 'sha256:*') { $qSha = $asset.digest.Substring(7) }
  }
  $zip = Get-File 'qpdf' $QpdfUrl $qSha
  $x = Join-Path $Work 'qpdf'; Expand-Archive -Force $zip $x
  $exe = Get-ChildItem -Recurse -Filter qpdf.exe $x | Select-Object -First 1
  if (-not $exe) { throw 'qpdf.exe not found in the archive.' }
  Reset-Dir (Join-Path $Dest 'qpdf')
  Copy-Item -Recurse -Force (Join-Path $exe.Directory.Parent.FullName '*') (Join-Path $Dest 'qpdf')

  # ---------------------------------------------------------------- MuPDF (mutool)
  Step 'MuPDF (mutool)'
  if (-not $MuPdfUrl) {
    $links = @()
    # The releases page lists builds as text on casper.mupdf.com rather than as normal links, so match the page text.
    foreach ($p in @('https://mupdf.com/releases', 'https://mupdf.com/downloads/archive/')) {
      try {
        $page = (Invoke-WebRequest -Uri $p -UseBasicParsing -Headers $Headers).Content
        $links += [regex]::Matches($page, '(?:https?://)?casper\.mupdf\.com/downloads/archive/mupdf-[0-9.]+-windows\.zip') | ForEach-Object { if ($_.Value -like 'http*') { $_.Value } else { 'https://' + $_.Value } }
        try { $links += Get-Links $p } catch {}
      } catch { Write-Host "  could not list $p" }
    }
    $MuPdfUrl = Pick-Latest $links 'mupdf-(\d+\.\d+\.\d+)-windows\.zip$'
  }
  $zip = Get-File 'mupdf' $MuPdfUrl $MuPdfSha256
  $x = Join-Path $Work 'mupdf'; Expand-Archive -Force $zip $x
  $exe = Get-ChildItem -Recurse -Filter mutool.exe $x | Select-Object -First 1
  if (-not $exe) { throw 'mutool.exe not found in the archive.' }
  Reset-Dir (Join-Path $Dest 'mupdf')
  Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $Dest 'mupdf')
  Get-ChildItem -LiteralPath $exe.Directory.FullName -Filter *.dll -File | Copy-Item -Destination (Join-Path $Dest 'mupdf')
  Get-ChildItem $exe.Directory.FullName -File | Where-Object { $_.Name -match '^(COPYING|LICENSE|README|CHANGES)' } | Copy-Item -Destination (Join-Path $Dest 'mupdf')

  # ---------------------------------------------------------------- Tesseract
  Step 'Tesseract OCR'
  if (-not $TesseractUrl) {
    # UB Mannheim publishes the Windows builds on GitHub; their own download site is the fallback (it can refuse scripts).
    try {
      $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/UB-Mannheim/tesseract/releases?per_page=10' -Headers $Headers
      $asset = $rel | ForEach-Object { $_.assets } | Where-Object { $_.name -match '^tesseract-ocr-w64-setup-.*\.exe$' } | Select-Object -First 1
      if ($asset) { $TesseractUrl = $asset.browser_download_url }
    } catch { Write-Host '  GitHub release list unavailable' }
    if (-not $TesseractUrl) {
      $TesseractUrl = Pick-Latest (Get-Links 'https://digi.bib.uni-mannheim.de/tesseract/') 'tesseract-ocr-w64-setup-v?(5[\d.]+?)\.exe$'
    }
  }
  $setup = Get-File 'tesseract' $TesseractUrl $TesseractSha256
  $sevenZip = Find-7Zip
  $x = Join-Path $Work 'tesseract'
  & $sevenZip x $setup "-o$x" -y '-x!*uninstall*' | Out-Null
  # 7-Zip may warn about installer-only parts it cannot read; what matters is that tesseract.exe was unpacked.
  if (-not (Get-ChildItem -Recurse -Filter tesseract.exe $x -ErrorAction SilentlyContinue)) { throw '7-Zip could not unpack the Tesseract installer.' }
  $exe = Get-ChildItem -Recurse -Filter tesseract.exe $x | Select-Object -First 1
  if (-not $exe) { throw 'tesseract.exe not found in the installer.' }
  $t = Join-Path $Dest 'tesseract'; Reset-Dir $t
  Get-ChildItem $exe.Directory.FullName | Where-Object { $_.Name -notmatch '^\$|^uninstall' } | Copy-Item -Recurse -Destination $t
  $tessdata = Join-Path $t 'tessdata'; New-Item -ItemType Directory -Force $tessdata | Out-Null
  foreach ($lang in 'ara', 'eng') {
    $gz = Join-Path $Project "dist\vendor\ocr\$lang.traineddata.gz"
    if (-not (Test-Path $gz)) { throw "Missing $gz (the app's bundled OCR model)." }
    $in = [IO.File]::OpenRead($gz); $out = [IO.File]::Create((Join-Path $tessdata "$lang.traineddata"))
    $g = $null
    try { $g = New-Object IO.Compression.GZipStream($in, [IO.Compression.CompressionMode]::Decompress); $g.CopyTo($out) } finally { if ($g) { $g.Dispose() }; $out.Dispose(); $in.Dispose() }
  }

  # ---------------------------------------------------------------- LibreOffice
  if ($SkipOffice) {
    Step 'LibreOffice skipped (-SkipOffice): Office conversion tools will stay unavailable in this build'
    $Lock.Remove('libreoffice')
  } else {
    Step 'LibreOffice (large download)'
    if (-not $LibreOfficeUrl) {
      $root = 'https://download.documentfoundation.org/libreoffice/stable/'
      $verUrl = Pick-Latest (Get-Links $root) '/stable/(\d+\.\d+\.\d+)/$'
      $ver = [regex]::Match($verUrl, '(\d+\.\d+\.\d+)/$').Groups[1].Value
      $LibreOfficeUrl = "$root$ver/win/x86_64/LibreOffice_${ver}_Win_x86-64.msi"
    }
    $loSha = $LibreOfficeSha256
    if (-not $loSha) { try { $loSha = ((Invoke-WebRequest -Uri "$LibreOfficeUrl.sha256" -UseBasicParsing -Headers $Headers).Content.ToString().Trim() -split '\s+')[0] } catch { Write-Host '  no upstream .sha256 available' } }
    if ($loSha -notmatch '^[0-9a-fA-F]{64}$') { $loSha = $null }
    $msi = Get-File 'libreoffice' $LibreOfficeUrl $loSha
    $x = Join-Path $Work 'lo'
    # Administrative install = plain extraction of the MSI payload; nothing is registered on this PC.
    $p = Start-Process msiexec.exe -ArgumentList @('/a', "`"$msi`"", '/qn', "TARGETDIR=`"$x`"") -WindowStyle Hidden -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "msiexec extraction failed ($($p.ExitCode))." }
    $exe = Get-ChildItem -Recurse -Filter soffice.exe $x | Select-Object -First 1
    if (-not $exe) { throw 'soffice.exe not found after extraction.' }
    $lo = Join-Path $Dest 'libreoffice'; Reset-Dir $lo
    Copy-Item -Recurse -Force (Join-Path $exe.Directory.Parent.FullName '*') $lo
    Get-ChildItem -Recurse -Filter *.msi $lo | ForEach-Object { $checked = Assert-ChildPath $_.FullName $Work; Remove-Item -LiteralPath $checked -Force }
  }

  # ---------------------------------------------------------------- LibreDWG (DWG -> DXF, then LibreOffice makes the PDF)
  if ($SkipOffice) {
    $Lock.Remove('libredwg')
  } else {
    Step 'LibreDWG (CAD drawings)'
    $dwgSha = $LibreDwgSha256
    if (-not $LibreDwgUrl) {
      $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/LibreDWG/libredwg/releases/latest' -Headers $Headers
      $asset = $rel.assets | Where-Object { $_.name -match 'win64\.zip$' } | Select-Object -First 1
      if (-not $asset) { throw 'No LibreDWG win64 zip in the latest release.' }
      $LibreDwgUrl = $asset.browser_download_url
      if (-not $dwgSha -and $asset.digest -and $asset.digest -like 'sha256:*') { $dwgSha = $asset.digest.Substring(7) }
    }
    $zip = Get-File 'libredwg' $LibreDwgUrl $dwgSha
    $x = Join-Path $Work 'libredwg'; Expand-Archive -Force $zip $x
    $exe = Get-ChildItem -Recurse -Filter dwg2dxf.exe $x | Select-Object -First 1
    if (-not $exe) { throw 'dwg2dxf.exe not found in the LibreDWG archive.' }
    $dwg = Join-Path $Dest 'libredwg'; Reset-Dir $dwg
    Get-ChildItem -LiteralPath $exe.Directory.FullName -File | Where-Object { $_.Name -match '\.(exe|dll)$' } | Copy-Item -Destination $dwg
    Get-ChildItem -Recurse -File $x | Where-Object { $_.Name -match '^(COPYING|LICENSE|README)' } | Select-Object -First 3 | Copy-Item -Destination $dwg
  }

  # ---------------------------------------------------------------- manifest + licences
  Step 'Writing ENGINE-SOURCES.json and THIRD-PARTY-ENGINES.txt'
  $Lock['bundle'] = [ordered]@{ office = (-not $SkipOffice); created = (Get-Date).ToString('s') }
  ($Lock | ConvertTo-Json -Depth 4) | Set-Content -Encoding utf8 (Join-Path $Dest 'ENGINE-SOURCES.json')
  @"
Native engines bundled with Waraq PDF Studio (run as separate programs; not linked into Waraq):
  qpdf         Apache-2.0      https://github.com/qpdf/qpdf
  MuPDF mutool AGPL-3.0        https://mupdf.com  (commercial licence available from Artifex)
  Tesseract    Apache-2.0      https://github.com/tesseract-ocr/tesseract  (Windows build: UB Mannheim)
  LibreOffice  MPL-2.0         https://www.libreoffice.org  $(if ($SkipOffice) { '(not included in this build)' })
  LibreDWG     GPL-3.0         https://www.gnu.org/software/libredwg/  $(if ($SkipOffice) { '(not included in this build)' })
Binary download URLs and SHA-256 hashes are in ENGINE-SOURCES.json. These are not corresponding-source archives.
Review the exact upstream redistribution terms and provide required licenses/notices and corresponding source before distribution.
MuPDF runs as a separate process; this statement does not determine the license obligations of the combined distribution.
"@ | Set-Content -Encoding utf8 (Join-Path $Dest 'THIRD-PARTY-ENGINES.txt')

  # Verify executability and both language packs before replacing an existing working bundle.
  & (Join-Path $Dest 'qpdf\bin\qpdf.exe') --version | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Staged qpdf failed its version check.' }
  $mutoolVersion = Invoke-Tool (Join-Path $Dest 'mupdf\mutool.exe') @('-v')
  if (($LASTEXITCODE -notin @(0,1)) -or ($mutoolVersion -join ' ') -notmatch '(?i)mutool|mupdf') { throw 'Staged mutool failed its version check.' }
  $langs = Invoke-Tool (Join-Path $Dest 'tesseract\tesseract.exe') @('--tessdata-dir', $tessdata, '--list-langs') | ForEach-Object { $_.Trim() }
  if ($LASTEXITCODE -ne 0 -or 'ara' -notin $langs -or 'eng' -notin $langs) { throw 'Staged Tesseract does not expose both ara and eng language models.' }
  if (-not $SkipOffice) { & (Join-Path $Dest 'libreoffice\program\soffice.exe') --headless --version | Out-Host; if ($LASTEXITCODE -ne 0) { throw 'Staged LibreOffice failed its version check.' } }

  $checkedFinal = Assert-ChildPath $FinalDest $EngineRoot
  $backup = Assert-ChildPath (Join-Path $EngineRoot ('.previous-' + [guid]::NewGuid().ToString('N'))) $EngineRoot
  $checkedStage = Assert-ChildPath $Dest $Work
  if (Test-Path -LiteralPath $checkedFinal) { Move-Item -LiteralPath $checkedFinal -Destination $backup }
  try { Move-Item -LiteralPath $checkedStage -Destination $checkedFinal } catch { if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $checkedFinal }; throw }
  if (Test-Path -LiteralPath $backup) { Remove-Tree $backup $EngineRoot }
  $Dest = $FinalDest

  $size = (Get-ChildItem -Recurse -File $Dest | Measure-Object Length -Sum).Sum / 1MB
  Write-Host ''
  Write-Host ("Done. Engines staged in {0} ({1:N0} MB)." -f $Dest, $size) -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $Work) { Remove-Tree $Work $EngineRoot }
}
