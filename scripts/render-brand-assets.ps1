param([switch]$Force)

Add-Type -AssemblyName System.Drawing
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$brandRoot = Join-Path $PSScriptRoot '..\assets\images'

function New-Canvas([int]$width, [int]$height, [bool]$transparent) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  if (-not $transparent) { $graphics.Clear([System.Drawing.Color]::White) }
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Draw-Mark($graphics, [float]$x, [float]$y, [float]$size, $color) {
  $scale = $size / 100.0
  $pen = [System.Drawing.Pen]::new($color, [float](8 * $scale))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddBezier($x + 30 * $scale, $y + 17 * $scale, $x + 21 * $scale, $y + 26 * $scale, $x + 20 * $scale, $y + 46 * $scale, $x + 32 * $scale, $y + 63 * $scale)
  $graphics.DrawPath($pen, $path)
  $path.Reset()
  $path.AddLine($x + 32 * $scale, $y + 63 * $scale, $x + 50 * $scale, $y + 29 * $scale)
  $path.AddLine($x + 50 * $scale, $y + 29 * $scale, $x + 68 * $scale, $y + 63 * $scale)
  $graphics.DrawPath($pen, $path)
  $path.Reset()
  $path.AddBezier($x + 70 * $scale, $y + 17 * $scale, $x + 79 * $scale, $y + 26 * $scale, $x + 80 * $scale, $y + 46 * $scale, $x + 68 * $scale, $y + 63 * $scale)
  $graphics.DrawPath($pen, $path)
  $brush = New-Object System.Drawing.SolidBrush($color)
  $graphics.FillEllipse($brush, $x + 44.5 * $scale, $y + 13.5 * $scale, 11 * $scale, 11 * $scale)
  $brush.Dispose(); $path.Dispose(); $pen.Dispose()
}

function Save-Png($bitmap, [string]$name) {
  $destination = Join-Path $brandRoot $name
  if (Test-Path -LiteralPath $destination) {
    if (-not $Force) { throw "Refusing to overwrite existing asset without -Force: $destination" }
    Remove-Item -LiteralPath $destination
  }
  $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Save-Icon([string]$name, [int]$size, [bool]$darkTile, [bool]$transparent) {
  $canvas = New-Canvas $size $size $transparent
  $graphics = $canvas.Graphics
  if ($darkTile) {
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
    $radius = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90); $path.AddArc($size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90); $path.AddArc($size - $radius * 2, $size - $radius * 2, $radius * 2, $radius * 2, 0, 90); $path.AddArc(0, $size - $radius * 2, $radius * 2, $radius * 2, 90, 90); $path.CloseFigure()
    $graphics.FillPath($brush, $path); $path.Dispose(); $brush.Dispose()
  }
  $markSize = if ($darkTile) { [int]($size * 0.72) } else { [int]($size * 0.58) }
  $markColor = if ($darkTile) { [System.Drawing.Color]::White } else { [System.Drawing.Color]::Black }
  Draw-Mark $graphics (($size - $markSize) / 2) (($size - $markSize) / 2) $markSize $markColor
  Save-Png $canvas.Bitmap $name
  $graphics.Dispose(); $canvas.Bitmap.Dispose()
}

function Save-Splash {
  $canvas = New-Canvas 1600 1600 $false
  $graphics = $canvas.Graphics
  Draw-Mark $graphics 550 300 500 ([System.Drawing.Color]::Black)
  $wordmark = New-Object System.Drawing.Font('Arial', 92, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $tagline = New-Object System.Drawing.Font('Arial', 27, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString('W A R S H A', $wordmark, [System.Drawing.Brushes]::Black, 800, 865, $center)
  $secondary = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(102, 102, 102))
  $graphics.DrawString('YOUR BUSINESS. MORE JOBS.', $tagline, $secondary, 800, 990, $center)
  Save-Png $canvas.Bitmap 'warsha-brand-splash.png'
  $secondary.Dispose(); $center.Dispose(); $wordmark.Dispose(); $tagline.Dispose(); $graphics.Dispose(); $canvas.Bitmap.Dispose()
}

Save-Icon 'warsha-brand-icon.png' 1024 $true $false
Save-Icon 'warsha-brand-favicon.png' 512 $true $false
Save-Icon 'warsha-brand-adaptive-foreground.png' 432 $false $true
Save-Icon 'warsha-brand-monochrome.png' 432 $false $true
Save-Splash
