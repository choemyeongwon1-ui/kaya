# 대상지 조례의 용도지역별 건폐율·용적률을 받아 21종 표(CSV)와 대시보드 카드 데이터를 만드는 스크립트
#   대상지: 종로구청(서울 종로구 수송동 146-12) → 「서울특별시 도시계획 조례」 제44조(건폐율)·제48조(용적률)
#   1) law.go.kr 자치법규 검색(lawSearch target=ordin)으로 조례명이 정확히 일치하는 현행본의 일련번호를 찾고
#   2) 본문 조회(lawService target=ordin)로 두 조문을 받아 호마다 값을 뽑음
#   3) data\ordinance.json (카드·카탈로그용), output\ 조례 21종 CSV, data\ordinance_seoul_날짜.json(응답 원본)을 저장
# 인증키는 환경변수 LAW_OC 에서만 읽고, 저장하는 응답에서는 OC=*** 로 가림 (3주차 비교과 14쪽)
# 실행: powershell -ExecutionPolicy Bypass -File src\ordinance.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$enc = New-Object Text.UTF8Encoding $false
$OC = $env:LAW_OC
if (-not $OC) { $OC = [Environment]::GetEnvironmentVariable('LAW_OC', 'User') }
if (-not $OC) { throw "환경변수 LAW_OC 가 없습니다. [Environment]::SetEnvironmentVariable('LAW_OC','내OC','User') 실행 후 창을 새로 여세요." }
function Mask([string]$s) { $s -replace 'OC=[^&"\s]+', 'OC=***' }
function L($x) { if ($null -eq $x) { @() } else { @($x) } }

$NAME = '서울특별시 도시계획 조례'
$today = Get-Date -Format 'yyyy-MM-dd'
$stamp = Get-Date -Format 'yyyyMMdd'
$wc = New-Object Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
function Get-Json([string]$url) {
  $j = $wc.DownloadString($url) | ConvertFrom-Json
  if ($j.result) { throw "거절 응답: $($j.result) / $($j.msg)" }   # HTTP 200 이어도 result·msg 가 있으면 거절
  $j
}

# 1) 제명 확정 — 이름이 비슷한 구 조례(강남구 도시계획 조례 등)가 섞여 나오므로 정확히 일치하는 것만
$search = Get-Json ("https://www.law.go.kr/DRF/lawSearch.do?OC=$OC&target=ordin&type=JSON&display=100&query=" + [uri]::EscapeDataString($NAME))
$hit = L $search.OrdinSearch.law | Where-Object { $_.자치법규명 -eq $NAME } | Select-Object -First 1
if (-not $hit) { throw "「$NAME」을 찾지 못함" }

# 2) 본문 조회
$url = "https://www.law.go.kr/DRF/lawService.do?OC=$OC&target=ordin&type=JSON&MST=$($hit.자치법규일련번호)"
$text = $wc.DownloadString($url)
[IO.File]::WriteAllText((Join-Path $root "data\ordinance_seoul_$stamp.json"), (Mask $text), $enc)
$svc = ($text | ConvertFrom-Json).LawService
$info = $svc.자치법규기본정보
if ($info.시행일자 -ne $hit.시행일자) { throw "검색 시행일($($hit.시행일자))과 본문 시행일($($info.시행일자))이 다름 — 옛 버전을 받았을 수 있음" }
$ef = '{0}-{1}-{2}' -f $info.시행일자.Substring(0, 4), $info.시행일자.Substring(4, 2), $info.시행일자.Substring(6, 2)

function Article([string]$title) {
  $a = L $svc.조문.조 | Where-Object { $_.조제목 -eq $title } | Select-Object -First 1
  if (-not $a) { throw "조문 「$title」 없음" }
  $a
}
function ToNum([string]$s) {   # "1천" → 1000, "800" → 800
  $s = $s.Replace(',', '')
  $m = [regex]::Match($s, '^(\d+)천(\d*)$')
  if ($m.Success) { return [int]$m.Groups[1].Value * 1000 + $(if ($m.Groups[2].Value) { [int]$m.Groups[2].Value } else { 0 }) }
  [int]$s
}
# "8. 일반상업지역: 800퍼센트(단, 서울도심: 600퍼센트)" 같은 호를 번호별로 뽑음
function Items($article) {
  $no = [int](@($article.조문번호)[0]).Substring(0, 4)   # 응답에 조문번호 키가 두 번 들어 있어 배열로 읽힘
  $map = @{}
  $re = '(\d+)\.\s*([^:.]+?지역)\s*:\s*([\d,]+천?[\d]*)퍼센트(?:\(단,\s*서울도심\s*:\s*([\d,]+천?[\d]*)퍼센트\))?'
  foreach ($m in [regex]::Matches($article.조내용, $re)) {
    $map[$m.Groups[2].Value.Trim()] = [pscustomobject]@{
      ho = [int]$m.Groups[1].Value; value = ToNum $m.Groups[3].Value
      downtown = $(if ($m.Groups[4].Success) { ToNum $m.Groups[4].Value } else { $null })
      src = "$NAME 제${no}조제$($m.Groups[1].Value)호"
    }
  }
  @{ no = $no; map = $map }
}
$bcr = Items (Article '용도지역 안에서의 건폐율')
$far = Items (Article '용도지역 안에서의 용적률')

# 3) 국토계획법 시행령 제30조의 21종 순서로 표를 만듦 — 조례에 없는 종은 값을 비워 둠(임의 값 넣지 않음)
$zones = @(
  @('제1종전용주거지역', '주거'), @('제2종전용주거지역', '주거'), @('제1종일반주거지역', '주거'), @('제2종일반주거지역', '주거'),
  @('제3종일반주거지역', '주거'), @('준주거지역', '주거'), @('중심상업지역', '상업'), @('일반상업지역', '상업'),
  @('근린상업지역', '상업'), @('유통상업지역', '상업'), @('전용공업지역', '공업'), @('일반공업지역', '공업'),
  @('준공업지역', '공업'), @('보전녹지지역', '녹지'), @('생산녹지지역', '녹지'), @('자연녹지지역', '녹지'),
  @('보전관리지역', '관리'), @('생산관리지역', '관리'), @('계획관리지역', '관리'), @('농림지역', '농림'), @('자연환경보전지역', '자연환경보전')
)
$reproduce = 'powershell -ExecutionPolicy Bypass -File src\ordinance.ps1'
$via = 'law.go.kr OPEN API (법령·자치법규 lawSearch → lawService)'

# 상위 기준 — 법 제77조·제78조(대분류 상한)와 시행령 제84조·제85조(21종 범위)
# 조례에 없는 종(관리·농림·자연환경보전)도 상위 기준으로 21종을 모두 채움
function Law-Article([string]$lawName, [string]$jo) {
  $s = Get-Json ("https://www.law.go.kr/DRF/lawSearch.do?OC=$OC&target=law&type=JSON&display=100&query=" + [uri]::EscapeDataString($lawName))
  $h = L $s.LawSearch.law | Where-Object { $_.법령명한글 -eq $lawName -and $_.현행연혁코드 -eq '현행' } | Select-Object -First 1
  if (-not $h) { throw "「$lawName」을 찾지 못함" }
  $r = (Get-Json "https://www.law.go.kr/DRF/lawService.do?OC=$OC&target=law&type=JSON&MST=$($h.법령일련번호)&JO=$jo").법령
  $u = L $r.조문.조문단위 | Where-Object { $_.조문여부 -eq '조문' } | Select-Object -First 1
  if (-not $u -or [int]$u.조문번호 -ne [int]$jo.Substring(0, 4)) { throw "「$lawName」 JO=$jo 조문 없음" }
  if ($h.시행일자 -ne $r.기본정보.시행일자) { throw "「$lawName」 검색·본문 시행일 불일치" }
  @{ unit = $u; mst = $h.법령일련번호; id = $h.법령ID; ef = (D8 $h.시행일자); no = [int]$u.조문번호 }
}
function D8([string]$s) { '{0}-{1}-{2}' -f $s.Substring(0, 4), $s.Substring(4, 2), $s.Substring(6, 2) }
# 항①의 호·목에서 "이름지역 : 값" 을 뽑아 이름 → [값, 호·목] 으로
function Upper($art) {
  $map = @{}
  $h1 = (L $art.unit.항)[0]
  foreach ($ho in L $h1.호) {
    $hm = [regex]::Match($ho.호내용, '^\s*(\d+)\.\s*([^:：]+?지역)\s*[:：]\s*(.+?)\s*$')
    $hn = [regex]::Match($ho.호내용, '^\s*(\d+)\.').Groups[1].Value
    if ($hm.Success) { $map[$hm.Groups[2].Value.Trim()] = @(($hm.Groups[3].Value -replace '\s*<[^>]*>', '').Trim(), "제$($art.no)조제1항제$($hn)호") }
    foreach ($mk in L $ho.목) {
      $mm = [regex]::Match($mk.목내용, '^\s*([가-힣])\.\s*([^:：]+?지역)\s*[:：]\s*(.+?)\s*$')
      if ($mm.Success) { $map[$mm.Groups[2].Value.Trim()] = @(($mm.Groups[3].Value -replace '\s*<[^>]*>', '').Trim(), "제$($art.no)조제1항제$($hn)호$($mm.Groups[1].Value)목") }
    }
  }
  $map
}
$LAW = '국토의 계획 및 이용에 관한 법률'; $DEC = "$LAW 시행령"
$a77 = Law-Article $LAW '007700'; $a78 = Law-Article $LAW '007800'
$a84 = Law-Article $DEC '008400'; $a85 = Law-Article $DEC '008500'
$u77 = Upper $a77; $u78 = Upper $a78; $u84 = Upper $a84; $u85 = Upper $a85
if ($u84.Count -lt 21 -or $u85.Count -lt 21) { throw "시행령 제84·85조에서 21종을 다 뽑지 못함 ($($u84.Count) · $($u85.Count))" }
$upperSrc = "법 법령ID $($a77.id) · MST $($a77.mst) · 시행 $($a77.ef) / 시행령 법령ID $($a84.id) · MST $($a84.mst) · 시행 $($a84.ef)"

$rows = @(); $i = 0
foreach ($z in $zones) {
  $i++
  $b = $bcr.map[$z[0]]; $f = $far.map[$z[0]]
  $lawKey = if ($z[1] -in '주거', '상업', '공업', '녹지') { "$($z[1])지역" } else { $z[0] }   # 법은 도시지역을 대분류로만 정함
  $l77 = $u77[$lawKey]; $l78 = $u78[$lawKey]; $d84 = $u84[$z[0]]; $d85 = $u85[$z[0]]
  $none = '조례에 규정 없음 — 서울은 시 전역이 도시지역이라 관리·농림·자연환경보전지역이 없음 (상위 기준만 적음)'
  $rows += [pscustomobject][ordered]@{
    번호 = $i; 용도지역 = $z[0]; 구분 = $z[1]
    법_건폐율_상한 = $l77[0]; 법_건폐율_출처 = "법 $($l77[1])"
    법_용적률_상한 = $l78[0]; 법_용적률_출처 = "법 $($l78[1])"
    시행령_건폐율 = $d84[0]; 시행령_건폐율_출처 = "시행령 $($d84[1])"
    시행령_용적률 = $d85[0]; 시행령_용적률_출처 = "시행령 $($d85[1])"
    조례_건폐율_값 = $(if ($b) { $b.value } else { '' }); 조례_건폐율_단위 = $(if ($b) { '퍼센트 이하' } else { '' })
    조례_건폐율_출처 = $(if ($b) { "$($b.src) · 시행 $ef" } else { '' })
    조례_용적률_값 = $(if ($f) { $f.value } else { '' }); 조례_용적률_단위 = $(if ($f) { '퍼센트 이하' } else { '' })
    조례_용적률_출처 = $(if ($f) { "$($f.src) · 시행 $ef" } else { '' })
    조례_용적률_서울도심_값 = $(if ($f -and $null -ne $f.downtown) { $f.downtown } else { '' })
    조례_용적률_서울도심_출처 = $(if ($f -and $null -ne $f.downtown) { "$($f.src) 단서 · 시행 $ef" } else { '' })
    비고 = $(if (-not $b -and -not $f) { $none } elseif ($f -and $null -ne $f.downtown) { '서울도심에서는 단서 값 적용 — 기본값과 따로 적음' } else { '' })
    상위법령_판본 = $upperSrc
    조회일 = $today; 조회경로 = $via; 재현명령 = $reproduce
  }
}
New-Item -ItemType Directory -Force (Join-Path $root 'output') | Out-Null
$csvPath = Join-Path $root "output\조례_건폐율_용적률_21종_서울특별시_$stamp.csv"
$rows | Export-Csv $csvPath -NoTypeInformation -Encoding UTF8

# 대상지 카드 — 종로구청 필지의 용도지역은 토지이음 토지이용계획 열람으로 확인한 값
$site = [ordered]@{
  name = '종로구청'; parcel = '서울특별시 종로구 수송동 146-12'; zone = '일반상업지역'; downtown = $true
  others = '지구단위계획구역(수송구역) · 서울도심(4대문안) · 중점경관관리구역(역사도심) · 역사문화환경보존지역'
  checked = $today; checkedVia = '토지이음 토지이용계획 열람 (eum.go.kr)'
}
$z = $far.map[$site.zone]
$card = [ordered]@{
  label = "대상지 용적률 — $($site.name)"
  value = $z.downtown; unit = '퍼센트 이하'
  source = "$($z.src) 단서(서울도심) · 시행 $ef"
  fetched = "$today · law.go.kr OPEN API"
  base = $z.value
  note = "기본값 $($z.value)퍼센트 이하는 단서 전 값이라 따로 적음 · 대상지가 지구단위계획구역(수송구역)이어서 실제 허용 용적률은 지구단위계획으로 따로 정함 · 검색 시행일과 본문 시행일 일치 확인"
}
$meta = [ordered]@{
  name = $NAME; id = $info.자치법규ID; serial = $info.자치법규일련번호; effective = $ef
  promulgated = $info.공포일자; number = $info.공포번호; dept = $info.담당부서명
  articles = "제$($bcr.no)조(건폐율) · 제$($far.no)조(용적률)"; fetched = $today; via = $via; reproduce = $reproduce
  csv = (Split-Path $csvPath -Leaf); listed = @($rows | Where-Object { "$($_.조례_용적률_값)" -ne '' }).Count
}
$out = [ordered]@{ meta = $meta; site = $site; card = $card; rows = $rows }
[IO.File]::WriteAllText((Join-Path $root 'data\ordinance.json'), ($out | ConvertTo-Json -Depth 5 -Compress), $enc)

"「$NAME」 시행 $ef · 21종 중 조례에 값이 있는 종 $($meta.listed)개 → $csvPath"
"카드: $($card.value) $($card.unit) · $($card.source)"
