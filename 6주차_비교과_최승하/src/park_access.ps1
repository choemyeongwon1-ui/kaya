#requires -version 5.1
# ⑤ 심층 — 공원 유치거리 커버리지 (「도시공원 및 녹지 등에 관한 법률 시행규칙」 별표 3)
#   어린이공원 유치거리 250 m (1,500 ㎡ 이상) · 근린생활권 근린공원 500 m (10,000 ㎡ 이상)
#   30 m 셀(cells_30m.csv) 각각에서 가장 가까운 공원 경계까지의 거리를 재서 커버리지를 낸다.
param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = 'smartcity-class/1.0 (seunghagkrry@gmail.com)'
$dataDir = Join-Path $Root 'data'; $outDir = Join-Path $Root 'out'
function Save-Utf8($p, $t) { [IO.File]::WriteAllText($p, $t, (New-Object Text.UTF8Encoding $true)) }

# 반경 1 km 바깥 공원까지 포함해야 경계 근처 셀의 커버리지가 맞는다
$parkFile = Join-Path $dataDir 'osm_parks_1km.json'
if (-not (Test-Path $parkFile)) {
  $q = '[out:json][timeout:90];(way["leisure"~"^(park|garden|playground)$"](37.5600,126.9960,37.5920,127.0310);relation["leisure"~"^(park|garden|playground)$"](37.5600,126.9960,37.5920,127.0310););out geom;'
  Invoke-WebRequest -Uri 'https://overpass-api.de/api/interpreter' -Method Post -Body @{ data = $q } -UserAgent $UA -OutFile $parkFile
}
$pk = Get-Content $parkFile -Raw -Encoding UTF8 | ConvertFrom-Json
$cells = Import-Csv (Join-Path $dataDir 'cells_30m.csv')
$latC = 37.575; $kx = 111320.0 * [Math]::Cos($latC * [Math]::PI / 180); $ky = 110574.0

$parks = New-Object Collections.Generic.List[object]
foreach ($el in $pk.elements) {
  $geom = $null
  if ($el.type -eq 'way' -and $el.geometry) { $geom = $el.geometry }
  elseif ($el.type -eq 'relation' -and $el.members) {
    $o = $el.members | Where-Object { $_.role -eq 'outer' -and $_.geometry } | Select-Object -First 1
    if ($o) { $geom = $o.geometry }
  }
  if (-not $geom -or $geom.Count -lt 4) { continue }
  $xs = @(); $ys = @()
  foreach ($g in $geom) { $xs += ([double]$g.lon * $kx); $ys += ([double]$g.lat * $ky) }
  $s = 0.0
  for ($i = 0; $i -lt $xs.Count - 1; $i++) { $s += $xs[$i] * $ys[$i+1] - $xs[$i+1] * $ys[$i] }
  $parks.Add([pscustomobject]@{
    name = $(if ($el.tags.name) { $el.tags.name } else { '(이름 없음)' })
    leisure = $el.tags.leisure
    area_m2 = [Math]::Round([Math]::Abs($s / 2), 0)
    xs = $xs; ys = $ys })
}
Write-Host ("공원·녹지 폴리곤 {0}개 (반경 1 km 포함)" -f $parks.Count)

function Get-DistToPark($px, $py, $park) {   # 점 → 폴리곤 경계 최소거리(㎡ 좌표계, m)
  $min = [double]::MaxValue
  for ($i = 0; $i -lt $park.xs.Count - 1; $i++) {
    $ax = $park.xs[$i]; $ay = $park.ys[$i]; $bx = $park.xs[$i+1]; $by = $park.ys[$i+1]
    $vx = $bx - $ax; $vy = $by - $ay
    $len2 = $vx*$vx + $vy*$vy
    $t = $(if ($len2 -eq 0) { 0 } else { (($px-$ax)*$vx + ($py-$ay)*$vy) / $len2 })
    if ($t -lt 0) { $t = 0 } elseif ($t -gt 1) { $t = 1 }
    $dx = $px - ($ax + $t*$vx); $dy = $py - ($ay + $t*$vy)
    $d = [Math]::Sqrt($dx*$dx + $dy*$dy)
    if ($d -lt $min) { $min = $d }
  }
  return $min
}

$kids  = @($parks | Where-Object { $_.area_m2 -ge 1500 })    # 어린이공원 규모 이상
$neigh = @($parks | Where-Object { $_.area_m2 -ge 10000 })   # 근린생활권 근린공원 규모 이상
Write-Host ("1,500㎡ 이상 {0}개 · 10,000㎡ 이상 {1}개" -f $kids.Count, $neigh.Count)

$cov250 = 0; $cov500 = 0; $dists = New-Object Collections.Generic.List[double]
foreach ($c in $cells) {
  $px = [double]$c.lon * $kx; $py = [double]$c.lat * $ky
  $d1 = [double]::MaxValue; foreach ($p in $kids)  { $d = Get-DistToPark $px $py $p; if ($d -lt $d1) { $d1 = $d } }
  $d2 = [double]::MaxValue; foreach ($p in $neigh) { $d = Get-DistToPark $px $py $p; if ($d -lt $d2) { $d2 = $d } }
  $dists.Add($d1)
  if ($d1 -le 250) { $cov250++ }
  if ($d2 -le 500) { $cov500++ }
}
$n = $cells.Count
$res = [ordered]@{
  기준 = '「도시공원 및 녹지 등에 관한 법률 시행규칙」 별표 3 (제6조 관련, 개정 2026-08-25) — 어린이공원 유치거리 250 m·1,500 ㎡ 이상, 근린생활권 근린공원 500 m·10,000 ㎡ 이상'
  실측출처 = 'Overpass API (OpenStreetMap) leisure=park|garden|playground · 대상지 반경 1 km 포함 · 거리 = 셀 중심에서 공원 경계까지'
  조회일 = (Get-Date -Format 'yyyy-MM-dd HH:mm')
  셀수 = $n; 셀크기_m = 30
  커버리지_250m_pct = [Math]::Round(100.0 * $cov250 / $n, 1)
  커버리지_500m_pct = [Math]::Round(100.0 * $cov500 / $n, 1)
  최근접공원거리_m = @{ 평균 = [Math]::Round(($dists | Measure-Object -Average).Average, 0)
                        최대 = [Math]::Round(($dists | Measure-Object -Maximum).Maximum, 0) }
  후보공원 = @($parks | Where-Object { $_.area_m2 -ge 1500 } | Sort-Object area_m2 -Descending |
               Select-Object -First 8 | ForEach-Object { [ordered]@{ 이름=$_.name; 종류=$_.leisure; 면적_m2=$_.area_m2 } })
}
Save-Utf8 (Join-Path $outDir '공원_유치거리.json') ($res | ConvertTo-Json -Depth 5)
"250 m 커버리지 {0}% · 500 m 커버리지 {1}% · 최근접 평균 {2} m" -f $res.커버리지_250m_pct, $res.커버리지_500m_pct, $res.최근접공원거리_m.평균 | Write-Host
Write-Host '완료: out\공원_유치거리.json'
