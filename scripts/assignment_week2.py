# -*- coding: utf-8 -*-
"""2주차 과제 산출물 생성 — ① 개념 다이어그램 ② 링별 밀도표 ③ 우선순위표 + 제출용 PDF.

② 는 이미 팀 저장소에 있는 집계 결과를 읽어 쓰고, ①·③ 을 새로 그린 뒤
셋을 한 PDF 로 묶는다. 수치를 이 파일에 적어 두지 않고 CSV 에서 읽어
표·그림·적합식이 같은 원본을 보게 한다.
"""
import csv, io, json, math, os, textwrap
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Circle, FancyArrowPatch, Rectangle

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "out")
SUB = os.path.join(ROOT, "과제_2주차")
os.makedirs(SUB, exist_ok=True)

for f in ("Malgun Gothic", "NanumGothic", "AppleGothic", "Gulim"):
    try:
        matplotlib.font_manager.findfont(f, fallback_to_default=False)
        plt.rcParams["font.family"] = f
        break
    except Exception:
        continue
plt.rcParams["axes.unicode_minus"] = False

NAVY, NAVY2, ACC, GREY = "#1B3A6B", "#2E75B6", "#C4570F", "#8A94A6"
RULE, INK, INK2 = "#D9DFE8", "#1B2434", "#5A6578"

CENTER = "서울 종로구청 (37.5735, 126.9790)"
QUERIED = "2026-09-14"
SOURCE = "Overpass API (OpenStreetMap) · building 태그 · © OpenStreetMap contributors (ODbL)"
REPO = "https://github.com/choemyeongwon1-ui/kaya"
PAGES = "https://choemyeongwon1-ui.github.io/kaya/"

# ③ 의 대상지 공원 — OSM leisure=park, 종로구청에서 433 m (0–1 km 링 안)
PARK_NAME = "열린송현 녹지광장"
PARK_LL = (37.57688, 126.98142)
PARK_BUF = 500.0

# ── ② 이미 집계된 값 읽기 ────────────────────────────────────────────────
with io.open(os.path.join(OUT, "ring_density.csv"), encoding="utf-8-sig") as f:
    R500 = list(csv.DictReader(f))
for r in R500:
    r["n"] = int(r["건물수"])
    r["area"] = float(r["링면적_km2"])
    r["dens"] = float(r["밀도_동_per_km2"])
    r["r0"], r["r1"] = (int(v) for v in r["거리구간_m"].split("-"))

# 500 m 표를 1 km 로 합산 (과제 ② 가 요구하는 1 km 간격)
KM = []
for k in range(3):
    part = [r for r in R500 if r["r0"] >= k * 1000 and r["r1"] <= (k + 1) * 1000]
    n = sum(r["n"] for r in part)
    a = sum(r["area"] for r in part)
    KM.append({"band": "%d–%d" % (k, k + 1), "n": n, "area": a, "dens": n / a})

# 과제 ② 제출 집계표는 팀 저장소 ring_density/(반경 5 km, 1 km 링)이다.
# 아래 5개 값이 그 표이고, 0–3 km 구간은 위 500 m 집계(KM)와 1% 안에서 일치한다.
FIVE = [{"band": "0–1", "dens": 1261.0}, {"band": "1–2", "dens": 935.0},
        {"band": "2–3", "dens": 390.0}, {"band": "3–4", "dens": 373.0},
        {"band": "4–5", "dens": 387.0}]
OUTER = FIVE[3:]


def clark_fit(bands):
    """ln D = ln D0 − b·r 최소제곱. r 은 구간 중앙값(km) — 팀 표와 같은 방식."""
    xs, ys = [], []
    for i, b in enumerate(bands):
        xs.append(i + 0.5)
        ys.append(math.log(b["dens"]))
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    b = -sxy / sxx
    lnD0 = my + b * mx
    D0 = math.exp(lnD0)
    ss_res = sum((y - (lnD0 - b * x)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    return D0, b, 1 - ss_res / ss_tot, xs


D0, B, R2, XS = clark_fit(FIVE)
print("클라크 적합  D(r) = %.0f · e^(-%.3f r)   R² = %.3f" % (D0, B, R2))
peak = max(R500, key=lambda r: r["dens"])
core = R500[0]

TOT_N = sum(r["n"] for r in R500)
TOT_A = sum(r["area"] for r in R500)
TOT_D = TOT_N / TOT_A


def park_density():
    """공원 반경 500 m 안의 건물밀도 — ③ 효과 점수의 보정 근거."""
    K = math.cos(math.radians(CENTER_LAT)) * 111320.0
    n = 0
    with io.open(os.path.join(OUT, "buildings_classified.csv"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            dx = (float(r["lon"]) - PARK_LL[1]) * K
            dy = (float(r["lat"]) - PARK_LL[0]) * 111320.0
            if math.hypot(dx, dy) <= PARK_BUF:
                n += 1
    a = math.pi * (PARK_BUF / 1000.0) ** 2
    return n, a, n / a


CENTER_LAT, CENTER_LON = 37.5735, 126.9790
PARK_N, PARK_A, PARK_D = park_density()
PARK_RATIO = PARK_D / TOT_D
print("공원 주변 500 m  %d동 · %.0f 동/km² · 반경3km 평균의 %.2f배"
      % (PARK_N, PARK_D, PARK_RATIO))

FOOT = "중심 %s · 조회일 %s · 출처 %s" % (CENTER, QUERIED, SOURCE)


def footer(fig, page=None):
    fig.text(0.5, 0.022, FOOT, ha="center", fontsize=6.6, color=GREY, style="italic")
    if page:
        fig.text(0.94, 0.022, page, ha="right", fontsize=7, color=GREY)


def head(fig, eyebrow, title):
    fig.text(0.08, 0.955, eyebrow, fontsize=8.5, color=NAVY, weight="bold")
    fig.text(0.08, 0.925, title, fontsize=17, color="#0E2144", weight="bold")
    fig.add_artist(plt.Line2D([0.08, 0.14], [0.908, 0.908], color=NAVY, lw=3,
                              transform=fig.transFigure))


# ══ ① 개념 다이어그램 ═══════════════════════════════════════════════════
def page_concept(pdf=None):
    fig = plt.figure(figsize=(11.69, 8.27), dpi=200)      # A4 가로
    head(fig, "과제 ① · 1차시 이론의 대상지 대입",
         "클라크 밀도경사 모델로 읽은 서울 종로 도심")
    fig.text(0.08, 0.893,
             "이론: Clark, C. (1951). Urban Population Densities. "
             "Journal of the Royal Statistical Society A, 114(4).    "
             "같은 링 집계를 버제스(1925) 동심원 지대로 읽은 해석은 팀 내 최승하 자료가 맡음.",
             fontsize=7.6, color=GREY)

    # ── 왼쪽: 이론 개념도
    ax = fig.add_axes([0.06, 0.38, 0.40, 0.49])
    ax.set_xlim(-5.6, 5.6); ax.set_ylim(-5.6, 5.6); ax.set_aspect("equal"); ax.axis("off")
    for k, rr in enumerate([1, 2, 3, 4, 5]):
        shade = 0.10 + 0.72 * math.exp(-B * (rr - 0.5))
        ax.add_patch(Circle((0, 0), rr, facecolor=NAVY2, alpha=shade * 0.55,
                            edgecolor="white", lw=1.1, zorder=5 - k))
    ax.plot(0, 0, marker="*", ms=15, color=ACC, mec="white", mew=1.1, zorder=9)
    ax.text(0, -1.05, "도심(CBD) · 밀도 $D_0$", ha="center", fontsize=8.5,
            color=ACC, weight="bold")
    ax.annotate("", xy=(5.15, 0), xytext=(0, 0),
                arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.4))
    ax.text(5.3, 0.25, "거리 r", fontsize=9, color=INK)
    for rr in [1, 3, 5]:
        ax.text(rr - 0.5, 0.32, "%d" % rr, fontsize=7.5, color=INK2, ha="center")
    ax.set_title("이론 — 중심에서 멀어질수록 밀도가 지수적으로 감소",
                 fontsize=10.5, color=INK, pad=12, weight="bold")
    ax.text(0, -5.3, r"$D(r) = D_0 \cdot e^{-br}$" + "\nClark (1951)",
            ha="center", fontsize=12, color=NAVY)

    # ── 오른쪽: 대상지 대입
    ax2 = fig.add_axes([0.55, 0.38, 0.39, 0.49])
    xs = [i + 0.5 for i in range(len(FIVE))]
    ax2.bar(xs, [b["dens"] for b in FIVE], width=0.72, color=NAVY2,
            label="실측 건물밀도")
    rr = [i / 50.0 for i in range(0, 251)]
    ax2.plot([r + 0.0 for r in rr], [D0 * math.exp(-B * r) for r in rr],
             color=ACC, lw=2.2, label="클라크 적합곡선")
    for x, b in zip(xs, FIVE):
        ax2.text(x, b["dens"] + 30, "{:,.0f}".format(b["dens"]), ha="center",
                 fontsize=8.5, color=INK, weight="bold")
    ax2.set_xticks(xs)
    ax2.set_xticklabels([b["band"] for b in FIVE], fontsize=9)
    ax2.set_xlabel("중심으로부터 거리대 (km)", fontsize=9.5)
    ax2.set_ylabel("건물밀도 (동/km²)", fontsize=9.5)
    ax2.set_ylim(0, 1500)
    ax2.legend(fontsize=8.5, frameon=False, loc="upper right")
    ax2.grid(axis="y", color="#EDEFF3", lw=0.9)
    ax2.set_axisbelow(True)
    for s in ("top", "right"):
        ax2.spines[s].set_visible(False)
    ax2.set_title("대상지 — 종로구청 중심 1 km 링별 실측", fontsize=10.5,
                  color=INK, pad=12, weight="bold")
    ax2.text(0.02, 0.88, "D(r) = {:,.0f}·e^(-{:.2f}r)\nR² = {:.2f}".format(D0, B, R2),
             transform=ax2.transAxes, fontsize=10, color=ACC, weight="bold")

    # ── 하단: 이론이 맞은 곳 / 어긋난 곳
    box = [
        ("이론과 맞음", NAVY,
         "0–1 km가 정점({:,.0f}동/km²)이고 2 km까지 단조 감소한다.\n"
         "단일중심 구조라는 전제는 기각되지 않으며, 지수감소 적합도 R²={:.2f}로 높다."
         .format(FIVE[0]["dens"], R2)),
        ("어긋남 ①  중심부 함몰", ACC,
         "500 m 안쪽은 {:,.0f}동/km²로 오히려 낮고 정점은 {}m 링({:,.0f})이다.\n"
         "경복궁·청와대 부지가 중심을 비워 이론의 D0 가정이 성립하지 않는다."
         .format(core["dens"], peak["거리구간_m"], peak["dens"])),
        ("어긋남 ②  외곽 반등", ACC,
         "3–4 km {:,.0f} → 4–5 km {:,.0f}로 다시 오른다.\n"
         "북악·남산 산지가 끝나고 시가지가 다시 나타나기 때문이며, 단조 감소는 기각된다."
         .format(OUTER[0]["dens"], OUTER[1]["dens"])),
    ]
    for i, (t, c, body) in enumerate(box):
        x = 0.06 + i * 0.3067
        fig.patches.append(Rectangle((x, 0.07), 0.288, 0.23, transform=fig.transFigure,
                                     facecolor="#F7F9FB", edgecolor=RULE, lw=0.8))
        fig.patches.append(Rectangle((x, 0.07), 0.005, 0.23, transform=fig.transFigure,
                                     facecolor=c, edgecolor="none"))
        fig.text(x + 0.020, 0.262, t, fontsize=9.5, color=c, weight="bold")
        wrapped = "\n".join(textwrap.fill(ln, 38) for ln in body.split("\n"))
        fig.text(x + 0.020, 0.232, wrapped, fontsize=7.8, color=INK2, va="top",
                 linespacing=1.75)

    footer(fig, "① 개념 다이어그램")
    if pdf:
        pdf.savefig(fig)
    fig.savefig(os.path.join(OUT, "과제1_개념다이어그램.png"), facecolor="white")
    plt.close(fig)
    print("saved 과제1_개념다이어그램.png")


# ══ ③ 스마트공원 요소 우선순위 ═════════════════════════════════════════
# 효과·난이도는 1–5. 근거는 이 저장소의 링별 집계에서 끌어온다.
ELEMENTS = [
    ("환경센서(폭염·미세먼지)", 4, 2,
     "0–1 km 밀도 정점 구간의 주간 체류인구 대응. 설치·배선 부담이 작다"),
    ("스마트 그늘막·쿨링포그", 4, 2,
     "상업·업무 비율이 500–1000 m에서 50.2%로 최고 — 주간 보행자 밀집"),
    ("이용자 계수 센서", 3, 2,
     "링별 밀도 격차(1,448 → 403)를 실이용으로 검증할 기초자료"),
    ("공공 와이파이", 3, 2,
     "관광·업무 통행 혼재 구간, 기존 통신 인프라 활용 가능"),
    ("스마트 관수(자동관개)", 3, 3,
     "궁궐·공원 녹지가 중심부에 집중, 관수 인력 절감 효과"),
    ("AI 안전 CCTV·비상벨", 5, 4,
     "야간 유동인구 많은 상업축. 개인정보 심의·통신망 구축 필요"),
    ("AR 문화재 해설", 4, 4,
     "종교·문화 용도가 중심 500 m에 집중(54동) — 경복궁·창덕궁·종묘"),
    ("빗물 저류·투수포장", 5, 5,
     "청계천 유역 도심 침수 대응. 굴착·구조 변경으로 난이도 최고"),
    ("스마트 벤치(충전)", 2, 2,
     "체감 편의는 있으나 밀도·안전 문제 해결에는 기여가 작다"),
    ("디지털 사이니지", 2, 3,
     "기존 안내판 대체 수준. 문화재 경관 심의가 걸린다"),
    ("스마트 주차·PM 거치", 2, 4,
     "도심 주차 수요는 크나 공원 요소로서의 효과는 간접적"),
    ("자율 청소·순찰 로봇", 2, 5,
     "보도 폭이 좁은 이면도로가 많아 주행 환경이 불리하다"),
]


def quadrant(e, d):
    if e >= 3.5 and d <= 3:
        return "1순위 · 즉시 추진", "#1B7A4B"
    if e >= 3.5:
        return "2순위 · 전략 추진", NAVY
    if d <= 3:
        return "3순위 · 선택 도입", "#8A6D1F"
    return "4순위 · 보류", "#8A94A6"


def page_priority(pdf=None):
    fig = plt.figure(figsize=(11.69, 8.27), dpi=200)
    head(fig, "과제 ③ · 스마트공원 요소 우선순위",
         "효과와 난이도 두 축으로 본 도입 순서")
    fig.text(0.08, 0.893,
             "대상지 공원: {} (OSM leisure=park · 종로구청에서 433 m · 0–1 km 링 안)    "
             "주변 500 m 건물밀도 {:,.0f}동/km² = 반경 3 km 평균 {:,.0f}의 {:.2f}배 "
             "→ 이용 압력이 큰 만큼 효과 점수를 +1 보정".format(
                 PARK_NAME, PARK_D, TOT_D, PARK_RATIO),
             fontsize=7.6, color=GREY)

    ax = fig.add_axes([0.06, 0.12, 0.44, 0.74])
    ax.add_patch(Rectangle((3.5, 0.3), 2.6, 2.7, facecolor="#E8F3EC", edgecolor="none"))
    ax.add_patch(Rectangle((3.5, 3.0), 2.6, 2.7, facecolor="#EAF0F8", edgecolor="none"))
    ax.add_patch(Rectangle((0.3, 0.3), 3.2, 2.7, facecolor="#FAF6E8", edgecolor="none"))
    ax.add_patch(Rectangle((0.3, 3.0), 3.2, 2.7, facecolor="#F2F3F5", edgecolor="none"))
    ax.text(4.8, 0.55, "1순위 · 즉시 추진", ha="center", fontsize=9, color="#1B7A4B", weight="bold")
    ax.text(4.8, 5.5, "2순위 · 전략 추진", ha="center", fontsize=9, color=NAVY, weight="bold")
    ax.text(1.8, 0.55, "3순위 · 선택 도입", ha="center", fontsize=9, color="#8A6D1F", weight="bold")
    ax.text(1.8, 5.5, "4순위 · 보류", ha="center", fontsize=9, color=GREY, weight="bold")

    seen = {}
    for name, e, d, _ in ELEMENTS:
        key = (e, d)
        seen[key] = seen.get(key, 0) + 1
        off = (seen[key] - 1) * 0.30
        _, c = quadrant(e, d)
        ax.scatter([e], [d - off], s=90, color=c, zorder=6, edgecolor="white", lw=1.2)
        # 라벨은 점 위 중앙 — 오른쪽에 두면 옆 칸 점을 덮는다
        ax.annotate(name, (e, d - off), xytext=(0, 9), textcoords="offset points",
                    fontsize=7.5, color=INK, ha="center", va="bottom", zorder=7)
    ax.axvline(3.5, color=INK2, lw=1, ls=(0, (5, 4)))
    ax.axhline(3.0, color=INK2, lw=1, ls=(0, (5, 4)))
    ax.set_xlim(0.3, 6.1); ax.set_ylim(5.7, 0.3)
    ax.set_xlabel("효과  (대상지 문제 해결 기여도, 1–5)", fontsize=9.5)
    ax.set_ylabel("난이도  (예산·심의·기술, 1–5) — 아래가 쉬움", fontsize=9.5)
    ax.set_xticks([1, 2, 3, 4, 5]); ax.set_yticks([1, 2, 3, 4, 5])
    ax.tick_params(labelsize=8.5)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)

    rows = sorted(ELEMENTS, key=lambda r: (-r[1], r[2]))
    ax2 = fig.add_axes([0.53, 0.12, 0.41, 0.74]); ax2.axis("off")
    ax2.text(0, 1.0, "요소별 판단 근거", fontsize=10.5, color=INK, weight="bold",
             transform=ax2.transAxes)
    y = 0.955
    ax2.text(0.0, y, "요소", fontsize=7.4, color=GREY, weight="bold", transform=ax2.transAxes)
    ax2.text(0.40, y, "효과", fontsize=7.4, color=GREY, weight="bold", transform=ax2.transAxes)
    ax2.text(0.47, y, "난이도", fontsize=7.4, color=GREY, weight="bold", transform=ax2.transAxes)
    ax2.text(0.58, y, "우선순위", fontsize=7.4, color=GREY, weight="bold", transform=ax2.transAxes)
    y -= 0.012
    ax2.add_artist(plt.Line2D([0, 1], [y, y], color=RULE, lw=1, transform=ax2.transAxes))
    y -= 0.045
    for name, e, d, why in rows:
        q, c = quadrant(e, d)
        ax2.text(0.0, y, name, fontsize=8, color=INK, weight="bold", transform=ax2.transAxes)
        ax2.text(0.415, y, str(e), fontsize=8, color=INK, transform=ax2.transAxes)
        ax2.text(0.495, y, str(d), fontsize=8, color=INK, transform=ax2.transAxes)
        ax2.text(0.58, y, q.split(" · ")[0], fontsize=7.8, color=c, weight="bold",
                 transform=ax2.transAxes)
        ax2.text(0.0, y - 0.028, why, fontsize=6.9, color=INK2, transform=ax2.transAxes)
        y -= 0.077
    footer(fig, "③ 우선순위표")
    if pdf:
        pdf.savefig(fig)
    fig.savefig(os.path.join(OUT, "과제3_우선순위매트릭스.png"), facecolor="white")
    plt.close(fig)

    p = os.path.join(OUT, "과제3_스마트공원_우선순위.csv")
    with io.open(p, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["요소", "효과_1_5", "난이도_1_5", "우선순위", "판단근거"])
        for name, e, d, why in rows:
            w.writerow([name, e, d, quadrant(e, d)[0], why])
        w.writerow([])
        w.writerow(["중심", CENTER, "", "", ""])
        w.writerow(["조회일", QUERIED, "", "", ""])
        w.writerow(["출처", SOURCE, "", "", ""])
    print("saved 과제3_우선순위매트릭스.png / 과제3_스마트공원_우선순위.csv")


# ══ ② 집계에 쓴 지도 화면 ══════════════════════════════════════════════
def ring_map(ax):
    """팀 저장소 ring_density/ 화면과 같은 구성 — 위성 위 1 km 링과 링별 밀도."""
    from PIL import Image
    HALF = 3300.0                       # 표시 반경(m)
    K = math.cos(math.radians(CENTER_LAT)) * 111320.0
    meta = json.load(io.open(os.path.join(ROOT, "ring_density", "data",
                                          "satellite_z15.json"), encoding="utf-8-sig"))
    lw, le = meta["lonWest"], meta["lonEast"]
    ln, ls = meta["latNorth"], meta["latSouth"]
    W, H = meta["width"], meta["height"]

    def px(lon):
        return (lon - lw) / (le - lw) * W

    def py(lat):
        return (ln - lat) / (ln - ls) * H

    dlat, dlon = HALF / 111320.0, HALF / K
    box = (int(px(CENTER_LON - dlon)), int(py(CENTER_LAT + dlat)),
           int(px(CENTER_LON + dlon)), int(py(CENTER_LAT - dlat)))
    im = Image.open(os.path.join(ROOT, "ring_density", "data", "satellite_z15.jpg")).crop(box)
    ax.imshow(im, extent=(-HALF, HALF, -HALF, HALF), zorder=1)
    ax.add_patch(Rectangle((-HALF, -HALF), 2 * HALF, 2 * HALF, facecolor="#0A1018",
                           alpha=0.30, zorder=2))

    xs, ys = [], []
    with io.open(os.path.join(OUT, "buildings_classified.csv"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            xs.append((float(r["lon"]) - CENTER_LON) * K)
            ys.append((float(r["lat"]) - CENTER_LAT) * 111320.0)
    ax.scatter(xs, ys, s=0.45, color="#7FC4FF", alpha=0.55, linewidths=0, zorder=3)

    for i, b in enumerate(KM):
        rr = (i + 1) * 1000.0
        ax.add_patch(Circle((0, 0), rr, fill=False, ec="white", lw=1.4,
                            ls=(0, (6, 4)), alpha=0.9, zorder=5))
        ang = math.radians([100, 52, 18][i])       # 링마다 다른 방향 — 라벨끼리 안 겹치게
        mid = (i + 0.5) * 1000.0
        ax.text(mid * math.cos(ang), mid * math.sin(ang),
                "{:,.0f}".format(b["dens"]), ha="center", va="center", fontsize=9,
                color="#0E2144", weight="bold", zorder=7,
                bbox=dict(boxstyle="circle,pad=0.34", fc="white", ec=NAVY, lw=1.3,
                          alpha=0.95))
    ax.plot(0, 0, marker="*", ms=13, color=ACC, mec="white", mew=1.1, zorder=8)
    ax.plot([-3050, -2050], [-3000, -3000], color="white", lw=3, solid_capstyle="butt",
            zorder=8)
    ax.text(-2550, -2870, "1 km", ha="center", fontsize=7.5, color="white", weight="bold",
            zorder=8)
    ax.set_xlim(-HALF, HALF)
    ax.set_ylim(-HALF, HALF)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title("집계에 쓴 화면 — 위성 위 1 km 링과 링별 밀도(동/km²)",
                 fontsize=9.5, color=INK, pad=8, weight="bold")
    ax.text(0.5, -0.055, "실행 화면 " + PAGES + "ring_density/", transform=ax.transAxes,
            ha="center", fontsize=7, color=GREY)


# ══ ② 링별 밀도표 페이지 ════════════════════════════════════════════════
def page_table(pdf=None):
    fig = plt.figure(figsize=(11.69, 8.27), dpi=200)
    head(fig, "과제 ② · 권역별 밀도 집계",
         "1 km 링별 건물밀도 — 개수가 아니라 밀도로 환산")

    ax = fig.add_axes([0.06, 0.50, 0.42, 0.34]); ax.axis("off")
    ax.text(0, 1.06, "1 km 링별 (반경 3 km · 본 저장소 집계)", fontsize=10.5, color=INK, weight="bold",
            transform=ax.transAxes)
    cells = [["링", "거리(km)", "건물수(동)", "링면적(km²)", "밀도(동/km²)"]]
    for i, b in enumerate(KM):
        cells.append(["R%d" % (i + 1), b["band"], "{:,}".format(b["n"]),
                      "{:.3f}".format(b["area"]), "{:,.0f}".format(b["dens"])])
    tot_n = sum(b["n"] for b in KM); tot_a = sum(b["area"] for b in KM)
    cells.append(["계", "0–3", "{:,}".format(tot_n), "{:.3f}".format(tot_a),
                  "{:,.0f}".format(tot_n / tot_a)])
    t = ax.table(cellText=cells[1:], colLabels=cells[0], loc="center", cellLoc="right")
    t.auto_set_font_size(False); t.set_fontsize(8.6); t.scale(1, 1.55)
    for (r, c), cell in t.get_celld().items():
        cell.set_edgecolor(RULE)
        if r == 0:
            cell.set_facecolor(NAVY); cell.set_text_props(color="white", weight="bold")
        elif r == len(cells) - 1:
            cell.set_facecolor("#F0F3F7"); cell.set_text_props(weight="bold")
        if c == 4 and r > 0:
            cell.set_text_props(weight="bold", color=NAVY)

    ax3 = fig.add_axes([0.54, 0.50, 0.40, 0.34]); ax3.axis("off")
    ax3.text(0, 1.06, "500 m 링별 (교차검증 · 가변공간단위 확인)", fontsize=10.5,
             color=INK, weight="bold", transform=ax3.transAxes)
    c2 = [["링", "거리(m)", "건물수", "면적(km²)", "밀도"]]
    for r in R500:
        c2.append([r["링"], r["거리구간_m"], "{:,}".format(r["n"]),
                   "{:.3f}".format(r["area"]), "{:,.0f}".format(r["dens"])])
    t2 = ax3.table(cellText=c2[1:], colLabels=c2[0], loc="center", cellLoc="right")
    t2.auto_set_font_size(False); t2.set_fontsize(8.2); t2.scale(1, 1.45)
    for (r, c), cell in t2.get_celld().items():
        cell.set_edgecolor(RULE)
        if r == 0:
            cell.set_facecolor(NAVY2); cell.set_text_props(color="white", weight="bold")
        if c == 4 and r > 0:
            cell.set_text_props(weight="bold", color=NAVY)

    ring_map(fig.add_axes([0.06, 0.09, 0.36, 0.35]))

    axb = fig.add_axes([0.52, 0.13, 0.42, 0.28])
    xs = [i + 0.5 for i in range(len(R500))]
    axb.bar(xs, [r["dens"] for r in R500], width=0.7, color=NAVY2)
    for x, r in zip(xs, R500):
        axb.text(x, r["dens"] + 28, "{:,.0f}".format(r["dens"]), ha="center",
                 fontsize=8.5, color=INK, weight="bold")
    axb.set_xticks(xs)
    axb.set_xticklabels([r["거리구간_m"].replace("-", "–") + " m" for r in R500], fontsize=8.5)
    axb.set_ylabel("건물밀도 (동/km²)", fontsize=9)
    axb.set_ylim(0, 1650)
    axb.grid(axis="y", color="#EDEFF3", lw=0.9); axb.set_axisbelow(True)
    for s in ("top", "right"):
        axb.spines[s].set_visible(False)
    axb.set_title("500 m 링별 밀도 — 중심 500 m 함몰과 500–1000 m 정점이 드러난다",
                  fontsize=10, color=INK, pad=10, weight="bold")
    footer(fig, "② 링별 밀도표")
    if pdf:
        pdf.savefig(fig)
    fig.savefig(os.path.join(OUT, "과제2_링별밀도표.png"), facecolor="white")
    plt.close(fig)
    print("saved 과제2_링별밀도표.png")


# ══ 표지 ════════════════════════════════════════════════════════════════
def page_cover(pdf):
    fig = plt.figure(figsize=(11.69, 8.27), dpi=200)
    fig.patches.append(Rectangle((0, 0.88), 1, 0.12, transform=fig.transFigure,
                                 facecolor=NAVY, edgecolor="none"))
    fig.text(0.08, 0.925, "스마트도시계획(캡스톤디자인) · 2주차 과제", fontsize=13,
             color="white", weight="bold")
    fig.text(0.08, 0.74, "종로 도심 밀도 구조 분석과\n스마트공원 요소 우선순위", fontsize=27,
             color="#0E2144", weight="bold", linespacing=1.35)
    fig.add_artist(plt.Line2D([0.08, 0.16], [0.70, 0.70], color=ACC, lw=4,
                              transform=fig.transFigure))
    items = [
        ("①", "1차시 이론의 대상지 대입 — 클라크(1951) 밀도경사 모델 개념 다이어그램"),
        ("②", "대상지 중심 정의와 1 km 링별 건물밀도 집계표 (개수 → 밀도 환산)"),
        ("③", "스마트공원 요소 우선순위표 — 효과 × 난이도"),
        ("④", "팀 저장소 업로드 및 조회일·출처 명기"),
    ]
    y = 0.60
    for num, txt in items:
        fig.text(0.09, y, num, fontsize=13, color=ACC, weight="bold")
        fig.text(0.13, y, txt, fontsize=11.5, color=INK)
        y -= 0.058
    meta = [
        ("대상지 중심", CENTER),
        ("분석 반경", "3 km (1 km 링 3개) · 외곽 구간은 팀 저장소 ring_density/ 의 5 km 집계 인용"),
        ("데이터 출처", SOURCE),
        ("조회일", QUERIED),
        ("팀 저장소", "https://github.com/choemyeongwon1-ui/kaya"),
        ("집계표 원본", "out/ring_density.csv · out/과제3_스마트공원_우선순위.csv"),
    ]
    y = 0.30
    fig.add_artist(plt.Line2D([0.08, 0.92], [y + 0.035, y + 0.035], color=RULE, lw=1,
                              transform=fig.transFigure))
    for k, v in meta:
        fig.text(0.09, y, k, fontsize=8.6, color=GREY, weight="bold")
        fig.text(0.24, y, v, fontsize=8.6, color=INK2)
        y -= 0.036
    pdf.savefig(fig)
    plt.close(fig)


# ══ ④ 산출물과 출처 기록 ═══════════════════════════════════════════════
def page_outputs(pdf=None):
    fig = plt.figure(figsize=(11.69, 8.27), dpi=200)
    head(fig, "과제 ④ · 산출물과 출처 기록",
         "어느 값이 어느 조회에서 나왔는지 남기기")

    def block(y, title, rows, wkey=0.17):
        fig.text(0.08, y, title, fontsize=11, color="#0E2144", weight="bold")
        fig.add_artist(plt.Line2D([0.08, 0.92], [y - 0.018, y - 0.018], color=RULE,
                                  lw=1, transform=fig.transFigure))
        yy = y - 0.048
        for k, v in rows:
            fig.text(0.085, yy, k, fontsize=8.4, color=GREY, weight="bold")
            fig.text(0.085 + wkey, yy, v, fontsize=8.4, color=INK2)
            yy -= 0.032
        return yy

    y = block(0.845, "산출물", [
        ("① 개념 다이어그램", "본 PDF 2쪽 · out/과제1_개념다이어그램.png"),
        ("② 링별 밀도 집계표", "본 PDF 3쪽 · out/ring_density.csv (동봉: 과제2_링별밀도표_원본.csv)"),
        ("③ 우선순위표", "본 PDF 4쪽 · out/과제3_스마트공원_우선순위.csv (동봉: 과제3_우선순위표_원본.csv)"),
        ("생성 스크립트", "scripts/assignment_week2.py — 위 CSV를 읽어 PDF·PNG를 다시 만듦"),
    ])

    y = block(y - 0.030, "팀 저장소와 실행 화면", [
        ("팀 저장소", REPO),
        ("제출물 경로", "과제_2주차/ (PDF·CSV 2종)"),
        ("링별 밀도 화면", PAGES + "ring_density/"),
        ("용도판독 대시보드", PAGES + "dashboard/index_server.html"),
    ])

    y = block(y - 0.030, "데이터 출처와 조회 기록", [
        ("출처", "Overpass API (OpenStreetMap) · © OpenStreetMap contributors (ODbL)"),
        ("조회일", QUERIED + " (OSM 기준시각 2026-07-15)"),
        ("엔드포인트", "https://overpass.kumi.systems/api/interpreter"),
        ("대상지 중심", CENTER),
        ("집계 대상", "반경 3 km 안에 건물 중심점이 있는 {:,}동 (링별 집계 기준)".format(TOT_N)),
        ("공원 주변 집계", "{} 반경 {:.0f} m · {:,}동 · {:,.0f}동/km²".format(
            PARK_NAME, PARK_BUF, PARK_N, PARK_D)),
    ])

    fig.text(0.085, y - 0.016, "조회에 쓴 Overpass 질의", fontsize=8.4, color=GREY,
             weight="bold")
    q = ('[out:json][timeout:600];(way["building"](around:3000,37.5735,126.9790);'
         'relation["building"](around:3000,37.5735,126.9790););out center tags qt;')
    fig.patches.append(Rectangle((0.085, y - 0.088), 0.835, 0.062,
                                 transform=fig.transFigure, facecolor="#F4F6F9",
                                 edgecolor=RULE, lw=0.8))
    fig.text(0.095, y - 0.048, textwrap.fill(q, 96), fontsize=7.2, color=INK,
             family="monospace", va="top", linespacing=1.5)

    fig.text(0.085, y - 0.115,
             "※ 밀도는 건물 동수 기준이며 인구밀도가 아님. OSM은 자원봉사 매핑이라 "
             "등재 건물만 집계되므로 실제 건물밀도의 하한값으로 읽어야 함.",
             fontsize=7.6, color=ACC)

    footer(fig, "④ 산출물·출처")
    if pdf:
        pdf.savefig(fig)
    fig.savefig(os.path.join(OUT, "과제4_산출물출처기록.png"), facecolor="white")
    plt.close(fig)
    print("saved 과제4_산출물출처기록.png")


path = os.path.join(SUB, "2주차_과제_종로밀도_스마트공원.pdf")
with PdfPages(path) as pdf:
    d = pdf.infodict()
    d["Title"] = "스마트도시계획 2주차 과제 — 종로 도심 밀도 구조와 스마트공원 요소 우선순위"
    d["Subject"] = "Overpass API(OSM) 기반 링별 건물밀도 분석 · 조회일 " + QUERIED
    page_cover(pdf)
    page_concept(pdf)
    page_table(pdf)
    page_priority(pdf)
    page_outputs(pdf)
print("saved", path, "{:.2f} MB".format(os.path.getsize(path) / 1e6))
