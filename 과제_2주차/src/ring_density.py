"""과제 ②: 대상지 중심에서 1km 간격 링(권역)별 건물 밀도 집계.

개수가 아니라 밀도(동/km²)로 환산한다. 중심은 종로구청(37.5735, 126.9788).
결과: output/ring_density.csv (권역별 총괄), output/ring_density_by_use.csv (권역×용도)
"""
import csv
import json
import math
from datetime import date
from pathlib import Path

from analyze import ORDER, classify

BASE = Path(__file__).parent
DATA = BASE / "data"
OUT = BASE / "output"

CENTER = (37.5735, 126.9788)  # 종로구청
CENTER_NAME = "종로구청"
RINGS = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]  # km
LAT_M, LON_M = 110989, 88334  # 위도 37.57°에서 1도당 m (평면 근사)
QUERIED = "2026.09.14"  # Overpass API 조회일


def distance_km(lat, lon):
    dy = (lat - CENTER[0]) * LAT_M
    dx = (lon - CENTER[1]) * LON_M
    return math.hypot(dx, dy) / 1000


def main():
    raw = json.loads((DATA / "osm_buildings_5km.json").read_text(encoding="utf-8"))
    osm_base = raw["osm3s"]["timestamp_osm_base"][:10].replace("-", ".")

    rows = []
    for r_in, r_out in RINGS:
        counts = dict.fromkeys(ORDER, 0)
        for e in raw["elements"]:
            c = e.get("center")
            if not c:
                continue
            if r_in <= distance_km(c["lat"], c["lon"]) < r_out:
                counts[classify(e.get("tags", {}))] += 1
        area = math.pi * (r_out ** 2 - r_in ** 2)
        total = sum(counts.values())
        classified = total - counts["미분류"]
        rows.append({
            "ring": f"{r_in}–{r_out}km", "r_in": r_in, "r_out": r_out, "area": area,
            "total": total, "counts": counts,
            "density": total / area, "density_classified": classified / area,
            "rate": classified / total * 100 if total else 0,
        })

    with open(OUT / "ring_density.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow([f"# 대상지 중심: {CENTER_NAME} ({CENTER[0]}, {CENTER[1]})"])
        w.writerow([f"# 출처: OpenStreetMap / Overpass API · OSM 기준일 {osm_base} · 조회일 {QUERIED}"
                    f" · 작성일 {date.today().isoformat().replace('-', '.')}"])
        w.writerow(["# 밀도 = 건물 수 / 링 면적(동/km²), 링 면적 = π(r_out² - r_in²), 건물 중심점 기준"])
        w.writerow(["권역", "안쪽반경(km)", "바깥반경(km)", "면적(km2)", "건물수(동)",
                    "건물밀도(동/km2)", "용도기재건물수(동)", "용도기재밀도(동/km2)", "용도기재율(%)"])
        for r in rows:
            w.writerow([r["ring"], r["r_in"], r["r_out"], round(r["area"], 2), r["total"],
                        round(r["density"], 1), r["total"] - r["counts"]["미분류"],
                        round(r["density_classified"], 1), round(r["rate"], 1)])

    with open(OUT / "ring_density_by_use.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow([f"# 대상지 중심: {CENTER_NAME} ({CENTER[0]}, {CENTER[1]})"])
        w.writerow([f"# 출처: OpenStreetMap / Overpass API · OSM 기준일 {osm_base} · 조회일 {QUERIED}"])
        w.writerow(["# 값은 밀도(동/km²), 괄호 안은 건물 수(동)"])
        w.writerow(["권역", "면적(km2)"] + [f"{u}(동/km2)" for u in ORDER] + [f"{u}(동)" for u in ORDER])
        for r in rows:
            w.writerow([r["ring"], round(r["area"], 2)]
                       + [round(r["counts"][u] / r["area"], 1) for u in ORDER]
                       + [r["counts"][u] for u in ORDER])

    summary = {"center": {"name": CENTER_NAME, "lat": CENTER[0], "lon": CENTER[1]},
               "osm_base": osm_base, "queried": QUERIED, "order": ORDER, "rings": rows}
    (OUT / "ring_density.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                                           encoding="utf-8")

    print(f"중심 {CENTER_NAME} · OSM 기준일 {osm_base}")
    print(f"{'권역':<8}{'면적':>8}{'건물수':>9}{'밀도':>10}{'기재밀도':>10}{'기재율':>8}")
    for r in rows:
        print(f"{r['ring']:<8}{r['area']:>8.2f}{r['total']:>9,}{r['density']:>10.1f}"
              f"{r['density_classified']:>10.1f}{r['rate']:>7.1f}%")
    print("\n권역별 용도 밀도(동/km²)")
    print(f"{'권역':<8}" + "".join(f"{u:>10}" for u in ORDER))
    for r in rows:
        print(f"{r['ring']:<8}" + "".join(f"{r['counts'][u] / r['area']:>10.1f}" for u in ORDER))


if __name__ == "__main__":
    main()
