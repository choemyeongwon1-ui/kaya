#requires -version 5.1
# 지표 ⑥ 경사·향 적합면적 비율 — 창신동 (카야팀 대상지)
# DEM: Copernicus GLO-90 (90 m) via Open-Meteo Elevation API (인증키 없음)
# 출력: data\cells.csv (셀별 경사·향), out\지표6_카탈로그행.csv, out\지표6_요약.json
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$Cell = 90,                       # 셀 크기 (m)  90 m = 0.81 ha
  [int[]]$Thresholds = @(10, 15, 25),    # 경사 임계값 (%) 하한·기준안·상한
  [double]$FlatPct = 5.0,                # 이 미만이면 평탄으로 보고 향 조건 면제
  [double]$AspectFrom = 112.5,           # 향 적합 구간 시작 (동남)
  [double]$AspectTo = 247.5              # 향 적합 구간 끝 (서남)
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = 'smartcity-class/1.0 (seunghagkrry@gmail.com)'
$dataDir = Join-Path $Root 'data'
$outDir  = Join-Path $Root 'out'
foreach ($d in @($dataDir, $outDir)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null } }

function Save-Utf8($path, $text) {
  [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $true))
}

# ─── 1. 대상지 경계 (OSM Nominatim, 법정동 창신동 relation 3883989) ───
$boundaryFile = Join-Path $dataDir 'changsin_boundary.json'
if (-not (Test-Path $boundaryFile)) {
  $url = 'https://nominatim.openstreetmap.org/search?q=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C%20%EC%A2%85%EB%A1%9C%EA%B5%AC%20%EC%B0%BD%EC%8B%A0%EB%8F%99&format=json&polygon_geojson=1&limit=5'
  Invoke-WebRequest -Uri $url -UserAgent $UA -OutFile $boundaryFile
  Start-Sleep -Seconds 1
}
$nom = Get-Content $boundaryFile -Raw -Encoding UTF8 | ConvertFrom-Json
$rel = $nom | Where-Object { $_.osm_type -eq 'relation' -and $_.geojson.type -eq 'Polygon' } | Select-Object -First 1
if (-not $rel) { throw '창신동 폴리곤을 찾지 못함' }
$ring = @($rel.geojson.coordinates[0])   # [lon, lat] 순서
$polyLon = $ring | ForEach-Object { [double]$_[0] }
$polyLat = $ring | ForEach-Object { [double]$_[1] }
$minLat = ($polyLat | Measure-Object -Minimum).Minimum
$maxLat = ($polyLat | Measure-Object -Maximum).Maximum
$minLon = ($polyLon | Measure-Object -Minimum).Minimum
$maxLon = ($polyLon | Measure-Object -Maximum).Maximum

function Test-Inside([double]$lat, [double]$lon) {   # ray casting
  $inside = $false; $n = $ring.Count
  for ($i = 0; $i -lt $n; $i++) {
    $j = ($i + $n - 1) % $n
    $yi = $polyLat[$i]; $xi = $polyLon[$i]
    $yj = $polyLat[$j]; $xj = $polyLon[$j]
    if ((($yi -gt $lat) -ne ($yj -gt $lat)) -and
        ($lon -lt ($xj - $xi) * ($lat - $yi) / ($yj - $yi) + $xi)) { $inside = -not $inside }
  }
  return $inside
}

# ─── 2. 90 m 격자 만들기 (경계 바깥 1셀 여유 — 경사 계산에 이웃 셀이 필요) ───
$midLat = ($minLat + $maxLat) / 2
$dLat = $Cell / 111320.0
$dLon = $Cell / (111320.0 * [Math]::Cos($midLat * [Math]::PI / 180))
$rows = [int][Math]::Ceiling(($maxLat - $minLat) / $dLat) + 3
$cols = [int][Math]::Ceiling(($maxLon - $minLon) / $dLon) + 3
$lat0 = $minLat - $dLat
$lon0 = $minLon - $dLon
Write-Host ("격자 {0} x {1} = {2} 셀 (셀 {3} m)" -f $rows, $cols, ($rows * $cols), $Cell)

$pts = New-Object System.Collections.Generic.List[object]
for ($r = 0; $r -lt $rows; $r++) {
  for ($c = 0; $c -lt $cols; $c++) {
    $pts.Add([pscustomobject]@{ r = $r; c = $c; lat = $lat0 + $r * $dLat; lon = $lon0 + $c * $dLon })
  }
}

# ─── 3. 표고 조회 (Open-Meteo Elevation API · 1회 100좌표) ───
$elevFile = Join-Path $dataDir ('elevation_{0}m_{1}.json' -f $Cell, (Get-Date -Format 'yyyyMMdd'))
$fetched = Get-Date -Format 'yyyy-MM-dd HH:mm'
if (Test-Path $elevFile) {
  $elev = Get-Content $elevFile -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
  $all = New-Object System.Collections.Generic.List[double]
  for ($i = 0; $i -lt $pts.Count; $i += 100) {
    $chunk = $pts[$i..([Math]::Min($i + 99, $pts.Count - 1))]
    $la = ($chunk | ForEach-Object { '{0:F5}' -f $_.lat }) -join ','
    $lo = ($chunk | ForEach-Object { '{0:F5}' -f $_.lon }) -join ','
    $u = "https://api.open-meteo.com/v1/elevation?latitude=$la&longitude=$lo"
    $res = Invoke-RestMethod -Uri $u -UserAgent $UA
    $res.elevation | ForEach-Object { $all.Add([double]$_) }
    Write-Host ("  표고 {0} / {1}" -f $all.Count, $pts.Count)
    Start-Sleep -Milliseconds 300
  }
  $elev = $all.ToArray()
  Save-Utf8 $elevFile ($elev | ConvertTo-Json -Compress)
}
if ($elev.Count -ne $pts.Count) { throw ("표고 개수 불일치: {0} vs {1}" -f $elev.Count, $pts.Count) }

$z = New-Object 'double[,]' $rows, $cols
for ($i = 0; $i -lt $pts.Count; $i++) { $z[$pts[$i].r, $pts[$i].c] = $elev[$i] }

# ─── 4. 경사·향 (Horn 1981, 3x3) ───
$ewRes = $Cell; $nsRes = $Cell
$cells = New-Object System.Collections.Generic.List[object]
for ($r = 1; $r -lt $rows - 1; $r++) {
  for ($c = 1; $c -lt $cols - 1; $c++) {
    $lat = $lat0 + $r * $dLat; $lon = $lon0 + $c * $dLon
    if (-not (Test-Inside $lat $lon)) { continue }
    $a = $z[($r+1),($c-1)]; $b = $z[($r+1),$c]; $cc = $z[($r+1),($c+1)]
    $d = $z[$r,($c-1)];     $f = $z[$r,($c+1)]
    $g = $z[($r-1),($c-1)]; $h = $z[($r-1),$c]; $ii = $z[($r-1),($c+1)]
    $dzdx = (($cc + 2*$f + $ii) - ($a + 2*$d + $g)) / (8 * $ewRes)
    $dzdy = (($a + 2*$b + $cc) - ($g + 2*$h + $ii)) / (8 * $nsRes)
    $slopePct = [Math]::Sqrt($dzdx*$dzdx + $dzdy*$dzdy) * 100
    $asp = [Math]::Atan2($dzdy, -$dzdx) * 180 / [Math]::PI   # 내리막 방향
    $aspect = (90 - $asp) % 360; if ($aspect -lt 0) { $aspect += 360 }
    $elevHere = [Math]::Round(($z[$r,$c]), 1)
    $flat = $slopePct -lt $FlatPct
    $aspectOk = $flat -or ($aspect -ge $AspectFrom -and $aspect -le $AspectTo)
    $cells.Add([pscustomobject]@{
      row = $r; col = $c
      lat = [Math]::Round($lat, 6); lon = [Math]::Round($lon, 6)
      elev_m = $elevHere
      slope_pct = [Math]::Round($slopePct, 2)
      aspect_deg = $(if ($flat) { '평탄' } else { [Math]::Round($aspect, 1) })
      aspect_ok = $aspectOk
    })
  }
}
if ($cells.Count -eq 0) { throw '대상지 안에 셀이 없음' }
$cellHa = [Math]::Round(($Cell * $Cell) / 10000.0, 4)
Write-Host ("대상지 셀 {0}개 · 면적 {1} ha" -f $cells.Count, ($cells.Count * $cellHa))

# ─── 5. 임계값 3개별 적합면적 비율 ───
$summary = foreach ($t in $Thresholds) {
  $slopeOk = @($cells | Where-Object { $_.slope_pct -le $t })
  $bothOk  = @($slopeOk | Where-Object { $_.aspect_ok })
  [pscustomobject]@{
    threshold_pct      = $t
    cells_total        = $cells.Count
    cells_slope_ok     = $slopeOk.Count
    cells_slope_aspect = $bothOk.Count
    area_ha_total      = [Math]::Round($cells.Count * $cellHa, 2)
    area_ha_fit        = [Math]::Round($bothOk.Count * $cellHa, 2)
    pct_slope_only     = [Math]::Round(100.0 * $slopeOk.Count / $cells.Count, 1)
    pct_slope_aspect   = [Math]::Round(100.0 * $bothOk.Count / $cells.Count, 1)
  }
}
$summary | Format-Table -AutoSize | Out-String | Write-Host

# ─── 6. 저장 ───
$cells | Export-Csv -Path (Join-Path $dataDir 'cells.csv') -NoTypeInformation -Encoding UTF8
$base = $summary | Where-Object { $_.threshold_pct -eq 15 }
$meta = [pscustomobject]@{
  지표            = '⑥ 경사·향 적합면적 비율'
  대상지          = '서울특별시 종로구 창신동 (법정동 전역)'
  경계출처        = 'OpenStreetMap relation 3883989 (Nominatim polygon_geojson)'
  DEM출처         = 'Copernicus DEM GLO-90 (ESA) · Open-Meteo Elevation API'
  DEM해상도       = '90 m (셀 0.81 ha)'
  계산방법        = 'Horn(1981) 3x3 경사·향, 경사는 백분율(%)'
  향기준          = ("적합 {0}°~{1}° (동남~서남), 경사 {2}% 미만은 평탄으로 보아 향 조건 면제" -f $AspectFrom, $AspectTo, $FlatPct)
  임계값          = ($Thresholds -join '·') + ' %'
  조회일          = $fetched
  값              = $summary
}
Save-Utf8 (Join-Path $outDir '지표6_요약.json') ($meta | ConvertTo-Json -Depth 5)

$row = [pscustomobject]@{
  '지표'              = '⑥ 경사·향 적합면적 비율'
  '값(%)'             = $base.pct_slope_aspect
  '임계값 10%'        = ($summary | Where-Object { $_.threshold_pct -eq 10 }).pct_slope_aspect
  '임계값 15%(기준안)'= $base.pct_slope_aspect
  '임계값 25%'        = ($summary | Where-Object { $_.threshold_pct -eq 25 }).pct_slope_aspect
  'DEM 출처·해상도'   = 'Copernicus DEM GLO-90 (ESA) · Open-Meteo Elevation API · 90 m (셀 0.81 ha)'
  '브이월드 레이어'   = 'LT_C_UQ111 용도지역(도시) — 지표 ③과 중첩 확인용'
  '조회일'            = $fetched
  '단위'              = '%'
  '대상지'            = '서울 종로구 창신동'
  '총면적(ha)'        = $base.area_ha_total
  '적합면적(ha)'      = $base.area_ha_fit
  '향 기준'           = ("{0}°~{1}°, 경사 {2}% 미만 평탄 면제" -f $AspectFrom, $AspectTo, $FlatPct)
  '계산값/수집값'     = '계산값 (DEM 수집 → 경사·향 계산)'
  '재현 명령'         = 'powershell -ExecutionPolicy Bypass -File src\slope_aspect.ps1'
}
$row | Export-Csv -Path (Join-Path $outDir '지표6_카탈로그행.csv') -NoTypeInformation -Encoding UTF8
Write-Host '완료: out\지표6_카탈로그행.csv, out\지표6_요약.json, data\cells.csv'
