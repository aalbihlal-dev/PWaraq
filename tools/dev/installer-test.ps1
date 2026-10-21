# Installs the Waraq NSIS installer silently into a test folder for the current user, checks files, shortcuts,
# registry entries, launching by file (ShellExecute, right-click verb, single instance), then uninstalls and checks
# that everything is gone. Results are appended to release/TEST-REPORT.md.  Windows only; needs no admin rights.
#   powershell -ExecutionPolicy Bypass -File tools/dev/installer-test.ps1 [-Installer <setup.exe>] [-Shots <dir>]
param([string]$Installer, [string]$Shots)
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $Installer) { $Installer = (Get-ChildItem (Join-Path $root 'release\*-setup.exe') | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
if (-not $Shots) { $Shots = Join-Path $root 'src-tauri\target\installer-test' }
New-Item -ItemType Directory -Force $Shots | Out-Null
$dir = Join-Path $env:LOCALAPPDATA 'WaraqInstallTest'   # no spaces: NSIS /D= takes the raw rest of the line
$results = New-Object System.Collections.ArrayList
function Check([string]$what, [bool]$ok, [string]$note = '') { [void]$results.Add([pscustomobject]@{ what = $what; ok = $ok; note = $note }); if ($ok) { "PASS $what $note" } else { "FAIL $what $note" } }
function Reg([string]$key, [string]$name = '') { try { (Get-ItemProperty -Path "HKCU:\$key" -ErrorAction Stop).$(if ($name) { $name } else { '(default)' }) } catch { $null } }
$shotScript = Join-Path $root 'tools/dev/win-shot.ps1'

# 0. before: PDF default handler and no leftovers
$pdfDefaultBefore = Reg 'Software\Classes\.pdf'
if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
Get-Process waraq -ErrorAction SilentlyContinue | Stop-Process -Force
"Installer: $Installer"; "Install dir: $dir"

# 1. silent install
$p = Start-Process -FilePath $Installer -ArgumentList "/S /D=$dir" -PassThru -Wait
Check 'silent install exits 0' ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
Check 'waraq.exe installed' (Test-Path "$dir\waraq.exe")
Check 'uninstall.exe installed' (Test-Path "$dir\uninstall.exe")
$sm = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Waraq.lnk"
Check 'Start menu shortcut' (Test-Path $sm)
Check 'desktop shortcut (silent installs create it)' (Test-Path "$([Environment]::GetFolderPath('Desktop'))\Waraq.lnk")
$u = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\Waraq'
Check 'uninstall entry (per-user)' ((Reg $u 'DisplayName') -eq 'Waraq') "version $(Reg $u 'DisplayVersion')"
Check 'uninstall entry points at the test dir' ("$(Reg $u 'InstallLocation')".Trim('"', '\') -eq $dir)
Check '.pdf default handler untouched' ((Reg 'Software\Classes\.pdf') -eq $pdfDefaultBefore) "before='$pdfDefaultBefore' after='$(Reg 'Software\Classes\.pdf')'"
Check '.pdf offered: OpenWithProgids\Waraq.PDF' ($null -ne (Reg 'Software\Classes\.pdf\OpenWithProgids' 'Waraq.PDF'))
Check 'Waraq.PDF open command' ("$(Reg 'Software\Classes\Waraq.PDF\shell\open\command')" -like "*$dir\waraq.exe*%1*")
Check '.waraq associated (Waraq.Portfolio)' ((Reg 'Software\Classes\.waraq') -eq 'Waraq.Portfolio')
Check 'Waraq.Portfolio open command' ("$(Reg 'Software\Classes\Waraq.Portfolio\shell\open\command')" -like "*$dir\waraq.exe*%1*")
foreach ($ext in 'pdf', 'waraq') {
  $k = "Software\Classes\SystemFileAssociations\.$ext\shell\OpenInWaraq"
  Check "right-click 'Open in Waraq' on .$ext" ((Reg $k) -eq 'Open in Waraq' -and "$(Reg "$k\command")" -like "*$dir\waraq.exe*%1*" -and "$(Reg $k 'Icon')" -like "*waraq.exe,0")
}
Check 'installer copy kept for rollback' ((Get-ChildItem "$env:APPDATA\com.waraq.app\updates\waraq-*.exe" -ErrorAction SilentlyContinue).Count -ge 1)

# 2. launch by file: ShellExecute with the right-click verb, then a .waraq by double-click (default verb) -> same window
$pdf = Join-Path $root 'tests\fixtures\three.pdf'
Start-Process -FilePath $pdf -Verb OpenInWaraq
Start-Sleep -Seconds 7
$procs = @(Get-Process waraq -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq "$dir\waraq.exe" })
Check 'PDF opens Waraq via the right-click verb' ($procs.Count -eq 1) "$($procs.Count) process(es)"
if ($procs.Count -eq 1) {
  $r = ''; foreach ($tone in [regex]::Matches((Get-Content (Join-Path $root 'src/styles/tokens.css') -Raw), '--surface: (#[0-9a-f]{6})') | ForEach-Object { $_.Groups[1].Value }) {
    $r = & $shotScript $procs[0].Id (Join-Path $Shots 'installed-pdf.png') $tone   # whichever theme the profile last used
    if ("$r" -match '^OK') { break }
  }
  Check 'window shows the document (screenshot)' ("$r" -match '^OK') "$r"
  $tmpPdf = Join-Path $env:TEMP 'waraq-test-second.pdf'; Copy-Item $pdf $tmpPdf -Force
  Start-Process -FilePath $tmpPdf -Verb OpenInWaraq   # second launch hands the file to the running window
  Start-Sleep -Seconds 4
  $again = @(Get-Process waraq -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq "$dir\waraq.exe" })
  Check 'second file goes to the running window (single instance)' ($again.Count -eq 1) "$($again.Count) process(es)"
  Remove-Item $tmpPdf -Force -ErrorAction SilentlyContinue
}
Get-Process waraq -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# 3. silent uninstall
$p = Start-Process -FilePath "$dir\uninstall.exe" -ArgumentList '/S' -PassThru -Wait
Start-Sleep -Seconds 3   # the uninstaller removes itself after exit
Check 'silent uninstall exits 0' ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
Check 'install folder removed' (-not (Test-Path "$dir\waraq.exe") -and -not (Test-Path "$dir\uninstall.exe"))
Check 'Start menu shortcut removed' (-not (Test-Path $sm))
Check 'desktop shortcut removed' (-not (Test-Path "$([Environment]::GetFolderPath('Desktop'))\Waraq.lnk"))
Check 'uninstall entry removed' ($null -eq (Reg $u 'DisplayName'))
Check 'Waraq.PDF removed' (-not (Test-Path 'HKCU:\Software\Classes\Waraq.PDF'))
Check 'OpenWithProgids\Waraq.PDF removed' ($null -eq (Reg 'Software\Classes\.pdf\OpenWithProgids' 'Waraq.PDF'))
Check '.pdf default handler still untouched' ((Reg 'Software\Classes\.pdf') -eq $pdfDefaultBefore)
Check '.waraq association removed' (-not (Test-Path 'HKCU:\Software\Classes\Waraq.Portfolio'))
Check 'right-click entries removed' (-not (Test-Path 'HKCU:\Software\Classes\SystemFileAssociations\.pdf\shell\OpenInWaraq') -and -not (Test-Path 'HKCU:\Software\Classes\SystemFileAssociations\.waraq\shell\OpenInWaraq'))
Check 'rollback copies removed' (-not (Test-Path "$env:APPDATA\com.waraq.app\updates"))
Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue

# 4. report
$failed = @($results | Where-Object { -not $_.ok }).Count
$md = @("", "## Installer test — $(Get-Date -Format 'yyyy-MM-dd HH:mm') — $(Split-Path $Installer -Leaf)", "", "Silent install into ``$dir`` (per-user), launch by file, silent uninstall. $($results.Count) checks, $failed failed.", "", "| Check | Result | Note |", "|---|---|---|")
$md += $results | ForEach-Object { "| $($_.what) | $(if ($_.ok) { 'pass' } else { '**FAIL**' }) | $($_.note -replace '\|', '/') |" }
Add-Content -Path (Join-Path $root 'release\TEST-REPORT.md') -Value ($md -join "`n") -Encoding utf8
"$($results.Count) checks, $failed failed -> release/TEST-REPORT.md"
exit $failed
