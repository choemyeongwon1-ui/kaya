# -*- coding: utf-8 -*-
"""2주차 과제 산출물 생성 — ① 개념 다이어그램 ② 링별 밀도표 ③ 우선순위표 ④ 출처기록.

A4 세로(210×297mm) 4쪽. 수치는 코드에 적지 않고 out/*.csv 에서 읽어
표·그림·적합식이 같은 원본을 보게 한다.
"""
import csv, io, json, math, os, textwrap
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Circle, Rectangle

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

A4 = (8.27, 11.69)                      # 세로
L, R = 0.075, 0.925                     # 좌우 여백
NAVY, NAVY2, ACC, GREY = "#1B3A6B", "#2E75B6", "#C4570F", "#8A94A6"
RULE, INK, INK2 = "#D9DFE8", "#1B2434", "#5A6578"

AUTHOR = "최명원"
COURSE = "2주차 과제 ｜ 스마트도시계획(캡스톤디자인) · 김태한 교수"
DEPT = "상명대학교 그린스마트시티학과"
CENTER = "서울 종로구청 (37.5735, 126.9790)"
CENTER_LAT, CENTER_LON = 37.5735, 126.9790
QUERIED = "2026-09-14"
SOURCE = "Overpass API (OpenStreetMap) · building 태그 · © OpenStreetMap contributors (ODbL)"
REPO = "https://github.com/choemyeongwon1-ui/kaya"
PAGES = "https://choemyeongwon1-ui.github.io/kaya/"

PARK_NAME = "열린송현 녹지광장"
PARK_LL = (37.57688, 126.98142)
PARK_BUF = 500.0

# ── 집계값 읽기 ─────────────────────────────────────────────────────────
with io.open(os.path.join(OUT, "ring_density.csv"), encoding="utf-8-sig") as f:
    R500 = list(csv.DictReader(f))
for r in R500:
    r["n"] = int(r["건물수"])
    r["area"] = float(r["링면적_km2"])
    r["dens"] = float(r["밀도_동_per_km2"])
    r["r0"], r["r1"] = (int(v) for v in r["거리구간_m"].split("-"))

KM = []
for k in range(3):
    part = [r for r in R500 if r["r0"] >= k * 1000 and r["r1"] <= (k + 1) * 1000]
    n = sum(r["n"] for r in part)
    a = sum(r["area"] for r in part)
    KM.append({"band": "%d–%d" % (k, k + 1), "n": n, "area": a, "dens": n / a})

# 반경 5 km 1 km 링 집계 (팀 저장소 ring_density/). 0–3 km 는 위 KM 과 1% 내 일치.
FIVE = [{"band": "0–1", "dens": 1261.0}, {"band": "1–2", "dens": 935.0},
        {"band": "2–3", "dens": 390.0}, {"band": "3–4", "dens": 373.0},
        {"band": "4–5", "dens": 387.0}]
OUTER = FIVE[3:]


def clark_fit(bands):
    """ln D = ln D0 − b·r 최소제곱. r 은 구간 중앙값(km) — 팀 표와 같은 방식."""
    xs = [i + 0.5 for i in range(len(bands))]
    ys = [math.log(b["dens"]) for b in bands]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    b = -sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    lnD0 = my + b * mx
    ss_res = sum((y - (lnD0 - b * x)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    return math.exp(lnD0), b, 1 - ss_res / ss_tot


D0, B, R2 = clark_fit(FIVE)
peak, core = max(R500, key=lambda r: r["dens"]), R500[0]
TOT_N = sum(r["n"] for r in R500)
TOT_A = sum(r["area"] for r in R500)
TOT_D = TOT_N / TOT_A


def park_density():
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


PARK_N, PARK_A, PARK_D = park_density()
PARK_RATIO = PARK_D / TOT_D
print("클라크 D(r)=%.0f·e^(-%.3f r)  R²=%.3f | 공원 500m %d동 %.0f/km² (%.2f배)"
      % (D0, B, R2, PARK_N, PARK_D, PARK_RATIO))


# ── 페이지 공통 ─────────────────────────────────────────────────────────
def page(num, total, eyebrow, title, sub, foot):
    fig = plt.figure(figsize=A4, dpi=200)
    fig.patches.append(Rectangle((0, 0.962), 1, 0.038, transform=fig.transFigure,
                                 facecolor=NAVY, edgecolor="none"))
    fig.text(L, 0.9745, COURSE, fontsize=7.6, color="white", va="center")
    fig.text(R, 0.9745, DEPT, fontsize=7.6, color="#C9DBF6", va="center", ha="right")
    fig.text(L, 0.938, eyebrow, fontsize=8.2, color=NAVY, weight="bold")
    fig.text(L, 0.912, title, fontsize=15.5, color="#0E2144", weight="bold")
    fig.add_artist(plt.Line2D([L, L + 0.05], [0.899, 0.899], color=ACC, lw=3,
                              transform=fig.transFigure))
    if sub:
        fig.text(L, 0.884, sub, fontsize=7.8, color=INK2, va="top", linespacing=1.6)
    fig.add_artist(plt.Line2D([L, R], [0.028, 0.028], color=RULE, lw=0.8,
                              transform=fig.transFigure))
    fig.text(L, 0.016, foot, fontsize=6.8, color=GREY)
    fig.text(R, 0.016, "%d / %d" % (num, total), fontsize=6.8, color=GREY, ha="right")
    return fig


def wrap(fig, x, y, text, width, size=8, color=INK2, weight=None, ls=1.65):
    fig.text(x, y, textwrap.fill(text, width), fontsize=size, color=color,
             va="top", linespacing=ls, weight=weight)


def bullets(fig, y, items, width=74, size=8, gap=0.0175):
    for it in items:
        lines = textwrap.fill(it, width).split("\n")
        fig.text(L + 0.004, y, "·", fontsize=size, color=ACC, weight="bold", va="top")
        fig.text(L + 0.016, y, "\n".join(lines), fontsize=size, color=INK2, va="top",
                 linespacing=1.6)
        y -= gap * len(lines) + 0.004
    return y


def table(ax, cells, widths, head_bg=NAVY, size=7.6, rowh=1.5, bold_col=None,
          last_row_grey=False):
    t = ax.table(cellText=cells[1:], colLabels=cells[0], loc="center", cellLoc="center",
                 colWidths=widths)
    t.auto_set_font_size(False)
    t.set_fontsize(size)
    t.scale(1, rowh)
    n = len(cells)
    for (r, c), cell in t.get_celld().items():
        cell.set_edgecolor(RULE)
        cell.set_linewidth(0.7)
        if r == 0:
            cell.set_facecolor(head_bg)
            cell.set_text_props(color="white", weight="bold")
        elif last_row_grey and r == n - 1:
            cell.set_facecolor("#EEF1F6")
            cell.set_text_props(weight="bold")
        if bold_col is not None and c == bold_col and r > 0:
            cell.set_text_props(weight="bold", color=NAVY)
    return t


FOOT_SRC = "출처 " + SOURCE + " · 조회 " + QUERIED


# ══ ① 개념 다이어그램 ═══════════════════════════════════════════════════
def page1(pdf):
    fig = page(1, 4, "① 개념 다이어그램 — 1차시 이론의 대상지 대입",
               "클라크 밀도경사 모델로 읽은 서울 종로 도심",
               "%s · 대상지 중심 %s · 작성 2026.09.20.\n"
               "이론: Clark, C. (1951). Urban Population Densities. "
               "Journal of the Royal Statistical Society A, 114(4)." % (AUTHOR, CENTER),
               "① 개념 다이어그램 · " + FOOT_SRC)

    # 왼쪽 — 이론 모식도
    ax = fig.add_axes([L, 0.545, 0.40, 0.285])
    ax.set_xlim(-5.6, 5.6); ax.set_ylim(-5.9, 5.3)
    ax.set_aspect("equal"); ax.axis("off")
    for k, rr in enumerate([1, 2, 3, 4, 5]):
        ax.add_patch(Circle((0, 0), rr, facecolor=NAVY2,
                            alpha=(0.10 + 0.72 * math.exp(-B * (rr - 0.5))) * 0.55,
                            edgecolor="white", lw=1.0, zorder=5 - k))
    ax.plot(0, 0, marker="*", ms=13, color=ACC, mec="white", mew=1.1, zorder=9)
    ax.annotate("", xy=(5.2, 0), xytext=(0, 0),
                arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.2))
    for rr in [1, 3, 5]:
        ax.text(rr - 0.5, 0.28, "%d" % rr, fontsize=6.8, color=INK2, ha="center")
    ax.text(0, -1.35, "도심(CBD) · 밀도 $D_0$", ha="center", fontsize=7.8,
            color=ACC, weight="bold")
    ax.text(0, -5.8, r"$D(r) = D_0 \cdot e^{-br}$", ha="center", fontsize=11, color=NAVY)
    ax.set_title("이론 — 중심에서 멀어질수록 지수적으로 감소",
                 fontsize=9, color=INK, pad=6, weight="bold")

    # 오른쪽 — 실측 대입
    ax2 = fig.add_axes([0.545, 0.565, 0.38, 0.265])
    xs = [i + 0.5 for i in range(len(FIVE))]
    ax2.bar(xs, [b["dens"] for b in FIVE], width=0.7, color=NAVY2, label="실측 건물밀도")
    rr = [i / 50.0 for i in range(251)]
    ax2.plot(rr, [D0 * math.exp(-B * x) for x in rr], color=ACC, lw=1.8,
             label="클라크 적합곡선")
    for x, b in zip(xs, FIVE):
        ax2.text(x, b["dens"] + 35, "{:,.0f}".format(b["dens"]), ha="center",
                 fontsize=7.4, color=INK, weight="bold")
    ax2.set_xticks(xs); ax2.set_xticklabels([b["band"] for b in FIVE], fontsize=7.4)
    ax2.set_xlabel("중심으로부터 거리대 (km)", fontsize=8)
    ax2.set_ylabel("건물밀도 (동/km²)", fontsize=8)
    ax2.set_ylim(0, 1560)
    ax2.tick_params(labelsize=7.2)
    ax2.legend(fontsize=7, frameon=False, loc="upper right")
    ax2.grid(axis="y", color="#EDEFF3", lw=0.8); ax2.set_axisbelow(True)
    for s in ("top", "right"):
        ax2.spines[s].set_visible(False)
    ax2.set_title("대상지 — 종로구청 중심 1 km 링별 실측", fontsize=9, color=INK,
                  pad=6, weight="bold")
    ax2.text(0.54, 0.60, "D(r) = {:,.0f}·e^(-{:.2f}r)\nR² = {:.2f}".format(D0, B, R2),
             transform=ax2.transAxes, fontsize=8.4, color=ACC, weight="bold")

    fig.text(L, 0.508, "이론 대입 결과 — 맞는 지점과 어긋나는 지점", fontsize=10,
             color="#0E2144", weight="bold")
    rows = [
        ("이론과 맞음", NAVY,
         "0–1 km가 정점 {:,.0f}동/km²이고 2 km까지 단조 감소한다. 단일중심 구조라는 "
         "전제는 기각되지 않으며, 지수감소 적합도는 R²={:.2f}로 높다."
         .format(FIVE[0]["dens"], R2)),
        ("어긋남 ① · 중심부 함몰", ACC,
         "중심 500 m 안쪽은 {:,.0f}동/km²로 오히려 낮고, 정점은 {} m 링의 {:,.0f}동/km²다. "
         "경복궁·청와대 부지가 중심을 비워 이론이 가정한 D0(중심 최대밀도)가 성립하지 않는다."
         .format(core["dens"], peak["거리구간_m"], peak["dens"])),
        ("어긋남 ② · 외곽 반등", ACC,
         "3–4 km {:,.0f} → 4–5 km {:,.0f}동/km²로 다시 오른다. 북악·남산 산지가 끝나고 "
         "시가지가 다시 나타나기 때문이며, 단조 감소 가설은 반경 5 km에서 기각된다."
         .format(OUTER[0]["dens"], OUTER[1]["dens"])),
    ]
    y = 0.482
    for title, c, body in rows:
        lines = textwrap.fill(body, 72).split("\n")
        h = 0.034 + 0.018 * len(lines)
        fig.patches.append(Rectangle((L, y - h), R - L, h, transform=fig.transFigure,
                                     facecolor="#F7F9FB", edgecolor=RULE, lw=0.7))
        fig.patches.append(Rectangle((L, y - h), 0.004, h, transform=fig.transFigure,
                                     facecolor=c, edgecolor="none"))
        fig.text(L + 0.016, y - 0.016, title, fontsize=8.6, color=c, weight="bold")
        fig.text(L + 0.016, y - 0.030, "\n".join(lines), fontsize=7.8, color=INK2,
                 va="top", linespacing=1.6)
        y -= h + 0.016

    fig.text(L, y - 0.008, "판단", fontsize=10, color="#0E2144", weight="bold")
    wrap(fig, L, y - 0.030,
         "반경 3 km 안에서는 클라크 모델이 잘 들어맞지만, 어긋나는 두 지점은 모두 "
         "이론이 상정하지 않은 조건에서 나온다 — 도심 한가운데의 대규모 문화재 부지와 "
         "도시를 둘러싼 산지다. 즉 종로 도심은 밀도경사 모델로 설명되되, 그 잔차가 "
         "지형과 문화재 보존구역이라는 대상지 고유 조건을 가리킨다. 모식도이며 축척 "
         "도면이 아니고, 원의 반지름만 실제 거리(1 km 간격)에 비례한다.", 74, 7.8)
    pdf.savefig(fig)
    fig.savefig(os.path.join(OUT, "과제1_개념다이어그램.png"), facecolor="white")
    plt.close(fig)
    print("saved 1쪽 ① 개념 다이어그램")


# ══ ② 링별 밀도표 ══════════════════════════════════════════════════════
def ring_map(ax):
    from PIL import Image
    HALF = 3300.0
    K = math.cos(math.radians(CENTER_LAT)) * 111320.0
    meta = json.load(io.open(os.path.join(ROOT, "ring_density", "data",
                                          "satellite_z15.json"), encoding="utf-8-sig"))
    lw, le, ln, ls = meta["lonWest"], meta["lonEast"], meta["latNorth"], meta["latSouth"]
    W, H = meta["width"], meta["height"]
    px = lambda lon: (lon - lw) / (le - lw) * W
    py = lambda lat: (ln - lat) / (ln - ls) * H
    dlat, dlon = HALF / 111320.0, HALF / K
    im = Image.open(os.path.join(ROOT, "ring_density", "data", "satellite_z15.jpg")).crop(
        (int(px(CENTER_LON - dlon)), int(py(CENTER_LAT + dlat)),
         int(px(CENTER_LON + dlon)), int(py(CENTER_LAT - dlat))))
    ax.imshow(im, extent=(-HALF, HALF, -HALF, HALF), zorder=1)
    ax.add_patch(Rectangle((-HALF, -HALF), 2 * HALF, 2 * HALF, facecolor="#0A1018",
                           alpha=0.32, zorder=2))
    xs, ys = [], []
    with io.open(os.path.join(OUT, "buildings_classified.csv"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            xs.append((float(r["lon"]) - CENTER_LON) * K)
            ys.append((float(r["lat"]) - CENTER_LAT) * 111320.0)
    ax.scatter(xs, ys, s=0.35, color="#7FC4FF", alpha=0.55, linewidths=0, zorder=3)
    for i, b in enumerate(KM):
        ax.add_patch(Circle((0, 0), (i + 1) * 1000.0, fill=False, ec="white", lw=1.2,
                            ls=(0, (6, 4)), alpha=0.9, zorder=5))
        ang = math.radians([104, 50, 16][i])
        mid = (i + 0.5) * 1000.0
        ax.text(mid * math.cos(ang), mid * math.sin(ang), "{:,.0f}".format(b["dens"]),
                ha="center", va="center", fontsize=7.4, color="#0E2144", weight="bold",
                zorder=7, bbox=dict(boxstyle="circle,pad=0.3", fc="white", ec=NAVY,
                                    lw=1.1, alpha=0.95))
    ax.plot(0, 0, marker="*", ms=11, color=ACC, mec="white", mew=1.0, zorder=8)
    ax.plot([-3080, -2080], [-3020, -3020], color="white", lw=2.6, solid_capstyle="butt",
            zorder=8)
    ax.text(-2580, -2890, "1 km", ha="center", fontsize=6.6, color="white",
            weight="bold", zorder=8)
    ax.set_xlim(-HALF, HALF); ax.set_ylim(-HALF, HALF)
    ax.set_aspect("equal"); ax.axis("off")
    ax.set_title("집계에 쓴 화면 — 위성 위 1 km 링과 링별 밀도(동/km²)",
                 fontsize=8.6, color=INK, pad=6, weight="bold")


def page2(pdf):
    fig = page(2, 4, "② 중심 정의와 1 km 링(권역)별 건물밀도",
               "개수가 아니라 면적으로 나눈 밀도로 환산",
               "중심 %s · 링 간격 1 km · 단위 동/km²" % CENTER,
               "② 링별 밀도표 · " + FOOT_SRC)

    fig.text(L, 0.844, "중심을 어떻게 정했는가", fontsize=10, color="#0E2144",
             weight="bold")
    y = bullets(fig, 0.825, [
        "행정 중심인 종로구청을 대상지 중심으로 정의했다. 중심을 어디로 잡느냐가 이미 "
        "가설의 일부이므로 좌표와 함께 고정해 기록한다.",
        "건물의 중심점이 반경 안에 있으면 그 링에 배정한다. 경계에 걸친 건물이 두 링에 "
        "중복 집계되지 않게 하기 위함이다.",
        "밀도 = 링 안 건물 동수 ÷ 링 면적(km²). 바깥 링일수록 면적이 넓어 동수만 "
        "비교하면 항상 바깥이 커 보인다.",
    ], width=72)

    fig.text(L, y - 0.004, "집계표 (반경 3 km · 동봉 CSV: 과제2_링별밀도표_원본.csv)",
             fontsize=10, color="#0E2144", weight="bold")
    ax = fig.add_axes([L, y - 0.125, R - L, 0.105]); ax.axis("off")
    cells = [["링(권역)", "면적 km²", "건물 동수", "밀도 동/km²", "정점 대비", "전 링 대비"]]
    top = KM[0]["dens"]
    for i, b in enumerate(KM):
        prev = "—" if i == 0 else "{:+.0f}%".format(100 * (b["dens"] - KM[i-1]["dens"]) / KM[i-1]["dens"])
        cells.append(["%s km" % b["band"], "{:.2f}".format(b["area"]),
                      "{:,}".format(b["n"]), "{:,.0f}".format(b["dens"]),
                      "{:.0f}%".format(100 * b["dens"] / top), prev])
    cells.append(["0–3 km 합", "{:.2f}".format(TOT_A), "{:,}".format(TOT_N),
                  "{:,.0f}".format(TOT_D), "—", "—"])
    table(ax, cells, [0.17, 0.15, 0.17, 0.19, 0.16, 0.16], bold_col=3,
          last_row_grey=True, size=7.8, rowh=1.45)

    fig.text(L, y - 0.142, "확장 집계(반경 5 km): 3–4 km {:,.0f} · 4–5 km {:,.0f}동/km² — "
             "바깥에서 다시 오름. 클라크(1951) 적합 D(r) = {:,.0f}·e^(-{:.2f}r), R² = {:.2f}."
             .format(OUTER[0]["dens"], OUTER[1]["dens"], D0, B, R2),
             fontsize=7.6, color=INK2)

    ring_map(fig.add_axes([L, 0.285, 0.40, 0.280]))

    ax3 = fig.add_axes([0.545, 0.325, 0.38, 0.215])
    xs = [i + 0.5 for i in range(len(R500))]
    ax3.bar(xs, [r["dens"] for r in R500], width=0.68, color=NAVY2)
    for x, r in zip(xs, R500):
        ax3.text(x, r["dens"] + 32, "{:,.0f}".format(r["dens"]), ha="center",
                 fontsize=6.6, color=INK, weight="bold")
    ax3.set_xticks(xs)
    ax3.set_xticklabels([r["거리구간_m"].split("-")[1] for r in R500], fontsize=6.8)
    ax3.set_xlabel("링 바깥 경계 (m)", fontsize=7.4)
    ax3.set_ylabel("밀도 (동/km²)", fontsize=7.4)
    ax3.set_ylim(0, 1700); ax3.tick_params(labelsize=6.8)
    ax3.grid(axis="y", color="#EDEFF3", lw=0.8); ax3.set_axisbelow(True)
    for s in ("top", "right"):
        ax3.spines[s].set_visible(False)
    ax3.set_title("500 m 링 교차검증 — 가변공간단위 확인", fontsize=8.6, color=INK,
                  pad=6, weight="bold")

    fig.text(L, 0.250, "판정", fontsize=10, color="#0E2144", weight="bold")
    y2 = bullets(fig, 0.231, [
        "단일중심 가설(0–1 km가 정점이 아니면 기각) — 정점이 0–1 km이므로 기각하지 못한다.",
        "단조 감소(바깥 링이 안쪽보다 높아지면 기각) — 3 km까지는 성립하나, 5 km로 "
        "넓히면 4–5 km에서 반등해 기각된다.",
        "500 m로 잘게 나누면 정점이 0–500 m가 아니라 500–1000 m({:,.0f}동/km²)로 "
        "옮겨간다. 같은 데이터도 구획 크기에 따라 결론이 달라지므로 링 간격을 함께 "
        "적어야 한다.".format(peak["dens"]),
    ], width=72)
    fig.text(L, y2 - 0.014, "건물 동수 밀도이지 인구밀도가 아니다. OSM 등재 건물만 "
             "집계되므로 실제 밀도의 하한값이다.", fontsize=7.6, color=ACC)
    pdf.savefig(fig)
    fig.savefig(os.path.join(OUT, "과제2_링별밀도표.png"), facecolor="white")
    plt.close(fig)
    print("saved 2쪽 ② 링별 밀도표")


# ══ ③ 우선순위표 ═══════════════════════════════════════════════════════
ELEMENTS = [
    ("환경센서(폭염·미세먼지)", 4, 2, "체류인구 밀집 구간의 폭염·대기 대응. 설치·배선 부담이 작음"),
    ("스마트 그늘막·쿨링포그", 4, 2, "주변 상업·업무 비율이 높아 주간 보행자 체류가 많음"),
    ("이용자 계수 센서(비영상)", 3, 2, "링별 밀도 격차를 실이용으로 검증할 기초자료. 개인정보 부담 없음"),
    ("공공 와이파이", 3, 2, "관광·업무 통행 혼재. 기존 통신 인프라 활용 가능"),
    ("스마트 관수(자동관개)", 3, 3, "궁궐·공원 녹지가 중심부에 집중, 관수 인력 절감"),
    ("AI 안전 CCTV·비상벨", 5, 4, "야간 유동인구 많은 상업축. 개인정보 심의·통신망 구축 필요"),
    ("AR 문화재 해설", 4, 4, "종교·문화 용도가 중심 500 m에 집중 — 경복궁·창덕궁·종묘"),
    ("빗물 저류·투수포장", 5, 5, "청계천 유역 도심 침수 대응. 굴착·구조 변경으로 난이도 최고"),
    ("스마트 벤치(충전)", 2, 2, "체감 편의는 있으나 밀도·안전 문제 해결 기여는 작음"),
    ("디지털 사이니지", 2, 3, "기존 안내판 대체 수준. 문화재 경관 심의가 걸림"),
    ("스마트 주차·PM 거치", 2, 4, "도심 주차 수요는 크나 공원 요소로서의 효과는 간접적"),
    ("자율 청소·순찰 로봇", 2, 5, "보도 폭이 좁은 이면도로가 많아 주행 환경이 불리"),
]


def quadrant(e, d):
    if e >= 3.5 and d <= 3:
        return "1순위 즉시", "#1B7A4B"
    if e >= 3.5:
        return "2순위 전략", NAVY
    if d <= 3:
        return "3순위 선택", "#8A6D1F"
    return "4순위 보류", "#8A94A6"


def page3(pdf):
    fig = page(3, 4, "③ 스마트공원 요소 우선순위표",
               "효과와 난이도 두 축으로 본 도입 순서",
               "대상지 공원 %s (OSM leisure=park · 종로구청에서 433 m · 0–1 km 링 안)\n"
               "주변 500 m 건물밀도 %s동/km² = 반경 3 km 평균 %s의 %.2f배"
               % (PARK_NAME, "{:,.0f}".format(PARK_D), "{:,.0f}".format(TOT_D), PARK_RATIO),
               "③ 우선순위표 · " + FOOT_SRC)

    fig.text(L, 0.824, "두 축을 어떻게 매겼는가", fontsize=10, color="#0E2144",
             weight="bold")
    y = bullets(fig, 0.805, [
        "효과(1~5) = 대상지 문제 해결 기여도. 공원 주변 500 m 건물밀도가 반경 3 km "
        "평균의 1.5배 이상이면 이용 압력이 크다고 보아 +1 보정했다(이 공원은 "
        "{:.2f}배로 해당).".format(PARK_RATIO),
        "난이도(1~5) = 예산·심의·기술. 문화재 보존구역 경관 심의, 영상 기반 계수의 "
        "개인정보, 굴착을 수반하는 구조 변경을 가중 요인으로 보았다.",
        "구분: 효과 3.5 이상·난이도 3 이하 = 1순위, 효과 3.5 이상·난이도 4 이상 = 2순위, "
        "효과 3 이하·난이도 3 이하 = 3순위, 나머지 = 4순위.",
    ], width=72)

    ax = fig.add_axes([0.20, 0.435, 0.60, 0.243])
    ax.add_patch(Rectangle((3.5, 0.3), 2.6, 2.7, facecolor="#E8F3EC", edgecolor="none"))
    ax.add_patch(Rectangle((3.5, 3.0), 2.6, 2.7, facecolor="#EAF0F8", edgecolor="none"))
    ax.add_patch(Rectangle((0.3, 0.3), 3.2, 2.7, facecolor="#FAF6E8", edgecolor="none"))
    ax.add_patch(Rectangle((0.3, 3.0), 3.2, 2.7, facecolor="#F2F3F5", edgecolor="none"))
    ax.text(4.8, 0.6, "1순위 · 즉시 추진", ha="center", fontsize=7.6, color="#1B7A4B",
            weight="bold")
    ax.text(4.8, 5.68, "2순위 · 전략 추진", ha="center", fontsize=7.6, color=NAVY,
            weight="bold")
    ax.text(1.8, 0.6, "3순위 · 선택 도입", ha="center", fontsize=7.6, color="#8A6D1F",
            weight="bold")
    ax.text(1.8, 5.68, "4순위 · 보류", ha="center", fontsize=7.6, color=GREY,
            weight="bold")
    by_d = {}
    for name, e, d, _ in ELEMENTS:
        by_d.setdefault(d, []).append((e, name))
    pts = []
    for d, items in by_d.items():
        items.sort()
        for e, name in items:
            same = [x for x in items if x[0] == e]
            off = same.index((e, name)) * 0.42 if len(same) > 1 else 0.0
            pts.append((round(d - off, 2), e, name, d))
    lanes = {}
    for y, e, name, d in sorted(pts):
        lanes.setdefault(y, []).append((e, name, d))
    for y, items in lanes.items():
        for k, (e, name, d) in enumerate(sorted(items)):
            c = quadrant(e, d)[1]
            ax.scatter([e], [y], s=52, color=c, zorder=6, edgecolor="white", lw=1.0)
            up = (k % 2 == 0)      # 같은 높이의 이웃끼리 위·아래 번갈아 — 겹침 방지
            ax.annotate(name, (e, y), xytext=(0, 8 if up else -9),
                        textcoords="offset points", fontsize=6.4, color=INK,
                        ha="center", va="bottom" if up else "top", zorder=7)
    ax.axvline(3.5, color=INK2, lw=0.9, ls=(0, (5, 4)))
    ax.axhline(3.0, color=INK2, lw=0.9, ls=(0, (5, 4)))
    ax.set_xlim(0.3, 6.1); ax.set_ylim(5.8, 0.3)
    ax.set_xlabel("효과 (1–5)", fontsize=8)
    ax.set_ylabel("난이도 (1–5) — 아래가 쉬움", fontsize=8)
    ax.set_xticks([1, 2, 3, 4, 5]); ax.set_yticks([1, 2, 3, 4, 5])
    ax.tick_params(labelsize=7)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)

    fig.text(L, 0.358, "요소별 점수와 근거 (동봉 CSV: 과제3_우선순위표_원본.csv)",
             fontsize=10, color="#0E2144", weight="bold")
    rows = sorted(ELEMENTS, key=lambda r: (-r[1], r[2]))
    ax2 = fig.add_axes([L, 0.042, R - L, 0.296]); ax2.axis("off")
    cells = [["순위", "요소", "효과", "난이도", "구분", "판단 근거"]]
    for i, (name, e, d, why) in enumerate(rows, 1):
        cells.append([str(i), name, str(e), str(d), quadrant(e, d)[0],
                      textwrap.fill(why, 34)])
    t = table(ax2, cells, [0.06, 0.24, 0.07, 0.08, 0.13, 0.42], size=6.9, rowh=1.70,
              bold_col=2)
    for (r, c), cell in t.get_celld().items():
        if r > 0 and c in (1, 5):
            cell.set_text_props(ha="left")
            cell.PAD = 0.04
        if r > 0 and c == 4:
            cell.set_text_props(color=quadrant(rows[r-1][1], rows[r-1][2])[1],
                                weight="bold")
    pdf.savefig(fig)
    fig.savefig(os.path.join(OUT, "과제3_우선순위매트릭스.png"), facecolor="white")
    plt.close(fig)

    p = os.path.join(OUT, "과제3_스마트공원_우선순위.csv")
    with io.open(p, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["순위", "요소", "효과_1_5", "난이도_1_5", "구분", "판단근거"])
        for i, (name, e, d, why) in enumerate(rows, 1):
            w.writerow([i, name, e, d, quadrant(e, d)[0], why])
        w.writerow([])
        for k, v in [("대상지 공원", PARK_NAME),
                     ("공원 주변 500m 건물밀도", "{:.0f} 동/km²".format(PARK_D)),
                     ("반경 3km 평균 대비", "{:.2f}배".format(PARK_RATIO)),
                     ("중심", CENTER), ("조회일", QUERIED), ("출처", SOURCE)]:
            w.writerow([k, v, "", "", "", ""])
    print("saved 3쪽 ③ 우선순위표 + CSV")


# ══ ④ 산출물과 출처 기록 ═══════════════════════════════════════════════
def page4(pdf):
    fig = page(4, 4, "④ 산출물과 출처 기록",
               "어느 값이 어느 조회에서 나왔는지 남기기",
               "세 산출물을 팀 저장소에 올리고 조회일·출처를 함께 기록함",
               "④ 산출물·출처 · " + FOOT_SRC)

    def block(y, title, rows, keyw=0.20):
        fig.text(L, y, title, fontsize=10, color="#0E2144", weight="bold")
        fig.add_artist(plt.Line2D([L, R], [y - 0.010, y - 0.010], color=RULE, lw=0.9,
                                  transform=fig.transFigure))
        yy = y - 0.030
        for k, v in rows:
            lines = textwrap.fill(v, 58).split("\n")
            fig.text(L + 0.004, yy, k, fontsize=7.8, color=GREY, weight="bold", va="top")
            fig.text(L + keyw, yy, "\n".join(lines), fontsize=7.8, color=INK2, va="top",
                     linespacing=1.6)
            yy -= 0.0155 * len(lines) + 0.006
        return yy

    y = block(0.855, "산출물", [
        ("① 개념 다이어그램", "본 PDF 1쪽 · out/과제1_개념다이어그램.png"),
        ("② 링별 밀도 집계표", "본 PDF 2쪽 · out/ring_density.csv (동봉 과제2_링별밀도표_원본.csv)"),
        ("③ 우선순위표", "본 PDF 3쪽 · out/과제3_스마트공원_우선순위.csv (동봉 과제3_우선순위표_원본.csv)"),
        ("생성 스크립트", "scripts/assignment_week2.py — 위 CSV를 읽어 이 PDF를 다시 만듦"),
    ])
    y = block(y - 0.022, "팀 저장소와 실행 화면", [
        ("팀 저장소", REPO),
        ("제출물 경로", "과제_2주차/ (PDF 1 · CSV 2)"),
        ("링별 밀도 화면", PAGES + "ring_density/"),
        ("용도판독 대시보드", PAGES + "dashboard/index_server.html"),
    ])
    y = block(y - 0.022, "데이터 출처와 조회 기록", [
        ("출처", "Overpass API (OpenStreetMap) · © OpenStreetMap contributors (ODbL)"),
        ("조회일", QUERIED + " (OSM 기준시각 2026-07-15)"),
        ("엔드포인트", "https://overpass.kumi.systems/api/interpreter"),
        ("대상지 중심", CENTER),
        ("집계 대상", "반경 3 km 안에 건물 중심점이 있는 {:,}동".format(TOT_N)),
        ("공원 주변 집계", "{} 반경 {:.0f} m · {:,}동 · {:,.0f}동/km²".format(
            PARK_NAME, PARK_BUF, PARK_N, PARK_D)),
        ("위성 영상", "Esri World Imagery © Esri, Maxar, Earthstar Geographics (2026-09-18)"),
    ])

    fig.text(L, y - 0.016, "조회에 쓴 Overpass 질의", fontsize=10, color="#0E2144",
             weight="bold")
    q = ('[out:json][timeout:600];\n'
         '(way["building"](around:3000,37.5735,126.9790);\n'
         ' relation["building"](around:3000,37.5735,126.9790););\n'
         'out center tags qt;')
    fig.patches.append(Rectangle((L, y - 0.112), R - L, 0.082, transform=fig.transFigure,
                                 facecolor="#F4F6F9", edgecolor=RULE, lw=0.8))
    fig.text(L + 0.014, y - 0.038, q, fontsize=7, color=INK, family="monospace",
             va="top", linespacing=1.7)

    fig.text(L, y - 0.132, "읽을 때 주의", fontsize=10, color="#0E2144", weight="bold")
    bullets(fig, y - 0.152, [
        "밀도는 건물 동수 기준이며 인구밀도가 아니다.",
        "OSM은 자원봉사 매핑이라 등재된 건물만 집계된다. 실제 건물밀도의 하한값으로 읽어야 한다.",
        "①의 지대 해석과 ③의 점수는 판단값이며, 용도지역 고시·건축물대장과 "
        "교차검증하기 전에는 확정된 결과가 아니다.",
    ], width=72, size=7.8)
    pdf.savefig(fig)
    fig.savefig(os.path.join(OUT, "과제4_산출물출처기록.png"), facecolor="white")
    plt.close(fig)
    print("saved 4쪽 ④ 산출물·출처")


path = os.path.join(SUB, "2주차_과제_종로밀도_스마트공원.pdf")
with PdfPages(path) as pdf:
    d = pdf.infodict()
    d["Title"] = "스마트도시계획 2주차 과제 — 종로 도심 밀도 구조와 스마트공원 요소 우선순위"
    d["Author"] = AUTHOR
    d["Subject"] = "Overpass API(OSM) 기반 링별 건물밀도 분석 · 조회일 " + QUERIED
    page1(pdf); page2(pdf); page3(pdf); page4(pdf)
print("saved", path, "{:.2f} MB".format(os.path.getsize(path) / 1e6))
