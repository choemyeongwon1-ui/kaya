# -*- coding: utf-8 -*-
"""Step 4 - draw the study area: every footprint Overpass returned, on a map."""
import json, io, os, csv, math, collections
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection, LineCollection
from matplotlib.patches import Circle
import classify_lib as L

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.environ.get("OUTDIR", os.path.join(HERE, "out"))
S = json.load(io.open(os.path.join(OUTDIR, "summary.json"), encoding="utf-8"))

for f in ("Malgun Gothic", "NanumGothic", "AppleGothic", "Gulim"):
    try:
        matplotlib.font_manager.findfont(f, fallback_to_default=False)
        plt.rcParams["font.family"] = f
        break
    except Exception:
        continue
plt.rcParams["axes.unicode_minus"] = False

COLOR = {"미분류": "#C55A11", "상업·업무": "#1F4E79", "주거": "#2E75B6",
         "공공·교육": "#8EAADB", "종교·문화": "#9C6BB0", "공업": "#7F7F7F",
         "기타·부속": "#BFBFBF"}
ORDER = ["상업·업무", "주거", "공공·교육", "종교·문화", "공업", "기타·부속", "미분류"]
BLUE = "#1F5FA9"

# ------------------------------------------------------------- projection ---
K = math.cos(math.radians(L.LAT))
prj = lambda x, y: ((x - L.LON) * K * 111320.0, (y - L.LAT) * 111320.0)   # metres


def poly(rings):
    return [[prj(px, py) for px, py in r] for r in rings]


# ------------------------------------------------------------------ data ----
B = L.load_buildings()
cls_of = {}
with io.open(os.path.join(OUTDIR, "buildings_classified.csv"), encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        cls_of[row["osm_id"]] = row["용도분류"]
for b in B:
    b["cls"] = cls_of.get(b["id"], "미분류")
    b["proj"] = poly(b["rings"])

water, green, roads = [], [], []
for el in L.load("basemap")["elements"]:
    t = el.get("tags", {})
    if el["type"] == "way" and "highway" in t and el.get("geometry"):
        roads.append([prj(p["lon"], p["lat"]) for p in el["geometry"]])
        continue
    rings = L.rings_of(el)
    if not rings:
        continue
    tgt = water if (t.get("natural") == "water" or t.get("waterway")) else green
    tgt.extend(poly(rings))


def frame(ax, title, sub=None):
    ax.add_collection(PolyCollection(green, facecolors="#E8F0E2", edgecolors="none", zorder=1))
    ax.add_collection(PolyCollection(water, facecolors="#CFE3F5", edgecolors="none", zorder=2))
    ax.add_collection(LineCollection(roads, colors="#DCDCDC", linewidths=1.1, zorder=3))
    ax.add_patch(Circle((0, 0), L.RAD, fill=False, ec="#C55A11", lw=1.6,
                        ls=(0, (7, 5)), zorder=9))
    ax.plot(0, 0, marker="*", ms=15, color="#C55A11", mec="white", mew=1.0, zorder=10)
    ax.annotate("종로구청 · 반경 3 km 중심", (0, 0), xytext=(78, 86),
                textcoords="offset points", fontsize=9.5, color="#C55A11",
                fontweight="bold", zorder=11,
                bbox=dict(boxstyle="round,pad=0.32", fc="white", ec="#F0C9A8", lw=0.8,
                          alpha=0.94),
                arrowprops=dict(arrowstyle="-", color="#C55A11", lw=0.9))
    # 1 km scale bar
    x0, y0 = -2950, -3150
    ax.plot([x0, x0 + 1000], [y0, y0], color="#404040", lw=3, solid_capstyle="butt", zorder=10)
    ax.text(x0 + 500, y0 + 110, "1 km", ha="center", fontsize=9, color="#404040")
    ax.annotate("N", (3050, 2760), fontsize=11, fontweight="bold", ha="center", color="#404040")
    ax.annotate("", xy=(3050, 3180), xytext=(3050, 2900),
                arrowprops=dict(arrowstyle="-|>", color="#404040", lw=1.6))
    ax.set_xlim(-3300, 3300)
    ax.set_ylim(-3300, 3300)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(title, fontsize=15, fontweight="bold", color="#1F1F1F", pad=34)
    if sub:
        ax.text(0.5, 1.012, sub, transform=ax.transAxes, ha="center",
                fontsize=10, color="#595959")


SRC = "출처: Overpass API(OpenStreetMap) · 서울 종로구청 반경 3km · 조회 2026.09.14"
N = S["total_buildings"]

# ------------------------------------------- map 1: the extracted footprints -
fig, ax = plt.subplots(figsize=(9.2, 9.6), dpi=200)
frame(ax, "Overpass API 수집 결과 — 반경 3 km 건물 {:,}동".format(N),
      "파란색 = OSM에서 실제로 받아온 건물 폴리곤 전수")
ax.add_collection(PolyCollection([r for b in B for r in b["proj"]],
                                 facecolors=BLUE, edgecolors=BLUE,
                                 linewidths=0.25, zorder=5))
fig.text(0.5, 0.022, SRC, fontsize=8.6, color="#7F7F7F", ha="center", style="italic")
fig.tight_layout(rect=(0, 0.035, 1, 1))
fig.savefig(os.path.join(OUTDIR, "map_buildings.png"), facecolor="white")
plt.close(fig)
print("saved map_buildings.png")

# --------------------------------- map 2: before - only building=* is known --
def use_map(ax, key, title, sub):
    frame(ax, title, sub)
    buckets = collections.defaultdict(list)
    for b in B:
        k = b["cls"] if (key == "after" or b["id"] in L1SET) else "미분류"
        buckets[k].extend(b["proj"])
    for k in ORDER:
        if buckets[k]:
            ax.add_collection(PolyCollection(buckets[k], facecolors=COLOR[k],
                                             edgecolors=COLOR[k], linewidths=0.25,
                                             zorder=4 if k == "미분류" else 6))


L1SET = set()
with io.open(os.path.join(OUTDIR, "buildings_classified.csv"), encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        if row["판정단계"] == "L1":
            L1SET.add(row["osm_id"])

fig, axes = plt.subplots(1, 2, figsize=(17.2, 9.9), dpi=190)
use_map(axes[0], "before", "기존 · building=* 태그만",
        "미분류 {:,}동 ({:.1f}%)".format(S["before"]["미분류"], 100.0 * S["before"]["미분류"] / N))
use_map(axes[1], "after", "보완 · Overpass 다층 태그 결합",
        "미분류 {:,}동 ({:.1f}%)".format(S["after"]["미분류"], 100.0 * S["after"]["미분류"] / N))
handles = [plt.Line2D([], [], marker="s", linestyle="", markersize=11, color=COLOR[k],
                      label="{}  {:,}동".format(k, S["after"][k])) for k in ORDER]
fig.legend(handles=handles, loc="lower center", ncol=7, frameon=False, fontsize=11,
           bbox_to_anchor=(0.5, 0.045))
fig.suptitle("용도 판정 결과 지도 — 미분류 {:.1f}% → {:.1f}%".format(
    100.0 * S["before"]["미분류"] / N, 100.0 * S["after"]["미분류"] / N),
    fontsize=17, fontweight="bold", y=0.965)
fig.text(0.5, 0.012, SRC, fontsize=9, color="#7F7F7F", ha="center", style="italic")
fig.subplots_adjust(top=0.855, bottom=0.10, left=0.02, right=0.98, wspace=0.02)
fig.savefig(os.path.join(OUTDIR, "map_before_after.png"), facecolor="white")
plt.close(fig)
print("saved map_before_after.png")

# ------------------------------------------- map 3: final use map, standalone -
fig, ax = plt.subplots(figsize=(9.6, 10.0), dpi=200)
use_map(ax, "after", "용도 판정 결과 — 반경 3 km 건물 {:,}동".format(N),
        "미분류 {:,}동 ({:.1f}%)".format(S["after"]["미분류"], 100.0 * S["after"]["미분류"] / N))
handles = [plt.Line2D([], [], marker="s", linestyle="", markersize=10, color=COLOR[k],
                      label="{}  {:,}동 ({:.1f}%)".format(k, S["after"][k],
                                                          100.0 * S["after"][k] / N))
           for k in ORDER]
ax.legend(handles=handles, loc="upper left", bbox_to_anchor=(0.005, 0.995),
          frameon=True, framealpha=0.92, edgecolor="#D9D9D9", fontsize=9.5,
          labelspacing=0.55)
fig.text(0.5, 0.02, SRC, fontsize=8.6, color="#7F7F7F", ha="center", style="italic")
fig.tight_layout(rect=(0, 0.032, 1, 1))
fig.savefig(os.path.join(OUTDIR, "map_use.png"), facecolor="white")
plt.close(fig)
print("saved map_use.png")
