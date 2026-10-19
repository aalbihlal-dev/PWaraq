Add-Type -AssemblyName System.Drawing
$fonts = [System.Drawing.Text.PrivateFontCollection]::new()
$fonts.AddFontFile((Join-Path (Get-Location) 'dist/fonts/ReemKufi-Semibold.ttf'))
$glyph = [System.Drawing.Drawing2D.GraphicsPath]::new()
$glyph.AddString([string][char]0x0648, $fonts.Families[0], 0, 100, [System.Drawing.PointF]::new(0,0), [System.Drawing.StringFormat]::GenericTypographic)
$bounds = $glyph.GetBounds()
$scale = [Math]::Min(43/$bounds.Width,45/$bounds.Height)
$matrix = [System.Drawing.Drawing2D.Matrix]::new()
$matrix.Translate(-$bounds.X,-$bounds.Y)
$glyph.Transform($matrix); $matrix.Dispose()
$matrix = [System.Drawing.Drawing2D.Matrix]::new(); $matrix.Scale($scale,$scale); $glyph.Transform($matrix); $matrix.Dispose()
$matrix = [System.Drawing.Drawing2D.Matrix]::new(); $matrix.Translate(64-$bounds.Width*$scale/2,72-$bounds.Height*$scale/2); $glyph.Transform($matrix); $matrix.Dispose()
function Num($n) { $n.ToString('0.###',[System.Globalization.CultureInfo]::InvariantCulture) }
$pts=$glyph.PathPoints; $types=$glyph.PathTypes; $d=''
for($i=0;$i -lt $pts.Length;$i++) {
 $kind=$types[$i] -band 7
 if($kind -eq 0){$d+='M'+(Num $pts[$i].X)+' '+(Num $pts[$i].Y)}
 elseif($kind -eq 1){$d+='L'+(Num $pts[$i].X)+' '+(Num $pts[$i].Y)}
 elseif($kind -eq 3){$d+='C'+(Num $pts[$i].X)+' '+(Num $pts[$i].Y)+' '+(Num $pts[$i+1].X)+' '+(Num $pts[$i+1].Y)+' '+(Num $pts[$i+2].X)+' '+(Num $pts[$i+2].Y);$i+=2}
 if(($types[$i] -band 128) -ne 0){$d+='Z'}
}
$svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#15775d"/><path d="M38 28h39l19 19v43a10 10 0 0 1-10 10H38a10 10 0 0 1-10-10V38a10 10 0 0 1 10-10Z" fill="#f4f5dc"/><path d="M77 28v19h19" fill="#a8c9a6"/><path fill="#15775d" fill-rule="evenodd" d="'+$d+'"/></svg>'
Set-Content dist/brand-mark.svg $svg; Set-Content dist/app-icon.svg $svg
foreach($size in 180,192,512){
 $bmp=[System.Drawing.Bitmap]::new($size,$size);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.SmoothingMode='AntiAlias';$g.ScaleTransform($size/128.0,$size/128.0);$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#15775d'))
 $paper=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f4f5dc'));$fold=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#a8c9a6'));$ink=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#15775d'))
 $g.FillPolygon($paper,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new(30,28),[System.Drawing.PointF]::new(77,28),[System.Drawing.PointF]::new(96,47),[System.Drawing.PointF]::new(96,100),[System.Drawing.PointF]::new(30,100)))
 $g.FillPolygon($fold,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new(77,28),[System.Drawing.PointF]::new(77,47),[System.Drawing.PointF]::new(96,47)))
 $g.FillPath($ink,$glyph)
 $target=if($size -eq 180){'dist/apple-touch-icon.png'}else{"dist/icons/icon-$size.png"};$bmp.Save((Join-Path (Get-Location) $target),[System.Drawing.Imaging.ImageFormat]::Png)
 $g.Dispose();$bmp.Dispose();$paper.Dispose();$fold.Dispose();$ink.Dispose()
}
Copy-Item dist/icons/icon-512.png dist/icons/icon-maskable-512.png
Write-Output "Logo glyph extracted from $($fonts.Families[0].Name): $($pts.Length) outline points"
$glyph.Dispose();$fonts.Dispose()
