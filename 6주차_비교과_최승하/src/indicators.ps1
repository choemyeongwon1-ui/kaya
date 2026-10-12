#requires -version 5.1
# 창신동 대시보드 지표 ①②⑤ 수집·계산 (③④는 인증키·열람 필요 → 조회 대기 행으로 남김)
# ① 기온·강수   Open-Meteo Archive (ERA5) 2016-2025 평균
# ② 격자 인구밀도 WorldPop 2020 (100 m 격자) ÷ 경계 면적
# ⑤ 용도별 소요면적 공원 — 법정 확보기준(1인당 6㎡·3㎡) vs 실측 공원면적(OSM)
param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = 'smartcity-class/1.0 (seunghagkrry@gmail.com)'
$dataDir = Join-Path $Root 'data'; $outDir = Join-Path $Root 'out'
foreach ($d in @($dataDir, $outDir)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null } }
function Save-Utf8($path, $text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $true)) }
$today = Get-Date -Format 'yyyy-MM-dd'
$now = Get-Date -Format 'yyyy-MM-dd HH:mm'

# ─── 경계 (OSM relation 3883989 법정동 창신동) ───
$nom = Get-Content (Join-Path $dataDir 'changsin_boundary.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$rel = $nom | Where-Object { $_.osm_type -eq 'relation' -and $_.geojson.type -eq 'Polygon' } | Select-Object -First 1
$ring = $rel.geojson.coordinates[0]
$polyLon = $ring | ForEach-Object { [double]$_[0] }
$polyLat = $ring | ForEach-Object { [double]$_[1] }
$latC = ($polyLat | Measure-Object -Average).Average
$lonC = ($polyLon | Measure-Object -Average).Average
$kx = 111320.0 * [Math]::Cos($latC * [Math]::PI / 180); $ky = 110574.0
function Get-AreaM2($coords) {   # [lon,lat] 고리 → 평면 근사 면적(㎡)
  $s = 0.0
  for ($i = 0; $i -lt $coords.Count - 1; $i++) {
    $s += ([double]$coords[$i][0] * $kx) * ([double]$coords[$i+1][1] * $ky) -
          ([double]$coords[$i+1][0] * $kx) * ([double]$coords[$i][1] * $ky)
  }
  return [Math]::Abs($s / 2)
}
function Test-Inside([double]$lat, [double]$lon) {
  $inside = $false; $n = $ring.Count
  for ($i = 0; $i -lt $n; $i++) {
    $j = ($i + $n - 1) % $n
    if ((($polyLat[$i] -gt $lat) -ne ($polyLat[$j] -gt $lat)) -and
        ($lon -lt ($polyLon[$j] - $polyLon[$i]) * ($lat - $polyLat[$i]) / ($polyLat[$j] - $polyLat[$i]) + $polyLon[$i])) {
      $inside = -not $inside
    }
  }
  return $inside
}
$areaM2 = Get-AreaM2 $ring
$areaKm2 = $areaM2 / 1e6
Write-Host ("대상지 창신동 면적 {0} km2 · 중심 {1}, {2}" -f [Math]::Round($areaKm2,4), [Math]::Round($latC,5), [Math]::Round($lonC,5))

# ─── ① 기온·강수 (ERA5 2016-2025) ───
$climFile = Join-Path $dataDir 'openmeteo_archive_2016_2025.json'
if (-not (Test-Path $climFile)) {
  $u = "https://archive-api.open-meteo.com/v1/archive?latitude={0:F4}&longitude={1:F4}&start_date=2016-01-01&end_date=2025-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=Asia%2FSeoul" -f $latC, $lonC
  Invoke-WebRequest -Uri $u -UserAgent $UA -OutFile $climFile
}
$clim = Get-Content $climFile -Raw -Encoding UTF8 | ConvertFrom-Json
$byYear = @{}
for ($i = 0; $i -lt $clim.daily.time.Count; $i++) {
  $y = $clim.daily.time[$i].Substring(0,4)
  if (-not $byYear[$y]) { $byYear[$y] = @{ t = New-Object Collections.Generic.List[double]; p = 0.0 } }
  if ($null -ne $clim.daily.temperature_2m_mean[$i]) { $byYear[$y].t.Add([double]$clim.daily.temperature_2m_mean[$i]) }
  if ($null -ne $clim.daily.precipitation_sum[$i])   { $byYear[$y].p += [double]$clim.daily.precipitation_sum[$i] }
}
$yearly = foreach ($y in ($byYear.Keys | Sort-Object)) {
  [pscustomobject]@{ year = [int]$y
    mean_c = [Math]::Round(($byYear[$y].t | Measure-Object -Average).Average, 2)
    precip_mm = [Math]::Round($byYear[$y].p, 1) }
}
$meanC = [Math]::Round(($yearly.mean_c | Measure-Object -Average).Average, 2)
$precip = [Math]::Round(($yearly.precip_mm | Measure-Object -Average).Average, 1)
Write-Host ("① 연평균기온 {0} ℃ · 연강수량 {1} mm (격자 {2},{3})" -f $meanC, $precip, $clim.latitude, $clim.longitude)

# ─── ② 격자 인구밀도 (WorldPop 2020) ───
$popFile = Join-Path $dataDir 'worldpop_2020.json'
if (-not (Test-Path $popFile)) {
  $geo = @{ type = 'Feature'; properties = @{}; geometry = $rel.geojson } | ConvertTo-Json -Depth 6 -Compress
  $task = Invoke-RestMethod -Uri ("https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=2020&geojson=" + [uri]::EscapeDataString($geo)) -UserAgent $UA
  do { Start-Sleep -Seconds 5; $res = Invoke-RestMethod -Uri ("https://api.worldpop.org/v1/tasks/" + $task.taskid) -UserAgent $UA }
  while ($res.status -in @('created','started'))
  Save-Utf8 $popFile ($res | ConvertTo-Json -Depth 5)
}
$pop = (Get-Content $popFile -Raw -Encoding UTF8 | ConvertFrom-Json).data.total_population
$popDensity = [Math]::Round($pop / $areaKm2)
Write-Host ("② 인구 {0} 명 · 인구밀도 {1} 명/km2" -f [Math]::Round($pop), $popDensity)

# ─── ⑤ 용도별 소요면적 — 공원 ───
$parkFile = Join-Path $dataDir 'osm_parks_changsin.json'
if (-not (Test-Path $parkFile)) {
  $q = '[out:json][timeout:60];(way["leisure"~"^(park|garden|playground)$"](37.5680,127.0060,37.5840,127.0210);relation["leisure"~"^(park|garden|playground)$"](37.5680,127.0060,37.5840,127.0210););out geom;'
  Invoke-WebRequest -Uri 'https://overpass-api.de/api/interpreter' -Method Post -Body @{ data = $q } -UserAgent $UA -OutFile $parkFile
}
$pk = Get-Content $parkFile -Raw -Encoding UTF8 | ConvertFrom-Json
$parksIn = New-Object Collections.Generic.List[object]
foreach ($el in $pk.elements) {
  $geom = $null
  if ($el.type -eq 'way' -and $el.geometry) { $geom = $el.geometry }
  elseif ($el.type -eq 'relation' -and $el.members) {
    $outer = $el.members | Where-Object { $_.role -eq 'outer' -and $_.geometry } | Select-Object -First 1
    if ($outer) { $geom = $outer.geometry }
  }
  if (-not $geom -or $geom.Count -lt 4) { continue }
  $coords = @($geom | ForEach-Object { ,@([double]$_.lon, [double]$_.lat) })
  if ($coords[0][0] -ne $coords[-1][0] -or $coords[0][1] -ne $coords[-1][1]) { $coords += ,$coords[0] }
  $cLat = (($geom | ForEach-Object { [double]$_.lat }) | Measure-Object -Average).Average
  $cLon = (($geom | ForEach-Object { [double]$_.lon }) | Measure-Object -Average).Average
  if (-not (Test-Inside $cLat $cLon)) { continue }
  $parksIn.Add([pscustomobject]@{
    id = "$($el.type)/$($el.id)"
    name = $(if ($el.tags.name) { $el.tags.name } else { '(이름 없음)' })
    leisure = $el.tags.leisure
    area_m2 = [Math]::Round((Get-AreaM2 $coords), 0)
    lat = [Math]::Round($cLat, 6); lon = [Math]::Round($cLon, 6) })
}
$parkArea = ($parksIn | Measure-Object -Property area_m2 -Sum).Sum
if (-not $parkArea) { $parkArea = 0 }
$need6 = [Math]::Round($pop * 6, 0)     # 도시지역 1인당 6㎡
$need3 = [Math]::Round($pop * 3, 0)     # 녹지지역 제외 도시지역 1인당 3㎡
Write-Host ("⑤ 실측 공원 {0}개 {1} ㎡ · 소요 6㎡/인 {2} ㎡ · 3㎡/인 {3} ㎡" -f $parksIn.Count, $parkArea, $need6, $need3)

# ─── 저장 ───
$parksIn | Export-Csv -Path (Join-Path $dataDir 'parks_in_changsin.csv') -NoTypeInformation -Encoding UTF8
$yearly  | Export-Csv -Path (Join-Path $dataDir 'climate_yearly.csv') -NoTypeInformation -Encoding UTF8
$result = [ordered]@{
  대상지 = '서울특별시 종로구 창신동 (법정동 전역)'
  경계 = 'OpenStreetMap relation 3883989 · Nominatim polygon_geojson'
  면적_km2 = [Math]::Round($areaKm2, 4)
  중심 = @{ lat = [Math]::Round($latC,5); lon = [Math]::Round($lonC,5) }
  조회일 = $now
  기온강수 = [ordered]@{ 연평균기온_C = $meanC; 연강수량_mm = $precip
    기간 = '2016-2025 (10년 평균)'; 격자 = ("{0}N {1}E" -f $clim.latitude, $clim.longitude)
    출처 = 'Open-Meteo Archive API (ERA5 재분석)'; 연도별 = $yearly }
  인구밀도 = [ordered]@{ 값_명_km2 = $popDensity; 인구_명 = [Math]::Round($pop)
    출처 = 'WorldPop 2020 (wpgppop, 100 m 격자) · api.worldpop.org 공간집계'
    주의 = '격자 추정값 — 주민등록 인구와 다를 수 있어 교차확인 필요' }
  소요면적 = [ordered]@{ 실측_공원면적_m2 = $parkArea; 공원수 = $parksIn.Count
    소요_6m2_per_person = $need6; 소요_3m2_per_person = $need3
    기준 = '「도시공원 및 녹지 등에 관한 법률 시행규칙」 제4조 — 도시지역 1인당 6㎡ 이상, 개발제한구역·녹지지역 제외 도시지역 1인당 3㎡ 이상 (시행 2026-08-27)'
    실측출처 = 'Overpass API (OpenStreetMap) leisure=park|garden|playground · 중심점이 창신동 안에 드는 것만 전체 면적 합산' }
}
Save-Utf8 (Join-Path $outDir '지표_창신동.json') ($result | ConvertTo-Json -Depth 6)
Write-Host '완료: out\지표_창신동.json, data\parks_in_changsin.csv, data\climate_yearly.csv'
