#requires -version 5.1
# 지표 ⑥ 정밀판 — 30 m 격자 경사·향 (AWS Terrain Tiles / terrarium, z14 ≈ 7.6 m/px)
# 90 m(Copernicus GLO-90) 결과와 해상도 민감도를 비교하려고 같은 규칙으로 다시 계산한다.
# 출력: data\cells_30m.csv, out\지표6_정밀.json, out\경사향_지도.png
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$Cell = 30,                      # 분석 셀 크기 (m) — 원자료 30 m급에 맞춤
  [int]$Zoom = 14,                      # 타일 줌 (z14 ≈ 7.6 m/px @ 37.6N)
  [int[]]$Thresholds = @(10, 15, 25),
  [double]$FlatPct = 5.0,
  [double]$AspectFrom = 112.5,
  [double]$AspectTo = 247.5
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing
$UA = 'smartcity-class/1.0 (seunghagkrry@gmail.com)'
$dataDir = Join-Path $Root 'data'; $outDir = Join-Path $Root 'out'
$tileDir = Join-Path $dataDir ('terrain_z{0}' -f $Zoom)
foreach ($d in @($dataDir, $outDir, $tileDir)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null } }
function Save-Utf8($p, $t) { [IO.File]::WriteAllText($p, $t, (New-Object Text.UTF8Encoding $true)) }

# ─── 경계 ───
$nom = Get-Content (Join-Path $dataDir 'changsin_boundary.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$rel = $nom | Where-Object { $_.osm_type -eq 'relation' -and $_.geojson.type -eq 'Polygon' } | Select-Object -First 1
$ring = $rel.geojson.coordinates[0]
$polyLon = $ring | ForEach-Object { [double]$_[0] }
$polyLat = $ring | ForEach-Object { [double]$_[1] }
$minLat = ($polyLat | Measure-Object -Minimum).Minimum; $maxLat = ($polyLat | Measure-Object -Maximum).Maximum
$minLon = ($polyLon | Measure-Object -Minimum).Minimum; $maxLon = ($polyLon | Measure-Object -Maximum).Maximum
function Test-Inside([double]$lat, [double]$lon) {
  $inside = $false; $n = $ring.Count
  for ($i = 0; $i -lt $n; $i++) {
    $j = ($i + $n - 1) % $n
    if ((($polyLat[$i] -gt $lat) -ne ($polyLat[$j] -gt $lat)) -and
        ($lon -lt ($polyLon[$j] - $polyLon[$i]) * ($lat - $polyLat[$i]) / ($polyLat[$j] - $polyLat[$i]) + $polyLon[$i])) {
      $inside = -not $inside }
  }
  return $inside
}

# ─── 타일 받기 ───
$n2 = [Math]::Pow(2, $Zoom)
function Get-TileX([double]$lon) { [int][Math]::Floor(($lon + 180) / 360 * $n2) }
function Get-TileY([double]$lat) {
  $r = $lat * [Math]::PI / 180
  [int][Math]::Floor((1 - [Math]::Log([Math]::Tan($r) + 1 / [Math]::Cos($r)) / [Math]::PI) / 2 * $n2)
}
$x0 = (Get-TileX $minLon) - 1; $x1 = (Get-TileX $maxLon) + 1
$y0 = (Get-TileY $maxLat) - 1; $y1 = (Get-TileY $minLat) + 1
$tiles = @{}
for ($tx = $x0; $tx -le $x1; $tx++) {
  for ($ty = $y0; $ty -le $y1; $ty++) {
    $f = Join-Path $tileDir ("{0}_{1}.png" -f $tx, $ty)
    if (-not (Test-Path $f)) {
      Invoke-WebRequest -Uri ("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{0}/{1}/{2}.png" -f $Zoom, $tx, $ty) -OutFile $f -UserAgent $UA -TimeoutSec 60
      Start-Sleep -Milliseconds 150
    }
    $bmp = [System.Drawing.Bitmap]::FromFile($f)
    $grid = New-Object 'double[,]' 256, 256
    for ($py = 0; $py -lt 256; $py++) {
      for ($px = 0; $px -lt 256; $px++) {
        $c = $bmp.GetPixel($px, $py)
        $grid[$py, $px] = ($c.R * 256 + $c.G + $c.B / 256.0) - 32768
      }
    }
    $bmp.Dispose()
    $tiles["$tx/$ty"] = $grid
  }
}
Write-Host ("타일 {0}장 (z{1}) 적재" -f $tiles.Count, $Zoom)

function Get-Elev([double]$lat, [double]$lon) {   # 타일 픽셀 쌍선형 보간
  $r = $lat * [Math]::PI / 180
  $fx = ($lon + 180) / 360 * $n2
  $fy = (1 - [Math]::Log([Math]::Tan($r) + 1 / [Math]::Cos($r)) / [Math]::PI) / 2 * $n2
  $px = ($fx - [Math]::Floor($fx)) * 256; $py = ($fy - [Math]::Floor($fy)) * 256
  $key = "{0}/{1}" -f [int][Math]::Floor($fx), [int][Math]::Floor($fy)
  $g = $tiles[$key]
  if (-not $g) { return $null }
  $ix = [int][Math]::Floor($px); $iy = [int][Math]::Floor($py)
  $ax = $px - $ix; $ay = $py - $iy
  $ix2 = [Math]::Min($ix + 1, 255); $iy2 = [Math]::Min($iy + 1, 255)
  return (1-$ax)*(1-$ay)*$g[$iy,$ix] + $ax*(1-$ay)*$g[$iy,$ix2] + (1-$ax)*$ay*$g[$iy2,$ix] + $ax*$ay*$g[$iy2,$ix2]
}

# ─── 30 m 격자 ───
$midLat = ($minLat + $maxLat) / 2
$dLat = $Cell / 111320.0
$dLon = $Cell / (111320.0 * [Math]::Cos($midLat * [Math]::PI / 180))
$rows = [int][Math]::Ceiling(($maxLat - $minLat) / $dLat) + 3
$cols = [int][Math]::Ceiling(($maxLon - $minLon) / $dLon) + 3
$lat0 = $minLat - $dLat; $lon0 = $minLon - $dLon
$z = New-Object 'double[,]' $rows, $cols
for ($r = 0; $r -lt $rows; $r++) {
  for ($c = 0; $c -lt $cols; $c++) {
    $e = Get-Elev ($lat0 + $r * $dLat) ($lon0 + $c * $dLon)
    $z[$r, $c] = $(if ($null -eq $e) { 0 } else { $e })
  }
}
Write-Host ("격자 {0} x {1} = {2} 점 (셀 {3} m)" -f $rows, $cols, ($rows*$cols), $Cell)

# ─── 경사·향 (Horn 3x3) ───
$cells = New-Object Collections.Generic.List[object]
for ($r = 1; $r -lt $rows - 1; $r++) {
  for ($c = 1; $c -lt $cols - 1; $c++) {
    $lat = $lat0 + $r * $dLat; $lon = $lon0 + $c * $dLon
    if (-not (Test-Inside $lat $lon)) { continue }
    $a = $z[($r+1),($c-1)]; $b = $z[($r+1),$c]; $cc = $z[($r+1),($c+1)]
    $d = $z[$r,($c-1)];     $f = $z[$r,($c+1)]
    $g = $z[($r-1),($c-1)]; $h = $z[($r-1),$c]; $ii = $z[($r-1),($c+1)]
    $dzdx = (($cc + 2*$f + $ii) - ($a + 2*$d + $g)) / (8 * $Cell)
    $dzdy = (($a + 2*$b + $cc) - ($g + 2*$h + $ii)) / (8 * $Cell)
    $slopePct = [Math]::Sqrt($dzdx*$dzdx + $dzdy*$dzdy) * 100
    $asp = [Math]::Atan2($dzdy, -$dzdx) * 180 / [Math]::PI
    $aspect = (90 - $asp) % 360; if ($aspect -lt 0) { $aspect += 360 }
    $flat = $slopePct -lt $FlatPct
    $elevHere = [Math]::Round(($z[$r,$c]), 1)
    $cells.Add([pscustomobject]@{
      row = $r; col = $c
      lat = [Math]::Round($lat,6); lon = [Math]::Round($lon,6)
      elev_m = $elevHere
      slope_pct = [Math]::Round($slopePct,2)
      aspect_deg = $(if ($flat) { -1 } else { [Math]::Round($aspect,1) })
      aspect_ok = ($flat -or ($aspect -ge $AspectFrom -and $aspect -le $AspectTo))
      flat = $flat })
  }
}
$cellHa = ($Cell * $Cell) / 10000.0
Write-Host ("대상지 셀 {0}개 · 면적 {1} ha" -f $cells.Count, [Math]::Round($cells.Count * $cellHa, 2))

$summary = foreach ($t in $Thresholds) {
  $s = @($cells | Where-Object { $_.slope_pct -le $t })
  $both = @($s | Where-Object { $_.aspect_ok })
  [pscustomobject]@{ threshold_pct=$t; cells_total=$cells.Count; cells_slope_ok=$s.Count; cells_slope_aspect=$both.Count
    area_ha_total=[Math]::Round($cells.Count*$cellHa,2); area_ha_fit=[Math]::Round($both.Count*$cellHa,2)
    pct_slope_only=[Math]::Round(100.0*$s.Count/$cells.Count,1); pct_slope_aspect=[Math]::Round(100.0*$both.Count/$cells.Count,1) }
}
$summary | Format-Table -AutoSize | Out-String | Write-Host

# 경사 구간·향 분포 (심층 기술통계)
$slopeBins = foreach ($b in @(@(0,5),@(5,10),@(10,15),@(15,25),@(25,100))) {
  $m = @($cells | Where-Object { $_.slope_pct -ge $b[0] -and $_.slope_pct -lt $b[1] })
  [pscustomobject]@{ bin = ("{0}-{1}%" -f $b[0], $b[1]); cells = $m.Count
    pct = [Math]::Round(100.0*$m.Count/$cells.Count,1); area_ha = [Math]::Round($m.Count*$cellHa,2) }
}
$dirNames = @('북','북동','동','남동','남','남서','서','북서')
$aspectBins = @()
$flatCells = @($cells | Where-Object { $_.flat })
$aspectBins += [pscustomobject]@{ dir='평탄(5% 미만)'; cells=$flatCells.Count; pct=[Math]::Round(100.0*$flatCells.Count/$cells.Count,1) }
for ($i = 0; $i -lt 8; $i++) {
  $lo = ($i * 45) - 22.5; $hi = $lo + 45
  $m = @($cells | Where-Object { -not $_.flat -and (
        ($lo -lt 0 -and ($_.aspect_deg -ge (360 + $lo) -or $_.aspect_deg -lt $hi)) -or
        ($lo -ge 0 -and $_.aspect_deg -ge $lo -and $_.aspect_deg -lt $hi)) })
  $aspectBins += [pscustomobject]@{ dir=$dirNames[$i]; cells=$m.Count; pct=[Math]::Round(100.0*$m.Count/$cells.Count,1) }
}
$slopeStats = $cells | Measure-Object -Property slope_pct -Average -Maximum -Minimum
$elevStats  = $cells | Measure-Object -Property elev_m -Average -Maximum -Minimum

# ─── 지도 PNG ───
$pxPer = 6
$W = ($cols) * $pxPer; $H = ($rows) * $pxPer
$bmp = New-Object System.Drawing.Bitmap $W, $H
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.Clear([System.Drawing.Color]::FromArgb(255, 243, 245, 249))
$brFit  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 11, 74, 150))
$brSlope= New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 157, 187, 228))
$brNo   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 205, 211, 221))
foreach ($cl in $cells) {
  $br = $brNo
  if ($cl.slope_pct -le 15) { $br = $(if ($cl.aspect_ok) { $brFit } else { $brSlope }) }
  $px = $cl.col * $pxPer; $py = $H - ($cl.row * $pxPer)
  $gfx.FillRectangle($br, $px, $py, $pxPer, $pxPer)
}
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 23, 32, 51)), 1.5
$pts = foreach ($p in $ring) {
  $cx = (([double]$p[0] - $lon0) / $dLon) * $pxPer
  $cy = $H - ((([double]$p[1] - $lat0) / $dLat) * $pxPer)
  New-Object System.Drawing.PointF ([float]$cx), ([float]$cy)
}
$gfx.SmoothingMode = 'AntiAlias'
$gfx.DrawPolygon($pen, [System.Drawing.PointF[]]$pts)
$gfx.Dispose()
$bmp.Save((Join-Path $outDir '경사향_지도.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# ─── 저장 ───
$cells | Export-Csv -Path (Join-Path $dataDir 'cells_30m.csv') -NoTypeInformation -Encoding UTF8
$res = [ordered]@{
  지표 = '⑥ 경사·향 적합면적 비율 (정밀판)'
  대상지 = '서울특별시 종로구 창신동'
  DEM = 'AWS Terrain Tiles (terrarium) z14 ≈ 7.6 m/px · 원자료 30 m급(SRTM/ALOS 계열) · 분석 셀 30 m (0.09 ha)'
  계산 = ("Horn(1981) 3x3 · 향 적합 {0}~{1}° · 경사 {2}% 미만 평탄 면제" -f $AspectFrom, $AspectTo, $FlatPct)
  조회일 = (Get-Date -Format 'yyyy-MM-dd HH:mm')
  셀수 = $cells.Count
  면적_ha = [Math]::Round($cells.Count * $cellHa, 2)
  표고_m = @{ 평균=[Math]::Round($elevStats.Average,1); 최저=$elevStats.Minimum; 최고=$elevStats.Maximum }
  경사_pct = @{ 평균=[Math]::Round($slopeStats.Average,1); 최대=$slopeStats.Maximum }
  임계값별 = $summary
  경사구간 = $slopeBins
  향분포 = $aspectBins
}
Save-Utf8 (Join-Path $outDir '지표6_정밀.json') ($res | ConvertTo-Json -Depth 6)
Write-Host '완료: out\지표6_정밀.json, out\경사향_지도.png, data\cells_30m.csv'
