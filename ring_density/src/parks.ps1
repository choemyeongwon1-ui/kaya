# OSM 공원(leisure=park) 응답(raw\, 저장소에는 올리지 않음)을 대시보드용으로 줄임 → data/parks.json
# 공원마다 이름·면적(m²)·중심점·종로구청까지 거리와 외곽선(소수 5자리)을 남김
# 실행: powershell -ExecutionPolicy Bypass -File src\parks.ps1

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$lat0 = 37.5735; $lon0 = 126.9790
$mLat = 111320.0; $mLon = 111320.0 * [Math]::Cos($lat0 * [Math]::PI / 180)
$inv = [Globalization.CultureInfo]::InvariantCulture
$src = Get-ChildItem (Join-Path $root 'raw') -Filter 'osm_parks_*.json' | Sort-Object Name | Select-Object -Last 1
$j = [IO.File]::ReadAllText($src.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json

function RingArea($pts) {   # signed shoelace area in m² on a local plane
  $s = 0.0
  for ($i = 0; $i -lt $pts.Count; $i++) {
    $a = $pts[$i]; $b = $pts[($i + 1) % $pts.Count]
    $s += (($a.lon - $lon0) * $mLon) * (($b.lat - $lat0) * $mLat) - (($b.lon - $lon0) * $mLon) * (($a.lat - $lat0) * $mLat)
  }
  $s / 2
}

$parks = foreach ($e in $j.elements) {
  $rings = @()
  if ($e.type -eq 'way' -and $e.geometry) { $rings += , @{ role = 'outer'; pts = $e.geometry } }
  elseif ($e.type -eq 'relation') {
    foreach ($m in $e.members) { if ($m.type -eq 'way' -and $m.geometry) { $rings += , @{ role = $m.role; pts = $m.geometry } } }
  }
  if (-not $rings) { continue }
  $area = 0.0; $cx = 0.0; $cy = 0.0; $n = 0
  foreach ($r in $rings) {
    $a = [Math]::Abs((RingArea $r.pts))
    if ($r.role -eq 'inner') { $area -= $a } else { $area += $a; foreach ($p in $r.pts) { $cx += $p.lon; $cy += $p.lat; $n++ } }
  }
  if ($n -eq 0 -or $area -lt 1500) { continue }   # 1,500 m² 미만 쌈지 녹지는 뺌
  $cy /= $n; $cx /= $n
  $dist = [Math]::Sqrt([Math]::Pow(($cy - $lat0) * $mLat, 2) + [Math]::Pow(($cx - $lon0) * $mLon, 2))
  $ringJson = ($rings | Where-Object { $_.role -ne 'inner' } | ForEach-Object {
    '[' + (($_.pts | ForEach-Object { '[{0},{1}]' -f ([double]$_.lat).ToString('F5', $inv), ([double]$_.lon).ToString('F5', $inv) }) -join ',') + ']'
  }) -join ','
  $name = ([string]$e.tags.name).Replace('"', '').Replace('\', '')
  [pscustomobject]@{ id = "$($e.type)/$($e.id)"; name = $name; area = [Math]::Round($area); dist = [Math]::Round($dist); lat = $cy; lon = $cx; json = $ringJson }
}

$items = $parks | Sort-Object dist | ForEach-Object {
  '{{"id":"{0}","name":"{1}","area":{2},"dist":{3},"lat":{4},"lon":{5},"rings":[{6}]}}' -f $_.id, $_.name, $_.area, $_.dist, $_.lat.ToString('F6', $inv), $_.lon.ToString('F6', $inv), $_.json
}
$meta = '{{"source":"Overpass API (OpenStreetMap) leisure=park","file":"{0}","osmBase":"{1}"}}' -f $src.Name, ([string]$j.osm3s.timestamp_osm_base).Substring(0, 10)
[IO.File]::WriteAllText((Join-Path $root 'data\parks.json'), ('{"meta":' + $meta + ',"parks":[' + ($items -join ',') + ']}'), (New-Object Text.UTF8Encoding $false))

"공원 $(@($parks).Count)곳 (1,500 m² 이상) → data\parks.json"
$parks | Where-Object { $_.dist -le 1500 } | Sort-Object dist | Format-Table name, area, dist -AutoSize | Out-String -Width 120
