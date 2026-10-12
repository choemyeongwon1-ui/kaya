# -*- coding: utf-8 -*-
"""만들기.py 결과로 제출용 과제.html 을 만든다 → Edge 로 PDF 인쇄.

  py 보고서.py
"""
import csv, html, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")
rd = lambda f: list(csv.DictReader(open(os.path.join(HERE, f), encoding="utf-8-sig")))
E = lambda s: html.escape(str(s))
R = json.load(open(os.path.join(HERE, "raw", "_결과.json"), encoding="utf-8"))
V = json.load(open(os.path.join(HERE, "01_4축표_값.json"), encoding="utf-8"))
FOUR, S, T, ORDER, REV, WT, UP = R["four"], R["S"], R["T"], R["order"], R["rev"], R["wt"], R["up"]
W = [r for r in rd("04_매트릭스_지표가중치_가안.csv") if r["번호"].startswith("I")]
X = {r["대안"]: r for r in rd("05_매트릭스_지표값.csv")}
AREA = rd("03_배분대안_3안.csv")
IND6 = rd("02_지표6_경사향.csv")
ALTS = list(X)
TODAY = V["조회일"]
TAG = {"충족": "t-n", "조건부": "t-w", "미충족": "t-x", "지표 없음": "t-q", "미확인": "t-q"}
tag = lambda j: '<span class="tag %s">%s</span>' % (TAG.get(j, "t-q"), E(j))


def count(site):
    out = {}
    for r in FOUR:
        d = out.setdefault(r["용도"], {"충족": 0, "조건부": 0, "미충족": 0})
        if r["%s 판정" % site] in d:
            d[r["%s 판정" % site]] += 1
    return out


rows4 = []
prev = None
for r in FOUR:
    first = r["용도"] != prev
    prev = r["용도"]
    rows4.append("<tr>%s<td>%s</td><td>%s<br><span class='small'>%s</span></td><td class='small'>%s</td>%s<td class='small'>%s</td></tr>" % (
        "<td class='k' rowspan='4'>%s</td>" % E(r["용도"]) if first else "", E(r["축"]), E(r["요건 문장"]), E(r["근거"]), E(r["조회 지표"]),
        "".join("<td class='v'>%s<br>%s</td>" % (E(r["%s 값" % s]), tag(r["%s 판정" % s])) for s in ("창신초", "종로구청")),
        E(r["판정 기준(가정)"])))

cnt = {s: count(s) for s in ("창신초", "종로구청")}
summ = "".join("<tr><td class='k'>%s</td>%s</tr>" % (u, "".join(
    "<td>충족 %d · 조건부 %d · 미충족 %d</td>" % (cnt[s][u]["충족"], cnt[s][u]["조건부"], cnt[s][u]["미충족"]) for s in ("창신초", "종로구청")))
    for u in ("녹지", "상업업무", "주거", "공업"))

v6 = "".join("<tr><td>%s</td><td>%s</td><td class='v'>%s%%</td><td class='v'><b>%s%%</b> · %s ha</td><td class='small'>국토지리정보원 90 m</td><td class='small'>LT_C_UQ111~114</td><td class='v'>%s</td></tr>" % (
    E(r["후보지"]), E(r["임계값"]), E(r["경사 조건 충족(%)"]), E(r["경사·향·표고 동시 충족(%)"]), E(r["적합면적(ha)"]), E(r["조회일"])) for r in IND6)
BND = IND6[0].get("경계 처리", "")

uses = ["녹지", "기반·공공(존치)", "공업", "상업업무", "주거"]
area = {(r["대안"], r["용도"]): r for r in AREA}
va = "".join("<tr><td class='k'>%s</td>%s</tr>" % (u, "".join(
    "<td class='v'>%s ha · %s%%</td>" % (area[(a, u)]["면적(ha)"], area[(a, u)]["구성비(%)"]) for a in ALTS)) for u in uses)

mx = "".join("<tr><td>%s</td><td class='small'>%s</td><td>%s<br><span class='small'>%s</span></td><td class='v'>%.2f</td>%s</tr>" % (
    E(w["번호"]), E(w["국토계획평가 기준(「국토기본법」 제19조의2)"]), E(w["지표"]), E(w["정의(계산식)"]), WT[w["번호"]],
    "".join("<td class='v'>%s%% → <b>%d</b></td>" % (E(X[a][w["번호"]]), S[a][w["번호"]]) for a in ALTS)) for w in W)
tot = "".join("<td class='v'><b>%.2f</b> (%d위)</td>" % (T[a], ORDER.index(a) + 1) for a in ALTS)
rv = "".join("<tr><td>%s</td><td class='v'>%.2f</td><td class='v'>%s</td><td>%s</td></tr>" % (
    E(r["지표"]), r["현재 가중치"], E(r["역전 가중치"]) if r["역전 가중치"] != "" else "—", E(r["해석"])) for r in REV)

c, g = V["값"]["창신초"], V["값"]["종로구청"]
ar = lambda a, u: float(area[(a, u)]["면적(ha)"])
c15 = next(r for r in IND6 if r["후보지"] == "창신초" and "15" in r["임계값"])
w1 = next(r for r in REV if r["지표"] == "I1")["역전 가중치"]
doc = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>6주차 과제 — 입지인자 4축 표·배분 대안·대안 비교 매트릭스</title>
<style>
@page {{ size: A4; margin: 12mm 11mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: "Noto Sans KR","Malgun Gothic",sans-serif; color:#1b1b1b; font-size:8.6pt; line-height:1.42; margin:0; background:#fff; }}
h1 {{ font-size:14.5pt; margin:0 0 2px; color:#12305e; }}
h2 {{ font-size:11.5pt; margin:11px 0 5px; color:#12305e; border-bottom:2px solid #12305e; padding-bottom:2px; }}
.meta {{ color:#555; font-size:8.2pt; margin-bottom:5px; }}
table {{ width:100%; border-collapse:collapse; margin:3px 0 5px; }}
th, td {{ border:1px solid #c9d2df; padding:3px 4px; vertical-align:top; text-align:left; }}
th {{ background:#12305e; color:#fff; font-weight:600; font-size:8pt; }}
td.k {{ background:#eef3fa; font-weight:700; color:#12305e; white-space:nowrap; }}
td.v {{ white-space:nowrap; font-variant-numeric:tabular-nums; }}
.small {{ font-size:7.6pt; color:#555; }}
.note {{ background:#f6f6f2; border-left:4px solid #999; padding:5px 8px; font-size:8pt; margin:4px 0; }}
.key {{ background:#eef3fa; border-left:4px solid #1d4f91; padding:5px 8px; font-weight:600; margin:5px 0; }}
.tag {{ display:inline-block; padding:0 5px; border-radius:3px; font-size:7.6pt; font-weight:700; color:#fff; }}
.t-x {{ background:#c0392b; }} .t-w {{ background:#d68910; }} .t-q {{ background:#7f8c8d; }} .t-n {{ background:#2e7d4f; }}
.page {{ page-break-after: always; }} .page:last-child {{ page-break-after: auto; }}
</style></head><body>

<div>
<h1>6주차 과제 — 입지인자 4축 표 · 지표 ⑥ · 배분 대안 3안 · 대안 비교 매트릭스 · 가중치 역전점</h1>
<div class="meta">스마트도시계획(캡스톤디자인) · 상명대학교 그린스마트시티학과 · 최명원 · 팀 저장소 github.com/choemyeongwon1-ui/kaya<br>
<b>후보지</b> ① 창신초(종로구 창신동 128-32) ② 종로구청(종로구 수송동 146-12) — 각 반경 400 m(50.3 ha), 지형은 국토지리정보원 공개DEM 90 m 셀(0.81 ha), 배분은 격자 30 m 표본 561점(0.09 ha) · <b>조회일</b> {today}<br>
자료: 브이월드 2D 데이터 API 2.0(용도지역·공원녹지 결정·국가유산·교육환경보호구역·연속지적도) · 국토지리정보원 공개DEM 90 m(2025 · 도엽 37608·37705, 국토정보플랫폼) · OpenStreetMap 간선도로·역. 좌표는 지오코더로 실행 때마다 구하고 저장하지 않음(지오코더 2.0 이용조건).</div>

<h2>① 입지인자 4축 표 — 요건 문장·근거 번호·조회값</h2>
<table>
<tr><th style="width:7%">용도</th><th style="width:6%">축</th><th style="width:33%">요건 문장 · 근거</th><th style="width:14%">조회 지표</th><th style="width:10%">창신초</th><th style="width:10%">종로구청</th><th>판정 기준(가정)</th></tr>
{rows4}
</table>
<table style="width:70%">
<tr><th>용도</th><th>창신초</th><th>종로구청</th></tr>{summ}
</table>
<div class="key">판단 — 창신초는 녹지(급경사 {c25}% · 공원·녹지 결정 {cpk}%)와 주거(배후 주거 {cres}%)에 맞고, 지형(경사 10% 이하 {c10}%)이 주거의 조건부 요인이다. 공업은 평지 {c5}%·주거지역 {cres}%로 부적합.
종로구청은 평지({g10}%가 경사 10% 이하)·역 {gst}·간선 접근({gart}%)으로 상업업무에 맞는다. 주거 4축 값은 충족이나 현행 지정의 {gcom}%가 상업·준주거라 주거 배분은 정합성이 낮고(원본 10번 지대지불능력), 공업도 도심 한가운데라 지대·이격 원칙에 어긋난다.</div>
<div class="note">배분 대안은 <b>창신초</b>에서 만든다 — 팀 계획단위 가설 H-C′의 대상지이고, 먼저 확정해야 할 녹지(급경사·공원 결정)가 있어 배분 순서의 차이가 드러난다. 종로구청 원은 녹지 선확정 대상이 거의 없어(25% 초과 0%) 대안 간 차이가 작다.</div>
</div>

<div>
<h2>② 지표 ⑥ — 경사·향·표고 적합면적 비율 (임계값 3개 · DEM 출처 · 조회일)</h2>
<table>
<tr><th>후보지</th><th>임계값</th><th>경사 조건만</th><th>① 값 — 경사·향·표고 동시 충족</th><th>③ DEM</th><th>④ 브이월드 레이어</th><th>⑤ 조회일</th></tr>{v6}
</table>
<div class="note">향 135~225°(북 0° 시계방향, 남향 ±45°) · 표고 = 원 안 최저 표고(간선 기반시설 기준) +50 m 이내 <b>가정</b> · 임계값 10·15·25%는 교재 범위(4% 이상적·10% 권장·25% 한계, 원본 19번) 안의 가정 · DEM 국토지리정보원 공개DEM 90 m(2025, EPSG:5179) · 경사·향은 3×3 Horn 법 · 적합면적 = 참 셀 수 × 0.81 ha · 경계 처리: {bnd} · 조회 {today}.
90 m DEM 이라 그보다 작은 급경사는 드러나지 않는다. 창신초는 경사만 보면 15% 기준 {c15s}%가 적합하지만, 향·표고까지 겹치면 {c15b}%로 줄어든다. 종로구청은 거의 평지(경사 10% 이하 100%)라 향 판정의 의미가 약하다.</div>

<h2>③ 배분 대안 3안 — 창신초 반경 400 m · 녹지 선확정 후 배분만 변경</h2>
<div class="key">배분 순서(원본 25~34번, 6주차 44쪽): ① 녹지 → ② 공업 → ③ 상업업무 → ④ 주거(잔여). 녹지와 기반·공공은 세 대안에 똑같이 먼저 확정하고, 남은 땅의 ②~④ 규칙만 바꾼다.</div>
<table>
<tr><th style="width:18%">공통 확정</th><th>규칙</th></tr>
<tr><td class="k">기반·공공(존치)</td><td>지목 도로·철도·하천·구거·학교·종교 — 도로망·학교는 배분 대상에서 뺌</td></tr>
<tr><td class="k">① 녹지</td><td>공원·녹지 결정(브이월드 도시계획시설 공간시설) ∪ 지목 공원·임야 ∪ 문화재보호구역 ∪ 경사 25% 초과(주거 개발한계, 원본 19번)</td></tr>
</table>
<table>
<tr><th style="width:15%">대안</th><th>② 공업</th><th>③ 상업업무</th><th>④ 주거</th></tr>
<tr><td class="k">A 근린주거형<br><span class="small">≈ 47쪽 보전 우선</span></td><td>배치 안 함</td><td>현행 상업·준주거만</td><td>나머지 전부</td></tr>
<tr><td class="k">B 일자리형<br><span class="small">≈ 47쪽 개발 우선</span></td><td>경사 5% 이하 · 간선 150 m 이내 · 현행 상업 아님(원본 21번)</td><td>현행 상업·준주거 + 간선 100 m 이내·경사 10% 이하</td><td>나머지</td></tr>
<tr><td class="k">C 절충형<br><span class="small">≈ 47쪽 절충</span></td><td>경사 5% 이하 · 간선 100 m 이내 · 교육환경보호구역 밖</td><td>현행 상업·준주거만</td><td>나머지</td></tr>
</table>
<table>
<tr><th>용도</th>{alts_h}</tr>{va}
</table>
<div class="key">녹지 확보기준 확인(52쪽, 「도시공원법 시행규칙」 제4조·별표 2): 원 50.3 ha 는 30만~100만㎡ 구간 → 부지의 9% = 4.5 ha. 녹지 {gha} ha({gpc}%), 그중 공원·녹지 결정만 {cpk}% → 기준 충족. 1인당 6㎡ 기준은 인구(SGIS) 조회 대기라 미산정.</div>
<div class="note">47쪽 대안은 녹지 총량이 다르지만, 이 과제는 "녹지를 먼저 확정한 뒤 배분만 변경"이라 녹지는 세 안 동일하고 개발용지 규모로 보전·개발·절충을 나눴다. 목표인구를 두지 않아(인구 미조회) B 안의 주거 면적 감소({ra} → {rb} ha, {rd}%)는 매트릭스 밖 득실로 아래 대차대조표에 적었다. 공업은 창신동 봉제업 같은 도시형 공업(준공업 성격, 시행령 제30조)을 가정했다. C안은 교육환경보호구역(원의 {cedu}%)을 피하자 공업이 {ic} ha 로 줄어 주거 사이에 조각으로 남았다 — 매트릭스 I4 에서 드러난다.</div>
</div>

<div class="page">
<h2>④ 대안 비교 매트릭스 — 지표·가중치 사전 확정(가안) 후 채점</h2>
<div class="key">작성 순서(6주차 59쪽): 지표 6개 확정 → 가중치(합 1.00) → <span style="color:#b04a14">교수자 승인 대기</span> → 5점 척도 채점 → 역전점 검증. 지표·가중치·채점 구간은 지표값 계산 전에 <span class="small">04_매트릭스_지표가중치_가안.csv</span> 로 먼저 고정했고, 결과를 본 뒤 고치지 않았다.</div>
<table>
<tr><th style="width:4%">지표</th><th style="width:13%">국토계획평가 기준</th><th style="width:30%">지표 · 정의</th><th style="width:6%">가중치</th>{alts_h2}</tr>
{mx}
<tr><td colspan="3" class="k">총점 = Σ 가중치 × 점수 (목표-성취 분석, 힐 1968)</td><td class="v">1.00</td>{tot}</tr>
</table>
<div class="note">채점 구간(고정): 클수록 좋음 0~20% → 1 · 20~40 → 2 · 40~60 → 3 · 60~80 → 4 · 80~100 → 5, 작을수록 좋음(I4)은 반대. 가중치 근거: 팀 가설 H-C′(근린주구)에 맞춰 균형발전·친환경·정합성(각 0.20)을 경쟁력·충돌(각 0.15)·간선 접근(0.10)보다 높게 둠.
<b>예시와 다른 지표:</b> ④ 자원관리의 슬라이드 예시 '공원·녹지 비율'은 녹지를 세 안 동일하게 고정해 차이가 0 이라 공업–주거 충돌(원본 21번 이격)로 바꿨고, ⑥ 정합성은 상위계획(기본계획) 대신 현행 관리계획(용도지역)과의 일치로 잰 대용 지표다.
<b>변별력 없음:</b> I2·I3 은 세 대안 모두 5점 — 녹지를 먼저 같은 범위로 확정했기 때문에(녹지가 원의 {gpc}%) 주거와 녹지 거리가 대안마다 다르지 않다. 승인 단계에서 유치거리를 250 m 보다 짧게 잡거나 다른 지표로 바꿀지 검토가 필요하다(사후 수정은 하지 않음).</div>

<h2>계획 대차대조표 — 대안별 얻는 것(+)과 잃는 것(−) (리치필드 1976 방식, 56쪽)</h2>
<table>
<tr><th style="width:16%">피영향 집단</th><th>A 근린주거형</th><th>B 일자리형</th><th>C 절충형</th></tr>
<tr><td class="k">주민(주거 수요)</td><td>+ 주거 {ra} ha 최대</td><td>− 주거 {rb} ha({rd}%)</td><td>+ 주거 {rc} ha</td></tr>
<tr><td class="k">봉제 소공인(일자리)</td><td>− 공업용지 0 — 기존 공장 이전 압박</td><td>+ 공업 {ib} ha · 상업 {cb} ha</td><td>− 공업 {ic} ha 조각뿐</td></tr>
<tr><td class="k">학생·학교</td><td>+ 영향 없음</td><td>− 공업 규칙이 교육환경보호구역(원의 {cedu}%)을 빼지 않음 — 교육환경보호법 제9조 검토 필요</td><td>+ 보호구역 밖에만 공업</td></tr>
<tr><td class="k">인접 주거환경</td><td>+ 공업–주거 충돌 0%</td><td>− 공업의 {b4}%가 주거와 50 m 이내</td><td>− 조각 공업 전부(100%)가 주거 인접</td></tr>
</table>
<h2>⑤ 가중치 역전점 — 1위·2위가 바뀌는 가중치</h2>
<table>
<tr><th style="width:8%">지표</th><th style="width:12%">현재 가중치</th><th style="width:14%">역전 가중치</th><th>해석 ({first} 1위 · {second} 2위)</th></tr>{rv}
</table>
<div class="key">1위 {first}({t1:.2f})는 I1 일자리 공간 비율 가중치가 0.15 에서 <b>{w1} 이상</b>(약 {w1x:.1f}배)으로 커질 때만 {second}에게 1위를 내준다. 다른 지표는 0~1 범위 어디서도 1·2위가 바뀌지 않는다 — 순위는 "일자리를 얼마나 중시하는가" 하나에 걸려 있다.</div>
<div class="note">역전점 계산: 지표 k 의 가중치를 w 로 바꾸고 나머지를 (1−w)/(1−w<sub>k</sub>) 배로 줄여 합 1.00 을 유지 → 대안 총점 = w·s<sub>k</sub> + (1−w)·B, B = (현재 총점 − w<sub>k</sub>·s<sub>k</sub>)/(1−w<sub>k</sub>). 두 대안 총점이 같아지는 w. 매트릭스 원본(05_대안비교_매트릭스.xlsx)은 가중치 칸만 바꾸면 점수·순위·역전점이 수식으로 다시 계산된다.</div>

<h2>한계 · 재현</h2>
<div class="note">① 대안은 도면 설계가 아니라 격자 규칙 배분이다 — 블록·가로망·밀도는 다루지 않았다. ② DEM 90 m · 표본 30 m 라 작은 급경사와 옹벽은 반영되지 않는다. ③ 용도지역·공원 결정은 브이월드 현행 지정이라 고시 중인 계획안(창신동23 지구단위 등)은 반영되지 않을 수 있다. ④ 인구(지표 ②)가 없어 공원 1인당 기준(6㎡)과 주거 수용인구는 계산하지 않았다 — SGIS 인증키 필요.
재현: <span class="small">py 분석.py → py 만들기.py → py 보고서.py</span> (환경변수 VWORLD_KEY · VWORLD_DOMAIN) · 산출 01_입지인자_4축표.csv · 02_지표6_경사향.csv · 03_배분대안_3안.csv · 04_매트릭스_지표가중치_가안.csv · 05_대안비교_매트릭스.xlsx · 06_가중치_역전점.csv.<br>
<b>참고문헌(APA)</b><br>
대한국토·도시계획학회. (2015). <i>토지이용계획론</i>. 보성각. · Chapin, F. S., & Kaiser, E. J. (1979). <i>Urban land use planning</i> (3rd ed.). University of Illinois Press. ·
Hill, M. (1968). A goals-achievement matrix for evaluating alternative plans. <i>Journal of the American Institute of Planners, 34</i>(1), 19–29. ·
김태한. (2026). <i>스마트도시계획(캡스톤디자인) 6주차 강의자료: 입지조건 — 용도를 고르는 땅의 성질</i> [강의자료]. 상명대학교. ·
「국토기본법」 제19조의2 (시행 2026. 6. 2.) · 「국토의 계획 및 이용에 관한 법률」 제25조·제36조 (시행 2026. 7. 1.) · 같은 법 시행령 제30조 (시행 2026. 9. 8.) · 「도시공원 및 녹지 등에 관한 법률」 제15조·제35조 (시행 2026. 8. 27.) · 같은 법 시행규칙 제4조·별표 2·3 · 「교육환경 보호에 관한 법률」 제9조. ·
공간정보산업진흥원. (2026). <i>브이월드 2D 데이터 API 2.0</i> [Data set]. Retrieved {today}, from https://www.vworld.kr ·
국토지리정보원. (2025). <i>공개 수치표고모형(DEM) 90 m — 도엽 37608·37705</i> [Data set]. 국토정보플랫폼. Retrieved {today}, from https://map.ngii.go.kr ·
OpenStreetMap contributors. (2026). <i>OpenStreetMap</i> [Data set]. Retrieved {today}, from https://www.openstreetmap.org</div>
</div>
</body></html>""".format(
    today=TODAY, rows4="".join(rows4), summ=summ, v6=v6, va=va, mx=mx, tot=tot, rv=rv,
    alts_h="".join("<th>%s</th>" % E(a) for a in ALTS), alts_h2="".join("<th>%s<br>값 → 점수</th>" % E(a) for a in ALTS),
    first=ORDER[0], second=ORDER[1], t1=T[ORDER[0]],
    c25=c["경사 25% 초과(%)"], cpk=c["공원·녹지 결정(%)"], cres=c["주거지역(%)"], c10=c["경사 10% 이하(%)"], c5=c["경사 5% 이하(%)"],
    g10=g["경사 10% 이하(%)"], gst=g["최근접 도시철도역"], gart=g["간선 100 m 이내(%)"], gcom=g["상업·준주거(%)"], cedu=c["교육환경보호구역(%)"], bnd=E(BND), c15s=c15["경사 조건 충족(%)"], c15b=c15["경사·향·표고 동시 충족(%)"],
    gha=area[("A 근린주거형", "녹지")]["면적(ha)"], gpc=area[("A 근린주거형", "녹지")]["구성비(%)"],
    ra=ar("A 근린주거형", "주거"), rb=ar("B 일자리형", "주거"), rc=ar("C 절충형", "주거"),
    rd=round(100 * (ar("B 일자리형", "주거") - ar("A 근린주거형", "주거")) / ar("A 근린주거형", "주거")),
    ib=ar("B 일자리형", "공업"), cb=ar("B 일자리형", "상업업무"), ic=ar("C 절충형", "공업"),
    w1=w1, w1x=(w1 / 0.15 if w1 != "" else 0), b4=X["B 일자리형"]["I4"])
open(os.path.join(HERE, "과제.html"), "w", encoding="utf-8").write(doc)
print("과제.html 저장")
