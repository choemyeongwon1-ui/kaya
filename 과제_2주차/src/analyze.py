"""종로구청 반경 3km 건물 용도 구성 분석 (Overpass API / OpenStreetMap).

1) Overpass API로 반경 3km 안 building 태그가 있는 way·relation을 조회
2) building 태그 값으로 용도를 분류 (building=yes → 미분류)
3) 보조 분석: 미분류 건물 중 amenity/shop/office 등 부가 태그로 추정 가능한 비율
4) 결과 CSV·JSON·도넛 차트 PNG 저장

사용법: python analyze.py [--refresh]   (--refresh: 캐시 무시하고 다시 조회)
"""
import csv
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

BASE = Path(__file__).parent
DATA = BASE / "data"
OUT = BASE / "output"
RAW = DATA / "osm_buildings_raw.json"

CENTER = (37.5735, 126.9788)  # 종로구청
RADIUS_M = 3000
ENDPOINT = "https://overpass-api.de/api/interpreter"

QUERY = f"""[out:json][timeout:180];
(
  way["building"](around:{RADIUS_M},{CENTER[0]},{CENTER[1]});
  relation["building"](around:{RADIUS_M},{CENTER[0]},{CENTER[1]});
);
out tags center;"""

# building=* 값 → 용도 대분류
CATEGORY_MAP = {
    "상업·업무": {"commercial", "retail", "office", "hotel", "company", "kiosk", "supermarket"},
    "주거": {"house", "apartments", "residential", "detached", "dormitory", "terrace",
             "semidetached_house", "bungalow"},
    "공공·교육": {"school", "university", "college", "kindergarten", "civic", "public",
                "hospital", "government", "fire_station", "train_station", "transportation",
                "station"},
    "종교·문화": {"church", "cathedral", "chapel", "shrine", "temple", "mosque", "religious",
                "palace", "pavilion", "city_gate", "gate", "gatehouse", "guardhouse", "ruins"},
    "공업": {"industrial", "warehouse", "manufacture", "greenhouse", "shed", "container"},
}
ORDER = ["미분류", "상업·업무", "주거", "공공·교육", "종교·문화", "공업", "기타"]

# 보조 분석: building=yes 건물의 부가 태그로 용도 추정
AMENITY_PUBLIC = {"police", "townhall", "library", "school", "university", "post_office",
                  "fire_station", "community_centre", "social_facility", "hospital",
                  "doctors", "pharmacy", "ranger_station", "courthouse", "kindergarten",
                  "childcare", "language_school", "toilets"}
AMENITY_CULTURE = {"place_of_worship", "theatre", "arts_centre", "cinema", "studio",
                   "museum", "monastery"}


def fetch(refresh=False):
    if RAW.exists() and not refresh:
        return json.loads(RAW.read_text(encoding="utf-8"))
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={"User-Agent": "smartcity-capstone"})
    with urllib.request.urlopen(req, timeout=300) as r:
        raw = r.read()
    DATA.mkdir(exist_ok=True)
    RAW.write_bytes(raw)
    return json.loads(raw)


def classify(tags):
    b = tags.get("building", "yes")
    if b == "yes":
        return "미분류"
    for cat, values in CATEGORY_MAP.items():
        if b in values:
            return cat
    return "기타"  # roof, parking, shelter, construction 등


def infer_from_extra_tags(tags):
    """building=yes 건물을 부가 태그로 추정. 추정 불가면 None."""
    amenity = tags.get("amenity")
    if amenity in AMENITY_CULTURE or "religion" in tags or "historic" in tags:
        return "종교·문화"
    if amenity in AMENITY_PUBLIC or "government" in tags:
        return "공공·교육"
    if "shop" in tags or "office" in tags or "tourism" in tags or amenity:
        return "상업·업무"
    return None


def main():
    data = fetch(refresh="--refresh" in sys.argv)
    elements = data["elements"]
    osm_base = data["osm3s"]["timestamp_osm_base"][:10]
    OUT.mkdir(exist_ok=True)

    rows, counts, building_values, inferred = [], Counter(), Counter(), Counter()
    for e in elements:
        tags = e.get("tags", {})
        cat = classify(tags)
        counts[cat] += 1
        building_values[tags.get("building")] += 1
        guess = infer_from_extra_tags(tags) if cat == "미분류" else None
        if guess:
            inferred[guess] += 1
        c = e.get("center", {})
        rows.append({
            "osm_type": e["type"], "osm_id": e["id"], "lat": c.get("lat"), "lon": c.get("lon"),
            "building": tags.get("building"), "category": cat, "inferred_from_tags": guess or "",
            "name": tags.get("name", ""), "amenity": tags.get("amenity", ""),
            "shop": tags.get("shop", ""), "office": tags.get("office", ""),
        })

    total = len(elements)
    with open(OUT / "buildings_classified.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    summary = {
        "center": {"name": "종로구청", "lat": CENTER[0], "lon": CENTER[1]},
        "radius_m": RADIUS_M,
        "osm_base": osm_base,
        "queried_on": date.today().isoformat(),
        "total": total,
        "categories": [{"name": k, "count": counts[k], "pct": round(counts[k] / total * 100, 1)}
                       for k in ORDER],
        "unclassified_inferable": dict(inferred),
        "building_values": dict(building_values.most_common()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                                      encoding="utf-8")
    with open(OUT / "category_summary.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["용도", "건물 수", "비율(%)"])
        for c in summary["categories"]:
            w.writerow([c["name"], c["count"], c["pct"]])

    draw_chart(summary)

    print(f"총 {total:,}동 (OSM 기준일 {osm_base})")
    for c in summary["categories"]:
        print(f"  {c['name']:<6} {c['count']:>6,}동  {c['pct']:>5.1f}%")
    n_inf = sum(inferred.values())
    print(f"미분류 중 부가 태그로 추정 가능: {n_inf:,}동 "
          f"({n_inf / counts['미분류'] * 100:.1f}%) {dict(inferred)}")


def draw_chart(summary):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams["font.family"] = "Malgun Gothic"
    colors = ["#C0521F", "#1F4E9C", "#3B72C0", "#A9C1E4", "#D5DFEE", "#E4E8EF", "#B8B8B8"]
    cats = summary["categories"]
    fig, ax = plt.subplots(figsize=(6, 6), dpi=200)
    wedges, _ = ax.pie([c["count"] for c in cats], colors=colors, startangle=90,
                       counterclock=False, wedgeprops={"width": 0.5, "edgecolor": "white"})
    for wdg, c in zip(wedges, cats):
        if c["pct"] < 5:
            continue
        import math
        ang = math.radians((wdg.theta1 + wdg.theta2) / 2)
        ax.text(0.75 * math.cos(ang), 0.75 * math.sin(ang), f"{c['pct']}%",
                ha="center", va="center", color="white", fontsize=12, fontweight="bold")
    ax.legend(wedges, [f"{c['name']} {c['count']:,}동" for c in cats],
              loc="center left", bbox_to_anchor=(1, 0.5), frameon=False)
    ax.set_title(f"반경 3km 건물 {summary['total']:,}동", fontsize=15, fontweight="bold")
    fig.savefig(OUT / "donut_chart.png", bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    main()
