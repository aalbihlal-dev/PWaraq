# Screenshots a process's main window (without the shadow) and checks the Waraq desktop window:
#   top edge: one flat colour equal to the expected hex from the title bar down into the task bar (no title bar, no line),
#   page drawn: the middle of the window holds a white page with dark text.
# -Start: the window is on the start screen (no document): only the flat top strip and some dark text are checked (no
#   white page there, and the left edge has the tab bar's own colour step below the header).
# Prints "OK ..." or "FAIL ...".   powershell -File win-shot.ps1 <pid> <out.png> <#rrggbb> [-Start]
param([int]$ProcId, [string]$Out, [string]$Expect, [switch]$Start)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public struct RECT { public int L, T, R, B; }
public static class W {
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
$proc = Get-Process -Id $ProcId -ErrorAction Stop
for ($i = 0; $i -lt 40 -and $proc.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 250; $proc.Refresh() }
$h = $proc.MainWindowHandle
if ($h -eq 0) { "FAIL no window"; exit 1 }
[W]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 400
$r = New-Object RECT
[W]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) | Out-Null   # 9 = DWMWA_EXTENDED_FRAME_BOUNDS (frame without shadow)
$w = $r.R - $r.L; $hh = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size); $g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)

$hex = { param($c) ('#{0:x2}{1:x2}{2:x2}' -f $c.R, $c.G, $c.B) }
$bad = @()
# the top strip, from the very first row (the DWM frame) down into the bar, away from the buttons and the corners
foreach ($y in 0, 12, 24, 38) { foreach ($x in 24, 200, [int]($w / 2)) { if ($x -eq [int]($w / 2) -and $y -in 12, 24) { continue }  # the document name stands centred on the title rail there (its letters are not a line)
  $c = & $hex $bmp.GetPixel($x, $y); if ($c -ne $Expect) { $bad += "($x,$y)=$c" } } }
# straight down the left edge (left of the logo) through the title bar into the task bar: no line, no colour step
if (-not $Start) { foreach ($y in 12..60) { $c = & $hex $bmp.GetPixel(8, $y); if ($c -ne $Expect) { $bad += "(8,$y)=$c" } } }
# the page: white with dark text somewhere in the middle
$white = 0; $dark = 0; $n = 0
for ($y = [int]($hh * 0.3); $y -lt [int]($hh * 0.98); $y += 4) { for ($x = [int]($w * 0.3); $x -lt [int]($w * 0.7); $x += 4) {
  $c = $bmp.GetPixel($x, $y); $n++
  if ($c.R -ge 250 -and $c.G -ge 250 -and $c.B -ge 250) { $white++ } elseif ($c.R -le 90 -and $c.G -le 90 -and $c.B -le 90) { $dark++ }
} }
$bmp.Dispose()
$pageOk = ($Start -or ($white -gt $n * 0.3)) -and ($dark -gt 20)
$info = "top=$Expect page: white $([int](100 * $white / $n))% dark $dark px, window ${w}x${hh}"
if ($bad.Count -eq 0 -and $pageOk) { "OK $info" } else { "FAIL $info edge: " + ($bad | Select-Object -First 6) -join ' '; exit 1 }
