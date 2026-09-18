# index.html을 다시 만드는 스크립트
#   1) raw/ 의 Overpass 응답(저장소에는 올리지 않음, -Fetch 로 다시 받음)(JSON)을 읽어 반경 5km 안 건물만 남기고
#   2) src/template.html 의 자리표시자(__DATA__ 등)에 채워 index.html 로 저장함
# 실행: powershell -ExecutionPolicy Bypass -File src\build.ps1
# 데이터를 새로 받으려면 -Fetch 를 붙임 (Overpass 서버가 느리면 몇 분 걸림)

param([switch]$Fetch)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$enc = New-Object Text.UTF8Encoding $false
$lat0 = 37.5735; $lon0 = 126.9790; $maxR = 5   # 중심 종로구청, 반경 km
$endpoint = 'https://overpass.kumi.systems/api/interpreter'
$fetched = Get-Date -Format 'yyyy-MM-dd'
$dataFile = Join-Path $root 'raw\osm_buildings_5km_20260914.json'

if ($Fetch) {
  $query = "[out:json][timeout:600];(way[`"building`"](around:$($maxR * 1000),$lat0,$lon0);relation[`"building`"](around:$($maxR * 1000),$lat0,$lon0););out center tags qt;"
  $dataFile = Join-Path $root ("raw\osm_buildings_{0}km_{1}.json" -f $maxR, (Get-Date -Format 'yyyyMMdd'))
  Invoke-WebRequest -Uri $endpoint -Method Post -Body @{ data = $query } -UserAgent 'SMU-urbanplanning-class/1.0' -TimeoutSec 600 -OutFile $dataFile -UseBasicParsing
} else {
  $fetched = '2026-09-14'
}

$j = Get-Content $dataFile -Raw -Encoding UTF8 | ConvertFrom-Json

# 용도가 적힌 building 태그 (나머지 yes·roof 등은 미기재로 봄)
$known = 'commercial retail office hotel company kiosk supermarket house apartments residential detached dormitory terrace semidetached_house school university college kindergarten hospital civic public government fire_station train_station police church cathedral chapel shrine temple mosque religious palace pavilion city_gate gate museum industrial warehouse factory manufacture' -split ' '
$set = New-Object 'System.Collections.Generic.HashSet[string]'
$known | ForEach-Object { [void]$set.Add($_) }

$inv = [Globalization.CultureInfo]::InvariantCulture
$cosLat = [Math]::Cos($lat0 * [Math]::PI / 180)
$rows = New-Object System.Collections.Generic.List[string]
foreach ($e in $j.elements) {
  if (-not $e.center) { continue }
  $la = [double]$e.center.lat; $lo = [double]$e.center.lon
  $dy = ($la - $lat0) * 111320; $dx = ($lo - $lon0) * 111320 * $cosLat
  if ([Math]::Sqrt($dx * $dx + $dy * $dy) -gt $maxR * 1000) { continue }
  $b = ([string]$e.tags.building).Replace('"', '').Replace('\', '')
  $c = if ($set.Contains($b)) { 1 } else { 0 }
  $name = ([string]$e.tags.name).Replace('\', '').Replace('"', '').Replace('<', '').Replace('>', '')
  $rows.Add(('[{0},{1},{2},"{3}","{4}"]' -f $la.ToString('F5', $inv), $lo.ToString('F5', $inv), $c, $b, $name))
}

$osmBase = ([string]$j.osm3s.timestamp_osm_base).Substring(0, 10)

# 위성사진(src\satellite.ps1로 만든 것)과 Leaflet을 파일 안에 넣어 인터넷 없이도 열리게 함
$satMeta = Get-Content (Join-Path $root 'data\satellite_z15.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$satB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root 'data\satellite_z15.jpg')))
$sat = '{{"uri":"data:image/jpeg;base64,{0}","latSouth":{1},"latNorth":{2},"lonWest":{3},"lonEast":{4}}}' -f $satB64,
  ([double]$satMeta.latSouth).ToString('R', $inv), ([double]$satMeta.latNorth).ToString('R', $inv),
  ([double]$satMeta.lonWest).ToString('R', $inv), ([double]$satMeta.lonEast).ToString('R', $inv)
$leafletCss = [IO.File]::ReadAllText((Join-Path $root 'src\vendor\leaflet.min.css'), $enc)
$leafletJs = [IO.File]::ReadAllText((Join-Path $root 'src\vendor\leaflet.min.js'), $enc)

$t = [IO.File]::ReadAllText((Join-Path $root 'src\template.html'), $enc)
$html = $t.Replace('/*__LEAFLET_CSS__*/', $leafletCss).
  Replace('/*__LEAFLET_JS__*/', $leafletJs).
  Replace('__SAT__', $sat).
  Replace('__DATA__', '[' + ($rows -join ',') + ']').
  Replace('__MAXR__', [string]$maxR).
  Replace('__ENDPOINT__', $endpoint).
  Replace('__OSMDATE__', $osmBase).
  Replace('__FETCHED__', $fetched).
  Replace('__RESPONSE__', [string]$j.elements.Count)
[IO.File]::WriteAllText((Join-Path $root 'index.html'), $html, $enc)

"응답 $($j.elements.Count)건 → 반경 ${maxR}km 안 $($rows.Count)동 · OSM 기준 $osmBase · index.html 저장"
