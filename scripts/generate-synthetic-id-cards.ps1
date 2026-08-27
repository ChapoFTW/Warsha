# Draw the synthetic OCR test cards described by scripts/synthetic-id-cards.json.
#
# The text lives in the JSON rather than in this file on purpose. Windows
# PowerShell 5.1 reads a .ps1 as ANSI unless it carries a byte-order mark, so
# Arabic written inline here is mojibake by the time the parser sees it. Reading
# it from a UTF-8 JSON file keeps the script plain ASCII and the text correct.
#
# These are not identity documents. Every number is invented, no government
# layout or security feature is reproduced, and each card says on its face that
# it is a test card. See the note in the JSON.

param(
  [string]$OutputDirectory = "artifacts/synthetic-id",
  [string]$SpecPath = "scripts/synthetic-id-cards.json"
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$spec = Get-Content -Path $SpecPath -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Write-Lines {
  param($Graphics, $Lines)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 18, 18, 18))
  foreach ($line in $Lines) {
    $font = New-Object System.Drawing.Font($line.family, [single]$line.size,
      [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $Graphics.DrawString($line.text, $font, $brush, [single]$line.x, [single]$line.y)
    $font.Dispose()
  }
  $brush.Dispose()
}

foreach ($card in $spec.cards) {
  $bitmap = New-Object System.Drawing.Bitmap(1000, 640,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::FromArgb(255, 246, 244, 238))

  # A plain rectangle, so the provider reads text on a card rather than text on
  # a blank page. Not a facsimile of anything.
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 120, 120, 120), 4)
  $graphics.DrawRectangle($pen, 12, 12, 976, 616)
  $pen.Dispose()

  Write-Lines -Graphics $graphics -Lines $card.lines
  $graphics.Dispose()
  $path = Join-Path $OutputDirectory $card.file
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Output "wrote $path"
}

# The unreadable card is drawn tiny and scaled up with nearest-neighbour, so the
# glyphs become blocks. There is text underneath, which is the point: this is
# what a worker's bad photograph actually looks like to a provider, rather than
# a blank image that tests nothing.
$small = New-Object System.Drawing.Bitmap(90, 58,
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$smallGraphics = [System.Drawing.Graphics]::FromImage($small)
$smallGraphics.Clear([System.Drawing.Color]::FromArgb(255, 210, 205, 195))
Write-Lines -Graphics $smallGraphics -Lines $spec.unreadable.lines
$smallGraphics.Dispose()

$blurred = New-Object System.Drawing.Bitmap(1000, 640,
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$blurGraphics = [System.Drawing.Graphics]::FromImage($blurred)
$blurGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$blurGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$blurGraphics.DrawImage($small, 0, 0, 1000, 640)
$blurGraphics.Dispose()

$blurredPath = Join-Path $OutputDirectory $spec.unreadable.file
$blurred.Save($blurredPath, [System.Drawing.Imaging.ImageFormat]::Png)
$blurred.Dispose()
$small.Dispose()
Write-Output "wrote $blurredPath"
