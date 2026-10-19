# Draws the installer artwork (NSIS needs 24-bit BMPs): the side panel of the Welcome/Finish pages (164x314)
# and the header of the Installing page (150x57), from the logo master and the app's own fonts.
# Run from the waraq folder:  powershell -ExecutionPolicy Bypass -File tools\make-installer-art.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'desktop\resources'
$logo = [System.Drawing.Image]::FromFile((Resolve-Path (Join-Path $root '..\Designs\Logo\pwaraq-mark-transparent.png')))
$fonts = New-Object System.Drawing.Text.PrivateFontCollection
$fonts.AddFontFile((Join-Path $root 'dist\fonts\ReemKufi-Semibold.ttf'))
$fonts.AddFontFile((Join-Path $root 'dist\fonts\Tajawal-Bold.ttf'))
$fonts.AddFontFile((Join-Path $root 'dist\fonts\Tajawal-Medium.ttf'))
function Family($name) { $fonts.Families | Where-Object { $_.Name -like "$name*" } | Select-Object -First 1 }
$kufi = Family 'Reem Kufi'; $tajawal = Family 'Tajawal'
function Color($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
$green = Color '#15775d'; $deep = Color '#0d4f3e'; $paper = Color '#f7f6ef'; $muted = Color '#5b6b64'

function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.PixelOffsetMode = 'HighQuality'
  return @($bmp, $g)
}
function Center-Text($g, $text, $font, $brush, $y, $w, [switch]$rtl) {
  $f = New-Object System.Drawing.StringFormat; $f.Alignment = 'Center'
  if ($rtl) { $f.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft }
  $g.DrawString($text, $font, $brush, (New-Object System.Drawing.RectangleF 0, $y, $w, 200), $f)
}

# ---- side panel 164 x 314: paper, logo, Arabic + Latin name, green foot with the product line ----
$c = New-Canvas 164 314; $bmp = $c[0]; $g = $c[1]
$g.Clear($paper)
$band = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 0, 236, 164, 78), $green, $deep, 90
$g.FillRectangle($band, 0, 236, 164, 78)
$g.DrawImage($logo, 34, 34, 96, 96)
Center-Text $g 'ورق' (New-Object System.Drawing.Font $kufi, 30, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)) (New-Object System.Drawing.SolidBrush $green) 138 164 -rtl
Center-Text $g 'W A R A Q' (New-Object System.Drawing.Font $tajawal, 12, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)) (New-Object System.Drawing.SolidBrush $deep) 184 164
Center-Text $g 'PDF Studio' (New-Object System.Drawing.Font $tajawal, 16, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)) (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)) 252 164
Center-Text $g 'عربي · English' (New-Object System.Drawing.Font $tajawal, 12, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)) (New-Object System.Drawing.SolidBrush (Color '#d6efe5')) 276 164 -rtl
$bmp.Save((Join-Path $out 'installer-sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp); $g.Dispose(); $bmp.Dispose()

# ---- header 150 x 57 (white area of the Installing page): small logo + name ----
$c = New-Canvas 150 57; $bmp = $c[0]; $g = $c[1]
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($logo, 104, 9, 38, 38)
$f = New-Object System.Drawing.StringFormat; $f.Alignment = 'Far'; $f.LineAlignment = 'Center'
$g.DrawString('Waraq', (New-Object System.Drawing.Font $tajawal, 17, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $green), (New-Object System.Drawing.RectangleF 0, 9, 98, 22), $f)
$g.DrawString('PDF Studio', (New-Object System.Drawing.Font $tajawal, 11, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $muted), (New-Object System.Drawing.RectangleF 0, 29, 98, 18), $f)
$bmp.Save((Join-Path $out 'installer-header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp); $g.Dispose(); $bmp.Dispose()
$logo.Dispose()
'installer-sidebar.bmp and installer-header.bmp written to desktop\resources'
