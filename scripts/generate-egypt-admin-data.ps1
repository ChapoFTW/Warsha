param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
if ($OutputPath -eq '') {
  $OutputPath = Join-Path $PSScriptRoot '..\src\locations\egypt-administrative-areas.generated.ts'
}
$resolvedWorkbook = (Resolve-Path -LiteralPath $WorkbookPath).Path
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('warsha-egy-admin-' + [guid]::NewGuid().ToString('N'))
$temporaryZip = Join-Path $temporaryRoot 'source.zip'
$expanded = Join-Path $temporaryRoot 'expanded'

function Read-Cells([string]$SheetPath, [string[]]$SharedStrings) {
  [xml]$sheet = Get-Content -Raw -Encoding UTF8 -LiteralPath $SheetPath
  $namespace = New-Object System.Xml.XmlNamespaceManager($sheet.NameTable)
  $namespace.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $rows = @($sheet.SelectNodes('//x:sheetData/x:row', $namespace))
  $result = @()
  foreach ($row in $rows | Select-Object -Skip 1) {
    $values = @{}
    foreach ($cell in $row.SelectNodes('./x:c', $namespace)) {
      $column = [regex]::Match([string]$cell.r, '^[A-Z]+').Value
      $valueNode = $cell.SelectSingleNode('./x:v', $namespace)
      $value = if ($null -eq $valueNode) { '' } else { [string]$valueNode.InnerText }
      if ([string]$cell.t -eq 's' -and $value -ne '') { $value = $SharedStrings[[int]$value] }
      $values[$column] = $value
    }
    $result += ,$values
  }
  return $result
}

function Js-String([string]$Value) {
  return ($Value | ConvertTo-Json -Compress)
}

try {
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  Copy-Item -LiteralPath $resolvedWorkbook -Destination $temporaryZip
  Expand-Archive -LiteralPath $temporaryZip -DestinationPath $expanded

  [xml]$shared = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $expanded 'xl\sharedStrings.xml')
  $namespace = New-Object System.Xml.XmlNamespaceManager($shared.NameTable)
  $namespace.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  [string[]]$strings = @($shared.SelectNodes('//x:si', $namespace) | ForEach-Object {
    ($_.SelectNodes('.//x:t', $namespace) | ForEach-Object { $_.InnerText }) -join ''
  })

  $admin1 = Read-Cells (Join-Path $expanded 'xl\worksheets\sheet2.xml') $strings
  $admin2 = Read-Cells (Join-Path $expanded 'xl\worksheets\sheet3.xml') $strings
  $areasByGovernorate = @{}
  foreach ($row in $admin2) {
    if (-not $areasByGovernorate.ContainsKey($row['J'])) { $areasByGovernorate[$row['J']] = @() }
    $areasByGovernorate[$row['J']] += ,$row
  }

  $lines = @(
    '/**',
    ' * Generated from OCHA/HDX Egypt COD-AB v01 (CAPMAS source).',
    ' * Dataset review date: 2024-12-19. Admin 1: 27; Admin 2: 365.',
    ' * Source: https://data.humdata.org/dataset/cod-ab-egy',
    ' * Do not edit by hand; run scripts/generate-egypt-admin-data.ps1.',
    ' */',
    'export const egyptAdministrativeAreas = ['
  )
  foreach ($governorate in $admin1 | Sort-Object { $_['A'] }) {
    $lines += "  { id: $(Js-String $governorate['E']), en: $(Js-String $governorate['A']), ar: $(Js-String $governorate['B']), areas: ["
    foreach ($area in $areasByGovernorate[$governorate['E']] | Sort-Object { $_['A'] }) {
      $lines += "    { id: $(Js-String $area['E']), en: $(Js-String $area['A']), ar: $(Js-String $area['B']) },"
    }
    $lines += '  ] },'
  }
  $lines += '] as const;'

  $directory = Split-Path -Parent $resolvedOutput
  if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory | Out-Null }
  [IO.File]::WriteAllLines($resolvedOutput, $lines, (New-Object Text.UTF8Encoding($false)))
  Write-Output "Generated $resolvedOutput with $($admin1.Count) governorates and $($admin2.Count) ADM2 areas."
}
finally {
  if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}
