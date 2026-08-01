param([switch]$Force)

Add-Type -AssemblyName System.Drawing
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$imageRoot = Join-Path $projectRoot 'assets\images'
$publicRoot = Join-Path $projectRoot 'public'
$interBoldPath = Join-Path $projectRoot 'node_modules\@expo-google-fonts\inter\700Bold\Inter_700Bold.ttf'

$palette = @{
  Background = [System.Drawing.ColorTranslator]::FromHtml('#080808')
  Ink = [System.Drawing.ColorTranslator]::FromHtml('#FAFAFA')
}

function New-Canvas([int]$width, [int]$height, $backgroundColor) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear($backgroundColor)
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function New-RoundedRectanglePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $diameter = $radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-CurrentMark($graphics, [float]$x, [float]$y, [float]$size, $color) {
  $scale = $size / 32.0
  $pen = [System.Drawing.Pen]::new($color, [float](2.5 * $scale))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $frame = New-RoundedRectanglePath `
    ($x + 2 * $scale) `
    ($y + 2 * $scale) `
    (28 * $scale) `
    (28 * $scale) `
    (7.2 * $scale)
  $graphics.DrawPath($pen, $frame)

  $wave = New-Object System.Drawing.Drawing2D.GraphicsPath
  $points = [System.Drawing.PointF[]] @(
    [System.Drawing.PointF]::new($x + 2 * $scale, $y + 18.8 * $scale),
    [System.Drawing.PointF]::new($x + 8.4 * $scale, $y + 8.8 * $scale),
    [System.Drawing.PointF]::new($x + 14 * $scale, $y + 17.2 * $scale),
    [System.Drawing.PointF]::new($x + 19.6 * $scale, $y + 10.8 * $scale),
    [System.Drawing.PointF]::new($x + 30 * $scale, $y + 22.8 * $scale)
  )
  $wave.AddLines($points)
  $graphics.DrawPath($pen, $wave)

  $wave.Dispose()
  $frame.Dispose()
  $pen.Dispose()
}

function Save-Png($bitmap, [string]$destination) {
  $directory = Split-Path -Parent $destination
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  if (Test-Path -LiteralPath $destination) {
    if (-not $Force) { throw "Refusing to overwrite existing asset without -Force: $destination" }
  }
  $stream = [System.IO.File]::Open($destination, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $stream.Dispose()
  }
}

function Save-MarkAsset(
  [string]$destination,
  [int]$canvasSize,
  [float]$markSize,
  $backgroundColor,
  $markColor
) {
  $canvas = New-Canvas $canvasSize $canvasSize $backgroundColor
  $offset = ($canvasSize - $markSize) / 2
  Draw-CurrentMark $canvas.Graphics $offset $offset $markSize $markColor
  Save-Png $canvas.Bitmap $destination
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Dispose()
}

function Save-SplashAsset {
  $canvasSize = 512
  $canvas = New-Canvas $canvasSize $canvasSize ([System.Drawing.Color]::Transparent)
  Draw-CurrentMark $canvas.Graphics 146 78 220 $palette.Ink

  $fontCollection = New-Object System.Drawing.Text.PrivateFontCollection
  $fontCollection.AddFontFile($interBoldPath)
  $font = New-Object System.Drawing.Font($fontCollection.Families[0], 44, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = [System.Drawing.StringAlignment]::Center
  $center.LineAlignment = [System.Drawing.StringAlignment]::Center
  $canvas.Graphics.DrawString('WARSHA', $font, (New-Object System.Drawing.SolidBrush($palette.Ink)), 256, 358, $center)

  Save-Png $canvas.Bitmap (Join-Path $imageRoot 'warsha-current-splash.png')
  $center.Dispose()
  $font.Dispose()
  $fontCollection.Dispose()
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Dispose()
}

Save-MarkAsset (Join-Path $imageRoot 'warsha-current-icon.png') 1024 520 $palette.Background $palette.Ink
Save-MarkAsset (Join-Path $imageRoot 'warsha-current-favicon.png') 512 300 $palette.Background $palette.Ink
Save-MarkAsset (Join-Path $imageRoot 'warsha-current-adaptive-foreground.png') 432 210 ([System.Drawing.Color]::Transparent) $palette.Ink
Save-MarkAsset (Join-Path $imageRoot 'warsha-current-monochrome.png') 432 210 ([System.Drawing.Color]::Transparent) $palette.Ink
Save-MarkAsset (Join-Path $imageRoot 'warsha-current-notification.png') 96 72 ([System.Drawing.Color]::Transparent) ([System.Drawing.Color]::White)
Save-MarkAsset (Join-Path $publicRoot 'warsha-icon-192.png') 192 104 $palette.Background $palette.Ink
Save-MarkAsset (Join-Path $publicRoot 'warsha-icon-512.png') 512 276 $palette.Background $palette.Ink
Save-SplashAsset

Write-Output 'Rendered The Current icon, adaptive, monochrome, notification, favicon, splash, and web assets.'
