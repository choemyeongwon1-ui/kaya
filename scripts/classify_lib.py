# -*- coding: utf-8 -*-
"""Geometry + loading helpers shared by the classification steps (stdlib only)."""
import json, io, os, math, collections

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
LAT, LON, RAD = 37.5735, 126.9790, 3000

M_PER_DEG_LAT = 111320.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT))   # study area is tiny -> constant


def load(name):
    return json.load(io.open(os.path.join(RAW, name + ".json"), encoding="utf-8"))


def rings_of(el):
    if el["type"] == "way":
        g = el.get("geometry") or []
        return [[(p["lon"], p["lat"]) for p in g if p]] if len(g) >= 3 else []
    out = []
    for m in el.get("members", []):
        if m.get("role") in ("outer", "") and m.get("geometry"):
            g = [(p["lon"], p["lat"]) for p in m["geometry"] if p]
            if len(g) >= 3:
                out.append(g)
    return out


def bbox(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def centroid(rings):
    r = max(rings, key=len)
    return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)


def inside(x, y, rings):
    for r in rings:
        c = False
        n = len(r)
        j = n - 1
        for i in range(n):
            xi, yi = r[i]
            xj, yj = r[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi:
                c = not c
            j = i
        if c:
            return True
    return False


CELL = 0.002   # about 180 m


def grid_index(items):
    idx = collections.defaultdict(list)
    for k, it in enumerate(items):
        x0, y0, x1, y1 = it["bbox"]
        for cx in range(int(x0 / CELL), int(x1 / CELL) + 1):
            for cy in range(int(y0 / CELL), int(y1 / CELL) + 1):
                idx[(cx, cy)].append(k)
    return idx


def hits(idx, items, x, y):
    for k in idx.get((int(x / CELL), int(y / CELL)), ()):
        it = items[k]
        x0, y0, x1, y1 = it["bbox"]
        if x0 <= x <= x1 and y0 <= y <= y1 and inside(x, y, it["rings"]):
            yield it


def _seg_dist_m(px, py, ax, ay, bx, by):
    """Distance in metres from P to segment AB (local equirectangular projection)."""
    px, ax, bx = px * M_PER_DEG_LON, ax * M_PER_DEG_LON, bx * M_PER_DEG_LON
    py, ay, by = py * M_PER_DEG_LAT, ay * M_PER_DEG_LAT, by * M_PER_DEG_LAT
    dx, dy = bx - ax, by - ay
    d2 = dx * dx + dy * dy
    t = 0.0 if d2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / d2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def dist_to_m(item, x, y):
    best = 1e9
    for r in item["rings"]:
        for i in range(len(r)):
            a, b = r[i - 1], r[i]
            d = _seg_dist_m(x, y, a[0], a[1], b[0], b[1])
            if d < best:
                best = d
    return best


def nearest(idx, items, x, y, max_m=20.0):
    """Nearest item whose outline is within max_m of (x, y) -> (item, distance) or None."""
    span = int(max_m / (CELL * M_PER_DEG_LON)) + 1
    cx0, cy0 = int(x / CELL), int(y / CELL)
    seen, best, bestd = set(), None, max_m
    for cx in range(cx0 - span, cx0 + span + 1):
        for cy in range(cy0 - span, cy0 + span + 1):
            for k in idx.get((cx, cy), ()):
                if k in seen:
                    continue
                seen.add(k)
                d = dist_to_m(items[k], x, y)
                if d < bestd:
                    best, bestd = items[k], d
    return (best, bestd) if best else None


def great_circle_m(lat1, lon1, lat2, lon2):
    a = (math.sin(math.radians(lat1)) * math.sin(math.radians(lat2))
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.cos(math.radians(lon2 - lon1)))
    return 6371000 * math.acos(max(-1.0, min(1.0, a)))


def load_buildings():
    out = []
    for el in load("buildings")["elements"]:
        if el["type"] not in ("way", "relation"):
            continue
        rings = rings_of(el)
        if not rings:
            continue
        cx, cy = centroid(rings)
        if great_circle_m(LAT, LON, cy, cx) > RAD + 150:
            continue
        out.append({"id": el["type"][0] + str(el["id"]), "tags": el.get("tags", {}),
                    "rings": rings, "bbox": bbox(rings), "c": (cx, cy),
                    "cls": None, "level": None, "why": ""})
    return out


def poi_points(elements, classify):
    """Yield (x, y, cls, label) for every use-bearing POI."""
    for el in elements:
        tags = el.get("tags", {})
        c = classify(tags)
        if not c:
            continue
        p = el if "lat" in el else el.get("center")
        if not p:
            continue
        label = tags.get("name") or next(
            ("{}={}".format(k, v) for k, v in tags.items()
             if k in ("amenity", "shop", "office", "tourism", "leisure",
                      "healthcare", "craft", "historic", "government")), c)
        yield p["lon"], p["lat"], c, label
