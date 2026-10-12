# -*- coding: utf-8 -*-
"""분석.py 결과로 제출물을 만든다 — 01 4축 표 csv · 매트릭스 xlsx(수식) · 06 역전점 csv · 과제.html.

  py 만들기.py
"""
import csv, json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, "raw"), exist_ok=True)        # 중간 결과(_결과.json) 자리 — 저장소에는 올리지 않음
sys.stdout.reconfigure(encoding="utf-8")
rd = lambda f: list(csv.DictReader(open(os.path.join(HERE, f), encoding="utf-8-sig")))
V = json.load(open(os.path.join(HERE, "01_4축표_값.json"), encoding="utf-8"))
VAL, TODAY = V["값"], V["조회일"]
SITES = list(VAL)
W = [r for r in rd("04_매트릭스_지표가중치_가안.csv") if r["번호"].startswith("I")]
X = {r["대안"]: r for r in rd("05_매트릭스_지표값.csv")}
ALTS = list(X)
AREA = rd("03_배분대안_3안.csv")
IND6 = rd("02_지표6_경사향.csv")

# ── ① 입지인자 4축 표 — 요건 문장(원본 13~21번) · 조회 지표 · 판정 기준(가정) ─────────────
num = lambda s, k: float(VAL[s][k])
st_m = lambda s: float(VAL[s]["최근접 도시철도역"].split()[-2])
AXES = [
    # 용도, 축, 요건 문장, 근거, 지표 이름, 값 함수, 판정 함수(→ 충족/조건부/미충족/지표 없음), 판정 기준 문장
    ("녹지", "지형", "급경사·재난위험지대 등 시가화 부적당지를 녹지로 먼저 묶는다", "원본 13·14번 · 6주차 18쪽",
     "경사 25% 초과 면적(%)", lambda s: num(s, "경사 25% 초과(%)"),
     lambda v: "충족" if v >= 10 else "조건부" if v > 0 else "미충족", "≥10% 충족 · 0 초과 조건부(녹지 후보지 존재 여부)"),
    ("녹지", "접근성", "근린주구 생활권 안에서 일상적으로 걸어 이용할 수 있는 거리에 둔다", "원본 13번 · 도시공원법 시행규칙 별표 3",
     "공원·녹지 결정 면적(%)", lambda s: num(s, "공원·녹지 결정(%)"),
     lambda v: "충족" if v >= 9 else "조건부" if v >= 5 else "미충족", "도시공원법 시행규칙 별표 2 — 30만~100만㎡ 부지 9%(충족)·1만~30만㎡ 5%(조건부)"),
    ("녹지", "주변환경", "풍치·산림을 보전하고 위험시설과의 사이를 완충한다", "원본 13·14번 · 도시공원법 제35조",
     "문화재보호구역(%)", lambda s: num(s, "문화재보호구역(%)"),
     lambda v: "충족" if v > 0 else "미충족", ">0 이면 보전 대상 존재(충족)"),
    ("녹지", "기반시설", "녹지체계 위계(환상·방사·격자·분산)를 도시 전체와 잇는다", "원본 13번",
     "지표 없음(정성)", lambda s: "", lambda v: "지표 없음", "6주차 25쪽 — 측정 불가 낱말은 '지표 없음' 표기"),
    ("상업업무", "지형", "유통·대형 시설은 경사 5% 이하 평지에 둔다", "원본 17번 · 6주차 16쪽",
     "경사 5% 이하 면적(%)", lambda s: num(s, "경사 5% 이하(%)"),
     lambda v: "충족" if v >= 50 else "조건부" if v >= 20 else "미충족", "≥50% 충족 · 20~50% 조건부"),
    ("상업업무", "접근성", "위계별 교통결절 — 중심은 교통망 집중지, 일반은 간선 교차점, 근린은 주거지 인접", "원본 9·15~17번 · 6주차 14쪽",
     "최근접 도시철도역(m)", lambda s: st_m(s),
     lambda v: "충족" if v <= 500 else "조건부" if v <= 1000 else "미충족", "역 500 m 이내 충족(역세권) · 1,000 m 이내 조건부"),
    ("상업업무", "주변환경", "근린상업은 녹지와 이어 쾌적성을 유지한다", "원본 17번",
     "공원·녹지 결정 면적(%)", lambda s: num(s, "공원·녹지 결정(%)"),
     lambda v: "충족" if v >= 5 else "미충족", "≥5% 충족"),
    ("상업업무", "기반시설", "배후인구(근린 3~5만 명)와 물류망을 갖춘다", "원본 16·17번",
     "주거지역(%) — 배후 주거", lambda s: num(s, "주거지역(%)"),
     lambda v: "충족" if v >= 40 else "조건부" if v >= 10 else "미충족", "≥40% 충족(근린 배후) · 10~40% 조건부"),
    ("주거", "지형", "경사 4~10%(바람직)·25% 한계, 표고는 기반시설 +50 m 이내", "원본 19번 · 6주차 16·17쪽",
     "경사 10% 이하 면적(%)", lambda s: num(s, "경사 10% 이하(%)"),
     lambda v: "충족" if v >= 50 else "조건부" if v >= 25 else "미충족", "≥50% 충족 · 25~50% 조건부"),
    ("주거", "접근성", "직장·편익시설에 가깝고 휴식공간·간선도로와 이어진다", "원본 19번",
     "최근접 도시철도역(m)", lambda s: st_m(s),
     lambda v: "충족" if v <= 500 else "조건부" if v <= 1000 else "미충족", "역 500 m 이내 충족"),
    ("주거", "주변환경", "오염원에서 떨어지고 남경사지, 녹지·수변과 잇는다", "원본 19번",
     "남향(향 135~225°) 면적(%)", lambda s: num(s, "남향(%)"),
     lambda v: "충족" if v >= 30 else "조건부" if v >= 15 else "미충족", "≥30% 충족(남향 ±45°는 전체의 25% — 평균 이상)"),
    ("주거", "기반시설", "도로·가스·전기가 이미 깔린 곳(공급망 기구축)", "원본 19번",
     "도로(지목 '도') 면적(%)", lambda s: num(s, "도로(지목 도)(%)"),
     lambda v: "충족" if v >= 15 else "조건부" if v >= 10 else "미충족", "≥15% 충족 · 10~15% 조건부(가스·전기는 지표 없음)"),
    ("공업", "지형", "경사 5% 이하, 최소 규모 이상의 평탄지", "원본 21번 · 6주차 19쪽",
     "경사 5% 이하 면적(%)", lambda s: num(s, "경사 5% 이하(%)"),
     lambda v: "충족" if v >= 50 else "조건부" if v >= 20 else "미충족", "≥50% 충족 · 20~50% 조건부"),
    ("공업", "접근성", "화물수송·출퇴근 간선에 직결한다", "원본 9·21번",
     "간선 100 m 이내 면적(%)", lambda s: num(s, "간선 100 m 이내(%)"),
     lambda v: "충족" if v >= 30 else "조건부" if v >= 10 else "미충족", "≥30% 충족"),
    ("공업", "주변환경", "시가지와 떨어지고 완충녹지·확장 여지를 확보한다", "원본 10·21번 · 교육환경보호법 제9조",
     "주거지역(%) · 교육환경보호구역(%)", lambda s: "%.1f · %.1f" % (num(s, "주거지역(%)"), num(s, "교육환경보호구역(%)")),
     lambda v: "충족" if max(map(float, v.split(" · "))) < 30 else "미충족", "주거지역·교육환경보호구역 둘 다 30% 미만이면 충족"),
    ("공업", "기반시설", "폐수·폐기물 처리가 쉽고 공업용수·동력을 확보한다", "원본 21번",
     "지표 없음(원 안 처리시설 미조회)", lambda s: "", lambda v: "미확인", "하수처리·용수 공급은 원 단위 자료 없음 — 빈칸 + 사유"),
]
four = []
for use, ax, req, src, ind, f, judge, rule in AXES:
    r = {"용도": use, "축": ax, "요건 문장": req, "근거": src, "조회 지표": ind, "판정 기준(가정)": rule}
    for s in SITES:
        v = f(s)
        r["%s 값" % s] = v if not isinstance(v, float) else round(v, 1)
        r["%s 판정" % s] = judge(v)
    four.append(r)
cols4 = ["용도", "축", "요건 문장", "근거", "조회 지표"] + [c for s in SITES for c in ("%s 값" % s, "%s 판정" % s)] + ["판정 기준(가정)"]
with open(os.path.join(HERE, "01_입지인자_4축표.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, cols4)
    w.writeheader()
    w.writerows(four)

# ── 매트릭스 계산(파이썬 확인용 — xlsx 는 같은 계산을 수식으로) ─────────────────
def score(v, up):
    v = float(v)
    return min(5, int(v // 20) + 1) if up else max(1, 5 - int(v // 20))

wt = {r["번호"]: float(r["가중치"]) for r in W}
up = {r["번호"]: r["방향"] == "클수록 좋음" for r in W}
S = {a: {k: score(X[a][k], up[k]) for k in wt} for a in ALTS}
T = {a: round(sum(wt[k] * S[a][k] for k in wt), 4) for a in ALTS}
order = sorted(ALTS, key=lambda a: -T[a])
first, second = order[0], order[1]
rev = []
for k in wt:
    s1, s2, wk = S[first][k], S[second][k], wt[k]
    b1, b2 = (T[first] - wk * s1) / (1 - wk), (T[second] - wk * s2) / (1 - wk)
    d = (s1 - b1) - (s2 - b2)
    ws = None if abs(d) < 1e-12 else (b2 - b1) / d
    ok = ws is not None and 0 <= ws < 1 - 1e-9          # w*=1 은 두 대안이 그 지표 점수로만 같아지는 동점 — 역전 아님
    rev.append({"지표": k, "현재 가중치": wk, "%s 점수" % first: s1, "%s 점수" % second: s2,
                "역전 가중치": round(ws, 3) if ok else "",
                "해석": ("가중치를 %.3f %s으로 %s %s이(가) 1위" % (ws, "이상" if ws > wk else "이하", "올리면" if ws > wk else "낮추면", second) if ok
                       else "0~1 범위에서 1·2위 역전 없음")})
with open(os.path.join(HERE, "06_가중치_역전점.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, list(rev[0]))
    w.writeheader()
    w.writerows(rev)
print("총점", T, "1위", first, "2위", second)
for r in rev:
    print(r["지표"], r["역전 가중치"], r["해석"])

# ── xlsx — 입력(파랑)·가정(노랑) · 점수·총점·순위·역전점은 수식 ─────────────────────────
F = "Arial"
thin = Side(style="thin", color="BFC7D5")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD = PatternFill("solid", fgColor="12305E")
YEL = PatternFill("solid", fgColor="FFF2B3")
blue, black, green = Font(name=F, color="0000FF"), Font(name=F, color="000000"), Font(name=F, color="008000")
hfont = Font(name=F, color="FFFFFF", bold=True)


def head(ws, row, names, widths=None):
    for j, n in enumerate(names, 1):
        c = ws.cell(row=row, column=j, value=n)
        c.font, c.fill, c.border = hfont, HEAD, BOX
        c.alignment = Alignment(wrap_text=True, vertical="center")
    if widths:
        for j, wdt in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(j)].width = wdt


def put(ws, row, col, v, font=black, fmt=None, fill=None):
    c = ws.cell(row=row, column=col, value=v)
    c.font, c.border = font, BOX
    c.alignment = Alignment(wrap_text=True, vertical="top")
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = fill
    return c


wb = Workbook()
ws = wb.active
ws.title = "읽어보기"
notes = [
    "6주차 과제 — 대안 비교 매트릭스 원본 (창신초 반경 400 m · 배분 대안 3안)",
    "작성 순서(6주차 59쪽): ① 지표 확정 → ② 가중치(합 1.00) → ③ 교수자 승인 → ④ 채점(5점 척도) → ⑤ 역전점 검증",
    "현재 상태: 지표·가중치는 '가안 — 교수자 승인 대기'. 지표값 계산 전에 04_매트릭스_지표가중치_가안.csv 로 먼저 고정했다.",
    "고치는 칸: '지표·가중치' 시트의 노란 칸(가중치)만. 파란 글씨 = 입력값, 검은 글씨 = 수식. 가중치를 바꾸면 점수 합·순위·역전점이 다시 계산된다.",
    "점수 규칙(고정 구간): 클수록 좋음 0~20%→1 · 20~40→2 · 40~60→3 · 60~80→4 · 80~100→5 / 작을수록 좋음은 반대.",
    "역전점: 한 지표의 가중치 w 만 바꾸고 나머지는 비율대로 줄여 합 1.00 유지 — 1위와 2위 총점이 같아지는 w.",
    "자료: 브이월드 2D 데이터 API 2.0(용도지역 LT_C_UQ111~114 · 공원녹지 LT_C_UPISUQ153 · 국가유산 LT_C_UO301 · 교육환경 LT_C_UO101 · 연속지적도 LP_PA_CBND_BUBUN), "
    "Copernicus GLO-90 DEM(Open-Meteo), OSM 간선도로·역 — 조회 %s · 좌표는 저장하지 않음(지오코더 이용조건)" % TODAY,
]
for i, t in enumerate(notes, 1):
    ws.cell(row=i, column=1, value=t).font = Font(name=F, bold=(i == 1))
ws.column_dimensions["A"].width = 150

# 지표·가중치
wsW = wb.create_sheet("지표·가중치")
head(wsW, 1, ["번호", "국토계획평가 기준", "지표", "정의", "방향", "가중치", "근거", "상태"], [6, 20, 22, 48, 12, 9, 46, 20])
for i, r in enumerate(W, 2):
    for j, k in enumerate(["번호", "국토계획평가 기준(「국토기본법」 제19조의2)", "지표", "정의(계산식)", "방향"], 1):
        put(wsW, i, j, r[k])
    c = put(wsW, i, 6, float(r["가중치"]), blue, "0.00", YEL)
    put(wsW, i, 7, r["근거"])
    put(wsW, i, 8, r["상태"])
nW = len(W)
put(wsW, nW + 2, 5, "합계", Font(name=F, bold=True))
put(wsW, nW + 2, 6, "=SUM(F2:F%d)" % (nW + 1), black, "0.00")
put(wsW, nW + 2, 7, '=IF(ABS(F%d-1)<0.0001,"합 1.00 확인","합이 1.00 이 아님 — 가중치 확인")' % (nW + 2))

# 지표값
wsX = wb.create_sheet("지표값")
head(wsX, 1, ["지표"] + ALTS + ["단위", "출처"], [10, 16, 16, 16, 8, 60])
for i, r in enumerate(W, 2):
    put(wsX, i, 1, r["번호"])
    for j, a in enumerate(ALTS, 2):
        put(wsX, i, j, float(X[a][r["번호"]]), blue, "0.0")
    put(wsX, i, len(ALTS) + 2, "%")
    put(wsX, i, len(ALTS) + 3, "분석.py — 창신초 반경 400 m 격자 30 m 561점, %s" % TODAY)

# 채점·총점
wsS = wb.create_sheet("채점·총점")
head(wsS, 1, ["지표", "가중치"] + ["%s 점수" % a for a in ALTS] + ["%s 가중점수" % a for a in ALTS], [10, 9] + [14] * (2 * len(ALTS)))
nA = len(ALTS)
for i in range(2, nW + 2):
    put(wsS, i, 1, "='지표·가중치'!A%d" % i, green)
    put(wsS, i, 2, "='지표·가중치'!F%d" % i, green, "0.00")
    for j in range(nA):
        col = get_column_letter(2 + j)  # 지표값 시트 열 B,C,D
        v = "지표값!%s%d" % (col, i)
        put(wsS, i, 3 + j, '=IF(\'지표·가중치\'!E%d="클수록 좋음",MIN(5,INT(%s/20)+1),MAX(1,5-INT(%s/20)))' % (i, v, v), black, "0")
        put(wsS, i, 3 + nA + j, "=$B%d*%s%d" % (i, get_column_letter(3 + j), i), black, "0.00")
tr = nW + 2
put(wsS, tr, 1, "총점", Font(name=F, bold=True))
put(wsS, tr + 1, 1, "순위", Font(name=F, bold=True))
for j in range(nA):
    sc = get_column_letter(3 + j)
    put(wsS, tr, 3 + j, "=SUMPRODUCT($B$2:$B$%d,%s2:%s%d)" % (nW + 1, sc, sc, nW + 1), black, "0.00")
for j in range(nA):
    sc = get_column_letter(3 + j)
    put(wsS, tr + 1, 3 + j, "=RANK(%s%d,$C$%d:$%s$%d)" % (sc, tr, tr, get_column_letter(2 + nA), tr), black, "0")
put(wsS, tr + 2, 1, "대안")
for j, a in enumerate(ALTS):
    put(wsS, tr + 2, 3 + j, a)
put(wsS, tr + 3, 1, "1위")
put(wsS, tr + 3, 3, "=INDEX($C$%d:$%s$%d,MATCH(1,$C$%d:$%s$%d,0))" % (tr + 2, get_column_letter(2 + nA), tr + 2, tr + 1, get_column_letter(2 + nA), tr + 1))
put(wsS, tr + 4, 1, "2위")
put(wsS, tr + 4, 3, "=INDEX($C$%d:$%s$%d,MATCH(2,$C$%d:$%s$%d,0))" % (tr + 2, get_column_letter(2 + nA), tr + 2, tr + 1, get_column_letter(2 + nA), tr + 1))

# 역전점 — 1위(r1)·2위(r2) 열을 MATCH 로 찾아 지표마다 w* 계산
wsR = wb.create_sheet("역전점")
head(wsR, 1, ["지표", "현재 가중치", "1위 점수", "2위 점수", "1위 나머지 평균(B1)", "2위 나머지 평균(B2)", "역전 가중치 w*", "판정"],
     [10, 11, 10, 10, 16, 16, 14, 46])
LAST = get_column_letter(2 + nA)
r1 = "MATCH(1,'채점·총점'!$C$%d:$%s$%d,0)" % (tr + 1, LAST, tr + 1)
r2 = "MATCH(2,'채점·총점'!$C$%d:$%s$%d,0)" % (tr + 1, LAST, tr + 1)
for i in range(2, nW + 2):
    put(wsR, i, 1, "='지표·가중치'!A%d" % i, green)
    put(wsR, i, 2, "='지표·가중치'!F%d" % i, green, "0.000")
    put(wsR, i, 3, "=INDEX('채점·총점'!$C%d:$%s%d,%s)" % (i, LAST, i, r1), black, "0")
    put(wsR, i, 4, "=INDEX('채점·총점'!$C%d:$%s%d,%s)" % (i, LAST, i, r2), black, "0")
    put(wsR, i, 5, "=(INDEX('채점·총점'!$C$%d:$%s$%d,%s)-B%d*C%d)/(1-B%d)" % (tr, LAST, tr, r1, i, i, i), black, "0.000")
    put(wsR, i, 6, "=(INDEX('채점·총점'!$C$%d:$%s$%d,%s)-B%d*D%d)/(1-B%d)" % (tr, LAST, tr, r2, i, i, i), black, "0.000")
    put(wsR, i, 7, '=IF(ABS((C{0}-E{0})-(D{0}-F{0}))<0.000001,"",(F{0}-E{0})/((C{0}-E{0})-(D{0}-F{0})))'.format(i), black, "0.000")
    put(wsR, i, 8, '=IF(G{0}="","0~1 범위에서 1·2위 역전 없음",IF(AND(G{0}>=0,G{0}<0.999999),"가중치 "&TEXT(G{0},"0.000")&IF(G{0}>B{0}," 이상이면"," 이하이면")&" 2위가 1위","0~1 범위에서 1·2위 역전 없음"))'.format(i))
put(wsR, nW + 3, 1, "계산식: 지표 k 의 가중치를 w 로 바꾸고 나머지를 (1-w)/(1-w_k) 배로 줄이면 대안 총점 = w·s_k + (1-w)·B, B = (현재 총점 - w_k·s_k)/(1-w_k). 1위와 2위 총점이 같아지는 w 가 역전점.")

# 배분 3안 · 지표 ⑥ · 4축 표(값)
wsA = wb.create_sheet("배분 3안")
head(wsA, 1, ["대안", "용도", "면적(ha)", "구성비(%)"], [16, 16, 10, 10])
for i, r in enumerate(AREA, 2):
    put(wsA, i, 1, r["대안"]); put(wsA, i, 2, r["용도"])
    put(wsA, i, 3, float(r["면적(ha)"]), blue, "0.00"); put(wsA, i, 4, float(r["구성비(%)"]), blue, "0.0")
ws6 = wb.create_sheet("지표6")
head(ws6, 1, list(IND6[0]), [10, 12, 14, 18, 12, 22, 26, 40, 24, 12])
for i, r in enumerate(IND6, 2):
    for j, k in enumerate(r, 1):
        v = r[k]
        try:
            put(ws6, i, j, float(v), blue, "0.0")
        except ValueError:
            put(ws6, i, j, v)
ws4 = wb.create_sheet("4축표")
head(ws4, 1, cols4, [9, 8, 40, 26, 22, 11, 9, 11, 9, 40])
for i, r in enumerate(four, 2):
    for j, k in enumerate(cols4, 1):
        put(ws4, i, j, r[k] if not isinstance(r[k], float) else r[k], blue if "값" in k else black)
xlsx = os.path.join(HERE, "05_대안비교_매트릭스.xlsx")
wb.save(xlsx)
print("저장", xlsx)
json.dump({"four": four, "cols4": cols4, "S": S, "T": T, "order": order, "rev": rev, "wt": wt, "up": up},
          open(os.path.join(HERE, "raw", "_결과.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
