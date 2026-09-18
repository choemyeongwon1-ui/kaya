# Esri World Imagery 타일을 받아 반경 5km를 덮는 위성사진 한 장(JPEG)으로 이어 붙임
# 결과: data/satellite_z15.jpg + data/satellite_z15.json (경계 좌표)
# build.ps1이 이 사진을 index.html 안에 넣으므로, 인터넷이 없거나 외부 이미지가 막혀도 위성 바탕이 보임
# 실행: powershell -ExecutionPolicy Bypass -File src\satellite.ps1

Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$lat0 = 37.5735; $lon0 = 126.9790; $radius = 5000 * 1.06; $z = 15
$url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{0}/{1}/{2}'

function LonToX($lon) { ($lon + 180.0) / 360.0 * [Math]::Pow(2, $z) }
function LatToY($lat) { $r = $lat * [Math]::PI / 180; (1.0 - [Math]::Log([Math]::Tan($r) + 1 / [Math]::Cos($r)) / [Math]::PI) / 2.0 * [Math]::Pow(2, $z) }
function XToLon($x) { $x / [Math]::Pow(2, $z) * 360.0 - 180.0 }
function YToLat($y) { $n = [Math]::PI * (1 - 2 * $y / [Math]::Pow(2, $z)); [Math]::Atan([Math]::Sinh($n)) * 180 / [Math]::PI }

$dlat = $radius / 111320.0
$dlon = $radius / (111320.0 * [Math]::Cos($lat0 * [Math]::PI / 180))
$x0 = [int][Math]::Floor((LonToX ($lon0 - $dlon))); $x1 = [int][Math]::Floor((LonToX ($lon0 + $dlon)))
$y0 = [int][Math]::Floor((LatToY ($lat0 + $dlat))); $y1 = [int][Math]::Floor((LatToY ($lat0 - $dlat)))
$cols = $x1 - $x0 + 1; $rows = $y1 - $y0 + 1
"zoom $z · 타일 ${cols}x${rows} = $($cols * $rows)장"

$bmp = New-Object System.Drawing.Bitmap ($cols * 256), ($rows * 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(24, 28, 34))
$wc = New-Object System.Net.WebClient
$wc.Headers.Add('User-Agent', 'SMU-urbanplanning-class/1.0 (academic use)')
$miss = 0
for ($ty = $y0; $ty -le $y1; $ty++) {
  for ($tx = $x0; $tx -le $x1; $tx++) {
    $ok = $false
    for ($try = 0; $try -lt 3 -and -not $ok; $try++) {
      try {
        $bytes = $wc.DownloadData(($url -f $z, $ty, $tx))
        $ms = New-Object System.IO.MemoryStream (, $bytes)
        $img = [System.Drawing.Image]::FromStream($ms)
        $g.DrawImage($img, ($tx - $x0) * 256, ($ty - $y0) * 256, 256, 256)
        $img.Dispose(); $ms.Dispose(); $ok = $true
      } catch { Start-Sleep -Milliseconds 400 }
    }
    if (-not $ok) { $miss++ }
  }
}
$g.Dispose()

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]72)
$jpg = Join-Path $root 'data\satellite_z15.jpg'
$bmp.Save($jpg, $codec, $ep)
$bmp.Dispose()

$inv = [Globalization.CultureInfo]::InvariantCulture
$meta = [ordered]@{
  zoom = $z; width = $cols * 256; height = $rows * 256
  latSouth = (YToLat ($y1 + 1)); latNorth = (YToLat $y0)
  lonWest = (XToLon $x0); lonEast = (XToLon ($x1 + 1))
  attribution = 'Esri, Maxar, Earthstar Geographics'; fetched = (Get-Date -Format 'yyyy-MM-dd')
}
($meta | ConvertTo-Json) | Set-Content -Path (Join-Path $root 'data\satellite_z15.json') -Encoding UTF8
"저장: $jpg · $([Math]::Round((Get-Item $jpg).Length / 1MB, 2)) MB · 실패 타일 ${miss}장"
