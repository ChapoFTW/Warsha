Add-Type -AssemblyName System.Drawing
function New-Mark([string]$Path,[int]$Size,[bool]$Transparent,[bool]$DarkInk){
  $bmp=[Drawing.Bitmap]::new($Size,$Size,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g=[Drawing.Graphics]::FromImage($bmp);$g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
  if($Transparent){$g.Clear([Drawing.Color]::Transparent)}else{$g.Clear($(if($DarkInk){[Drawing.Color]::White}else{[Drawing.Color]::Black}))}
  $ink=if($DarkInk){[Drawing.Color]::Black}else{[Drawing.Color]::White};$scale=$Size/100
  $pen=[Drawing.Pen]::new($ink,8*$scale);$pen.StartCap=$pen.EndCap=[Drawing.Drawing2D.LineCap]::Round;$pen.LineJoin=[Drawing.Drawing2D.LineJoin]::Round
  $p=[Drawing.Drawing2D.GraphicsPath]::new();$p.StartFigure();$p.AddBezier(25*$scale,18*$scale,8*$scale,32*$scale,10*$scale,63*$scale,30*$scale,79*$scale);$p.AddLine(30*$scale,79*$scale,50*$scale,39*$scale);$p.AddLine(50*$scale,39*$scale,70*$scale,79*$scale);$p.AddBezier(70*$scale,79*$scale,90*$scale,63*$scale,92*$scale,32*$scale,75*$scale,18*$scale);$g.DrawPath($pen,$p)
  $brush=[Drawing.SolidBrush]::new($ink);$g.FillEllipse($brush,44*$scale,12*$scale,12*$scale,12*$scale)
  $bmp.Save($Path,[Drawing.Imaging.ImageFormat]::Png);$brush.Dispose();$p.Dispose();$pen.Dispose();$g.Dispose();$bmp.Dispose()
}
$assets=Join-Path $PSScriptRoot '..\assets\images';New-Mark (Join-Path $assets 'warsha-icon.png') 1024 $false $false;New-Mark (Join-Path $assets 'warsha-adaptive-foreground.png') 1024 $true $false;New-Mark (Join-Path $assets 'warsha-monochrome.png') 432 $true $false;New-Mark (Join-Path $assets 'warsha-splash.png') 512 $true $false;New-Mark (Join-Path $assets 'warsha-favicon.png') 64 $false $false
