"""2주차 과제 산출물 4장(PPTX) + 표 CSV 원본 생성.

  ① 개념 다이어그램: 버제스 동심원 이론을 종로 대상지에 대입
  (참고) 대상지 현황 지도: map.html 화면 캡처(assets/site_map_3km.png)
  ② 권역별(1km 링) 건물 밀도 표 — 개수가 아니라 동/km²
  ③ 스마트공원 요소 우선순위표 — 효과 × 난이도 두 축

입력: output/ring_density.json (ring_density.py 실행 결과)
출력: output/과제2주차_산출물.pptx, output/smartpark_priority.csv
"""
import csv
import json
from pathlib import Path
from urllib.parse import quote

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

from slide_kit import (BLUE, INK, MUTED, NAVY, PANEL, WHITE, label_shape, rect,
                       slide_footer, slide_header, style_run, text)

BASE = Path(__file__).parent
OUT = BASE / "output"
R = json.loads((OUT / "ring_density.json").read_text(encoding="utf-8"))
RINGS = R["rings"]
SOURCE = (f"출처: OpenStreetMap · Overpass API 조회 {R['queried']} (OSM 기준일 {R['osm_base']}) · "
          f"중심 {R['center']['name']} {R['center']['lat']}, {R['center']['lon']} · "
          "분류 기준 building 태그(building=yes는 미분류) · 표 원본 CSV 동봉")

BAND_FILL = ["#1F4E9C", "#5B8AC7", "#9FBEE0", "#CCDCEF", "#E9EFF7"]  # 0–1km → 4–5km
ZONES = [
    ("중심업무지구(CBD)", "상업·업무 밀도 {c:,.0f}동/km²로 최고, 건물밀도도 {d:,.0f}동/km²로 가장 높음"),
    ("점이지대", "상업·업무가 {c:,.0f}동/km²로 급감(1/2.6배)하고 주거 {h:,.0f}동/km²와 섞임"),
    ("노동자 주거지대", "밀도 {d:,.0f}동/km²로 최저 — 북악산·인왕산·경복궁이 들어와 이론과 어긋남"),
    ("일반 주거지대", "주거 밀도가 {h:,.0f}동/km²로 회복, 상업·업무는 {c:,.0f}동/km²까지 하락"),
    ("통근자 지대", "주거 밀도 {h:,.0f}동/km²로 최고 — 도심 밖 주거지 성격"),
]

ELEMENTS = [
    # (번호, 요소, 효과, 난이도, 대상지 근거)
    (1, "스마트 가로등(조도 자동제어)", 4, 2, "야간 보행·관광 동선이 많은 도심, 기존 가로등 교체로 적용 가능"),
    (2, "안전 CCTV·비상벨", 5, 3, "관광객·유동인구 집중 구간의 야간 안전 확보"),
    (3, "쿨링포그·스마트 그늘막", 5, 2, "0–1km 건물밀도 1,263동/km²의 고밀 도심, 열섬·폭염 대응"),
    (4, "환경 센서(미세먼지·소음·폭염)", 4, 2, "공원 운영 근거 데이터 확보, 설치 단가 낮음"),
    (5, "보행·이용자 카운터", 4, 2, "OSM 용도 기재율이 25.6%에 그쳐, 이용 실태는 직접 계측해야 함"),
    (6, "공공 와이파이", 3, 1, "이미 서울시 표준 사업이 있어 확장만 하면 됨"),
    (7, "스마트 벤치(태양광 충전)", 3, 2, "관광 체류시간이 긴 고궁 주변에 효과, 단가는 높은 편"),
    (8, "스마트 관수(토양수분 연동)", 3, 3, "녹지 면적이 2–3km 권역에 몰려 있어 도심 공원에서는 효과 제한"),
    (9, "다국어·AR 관광 안내", 3, 4, "외국인 관광객 수요는 있으나 콘텐츠 제작·유지비가 큼"),
    (10, "스마트 화장실(재실·청결 관리)", 4, 4, "관광지 민원 1순위, 급배수·구조 공사가 동반됨"),
    (11, "빗물 저류·스마트 배수", 4, 5, "청계천 등 하천 인접 저지대 침수 대응, 토목 공사 규모 큼"),
    (12, "공원 운영 디지털트윈", 5, 5, "①②의 센서 데이터를 통합해야 성립, 예산·조직 개편 필요"),
]
QUAD = {(True, False): ("즉시 추진", RGBColor(0x1F, 0x4E, 0x9C)),
        (True, True): ("전략 과제", RGBColor(0x2E, 0x9E, 0x6B)),
        (False, False): ("여력 시 추진", RGBColor(0x8A, 0x90, 0x99)),
        (False, True): ("후순위", RGBColor(0xC0, 0x52, 0x1F))}


def quadrant(effect, difficulty):
    return QUAD[(effect >= 4, difficulty >= 3)]


def hexc(s):
    return RGBColor.from_string(s.lstrip("#"))


def dens(ring, use):
    return ring["counts"][use] / ring["area"]


# ── 슬라이드 ① 개념 다이어그램 ────────────────────────────────────────────────
def slide_concept(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    slide_header(s, "과제 ①  개념 다이어그램", "동심원 이론을 대상지에 대입하면 어디서 어긋나는가", 1)

    cx, cy = 3.6, 4.0
    for i in range(4, -1, -1):
        r = (i + 1) * 0.45
        rect(s, cx - r, cy - r, 2 * r, 2 * r, hexc(BAND_FILL[i]), MSO_SHAPE.OVAL, line=WHITE, line_w=1)
    for i, ring in enumerate(RINGS):
        r_mid = (i + 0.5) * 0.45
        color = WHITE if i <= 1 else NAVY
        text(s, cx - 0.78, cy - r_mid - 0.19, 1.56, 0.38,
             [(f"{ring['r_in']}–{ring['r_out']}km\n", {"size": 9, "bold": True}),
              (f"{ring['density']:,.0f}동/km²", {"size": 9})],
             color=color, align=PP_ALIGN.CENTER, line_spacing=1.0)
    label_shape(rect(s, cx - 0.09, cy - 0.09, 0.18, 0.18, RGBColor(0xFF, 0xD9, 0x66), MSO_SHAPE.OVAL), "")
    text(s, cx - 1.1, cy + 0.14, 2.2, 0.25, f"중심 {R['center']['name']}", size=9, bold=True,
         color=WHITE, align=PP_ALIGN.CENTER)
    text(s, 0.6, 6.35, 6.0, 0.3, "원 = 1km 간격 권역, 색 농도 = 건물밀도(동/km²)",
         size=10, color=MUTED, align=PP_ALIGN.CENTER)

    # 오른쪽: 이론 ↔ 관측 대응
    rect(s, 7.0, 1.7, 5.75, 4.55, PANEL)
    rect(s, 7.0, 1.7, 0.07, 4.55, BLUE)
    text(s, 7.3, 1.9, 5.2, 0.3, "버제스 동심원 이론(1925) → 대상지 대입", size=13, bold=True, color=BLUE)
    for i, (zone, tmpl) in enumerate(ZONES):
        ring = RINGS[i]
        y = 2.35 + i * 0.77
        label_shape(rect(s, 7.3, y + 0.02, 0.3, 0.3, NAVY, MSO_SHAPE.OVAL), str(i + 1), size=10)
        text(s, 7.72, y, 4.85, 0.7,
             [(f"{zone} · {ring['ring']}\n", {"bold": True, "size": 11, "color": NAVY}),
              (tmpl.format(c=dens(ring, "상업·업무"), h=dens(ring, "주거"), d=ring["density"]),
               {"size": 10})], line_spacing=1.12)

    text(s, 0.6, 6.62, 12.15, 0.5,
         [("이론이 맞은 부분: ", {"bold": True, "color": BLUE}),
          (f"상업·업무 밀도는 중심에서 바깥으로 {dens(RINGS[0], '상업·업무'):,.0f} → "
           f"{dens(RINGS[-1], '상업·업무'):,.0f}동/km²로 단조 감소함.  ", {}),
          ("어긋난 부분: ", {"bold": True, "color": RGBColor(0xC0, 0x52, 0x1F)}),
          ("주거는 U자형(2–3km에서 최저) — 산지·궁궐이 지대를 끊어 동심원이 성립하지 않음.  ", {}),
          ("해석의 한계: ", {"bold": True, "color": RGBColor(0xC0, 0x52, 0x1F)}),
          (f"용도 기재율이 권역마다 {min(r['rate'] for r in RINGS):.1f}~"
           f"{max(r['rate'] for r in RINGS):.1f}%로 달라, 용도별 밀도 비교는 보정 없이는 단정할 수 없음.", {})],
         size=10, line_spacing=1.15)
    slide_footer(s, SOURCE, y=7.2)


# ── 슬라이드 ①-2 대상지 현황 지도 ────────────────────────────────────────────
def slide_site_map(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    slide_header(s, "참고  대상지 현황", "반경 3km 건물 용도 분포 — 집계의 근거가 된 지도", 2)

    img = BASE / "assets" / "site_map_3km.png"
    h = 4.95
    w = h * 1.271  # 원본 952×749 비율
    s.shapes.add_picture(str(img), Inches(0.6), Inches(1.65), Inches(w), Inches(h))
    text(s, 0.6, 6.7, w, 0.3, "반경 3km 설정 화면 — 색은 용도, 회색 점은 반경 밖(5km까지 수집한 범위)",
         size=10, color=MUTED, align=PP_ALIGN.CENTER)

    px = 0.6 + w + 0.45
    pw = 13.333 - px - 0.6
    rect(s, px, 1.65, pw, 4.95, PANEL)
    rect(s, px, 1.65, 0.07, 4.95, BLUE)
    text(s, px + 0.3, 1.85, pw - 0.6, 0.3, "지도에서 읽히는 것", size=13, bold=True, color=BLUE)
    notes = [
        ("반경 3km · 19,220동 · 용도 기재율 25.6%",
         "지도의 반경을 바꾸면 집계가 즉시 다시 계산됨 — ②의 1km 링 표도 같은 데이터로 산출"),
        ("주황(미분류)이 도심 전역을 덮음",
         "74.4%가 building=yes라 용도를 알 수 없음 — 구성비보다 기재율을 먼저 확인해야 하는 이유"),
        ("용도가 기재된 건물은 구역별로 뭉쳐 있음",
         "파랑(상업·업무)은 종로·을지로 축에, 하늘색(주거)은 서촌·북촌 일부에 몰림 — 자원봉사 매핑이라 "
         "커버리지가 고르지 않음"),
        ("건물이 비는 구역 = 산지·궁궐",
         "북악산·인왕산과 경복궁·창덕궁이 2–3km 권역에 들어와, ①의 동심원 가정이 깨지는 지점과 일치"),
    ]
    for i, (head, body) in enumerate(notes):
        y = 2.35 + i * 1.05
        label_shape(rect(s, px + 0.3, y + 0.02, 0.3, 0.3, NAVY, MSO_SHAPE.OVAL), str(i + 1), size=10)
        text(s, px + 0.72, y, pw - 1.02, 0.95,
             [(head + "\n", {"bold": True, "size": 11, "color": NAVY}), (body, {"size": 10})],
             line_spacing=1.12)

    slide_footer(s, "지도 도구: 팀 제작 map.html(제출물 '참고_건물용도지도.html') · " + SOURCE
                    + " · 반경 판정은 건물 중심점 기준이라 Overpass around 집계(19,332동)보다 112동 적음",
                 y=7.15)


# ── 슬라이드 ② 권역별 밀도 표 ────────────────────────────────────────────────
def slide_density(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    slide_header(s, "과제 ②  권역별 밀도 집계", "1km 간격 링 — 개수가 아니라 밀도(동/km²)로 환산", 3)

    headers = ["권역", "면적\n(km²)", "건물 수\n(동)", "건물밀도\n(동/km²)", "용도기재\n건물 수(동)",
               "용도기재밀도\n(동/km²)", "용도\n기재율", "상업·업무\n(동/km²)", "주거\n(동/km²)"]
    widths = [1.25, 1.05, 1.25, 1.45, 1.45, 1.55, 1.1, 1.5, 1.5]
    rows = len(RINGS) + 2
    table = s.shapes.add_table(rows, len(headers), Inches(0.6), Inches(1.7),
                               Inches(sum(widths)), Inches(2.45)).table
    for i, w in enumerate(widths):
        table.columns[i].width = Inches(w)
    table.rows[0].height = Inches(0.55)

    def cell(r, c, value, bold=False, color=INK, size=10.5, fill=None):
        cl = table.cell(r, c)
        cl.margin_left = cl.margin_right = Inches(0.05)
        cl.margin_top = cl.margin_bottom = Inches(0.03)
        cl.vertical_anchor = MSO_ANCHOR.MIDDLE
        if fill is not None:
            cl.fill.solid()
            cl.fill.fore_color.rgb = fill
        for j, line in enumerate(str(value).split("\n")):
            p = cl.text_frame.paragraphs[0] if j == 0 else cl.text_frame.add_paragraph()
            p.alignment = PP_ALIGN.CENTER if c else PP_ALIGN.LEFT
            style_run(p.add_run(), size=size, color=color, bold=bold)
            p.runs[-1].text = line

    for c, h in enumerate(headers):
        cell(0, c, h, bold=True, color=WHITE, size=9.5, fill=NAVY)
    for i, ring in enumerate(RINGS, start=1):
        r = RINGS[i - 1]
        bg = WHITE if i % 2 else RGBColor(0xF5, 0xF7, 0xFA)
        vals = [r["ring"], f"{r['area']:.2f}", f"{r['total']:,}", f"{r['density']:,.1f}",
                f"{r['total'] - r['counts']['미분류']:,}", f"{r['density_classified']:,.1f}",
                f"{r['rate']:.1f}%", f"{dens(r, '상업·업무'):,.1f}", f"{dens(r, '주거'):,.1f}"]
        for c, v in enumerate(vals):
            cell(i, c, v, bold=(c == 0 or c == 3), fill=bg,
                 color=BLUE if c == 3 else INK)
    tot_n = sum(r["total"] for r in RINGS)
    tot_a = sum(r["area"] for r in RINGS)
    tot_cl = sum(r["total"] - r["counts"]["미분류"] for r in RINGS)
    totals = ["합계 0–5km", f"{tot_a:.2f}", f"{tot_n:,}", f"{tot_n / tot_a:,.1f}", f"{tot_cl:,}",
              f"{tot_cl / tot_a:,.1f}", f"{tot_cl / tot_n * 100:.1f}%",
              f"{sum(r['counts']['상업·업무'] for r in RINGS) / tot_a:,.1f}",
              f"{sum(r['counts']['주거'] for r in RINGS) / tot_a:,.1f}"]
    for c, v in enumerate(totals):
        cell(rows - 1, c, v, bold=True, fill=RGBColor(0xE8, 0xEE, 0xF7), color=NAVY)

    # 권역별 밀도 막대그래프(네이티브 차트)
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
    cd = CategoryChartData()
    cd.categories = [r["ring"] for r in RINGS]
    cd.add_series("건물밀도", [round(r["density"], 1) for r in RINGS])
    cd.add_series("용도기재 건물밀도", [round(r["density_classified"], 1) for r in RINGS])
    chart = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.6), Inches(4.4),
                               Inches(6.9), Inches(2.5), cd).chart
    chart.has_title = False
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.TOP
    chart.legend.include_in_layout = False
    chart.legend.font.size = Pt(10)
    chart.legend.font.name = "Malgun Gothic"
    plot = chart.plots[0]
    plot.gap_width = 60
    plot.has_data_labels = True
    plot.data_labels.font.size = Pt(9)
    plot.data_labels.font.name = "Malgun Gothic"
    plot.data_labels.number_format = "#,##0"
    plot.data_labels.number_format_is_linked = False
    chart.series[0].format.fill.solid()
    chart.series[0].format.fill.fore_color.rgb = BLUE
    chart.series[1].format.fill.solid()
    chart.series[1].format.fill.fore_color.rgb = RGBColor(0xC0, 0x52, 0x1F)
    for axis in (chart.category_axis, chart.value_axis):
        axis.tick_labels.font.size = Pt(10)
        axis.tick_labels.font.name = "Malgun Gothic"
    chart.value_axis.has_major_gridlines = True

    rect(s, 7.75, 4.4, 5.0, 2.5, PANEL)
    rect(s, 7.75, 4.4, 0.07, 2.5, BLUE)
    text(s, 8.05, 4.6, 4.5, 0.3, "읽는 법", size=12, bold=True, color=BLUE)
    items = [
        f"밀도로 바꾸면 순위가 뒤집힘: 4–5km 권역은 건물 수가 {RINGS[-1]['total']:,}동으로 가장 많지만, "
        f"면적이 {RINGS[-1]['area']:.1f}km²라 밀도는 {RINGS[-1]['density']:,.0f}동/km²로 "
        f"0–1km({RINGS[0]['density']:,.0f})의 3분의 1 수준임",
        f"2–3km가 {RINGS[2]['density']:,.0f}동/km²로 가장 낮음 — 북악산·인왕산과 경복궁·창덕궁이 이 권역에 들어옴",
        f"용도기재밀도(주황)는 모든 권역에서 절반 이하 — 기재율 {min(r['rate'] for r in RINGS):.1f}~"
        f"{max(r['rate'] for r in RINGS):.1f}%",
    ]
    for i, t in enumerate(items):
        y = 5.0 + i * 0.63
        label_shape(rect(s, 8.05, y + 0.02, 0.26, 0.26, NAVY, MSO_SHAPE.OVAL), str(i + 1), size=9)
        text(s, 8.42, y, 4.15, 0.6, t, size=9.5, line_spacing=1.12)
    slide_footer(s, SOURCE + " · 면적 = π(r_out²−r_in²), 건물 중심점 기준")


# ── 슬라이드 ③ 스마트공원 요소 우선순위 ──────────────────────────────────────
def slide_priority(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    slide_header(s, "과제 ③  스마트공원 요소 우선순위", "효과 × 난이도 — 먼저 깔 것과 나중에 붙일 것", 4)

    x0, y0, w, h = 1.35, 1.9, 5.3, 4.2   # 매트릭스 플롯 영역
    rect(s, x0, y0, w / 2, h / 2, RGBColor(0xEA, 0xF0, 0xF9))          # 좌상: 즉시 추진
    rect(s, x0 + w / 2, y0, w / 2, h / 2, RGBColor(0xE8, 0xF4, 0xEE))  # 우상: 전략 과제
    rect(s, x0, y0 + h / 2, w / 2, h / 2, RGBColor(0xF2, 0xF3, 0xF5))  # 좌하: 여력 시
    rect(s, x0 + w / 2, y0 + h / 2, w / 2, h / 2, RGBColor(0xFA, 0xEE, 0xE9))
    for label, qx, qy, color in [("즉시 추진", x0 + 0.1, y0 + 0.08, QUAD[(True, False)][1]),
                                 ("전략 과제", x0 + w / 2 + 0.1, y0 + 0.08, QUAD[(True, True)][1]),
                                 ("여력 시 추진", x0 + 0.1, y0 + h - 0.32, QUAD[(False, False)][1]),
                                 ("후순위", x0 + w / 2 + 0.1, y0 + h - 0.32, QUAD[(False, True)][1])]:
        text(s, qx, qy, 1.6, 0.25, label, size=10, bold=True, color=color)
    text(s, x0, y0 + h + 0.12, w, 0.3, "난이도(예산·공사·협의) →", size=10.5, bold=True,
         color=MUTED, align=PP_ALIGN.CENTER)
    tb = text(s, 0, 0, 2.8, 0.3, "효과(체감·정책 기여) →", size=10.5, bold=True, color=MUTED,
              align=PP_ALIGN.CENTER)
    tb.rotation = 270  # 아래에서 위로 읽히게
    tb.left, tb.top = Inches(x0 - 0.45 - 1.4), Inches(y0 + h / 2 - 0.15)

    used = []
    for num, name, effect, diff, _ in ELEMENTS:
        px = x0 + (diff - 0.5) / 5 * w
        py = y0 + h - (effect - 0.5) / 5 * h
        while any(abs(px - ux) < 0.34 and abs(py - uy) < 0.34 for ux, uy in used):
            px += 0.36
        used.append((px, py))
        label_shape(rect(s, px - 0.16, py - 0.16, 0.32, 0.32, quadrant(effect, diff)[1],
                         MSO_SHAPE.OVAL), str(num), size=10)

    cols = [0.42, 2.83, 0.75, 0.85, 0.99]
    table = s.shapes.add_table(len(ELEMENTS) + 1, 5, Inches(6.95), Inches(1.75),
                               Inches(sum(cols)), Inches(4.9)).table
    for i, c in enumerate(cols):
        table.columns[i].width = Inches(c)

    def cell(r, c, value, bold=False, color=INK, size=9.5, fill=None, align=None):
        cl = table.cell(r, c)
        cl.margin_left = cl.margin_right = Inches(0.04)
        cl.margin_top = cl.margin_bottom = Inches(0.02)
        cl.vertical_anchor = MSO_ANCHOR.MIDDLE
        cl.text_frame.word_wrap = False  # 점수 표시(●●●●●)가 줄바꿈되지 않게
        if fill is not None:
            cl.fill.solid()
            cl.fill.fore_color.rgb = fill
        p = cl.text_frame.paragraphs[0]
        p.alignment = align or (PP_ALIGN.LEFT if c == 1 else PP_ALIGN.CENTER)
        p._p.get_or_add_pPr().set("eaLnBrk", "0")
        style_run(p.add_run(), size=size, color=color, bold=bold)
        p.runs[-1].text = str(value)

    for c, head in enumerate(["#", "스마트공원 요소", "효과", "난이도", "구분"]):
        cell(0, c, head, bold=True, color=WHITE, size=9.5, fill=NAVY)
    for i, (num, name, effect, diff, _) in enumerate(ELEMENTS, start=1):
        qname, qcolor = quadrant(effect, diff)
        bg = WHITE if i % 2 else RGBColor(0xF5, 0xF7, 0xFA)
        cell(i, 0, num, bold=True, color=qcolor, fill=bg)
        cell(i, 1, name, fill=bg)
        cell(i, 2, "●" * effect, color=BLUE, fill=bg, size=8)
        cell(i, 3, "●" * diff, color=RGBColor(0xC0, 0x52, 0x1F), fill=bg, size=8)
        cell(i, 4, qname, color=qcolor, bold=True, fill=bg, size=9)

    text(s, 0.6, 6.55, 6.2, 0.35,
         [("평가 기준: ", {"bold": True, "color": BLUE}),
          ("효과 = 이용자 체감·정책 기여도(5점), 난이도 = 예산·공사 규모·관계기관 협의(5점). "
           "문화재 주변 심의가 필요한 항목은 난이도를 한 단계 올려 잡음", {})],
         size=9.5, color=INK, line_spacing=1.1)
    slide_footer(s, "요소별 대상지 근거·점수는 smartpark_priority.csv(원본) 참조 · "
                    f"대상지 현황 출처: OpenStreetMap · Overpass API 조회 {R['queried']}", y=7.15)


# ── 슬라이드 ④ 산출물·출처 기록 ──────────────────────────────────────────────
REPO_URL = "https://github.com/choemyeongwon1-ui/kaya"
PDF_URL = (REPO_URL + "/blob/main/"
           + quote("과제_2주차/2주차_과제_종로밀도_스마트공원.pdf"))

OUTPUT_ROWS = [
    ("①", "개념 다이어그램 — 동심원 이론 대입", "PDF 1쪽", "2026.09.14"),
    ("참고", "대상지 현황 지도", "PDF 2쪽 · 참고_건물용도지도.html", "2026.09.14"),
    ("②", "권역별(1km 링) 밀도표", "PDF 3쪽 · ring_density.csv · ring_density_by_use.csv",
     "2026.09.14"),
    ("③", "스마트공원 요소 우선순위표", "PDF 4쪽 · smartpark_priority.csv", "2026.09.20 작성"),
]
SOURCE_ROWS = [
    ("데이터 출처", "OpenStreetMap contributors (ODbL)"),
    ("수집 도구", "Overpass API — overpass-api.de · private.coffee · kumi.systems"),
    ("조회일", "2026.09.14 (수집) · 2026.09.20 (집계·작성)"),
    ("OSM 기준일", "2026.09.14 (timestamp_osm_base)"),
    ("수집 범위", "종로구청 37.5735, 126.9788 기준 반경 5km"),
    ("수집 건물", "39,378동 (way·relation의 building 태그)"),
    ("질의 원본", "data/*.overpassql — 그대로 재실행하면 동일 데이터 수집"),
    ("분류 기준", "building 태그 값, building=yes는 미분류로 둠"),
]


def slide_records(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    slide_header(s, "과제 ④  산출물·출처 기록", "세 산출물을 어디에 두고, 무엇을 언제 조회했는가", 5)

    def table(x, y, w, h, headers, widths, rows, first_bold=True):
        t = s.shapes.add_table(len(rows) + 1, len(headers), Inches(x), Inches(y),
                               Inches(w), Inches(h)).table
        for i, cw in enumerate(widths):
            t.columns[i].width = Inches(cw)
        for r in range(len(rows) + 1):
            for c in range(len(headers)):
                cl = t.cell(r, c)
                cl.margin_left = cl.margin_right = Inches(0.07)
                cl.margin_top = cl.margin_bottom = Inches(0.035)
                cl.vertical_anchor = MSO_ANCHOR.MIDDLE
                cl.fill.solid()
                cl.fill.fore_color.rgb = (NAVY if r == 0 else
                                          (WHITE if r % 2 else RGBColor(0xF5, 0xF7, 0xFA)))
                value = headers[c] if r == 0 else rows[r - 1][c]
                p = cl.text_frame.paragraphs[0]
                p.alignment = PP_ALIGN.CENTER if (r == 0 or c == 0) else PP_ALIGN.LEFT
                p._p.get_or_add_pPr().set("eaLnBrk", "0")
                style_run(p.add_run(), size=10,
                          color=WHITE if r == 0 else (NAVY if c == 0 and first_bold else INK),
                          bold=(r == 0 or (c == 0 and first_bold)))
                p.runs[-1].text = str(value)
        return t

    text(s, 0.6, 1.62, 7.4, 0.3, "산출물 기록", size=13, bold=True, color=BLUE)
    table(0.6, 1.98, 7.4, 1.9, ["과제", "산출물", "파일 · 위치", "조회일"],
          [0.62, 2.6, 3.08, 1.1], OUTPUT_ROWS)

    text(s, 0.6, 4.15, 7.4, 0.3, "출처·조회 기록", size=13, bold=True, color=BLUE)
    table(0.6, 4.51, 7.4, 2.35, ["항목", "내용"], [1.35, 6.05], SOURCE_ROWS)

    px, pw = 8.35, 4.4
    rect(s, px, 1.62, pw, 5.24, PANEL)
    rect(s, px, 1.62, 0.07, 5.24, BLUE)
    text(s, px + 0.3, 1.82, pw - 0.6, 0.3, "보관 위치", size=13, bold=True, color=BLUE)
    blocks = [
        ("팀 저장소", [
            ("github.com/choemyeongwon1-ui/kaya", {"size": 9.5, "color": BLUE, "link": REPO_URL}),
            ("\n과제 PDF 바로 열기 → ", {"size": 9.5}),
            ("2주차_과제_종로밀도_스마트공원.pdf", {"size": 9.5, "color": BLUE, "link": PDF_URL}),
            ("\n표 CSV 원본과 재현 스크립트도 같은 폴더에 있음", {"size": 9.5}),
        ]),
        ("제출 폴더", "submit/2주차/\nPDF·PPTX·표 CSV 3종·참고 지도·Overpass 질의 원본을 한 곳에 모아 둠"),
        ("재현 방법", "python analyze.py --refresh\npython ring_density.py\npython build_assignment.py"),
        ("밝혀 둘 한계", "용도 기재율이 권역마다 21.6~32.4%로 달라, 용도별 밀도의 절대 비교는 "
                     "건축물대장·도시계획현황과 교차검증한 뒤에 확정해야 함"),
    ]
    for i, (head, body) in enumerate(blocks):
        y = 2.32 + i * 1.17
        label_shape(rect(s, px + 0.3, y + 0.02, 0.3, 0.3, NAVY, MSO_SHAPE.OVAL), str(i + 1), size=10)
        runs = body if isinstance(body, list) else [(body, {"size": 9.5})]
        text(s, px + 0.72, y, pw - 1.02, 1.05,
             [(head + "\n", {"bold": True, "size": 11, "color": NAVY}), *runs], line_spacing=1.15)

    slide_footer(s, SOURCE, y=7.1)


def write_priority_csv():
    path = OUT / "smartpark_priority.csv"
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow([f"# 스마트공원 요소 우선순위표 (효과 × 난이도) · 대상지 {R['center']['name']} 반경 5km"])
        w.writerow([f"# {SOURCE}"])
        w.writerow(["# 효과: 이용자 체감·정책 기여도 5점 척도 / 난이도: 예산·공사 규모·관계기관 협의 5점 척도"])
        w.writerow(["번호", "요소", "효과(1-5)", "난이도(1-5)", "점수(효과-난이도)", "구분", "대상지 근거"])
        for num, name, effect, diff, why in sorted(ELEMENTS, key=lambda e: (e[3] - e[2], -e[2])):
            w.writerow([num, name, effect, diff, effect - diff, quadrant(effect, diff)[0], why])
    return path


def main():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    slide_concept(prs)
    slide_site_map(prs)
    slide_density(prs)
    slide_priority(prs)
    slide_records(prs)
    pptx_path = OUT / "과제2주차_산출물.pptx"
    prs.save(pptx_path)
    csv_path = write_priority_csv()
    print(pptx_path)
    print(csv_path)


if __name__ == "__main__":
    main()
