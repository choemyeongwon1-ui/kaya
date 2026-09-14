# -*- coding: utf-8 -*-
"""Step 3 - redraw the slide's donut from live Overpass data, before and after."""
import json, io, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker
import math

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
         "공공·교육": "#8EAADB", "종교·문화": "#BDD7EE", "공업": "#DEEBF7",
         "기타·부속": "#A6A6A6"}
ORDER = ["미분류", "상업·업무", "주거", "공공·교육", "종교·문화", "공업", "기타·부속"]
N = S["total_buildings"]


def donut(ax, counts, title):
    keys = [k for k in ORDER if counts.get(k, 0) > 0]
    vals = [counts[k] for k in keys]
    wedges, _ = ax.pie(vals, colors=[COLOR[k] for k in keys], startangle=90,
                       counterclock=False, radius=0.88,
                       wedgeprops=dict(width=0.37, edgecolor="white", linewidth=1.6))
    for w, k, v in zip(wedges, keys, vals):
        pct = 100.0 * v / N
        ang = (w.theta1 + w.theta2) / 2
        x, y = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        if pct >= 4.0:
            ax.text(x * 0.70, y * 0.70, "{:.1f}%".format(pct), ha="center", va="center",
                    color="white", fontsize=12.5, fontweight="bold")
        elif pct >= 0.25:
            ax.annotate("{} {:.1f}%".format(k, pct), xy=(x * 0.90, y * 0.90),
                        xytext=(x * 1.30, y * 1.18 + 0.10),
                        ha="left" if x >= 0 else "right", va="center",
                        fontsize=9.0, color="#595959",
                        arrowprops=dict(arrowstyle="-", color="#BFBFBF", lw=0.9))
    ax.set_title(title, fontsize=14, fontweight="bold", color="#1F1F1F", pad=26)
    ax.set(aspect="equal")
    return keys


def legend(fig, ax, keys, counts):
    handles = [plt.Line2D([], [], marker="s", linestyle="", markersize=9,
                          color=COLOR[k],
                          label="{}  {:,}동 ({:.1f}%)".format(k, counts[k],
                                                              100.0 * counts[k] / N))
               for k in keys]
    ax.legend(handles=handles, loc="center left", bbox_to_anchor=(1.02, 0.5),
              frameon=False, fontsize=10.5, labelspacing=0.8,
              handletextpad=0.6)


def single(counts, title, fname, sub):
    fig, ax = plt.subplots(figsize=(8.6, 5.4), dpi=200)
    keys = donut(ax, counts, title)
    legend(fig, ax, keys, counts)
    fig.text(0.06, 0.045, sub, fontsize=8.6, color="#7F7F7F", style="italic")
    fig.subplots_adjust(left=0.02, right=0.62, top=0.86, bottom=0.14)
    fig.savefig(os.path.join(OUTDIR, fname), facecolor="white")
    plt.close(fig)
    print("saved", fname)


SRC = ("출처: Overpass API(OpenStreetMap) · 서울 종로구청 반경 3km · 조회 2026.09.14")
single(S["before"], "반경 3km 건물 {:,}동 — 기존(building 태그만)".format(N),
       "donut_before.png", SRC)
single(S["after"], "반경 3km 건물 {:,}동 — 보완(다층 태그 결합)".format(N),
       "donut_after.png", SRC)

# ------------------------------------------------------ before / after pair --
fig, axes = plt.subplots(1, 2, figsize=(13.6, 5.8), dpi=200)
k1 = donut(axes[0], S["before"], "기존 · building=* 태그만 사용")
k2 = donut(axes[1], S["after"], "보완 · Overpass 다층 태그 결합")
handles = [plt.Line2D([], [], marker="s", linestyle="", markersize=9,
                      color=COLOR[k], label=k) for k in ORDER
           if S["after"].get(k, 0) or S["before"].get(k, 0)]
fig.legend(handles=handles, loc="lower center", ncol=7, frameon=False,
           fontsize=10.5, bbox_to_anchor=(0.5, 0.055))
fig.suptitle("반경 3km 건물 {:,}동 · 용도 구성비  —  미분류 {:.1f}% → {:.1f}%".format(
    N, 100.0 * S["before"]["미분류"] / N, 100.0 * S["after"]["미분류"] / N),
    fontsize=16, fontweight="bold", y=0.965)
fig.text(0.5, 0.005, SRC, fontsize=8.6, color="#7F7F7F", ha="center", style="italic")
fig.subplots_adjust(top=0.84, bottom=0.14, left=0.03, right=0.97, wspace=0.05)
fig.savefig(os.path.join(OUTDIR, "donut_before_after.png"), facecolor="white")
plt.close(fig)
print("saved donut_before_after.png")

# ------------------------------------------------------------- waterfall -----
SHORT = {"L2": "L2\n동일 객체\n용도 태그", "L3": "L3\n건물명\n키워드",
         "L4": "L4\n내부 POI\n공간결합", "L5": "L5\n최근접 POI\n스냅(10m)",
         "L6": "L6\n상위 용도영역\n포함관계"}
fig, ax = plt.subplots(figsize=(11.2, 5.4), dpi=200)
lv = S["levels"]
labels = ["기존 미분류\n(building 태그만)"] + [SHORT[l["code"]] for l in lv[1:]] + ["최종\n미분류"]
start = S["before"]["미분류"]
cur = start
ax.bar(0, start, color="#C55A11", width=0.62)
ax.text(0, start + 260, "{:,}동 · {:.1f}%".format(start, 100.0 * start / N),
        ha="center", fontsize=10.5, fontweight="bold", color="#C55A11")
for i, l in enumerate(lv[1:], start=1):
    g = l["gained"]
    ax.bar(i, g, bottom=cur - g, color="#2E75B6", width=0.62)
    if g >= 700:
        ax.text(i, cur - g / 2, "-{:,}".format(g), ha="center", va="center",
                fontsize=10, color="white", fontweight="bold")
    else:
        ax.text(i, cur + 190, "-{:,}".format(g), ha="center", va="bottom",
                fontsize=10, color="#2E75B6", fontweight="bold")
    ax.plot([i - 0.69, i + 0.31], [cur - g, cur - g], color="#BFBFBF", lw=0.9, zorder=0)
    cur -= g
ax.bar(len(lv), cur, color="#C55A11", width=0.62, alpha=0.5)
ax.text(len(lv), cur + 260, "{:,}동 · {:.1f}%".format(cur, 100.0 * cur / N),
        ha="center", fontsize=10.5, fontweight="bold", color="#C55A11")
ax.set_ylim(0, start * 1.16)
ax.set_xticks(range(len(lv) + 1))
ax.set_xticklabels(labels, fontsize=9.5)
ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, p: format(int(v), ",")))
ax.set_ylabel("미분류 건물 수(동)", fontsize=10.5)
ax.set_title("Overpass 태그 결합 단계별 미분류 해소  (총 {:,}동)".format(N),
             fontsize=14.5, fontweight="bold", pad=14)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)
ax.grid(axis="y", color="#E7E7E7", lw=0.8)
ax.set_axisbelow(True)
fig.text(0.5, 0.012, SRC, fontsize=8.6, color="#7F7F7F", ha="center", style="italic")
fig.tight_layout(rect=(0, 0.045, 1, 1))
fig.savefig(os.path.join(OUTDIR, "waterfall.png"), facecolor="white")
plt.close(fig)
print("saved waterfall.png")
