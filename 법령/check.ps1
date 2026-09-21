<#
  법령 검증 기록 — 법령ID · 시행일 · 소관기관 · 검색시점이 맞는지 표로 쌓음
    1) 대상목록.csv 의 법령마다 검색(lawSearch)으로 제명이 정확히 일치하는 현행본을 고르고
    2) 본문(lawService)을 받아 검색 응답과 본문 응답의 법령ID·시행일·기관을 서로 대조하고
    3) 조회 시점에 현행인지(시행일 ≤ 조회일), 시행예정 개정본이 있는지, 직전 기록보다 버전이 바뀌었는지 판정해
    4) 조회기록.csv 에 조문마다 한 줄씩 덧붙임 (지우지 않음 — 조회할 때마다 계속 쌓임)
    5) README.md 의 "최신 검증 결과" 표를 다시 씀
  인증키는 환경변수 LAW_OC 에서만 읽고 어떤 파일에도 적지 않음 (3주차 비교과 14쪽)
  실행 (저장소 최상위에서): powershell -ExecutionPolicy Bypass -File 법령\check.ps1
#>
param([string]$By = "")
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$dir = $PSScriptRoot
$OC = $env:LAW_OC
if (-not $OC) { $OC = [Environment]::GetEnvironmentVariable('LAW_OC', 'User') }
if (-not $OC) { throw "환경변수 LAW_OC 가 없습니다. [Environment]::SetEnvironmentVariable('LAW_OC','내OC','User') 실행 후 창을 새로 여세요." }
if (-not $By) { $By = (git -C $dir config user.name) 2>$null; if (-not $By) { $By = $env:USERNAME } }

$now = Get-Date
$stamp = $now.ToString('yyyy-MM-dd HH:mm')
$today = $now.ToString('yyyyMMdd')
$wc = New-Object Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
function L($x) { if ($null -eq $x) { @() } else { @($x) } }
function D([string]$s) { if ($s -match '^\d{8}$') { '{0}-{1}-{2}' -f $s.Substring(0, 4), $s.Substring(4, 2), $s.Substring(6, 2) } else { $s } }
function Get-Json([string]$url) {
  $j = $wc.DownloadString($url) | ConvertFrom-Json
  if ($j.result) { throw "거절 응답: $($j.result) / $($j.msg)" }   # HTTP 200 이어도 result·msg 가 있으면 거절
  $j
}
function Mark($a, $b) { if ("$a" -ne '' -and "$a" -eq "$b") { '일치' } else { '불일치' } }
$base = 'https://www.law.go.kr/DRF'

$logPath = Join-Path $dir '조회기록.csv'
$old = if (Test-Path $logPath) { @(Import-Csv $logPath -Encoding UTF8) } else { @() }
$new = New-Object System.Collections.Generic.List[object]

foreach ($t in Import-Csv (Join-Path $dir '대상목록.csv') -Encoding UTF8) {
  $name = $t.법령명; $isOrdin = ($t.구분 -eq '자치법규')
  $arts = $t.조 -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  Write-Host "`n$name ($($t.구분))" -ForegroundColor Cyan

  # 1) 검색 — 제명이 정확히 일치하는 현행본
  if ($isOrdin) {
    $s = Get-Json ("$base/lawSearch.do?OC=$OC&target=ordin&type=JSON&display=100&query=" + [uri]::EscapeDataString($name))
    $hit = L $s.OrdinSearch.law | Where-Object { $_.자치법규명 -eq $name } | Select-Object -First 1
    $sId = $hit.자치법규ID; $sSerial = $hit.자치법규일련번호; $sEf = $hit.시행일자; $sOrg = $hit.지자체기관명
  } else {
    $s = Get-Json ("$base/lawSearch.do?OC=$OC&target=law&type=JSON&display=100&query=" + [uri]::EscapeDataString($name))
    $hit = L $s.LawSearch.law | Where-Object { $_.법령명한글 -eq $name -and $_.현행연혁코드 -eq '현행' } | Select-Object -First 1
    $sId = $hit.법령ID; $sSerial = $hit.법령일련번호; $sEf = $hit.시행일자; $sOrg = $hit.소관부처명
  }
  if (-not $hit) { Write-Host "  제명이 정확히 일치하는 법령 없음 — 건너뜀" -ForegroundColor Yellow; continue }

  # 2) 본문
  if ($isOrdin) {
    $svc = (Get-Json "$base/lawService.do?OC=$OC&target=ordin&type=JSON&MST=$sSerial").LawService
    $bi = $svc.자치법규기본정보
    $bId = $bi.자치법규ID; $bEf = $bi.시행일자; $bOrg = $bi.지자체기관명
    $units = L $svc.조문.조 | Where-Object { $_.조문여부 -eq 'Y' }   # N = 장·절 제목(같은 번호로 먼저 나옴)
  } else {
    $svc = (Get-Json "$base/lawService.do?OC=$OC&target=law&type=JSON&MST=$sSerial").법령
    $bi = $svc.기본정보
    $bId = $bi.법령ID; $bEf = $bi.시행일자; $bOrg = $bi.소관부처.content
    $units = L $svc.조문.조문단위 | Where-Object { $_.조문여부 -eq '조문' }
  }

  # 3) 시행예정 개정본 (법률·대통령령만 — 시행일법령 검색)
  $pending = '해당 없음(자치법규)'
  if (-not $isOrdin) {
    $e = Get-Json ("$base/lawSearch.do?OC=$OC&target=eflaw&type=JSON&display=100&nw=2&query=" + [uri]::EscapeDataString($name))
    $up = L $e.LawSearch.law | Where-Object { $_.법령ID -eq $sId -and $_.시행일자 -gt $today } | Sort-Object 시행일자 | Select-Object -First 1
    $pending = if ($up) { "있음 — MST $($up.법령일련번호) · 시행 $(D $up.시행일자)" } else { '없음' }
  }

  foreach ($a in $arts) {
    # 조문 찾기 — 없는 조 번호를 보내도 거절 문구 없이 빈 응답이 오므로 조문번호를 직접 대조
    $m = [regex]::Match($a, '^(\d+)(?:의(\d+))?$')
    $want = '{0:D4}{1:D2}' -f [int]$m.Groups[1].Value, $(if ($m.Groups[2].Success) { [int]$m.Groups[2].Value } else { 0 })
    if ($isOrdin) {
      $u = $units | Where-Object { (@($_.조문번호)[0]).Trim() -like "$want*" } | Select-Object -First 1
      $title = $u.조제목; $artEf = ''
    } else {
      $u = $units | Where-Object { ('{0:D4}{1:D2}' -f [int]$_.조문번호, $(if ($_.조문가지번호) { [int]$_.조문가지번호 } else { 0 })) -eq $want } | Select-Object -First 1
      $title = $u.조문제목; $artEf = D $u.조문시행일자
    }
    $label = "제$($m.Groups[1].Value)조" + $(if ($m.Groups[2].Success) { "의$($m.Groups[2].Value)" } else { '' })

    $idOk = Mark $sId $bId; $efOk = Mark $sEf $bEf; $orgOk = Mark $sOrg $bOrg
    $current = if ($bEf -and $bEf -le $today) { '현행' } else { '아직 시행 전' }
    $prev = $old | Where-Object { $_.법령명 -eq $name -and $_.조 -eq $label } | Select-Object -Last 1
    $diff = if (-not $prev) { '최초 기록' }
            elseif ($prev.'MST(일련번호)' -ne $sSerial) { "버전 바뀜 — $($prev.'MST(일련번호)') → $sSerial" }
            else { "변동 없음 (직전 $($prev.조회일시))" }
    $problems = @()
    if (-not $u) { $problems += '조문 없음' }
    foreach ($p in @(@('법령ID', $idOk), @('시행일', $efOk), @('기관', $orgOk))) { if ($p[1] -ne '일치') { $problems += "$($p[0]) 불일치" } }
    if ($current -ne '현행') { $problems += '시행 전' }
    $verdict = if ($problems) { '확인 필요: ' + ($problems -join ', ') } else { '정상' }

    $row = [pscustomobject][ordered]@{
      조회일시 = $stamp; 조회자 = $By; 구분 = $t.구분; 법령명 = $name; 조 = $label; 조문제목 = $title
      '법령ID(검색)' = $sId; '법령ID(본문)' = $bId; 법령ID확인 = $idOk
      'MST(일련번호)' = $sSerial
      '시행일(검색)' = D $sEf; '시행일(본문)' = D $bEf; 조문시행일 = $artEf; 시행일확인 = $efOk
      '기관(검색)' = $sOrg; '기관(본문)' = $bOrg; 기관확인 = $orgOk
      검색시점 = $current; 시행예정본 = $pending; 직전기록대비 = $diff; 판정 = $verdict
      조회경로 = "law.go.kr OPEN API · $(if ($isOrdin) { 'target=ordin' } else { 'target=law' }) 검색 → 본문"
    }
    $new.Add($row)
    Write-Host ("  {0} {1} · ID {2} · 시행 {3} · {4} · {5}" -f $label, $title, $idOk, $efOk, $orgOk, $verdict)
  }
}

# 4) 덧붙여 저장 — 예전 기록은 그대로 두고 이번 줄만 뒤에 붙임
$all = @($old) + $new.ToArray()
$all | Export-Csv $logPath -NoTypeInformation -Encoding UTF8

# 5) README 의 최신 표 다시 쓰기
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('# 법령 검증 기록')
[void]$md.AppendLine()
[void]$md.AppendLine('팀이 인용하는 법령·조례의 **법령ID · 시행일 · 소관기관 · 검색시점**이 맞는지 조회할 때마다 확인하고, 그 결과를 [`조회기록.csv`](조회기록.csv)에 한 줄씩 **계속 쌓는** 폴더입니다. 전체 기록은 [표 화면](https://choemyeongwon1-ui.github.io/kaya/%EB%B2%95%EB%A0%B9/)에서 볼 수 있습니다.')
[void]$md.AppendLine()
[void]$md.AppendLine("## 최신 검증 결과 — $stamp · $By")
[void]$md.AppendLine()
[void]$md.AppendLine('| 법령명 | 조 | 법령ID | MST(일련번호) | 시행일 | 기관 | 검색시점 | 시행예정본 | 직전 기록 대비 | 판정 |')
[void]$md.AppendLine('|---|---|---|---|---|---|---|---|---|---|')
foreach ($r in $new) {
  $ok = { param($v) if ($v -eq '일치') { '✅' } else { '❌' } }
  [void]$md.AppendLine(("| {0} | {1} {2} | {3} {4} | {5} | {6} {7} | {8} {9} | {10} | {11} | {12} | {13} |" -f `
    $r.법령명, $r.조, $r.조문제목, $r.'법령ID(검색)', (& $ok $r.법령ID확인), $r.'MST(일련번호)', $r.'시행일(본문)', (& $ok $r.시행일확인),
    $r.'기관(본문)', (& $ok $r.기관확인), $r.검색시점, $r.시행예정본, $r.직전기록대비, $(if ($r.판정 -eq '정상') { '✅ 정상' } else { '⚠️ ' + $r.판정 })))
}
[void]$md.AppendLine()
[void]$md.AppendLine("누적 $($all.Count)줄 · 이번 $($new.Count)줄 · ✅ = 검색 응답과 본문 응답의 값이 같음")
[void]$md.AppendLine()
[void]$md.AppendLine(@'
## 무엇을 확인하나

| 칸 | 확인 방법 |
|---|---|
| 법령ID | 검색(lawSearch) 응답의 ID와 본문(lawService) 응답의 ID가 같은지 |
| 시행일 | 검색이 안내한 시행일과 본문의 시행일이 같은지 — 다르면 옛 버전을 받은 것 (3주차 비교과 22쪽) |
| 기관 | 법률·대통령령은 소관부처, 자치법규는 지자체기관이 검색·본문에서 같은지 |
| 검색시점 | 조회일시를 적고, 그 시점에 시행 중인지(시행일 ≤ 조회일) · 시행예정 개정본이 있는지 |
| 직전 기록 대비 | 같은 법령·조의 바로 앞 기록과 MST(일련번호)가 다르면 "버전 바뀜"으로 표시 |
| 조문 | 없는 조 번호도 거절 없이 빈 응답이 오므로 조문번호를 직접 대조 |

## 쓰는 법

1. 인용할 법령을 [`대상목록.csv`](대상목록.csv)에 한 줄 추가 (구분 · 법령명 · 조를 `;`로 구분)
2. 저장소 최상위에서 실행 — 인증키는 환경변수 `LAW_OC`에만 둠
   ```
   powershell -ExecutionPolicy Bypass -File 법령\check.ps1
   ```
3. `조회기록.csv`에 줄이 붙고 이 README의 표가 새로 써짐 → 커밋 전 인증키가 섞이지 않았는지 확인하고 커밋

`조회기록.csv`의 예전 줄은 고치거나 지우지 않습니다. 틀린 기록도 그 시점의 기록으로 남깁니다.
'@)
[IO.File]::WriteAllText((Join-Path $dir 'README.md'), $md.ToString(), (New-Object Text.UTF8Encoding $false))

$bad = @($new | Where-Object { $_.판정 -ne '정상' }).Count
Write-Host ("`n이번 {0}줄 기록 (확인 필요 {1}줄) · 누적 {2}줄 → {3}" -f $new.Count, $bad, $all.Count, $logPath) -ForegroundColor $(if ($bad) { 'Yellow' } else { 'Green' })

# 커밋 전 인증키 섞임 확인
$leak = Get-ChildItem $dir -File | Where-Object { [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8).Contains($OC) }
Write-Host ("인증키 섞임 확인: 법령 폴더 파일 {0}개 중 키 포함 {1}개" -f @(Get-ChildItem $dir -File).Count, @($leak).Count) -ForegroundColor $(if ($leak) { 'Red' } else { 'Green' })
