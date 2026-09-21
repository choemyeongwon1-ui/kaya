"""CSV·계측 결과로 제출용 과제.html 을 만든다. PDF 는 headless 브라우저로 출력.

    python make_report.py
    msedge --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=과제.pdf 과제.html
"""
import csv
import html
import json

AUTHOR = "JUNHO313"
REPO = "https://github.com/choemyeongwon1-ui/kaya"
FOLDER = "3주차_과제_JUNHO313"

log = list(csv.DictReader(open("02_법령검증로그.csv", encoding="utf-8-sig")))
table = list(csv.DictReader(open("03_서울시_조례_21종표.csv", encoding="utf-8-sig")))
fac = list(csv.DictReader(open("data/계측_창신초_400m.csv", encoding="utf-8-sig")))
S = json.load(open("data/계측_요약.json", encoding="utf-8"))
osm = json.load(open("data/osm_changsin_900m.json", encoding="utf-8"))["elements"]
e = html.escape


# ── 400 m 원 개략도 (OSM 좌표 → 중심 기준 m) ──────────────────────────
def svg_map():
    import math
    c0, c1 = S["중심"]["좌표"]
    k = 0.30  # px per m
    W = H = 460
    ox, oy = W / 2, H / 2

    def P(x, y):
        return ox + x * k, oy - y * k

    def xy(lat, lon):
        return ((lon - c1) * 111320 * math.cos(math.radians(c0)), (lat - c0) * 110540)

    parts = [f'<svg viewBox="0 0 {W} {H}" width="{W*0.72:.0f}" height="{H*0.72:.0f}" xmlns="http://www.w3.org/2000/svg" '
             'font-family="Noto Sans KR, Malgun Gothic, sans-serif">',
             f'<rect width="{W}" height="{H}" fill="#fafaf7"/>']
    # 지봉로 동쪽 활꼴 음영
    cx, cy = P(0, 0)
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{400*k}" fill="#e8eef7" stroke="#1d4f91" stroke-width="1.5"/>')
    d = S["R2_지봉로_중심에서_동쪽_m"]
    h = math.sqrt(400**2 - d**2)
    x1, y1 = P(d, h)
    x2, y2 = P(d, -h)
    parts.append(f'<path d="M{x1},{y1} A{400*k},{400*k} 0 0 1 {x2},{y2} Z" fill="#f6d5c3" opacity=".85"/>')
    style = {"primary": ("#c0392b", 3.2), "secondary": ("#d35400", 2.6), "tertiary": ("#7f8c8d", 1.4)}
    for el in osm:
        t = el.get("tags", {})
        if "highway" in t and el.get("geometry"):
            col, w = style.get(t["highway"], ("#999", 1))
            pts = " ".join("%.1f,%.1f" % P(*xy(p["lat"], p["lon"])) for p in el["geometry"])
            parts.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>')
    for r in fac:
        if r["x_m"] == "" or r["구분"] not in ("초등학교", "공원", "역"):
            continue
        x, y = P(float(r["x_m"]), float(r["y_m"]))
        if not (0 <= x <= W and 0 <= y <= H):
            continue
        col = {"초등학교": "#1d4f91", "공원": "#2e8b57", "역": "#555"}[r["구분"]]
        shape = (f'<rect x="{x-4}" y="{y-4}" width="8" height="8" fill="{col}"/>' if r["구분"] == "역"
                 else f'<circle cx="{x}" cy="{y}" r="{5 if r["구분"]=="초등학교" else 4}" fill="{col}"/>')
        parts.append(shape)
        if r["이름"] == "창신초등학교":
            parts.append(f'<text x="{x-7}" y="{y+4}" font-size="10.5" font-weight="700" text-anchor="end" fill="#1d4f91">창신초(중심)</text>')
        else:
            parts.append(f'<text x="{x+6}" y="{y-5}" font-size="9.5" fill="#222">{e(r["이름"])} {r["거리_m"]}m</text>')
    parts += [f'<text x="{P(d+8,-60)[0]}" y="{P(d+8,-60)[1]}" font-size="11" fill="#b04a14" font-weight="700">지봉로</text>',
              f'<text x="{P(180,-150)[0]}" y="{P(180,-150)[1]}" font-size="10" fill="#b04a14">원의 {S["R2_지봉로_동쪽_원면적비"]*100:.0f}%</text>',
              f'<text x="{P(-20,-470)[0]}" y="{P(-20,-470)[1]}" font-size="11" fill="#c0392b" font-weight="700">종로</text>',
              f'<text x="8" y="{H-8}" font-size="9" fill="#666">개략도 · OSM 좌표(조회 {S["조회일"]}) · 원 반경 400 m · 북쪽이 위</text>',
              '</svg>']
    return "\n".join(parts)


def log_rows():
    out = []
    for r in log:
        cls = {"조문": "t-jo", "시점": "t-si", "수치": "t-su"}.get(r["오류유형"], "t-ok")
        out.append(
            f'<tr><td>{r["번호"]}</td><td><span class="tag {cls}">{e(r["오류유형"])}</span><br>{e(r["판정"])}</td>'
            f'<td><b>{e(r["검증대상"].split(" (")[0])}</b><br>{e(r["위치"])}</td>'
            f'<td>{e(r["원래주장"])}</td>'
            f'<td>{e(r["원문발췌"])}<div class="fix">→ {e(r["바로잡은내용"])}</div></td>'
            f'<td>{e(r["근거법령"])} {e(r["근거조문"])}<br><span class="mono">{e(r["식별자"])}</span></td>'
            f'<td class="nw">시행 {r["시행일"]}<br>조회 {r["조회일"]}</td></tr>')
    return "\n".join(out)


def table_rows():
    out = []
    for r in table:
        empty = not r["서울조례_용적률(%)"]
        dos = f' <span class="dos">(도심 {r["서울도심_용적률(%)"]})</span>' if r["서울도심_용적률(%)"] else ""
        out.append(
            f'<tr class="{"muted" if empty else ""}"><td>{r["번호"]}</td><td>{e(r["대분류"])}</td><td class="l">{e(r["용도지역"])}</td>'
            f'<td>{r["법_건폐율상한(%)"]}</td><td>{r["시행령_건폐율상한(%)"]}</td><td class="b">{r["서울조례_건폐율(%)"] or "—"}</td>'
            f'<td>{r["법_용적률상한(%)"]}</td><td>{r["시행령_용적률하한(%)"]}~{r["시행령_용적률상한(%)"]}</td>'
            f'<td class="b">{(r["서울조례_용적률(%)"] or "—")}{dos}</td></tr>')
    return "\n".join(out)


from collections import Counter
cnt = Counter(r["오류유형"] for r in log)
verdicts = Counter(r["판정"] for r in log)
t0 = table[0]

HTML = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>3주차 과제 — 창신동 계획단위 가설·법령 검증 로그</title>
<style>
@page {{ size: A4; margin: 13mm 12mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: "Noto Sans KR","Malgun Gothic",sans-serif; color:#1b1b1b; font-size:9.2pt; line-height:1.45; margin:0; background:#fff; }}
h1 {{ font-size:15pt; margin:0 0 2px; color:#12305e; }}
h2 {{ font-size:12pt; margin:0 0 6px; color:#12305e; border-bottom:2px solid #12305e; padding-bottom:3px; }}
h3 {{ font-size:10pt; margin:10px 0 4px; color:#12305e; }}
.meta {{ color:#555; font-size:8.6pt; margin-bottom:10px; }}
.page {{ page-break-after: always; }}
.page:last-child {{ page-break-after: auto; }}
.hyp {{ background:#eef3fa; border-left:4px solid #1d4f91; padding:7px 10px; font-size:10.4pt; font-weight:600; margin:6px 0 8px; }}
.grid {{ display:grid; grid-template-columns: 1fr 336px; gap:12px; align-items:start; }}
table {{ border-collapse:collapse; width:100%; }}
th, td {{ border:1px solid #cfd6df; padding:3px 5px; vertical-align:top; }}
th {{ background:#12305e; color:#fff; font-weight:600; font-size:8.4pt; }}
.k td {{ font-size:8.8pt; }}
.log td {{ font-size:7.4pt; line-height:1.38; }}
.log th {{ font-size:7.6pt; }}
.fix {{ color:#0f5132; margin-top:2px; }}
.mono {{ font-family: Consolas, monospace; font-size:7pt; color:#444; }}
.nw {{ white-space:nowrap; }}
.tag {{ display:inline-block; padding:0 5px; border-radius:3px; font-weight:700; font-size:7.2pt; color:#fff; }}
.t-jo {{ background:#8e44ad; }} .t-si {{ background:#d35400; }} .t-su {{ background:#c0392b; }} .t-ok {{ background:#7f8c8d; }}
.z td {{ text-align:center; font-size:8.6pt; }} .z td.l {{ text-align:left; }} .z td.b {{ font-weight:700; background:#f3f7fc; }}
.z tr.muted td {{ color:#8a8a8a; }} .dos {{ color:#b04a14; font-weight:600; }}
.note {{ font-size:8.2pt; color:#444; }}
.pill {{ display:inline-block; border:1px solid #1d4f91; color:#1d4f91; border-radius:10px; padding:0 7px; font-size:8pt; margin-right:4px; }}
.res-y {{ color:#b03a2e; font-weight:700; }} .res-n {{ color:#1e7d4f; font-weight:700; }}
ul {{ margin:3px 0 3px 18px; padding:0; }} li {{ margin:1px 0; }}
</style></head><body>

<section class="page">
<h1>3주차 과제 — 대상지 계획단위 가설 · 법령 검증 로그 · 조례 21종 표</h1>
<div class="meta">스마트도시계획(캡스톤디자인) · 작성 {AUTHOR} · 조회일 {S["조회일"]} · 팀 저장소 <b>{REPO}</b> (폴더 <code>{FOLDER}/</code>)</div>

<h2>① 대상지 계획단위 가설 1장</h2>
<div class="hyp">가설 H-C — 서울 종로구 창신동 남부 주거지는 <u>서울창신초등학교를 중심</u>으로, <u>종로·지봉로·한양도성(낙산)을 경계</u>로 하는
반경 400 m 의 페리(1929)식 근린주구 한 단위로 읽을 수 있다.</div>
<div class="grid"><div>
<h3>왜 창신동인가</h3>
팀 가설 H3(종로구청 반경 400 m)는 초등학교·근린공원이 0개라 기각되었다. 같은 종로구 안에서 <b>초등학교가 실제로 있는 주거지</b>에
같은 기각조건 R1~R3를 대 보면, H3 기각이 '도심이라서'인지 '페리 모형 자체가 종로에 맞지 않아서'인지 가를 수 있다.
<h3>중심 — 서울창신초등학교</h3>
종로구 지봉로 73 · 1916년 개교 · 2026년 학생 284명(나무위키, 조회 {S["조회일"]}). 창신동에는 중학교·일반고가 없어
초등학교가 동네의 사실상 유일한 교육 공공시설이다. 좌표는 OSM <code>amenity=school</code> 면의 중심점 ({S["중심"]["좌표"][0]}, {S["중심"]["좌표"][1]}).
<h3>경계 — 네 면 (가정)</h3>
<ul><li><b>남</b> 종로(주간선) — 동대문역·동묘앞역</li>
<li><b>동</b> 지봉로 — 숭인동과의 동 경계</li>
<li><b>서</b> 한양도성·낙산 — 흥인지문~낙산공원</li>
<li><b>북</b> 명신초 생활권(창신3동)과 맞닿는 창신역 일대</li></ul>
<h3>기각조건 — 데이터를 보기 전에 적음</h3>
팀 H3 의 R1~R3를 그대로 가져와 같은 잣대로 판정한다. 하나라도 충족되면 해당 부분을 기각한다.
<table class="k"><tr><th style="width:24%">조건</th><th>계측 결과 (OSM · 조회 {S["조회일"]})</th><th style="width:17%">판정</th></tr>
<tr><td><b>R1</b> 400 m 안 초등학교 0개</td><td>{", ".join(S["R1_초등학교_400m안"])} 1개(중심). 명신초 {next(r["거리_m"] for r in fac if r["이름"]=="명신초등학교")} m 로 원 밖</td><td class="res-n">미충족 → 유지</td></tr>
<tr><td><b>R2</b> 간선도로가 경계가 아니라 관통</td><td>지봉로(2차 간선)가 중심 동쪽 약 {S["R2_지봉로_중심에서_동쪽_m"]} m 를 남북으로 지나 <b>원 면적의 {S["R2_지봉로_동쪽_원면적비"]*100:.0f}%</b> 를 동쪽으로 떼어 냄. 종로는 {next(r["거리_m"] for r in fac if r["이름"]=="종로")} m 로 원 남단을 스침</td><td class="res-y">충족 → '지봉로=경계' 기각</td></tr>
<tr><td><b>R3</b> 400 m 안 근린공원 0개</td><td>{", ".join(S["R3_근린공원_400m안"])} {next(r["거리_m"] for r in fac if r["이름"]=="숭인근린공원")} m — 단, <b>지봉로 건너편</b>(숭인동). 낙산공원 {next(r["거리_m"] for r in fac if r["이름"]=="낙산공원")} m 는 원 밖</td><td class="res-n">미충족 → 유지<br><span class="note">(횡단 필요)</span></td></tr>
</table>
</div>
<div>{svg_map()}
<h3>판정과 수정 가설</h3>
<b>부분 기각.</b> '초등학교 중심'은 성립하지만 '지봉로가 경계'라는 전제가 틀렸다 — 학교가 경계 도로에 붙어 있고,
원 안의 유일한 근린공원은 그 도로 건너편에 있다. 페리 모형처럼 간선을 바깥에 두는 <b>분리</b>가 아니라,
지봉로를 창신·숭인을 잇는 생활권의 <b>척추</b>로 읽는 <b>연결(TND)</b> 쪽이 대상지에 맞는다 — 팀 H3 의 결론과 같은 방향이다.
<div class="hyp" style="font-size:9.6pt;margin-top:6px">수정 가설 H-C′ — 창신초·숭인근린공원·동묘앞역을 지봉로 한 축으로 묶은 창신·숭인 연결형 생활권.
<br><span style="font-weight:400">다음 기각조건: 지봉로 횡단보도 간격이 200 m 를 넘거나, 학교 앞 구간이 보행 안전 시설 없이 4차로 이상이면 기각.</span></div>
<h3>조회 대기 — 임의 값을 넣지 않음</h3>
<ul class="note">
<li><b>대상지 용도지역 구성비</b> — VWorld/국토부 용도지역지구 WMS 인증키 없음</li>
<li><b>서울도심 포함 여부</b> — 조례 시행규칙 제19조가 범역을 별표 5 <u>도면</u>으로 정함. 창신1동 상업지역에 800%·1,000% 중 어느 값이 걸리는지 미확정</li>
<li><b>지봉로 차로 수·횡단보도 위치</b> — H-C′ 판정용, 미조회</li>
<li><b>경사</b> — 낙산 쪽 경사가 400 m 를 보행 5분으로 바꿀 수 있음, DEM 미조회</li></ul>
<h3>이 가설에 걸리는 조례값</h3>
<div class="note">용도지역이 확인되면 ③ 표의 <b>서울 조례 제44·48조</b> 값을 쓴다 — 제1종일반 150%, 제2종일반 200%, 제3종일반 250%, 준주거 400%.
법 제78조 주거 500%·시행령 제3종 300% 는 <b>상한</b>이지 대상지 값이 아니다.</div>
</div></div>
</section>

<section class="page">
<h2>② 법령 검증 로그 — {len(log)}건</h2>
<div class="meta">
<span class="pill">조문 {cnt["조문"]}</span><span class="pill">시점 {cnt["시점"]}</span><span class="pill">수치 {cnt["수치"]}</span><span class="pill">일치 확인 {cnt["-"]}</span>
&nbsp;판정: {" · ".join(f"{k} {v}" for k, v in verdicts.items())}<br>
검증 대상 세 가지 — (1) 도구 없이 기억만으로 쓴 <b>AI 법규 요약</b>(Claude Haiku 4.5, 원문은 <code>sources/</code>), (2) <b>비교과 강의자료</b> 속 AI 생성 삽화의 조문, (3) <b>주간 강의자료</b> 본문.
원문발췌는 모두 <code>law_raw/</code> 의 API 응답에서 스크립트가 잘라 온 것이며, 원문·식별자·시행일·조회일 네 칸은 모든 행에 채웠다.
</div>
<table class="log"><tr><th style="width:3%">#</th><th style="width:9%">유형·판정</th><th style="width:13%">검증 대상·위치</th><th style="width:17%">원래 주장</th><th>원문 발췌 → 바로잡은 내용</th><th style="width:15%">근거·식별자</th><th style="width:9%">시점</th></tr>
{log_rows()}
</table>
<p class="note">조회경로: {e(log[0]["조회경로"])} · 인증 OC 는 저장소에 적지 않음(환경변수 LAW_OC) · 팀원 최명원의 로그(V3-1~7)와 겹치는 항목은 시행령 시점(V3-2), 용도지구 10종(V3-4), 보호취락지구(V3-6) 세 건이며 이 로그는 원문을 다시 받아 독립적으로 확인했다.</p>
</section>

<section class="page">
<h2>③ 서울특별시 도시계획 조례 — 건폐율·용적률 21종 표</h2>
<div class="meta">법(대분류 상한) → 시행령(21종 범위) → 서울 조례(적용값) 세 층을 한 행에 놓음. 단위 %, 건폐율·조례값은 '이하', 시행령 용적률은 '하한~상한'.
조례값이 시행령 범위 안인지 스크립트가 16행 모두 자동 점검함.</div>
<table class="z"><tr><th>#</th><th>대분류</th><th>용도지역</th><th>법 건폐율<br>제77조①</th><th>시행령 건폐율<br>제84조①</th><th>서울 건폐율<br>조례 제44조</th><th>법 용적률<br>제78조①</th><th>시행령 용적률<br>제85조①</th><th>서울 용적률<br>조례 제48조</th></tr>
{table_rows()}
</table>
<h3>출처 · 시점</h3>
<ul class="note">
<li>{e(t0["출처_법"])}</li><li>{e(t0["출처_시행령"].replace("제84조제1항제1호·제85조제1항제1호", "제84조제1항·제85조제1항"))}</li>
<li>{e(t0["출처_조례"].replace("제44조제1호·제48조제1호", "제44조·제48조"))}</li>
<li>조회일 {t0["조회일"]} · law.go.kr DRF API · 원본 CSV <code>03_서울시_조례_21종표.csv</code></li></ul>
<h3>표를 읽는 법</h3>
<ul class="note">
<li><b>17~21행이 비어 있는 것은 조회 실패가 아니다.</b> 서울 조례 제44조·제48조는 도시지역 16종(제1~16호)만 정한다. 시행령 범위만 남기고 값은 비웠다.</li>
<li><b>서울도심 단서</b>(주황): 상업지역 네 종은 서울도심에서 더 낮다 — 중심상업 1,000% → 800%. 범역은 조례 시행규칙 제19조·별표 5.</li>
<li>같은 종 안에서도 조례값은 시행령 상한보다 낮다 — 제3종일반주거 시행령 300% vs 서울 250%. <b>상한을 대상지 값으로 옮겨 적으면 수치 오류</b>(로그 #10·#12 유형).</li></ul>
</section>

<section class="page">
<h2>④ 저장소 · 다시 만들기</h2>
<p><b>팀 저장소</b> {REPO} → <code>{FOLDER}/</code></p>
<table class="k"><tr><th style="width:36%">파일</th><th>내용</th></tr>
<tr><td><code>3주차_과제_{AUTHOR}.pdf</code></td><td>이 문서 (①②③④ 합본)</td></tr>
<tr><td><code>02_법령검증로그.csv</code></td><td>② 검증 로그 CSV 원본 — {len(log)}행</td></tr>
<tr><td><code>03_서울시_조례_21종표.csv</code></td><td>③ 조례 21종 표 CSV 원본 — 21행</td></tr>
<tr><td><code>data/계측_창신초_400m.csv</code></td><td>① R1~R3 판정 자료 (학교·공원·역·간선도로 거리)</td></tr>
<tr><td><code>sources/AI요약_원문_2026-09-21.md</code></td><td>② 검증 대상 AI 요약 원문 (손대지 않음)</td></tr>
<tr><td><code>law_raw/</code></td><td>법령 API 응답 원본 JSON — 로그의 원문발췌가 여기서 나옴</td></tr></table>
<h3>다시 만들기</h3>
<pre style="font-size:8.4pt;background:#f4f4f4;padding:8px">$env:LAW_OC = "발급받은OC"
python fetch_articles.py     # 법령·조례 원문 → law_raw/
python measure_site.py       # ① 계측 (--fetch 로 Overpass 재조회)
python build_outputs.py      # ② 검증 로그, ③ 21종 표 CSV
python make_report.py        # 과제.html → 브라우저로 PDF 출력</pre>
<h3>조회에서 걸린 것</h3>
<ul class="note">
<li>개인 OC 는 IP 미등록으로 '사용자 정보 검증에 실패' 응답(HTTP 200). 이번 조회는 공개 데모 키 <code>OC=test</code> 로 했고, 저장소에는 키를 적지 않았다.</li>
<li>OSM 은 태그 누락이 있다 — <code>amenity=school</code> 태그 검색에서는 창신초가 빠져 <b>이름 검색</b>으로 바꿨다. 공원 거리는 면의 중심점 기준이다.</li>
<li>Overpass 는 504 가 잦아 미러 세 곳을 순회한다.</li></ul>
<h3>참고</h3>
<ul class="note">
<li>국가법령정보 공동활용 OPEN API, https://open.law.go.kr (조회 {S["조회일"]})</li>
<li>OpenStreetMap contributors, Overpass API (조회 {S["조회일"]})</li>
<li>나무위키 「창신동」「서울창신초등학교」 (조회 {S["조회일"]}) — 개교연도·학생 수·주소</li>
<li>Perry, C. A. (1929). The Neighborhood Unit.</li></ul>
</section>
</body></html>"""

open("과제.html", "w", encoding="utf-8").write(HTML)
print("과제.html 저장")
