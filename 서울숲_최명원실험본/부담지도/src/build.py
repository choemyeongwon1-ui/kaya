"""Build the burden-map data and write a standalone page (부담지도/index.html).

Outer map  : Seongsu 150 m grid. Paid staying places (cafe, food) vs distance to the
             nearest free staying place, with and without Seoul Forest.
Inner map  : Seoul Forest grid (copied team grid, ../data/processed/grid.geojson) scored
             on five burdens: cost, time, mind, body, env (0 = no burden, 1 = high).

All weights and thresholds below are this study's own assumptions (see WEIGHTS / NORM)
and are printed on the page.
Run: python 부담지도/src/build.py
"""
from __future__ import annotations

import datetime as dt
import json
import math
import pathlib

from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import unary_union

HERE = pathlib.Path(__file__).resolve().parents[1]          # 부담지도/
BASE = HERE.parent                                           # 서울숲 디벨롭 최명원/
RAW = HERE / "data" / "raw"
OUT = HERE / "data" / "processed"

LAT0, LON0 = 37.544, 127.045
KX = math.cos(math.radians(LAT0)) * 111_320
KY = 110_540


LANDMARKS = ["스타벅스", "카페 어니언", "대림창고", "Nudake", "메가엠지씨커피 서울숲역점", "Center Coffee"]


def xy(lon, lat):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


def ll(x, y):
    return (LON0 + x / KX, LAT0 + y / KY)


def geom_m(g):
    """shapely geometry in lon/lat -> metres."""
    from shapely.ops import transform
    return transform(lambda x, y, z=None: xy(x, y), g)


def clamp(v):
    return max(0.0, min(1.0, v))


# ---------------------------------------------------------------- outer map
PAID = {"cafe", "restaurant", "fast_food", "bar", "pub", "ice_cream", "bakery"}
FREE_PT = {"library", "community_centre", "social_facility", "shelter", "bench", "picnic_table"}
FREE_AREA = {"park", "garden", "playground"}
OUTER_CELL = 150
FREE_NEAR = 300   # 걸어서 5분 안팎 (가정)
HOT_OK = {"library", "community_centre", "social_facility", "shelter"}  # 무료 + 지붕/실내


def osm_geom(e):
    if e["type"] == "node":
        return Point(e["lon"], e["lat"])
    g = e.get("geometry")
    if e["type"] == "way" and g and len(g) >= 4 and g[0] == g[-1]:
        return Polygon([(p["lon"], p["lat"]) for p in g])
    if "center" in e:
        return Point(e["center"]["lon"], e["center"]["lat"])
    return None


def build_outer(park_poly_ll):
    src = sorted(RAW.glob("seongsu_stay_*.json"))[-1]
    els = json.loads(src.read_text(encoding="utf-8"))["elements"]
    paid, free_pts, free_areas = [], [], []
    named = []
    for e in els:
        t = e.get("tags", {})
        a, le, sh = t.get("amenity"), t.get("leisure"), t.get("shop")
        g = osm_geom(e)
        if g is None:
            continue
        c = g.centroid
        if a in PAID or sh in {"coffee", "bakery", "pastry"}:
            kind = "cafe" if (a in {"cafe", "bakery"} or sh) else "food"
            paid.append((c.x, c.y, kind))
            if t.get("name"):
                named.append((t["name"], c.x, c.y, kind))
        elif le in FREE_AREA and g.geom_type == "Polygon":
            free_areas.append((g, le, t.get("name", "")))
        elif a in FREE_PT or le == "picnic_table":
            free_pts.append((c.x, c.y, a or le, t.get("name", "")))

    park_m = geom_m(park_poly_ll)
    # Seoul Forest itself and parks inside it are handled separately
    other_areas = [(g, k, n) for g, k, n in free_areas if not park_m.buffer(30).contains(geom_m(g).centroid)]
    other_pts = [p for p in free_pts if not park_m.buffer(30).contains(Point(xy(p[0], p[1])))]
    free_wo = unary_union([geom_m(g) for g, _, _ in other_areas] + [Point(xy(x, y)).buffer(5) for x, y, *_ in other_pts])
    free_w = unary_union([free_wo, park_m])
    # 폭염·미세먼지 날: 햇볕 아래 공원·놀이터·벤치는 피난처가 못 됨 → 무료 실내·지붕 있는 곳만
    hot_pts = [p for p in other_pts if p[2] in HOT_OK]
    hot_wo = unary_union([Point(xy(x, y)).buffer(5) for x, y, *_ in hot_pts]) if hot_pts else None
    hot_w = unary_union([hot_wo, park_m]) if hot_wo is not None else park_m
    hdist = lambda u, p: round(u.distance(p)) if u is not None else 9999

    s, w, n, e = 37.5355, 127.0330, 37.5520, 127.0640
    x0, y0 = xy(w, s)
    x1, y1 = xy(e, n)
    paid_m = [(xy(x, y), k) for x, y, k in paid]
    cells = []
    nx, ny = int((x1 - x0) // OUTER_CELL) + 1, int((y1 - y0) // OUTER_CELL) + 1
    for i in range(nx):
        for j in range(ny):
            cx0, cy0 = x0 + i * OUTER_CELL, y0 + j * OUTER_CELL
            cx1, cy1 = cx0 + OUTER_CELL, cy0 + OUTER_CELL
            n_paid = sum(1 for (px, py), _ in paid_m if cx0 <= px < cx1 and cy0 <= py < cy1)
            ctr = Point((cx0 + cx1) / 2, (cy0 + cy1) / 2)
            if park_m.contains(ctr) or n_paid == 0:
                continue  # 서울숲 내부, 상업시설 없는 칸(강·도로·공장 등)은 제외
            sw, ne = ll(cx0, cy0), ll(cx1, cy1)
            cells.append({
                "b": [round(sw[1], 6), round(sw[0], 6), round(ne[1], 6), round(ne[0], 6)],
                "paid": n_paid,
                "dWo": round(free_wo.distance(ctr)),
                "dW": round(free_w.distance(ctr)),
                "hWo": hdist(hot_wo, ctr),
                "hW": hdist(hot_w, ctr),
            })
    # 이야기용 대표 상점: 성수역 → 서울숲 방향 순서, 지표는 데이터에서 계산 (반경 300m 유료 수, 무료 공간까지 거리)
    stn = Point(xy(127.055961, 37.544581))
    landmarks = []
    for want in LANDMARKS:
        cand = [(nm, x, y, k) for nm, x, y, k in named if nm == want]
        if not cand:
            continue
        nm, x, y, k = min(cand, key=lambda c: Point(xy(c[1], c[2])).distance(stn))
        pm = Point(xy(x, y))
        landmarks.append({
            "name": nm, "lat": round(y, 6), "lon": round(x, 6), "kind": k,
            "n300": sum(1 for (px, py), _ in paid_m if pm.distance(Point(px, py)) <= 300),
            "dFree": round(free_wo.distance(pm)),
            "dPark": round(park_m.distance(pm)),
        })
    tot = len(cells)
    far_wo = sum(c["dWo"] > FREE_NEAR for c in cells)
    far_w = sum(c["dW"] > FREE_NEAR for c in cells)
    hfar_wo = sum(c["hWo"] > FREE_NEAR for c in cells)
    hfar_w = sum(c["hW"] > FREE_NEAR for c in cells)
    n_cafe = sum(1 for p in paid if p[2] == "cafe")
    stats = {
        "paid": len(paid), "cafe": n_cafe, "food": len(paid) - n_cafe,
        "freeAreas": len(other_areas), "freePts": len(other_pts),
        "cells": tot, "farWo": far_wo, "farW": far_w,
        "farWoPct": round(100 * far_wo / tot, 1) if tot else 0,
        "farWPct": round(100 * far_w / tot, 1) if tot else 0,
        "paidPerFree": round(len(paid) / max(1, len(other_areas) + len(other_pts)), 1),
        "hotFree": len(hot_pts),
        "hotFreeKinds": {k: sum(1 for p in hot_pts if p[2] == k) for k in sorted(HOT_OK)},
        "hfarWo": hfar_wo, "hfarW": hfar_w,
        "hfarWoPct": round(100 * hfar_wo / tot, 1) if tot else 0,
        "hfarWPct": round(100 * hfar_w / tot, 1) if tot else 0,
    }
    return {
        "source": src.name,
        "near": FREE_NEAR, "cell": OUTER_CELL,
        "cells": cells,
        "paid": [[round(y, 6), round(x, 6), k] for x, y, k in paid],
        "landmarks": landmarks,
        "freePts": [[round(y, 6), round(x, 6), k, nm] for x, y, k, nm in other_pts],
        "freeAreas": [{"k": k, "n": nm, "c": [[round(p[1], 6), round(p[0], 6)] for p in g.exterior.coords]} for g, k, nm in other_areas],
        "stats": stats,
    }


# ---------------------------------------------------------------- inner map
NORM = {"water": 300, "lawn": 120, "lit": 120, "bench": 150, "toilet": 250, "rest": 150, "steps": 40}
WEIGHTS = {
    "cost": "0.5 × 무료 음수대 거리(300m) + 0.5 × 돗자리 펼 잔디 거리(120m)",
    "time": "조명 있는 길까지 거리(120m) — 저녁·겨울 해 진 뒤",
    "mind": "0.6 × 벤치 거리(150m) + 0.4 × 혼잡 — 혼자 와서 앉을 자리",
    "body": "0.45 × 화장실 거리(250m) + 0.3 × 쉼터 거리(150m) + 0.25 × 계단 40m 안(무장애 단절)",
    "env": "0.7 × 열(지표온도·녹지) + 0.3 × 대기(도로 근접)",
}
# 처방: key -> (이름, 어떤 부담을 줄이나)
ACTIONS = {
    "shade": ("녹음수 식재 · 그늘막", "환경(열)"),
    "buffer": ("도로변 차폐 수림대", "환경(대기)"),
    "water": ("음수대 · 피크닉 테이블", "비용"),
    "light": ("보행등 · 야간 머무름 동선", "시간"),
    "seat": ("1인 벤치 · 이동식 의자", "심리"),
    "rest": ("휴게 벤치 · 무장애 동선 보완", "신체"),
    "toilet": ("화장실 접근 개선", "신체"),
}
HIGH = 0.7  # 공원 안 상위 30%면 '부담 큼'


def build_inner():
    osm = json.loads((BASE / "data" / "raw" / "osm" / "seoulforest_osm_20261109_1433.json").read_text(encoding="utf-8"))
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in osm["elements"] if e["type"] == "node"}
    benches, water, lit, lawn, steps = [], [], [], [], []
    for e in osm["elements"]:
        t = e.get("tags", {})
        if e["type"] == "node":
            p = Point(xy(e["lon"], e["lat"]))
            if t.get("amenity") in {"bench"} or t.get("leisure") == "picnic_table":
                benches.append(p)
            if t.get("amenity") == "drinking_water":
                water.append(p)
        elif e["type"] == "way":
            if e.get("geometry"):
                pts = [xy(p["lon"], p["lat"]) for p in e["geometry"]]
            else:
                pts = [xy(*nodes[i]) for i in e.get("nodes", []) if i in nodes]
            if len(pts) < 2:
                continue
            if t.get("lit") == "yes" and t.get("highway"):
                lit.append(LineString(pts))
            if t.get("highway") == "steps":
                steps.append(LineString(pts))
            if (t.get("landuse") == "grass" or t.get("natural") == "grassland") and len(pts) >= 4:
                lawn.append(Polygon(pts).buffer(0))
    U = lambda gs: unary_union(gs) if gs else None
    ub, uw, ul, ug, us = U(benches), U(water), U(lit), U(lawn), U(steps)
    dist = lambda u, p: u.distance(p) if u is not None else 9999

    grid = json.loads((BASE / "data" / "processed" / "grid.geojson").read_text(encoding="utf-8"))
    cells, raws = [], []
    for f in grid["features"]:
        pr = f["properties"]
        g = shape(f["geometry"])
        c = Point(xy(g.centroid.x, g.centroid.y))
        d = {"water": dist(uw, c), "lawn": dist(ug, c), "lit": dist(ul, c), "bench": dist(ub, c),
             "toilet": pr["dToilet"], "rest": pr["dRest"], "steps": dist(us, c)}
        step_near = 1.0 if d["steps"] <= NORM["steps"] else 0.0  # 계단 = 무장애 동선 단절 대리지표
        raws.append({
            "cost": 0.5 * clamp(d["water"] / NORM["water"]) + 0.5 * clamp(d["lawn"] / NORM["lawn"]),
            "time": clamp(d["lit"] / NORM["lit"]),
            "mind": 0.6 * clamp(d["bench"] / NORM["bench"]) + 0.4 * pr["crowd"],
            "body": 0.45 * clamp(d["toilet"] / NORM["toilet"]) + 0.3 * clamp(d["rest"] / NORM["rest"]) + 0.25 * step_near,
            "env": 0.7 * pr["heat"] + 0.3 * pr["air"],
        })
        minx, miny, maxx, maxy = g.bounds
        cells.append({
            "id": pr["id"],
            "b": [round(miny, 6), round(minx, 6), round(maxy, 6), round(maxx, 6)],
            "d": {k: round(v) for k, v in d.items()},
            "lst": pr.get("lst"), "crowd": pr["crowd"],
            "heatDom": pr["heat"] >= pr["air"],
            "area": round(geom_m(g).area),
        })
    tot = len(cells)
    # OSM 등록 시설이 적어 절대 기준이면 거의 전부 '부담 큼'이 됨 → 공원 안 상대 순위(백분위)로 환산
    counts = {k: 0 for k in WEIGHTS}
    overlap_hist = [0] * 6
    for k in WEIGHTS:
        order = sorted(range(tot), key=lambda i: raws[i][k])
        for rank, i in enumerate(order):
            cells[i][k] = round(rank / (tot - 1), 2)
    for c in cells:
        hi = [k for k in WEIGHTS if c[k] >= HIGH]
        for k in hi:
            counts[k] += 1
        c["n"] = len(hi)
        overlap_hist[len(hi)] += 1
    # 개선 처방: 부담 3개 이상 겹친 칸 = 우선 개선 구역, 큰 부담마다 처방 하나
    plan = {k: {"label": v[0], "for": v[1], "cells": 0, "m2": 0} for k, v in ACTIONS.items()}
    prio_m2 = 0
    for c in cells:
        if c["n"] < 3:
            c["acts"] = []
            continue
        prio_m2 += c["area"]
        acts = []
        for k in sorted((k for k in WEIGHTS if c[k] >= HIGH), key=lambda k: -c[k]):
            if k == "env":
                acts.append("shade" if c["heatDom"] else "buffer")
            elif k == "body":
                acts.append("toilet" if c["d"]["toilet"] > NORM["toilet"] else "rest")
            else:
                acts.append({"cost": "water", "time": "light", "mind": "seat"}[k])
        c["acts"] = acts
        for a in acts:
            plan[a]["cells"] += 1
            plan[a]["m2"] += c["area"]
    # 사람이 실제로 머무는(혼잡 상위 30%) 칸 중 부담 3개 이상
    crowd_sorted = sorted(c["crowd"] for c in cells)
    busy_cut = crowd_sorted[int(tot * 0.7)]
    busy = [c for c in cells if c["crowd"] >= busy_cut]
    stats = {
        "cells": tot,
        "pct": {k: round(100 * v / tot, 1) for k, v in counts.items()},
        "overlap": overlap_hist,
        "multi3": sum(c["n"] >= 3 for c in cells),
        "multi3Pct": round(100 * sum(c["n"] >= 3 for c in cells) / tot, 1),
        "busyMulti3Pct": round(100 * sum(c["n"] >= 3 for c in busy) / len(busy), 1),
        "osm": {"bench": len(benches), "water": len(water), "litWays": len(lit), "lawn": len(lawn), "steps": len(steps)},
        "prioM2": prio_m2,
        "parkM2": sum(c["area"] for c in cells),
    }
    return {"cells": cells, "stats": stats, "weights": WEIGHTS, "high": HIGH, "plan": plan}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    park = json.loads((BASE / "data" / "processed" / "park.geojson").read_text(encoding="utf-8"))
    pf = park["features"][0] if "features" in park else park
    park_ll = shape(pf["geometry"])
    data = {
        "built": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "park": [[round(y, 6), round(x, 6)] for x, y in (park_ll.exterior.coords if park_ll.geom_type == "Polygon" else max(park_ll.geoms, key=lambda g: g.area).exterior.coords)],
        "outer": build_outer(park_ll),
        "inner": build_inner(),
    }
    (OUT / "burden.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    # 최명원 버전 대시보드로도 내보냄 (원본 대시보드 web/ 은 건드리지 않음)
    dash = BASE / "web_최명원버전" / "public" / "data"
    if dash.exists():
        (dash / "burden.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tpl = (HERE / "src" / "template.html").read_text(encoding="utf-8")
    (HERE / "index.html").write_text(tpl.replace("/*__DATA__*/null", json.dumps(data, ensure_ascii=False)), encoding="utf-8")
    print(json.dumps({"outer": data["outer"]["stats"], "inner": data["inner"]["stats"]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
