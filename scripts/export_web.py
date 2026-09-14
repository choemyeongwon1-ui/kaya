# -*- coding: utf-8 -*-
"""Step 5 - pack the classified footprints into a compact JSON for the dashboard.

Coordinates become integers in half-metre units relative to the study centre and
are delta-encoded, which keeps 19k polygons well inside a few MB.
"""
import json, io, os, csv, math, collections
import classify_lib as L

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.environ.get("OUTDIR", os.path.join(HERE, "out"))
WEB = os.path.join(HERE, "web", "data")
os.makedirs(WEB, exist_ok=True)
S = json.load(io.open(os.path.join(OUTDIR, "summary.json"), encoding="utf-8"))

CLASSES = ["상업·업무", "주거", "공공·교육", "종교·문화", "공업", "기타·부속", "미분류"]
CIDX = {c: i for i, c in enumerate(CLASSES)}
LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6", "-"]
LIDX = {l: i for i, l in enumerate(LEVELS)}

K = math.cos(math.radians(L.LAT))
U = 2.0   # half-metre units


def px(lon):
    return int(round((lon - L.LON) * K * 111320.0 * U))


def py(lat):
    return int(round((lat - L.LAT) * 111320.0 * U))


def encode(rings, simplify=0):
    """[ring, ...] -> flat delta-encoded ints, plus the point count of each ring."""
    flat, counts = [], []
    for r in rings:
        pts = []
        for lon, lat in r:
            p = (px(lon), py(lat))
            if pts and p == pts[-1]:
                continue
            if simplify and pts and abs(p[0] - pts[-1][0]) + abs(p[1] - pts[-1][1]) < simplify:
                continue
            pts.append(p)
        if len(pts) < 3:
            continue
        counts.append(len(pts))
        lx = ly = 0
        for x, y in pts:
            flat.append(x - lx)
            flat.append(y - ly)
            lx, ly = x, y
    return flat, counts


# ------------------------------------------------------------- buildings ----
rows = {}
with io.open(os.path.join(OUTDIR, "buildings_classified.csv"), encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        rows[r["osm_id"]] = r

B = L.load_buildings()
flat, counts, cls, cls0, lvl, names, whys, cent = [], [], [], [], [], [], [], []
for b in B:
    r = rows.get(b["id"])
    if not r:
        continue
    fl, ct = encode(b["rings"])
    if not ct:
        continue
    # one entry per building: ring count, then that many point counts
    counts.append(len(ct))
    counts.extend(ct)
    flat.extend(fl)
    cls.append(CIDX[r["용도분류"]])
    cls0.append(CIDX[r["용도분류"]] if r["판정단계"] == "L1" else CIDX["미분류"])
    lvl.append(LIDX.get(r["판정단계"], 6))
    names.append(r["name"])
    whys.append(r["판정근거"])
    cent.append(px(b["c"][0]))
    cent.append(py(b["c"][1]))

payload = {
    "meta": {
        "total": len(cls), "radius_m": L.RAD, "unit": U,
        "center": [L.LAT, L.LON], "center_name": "서울 종로구청",
        "source": "Overpass API (OpenStreetMap)", "queried": "2026-09-14",
        "classes": CLASSES, "levels": LEVELS,
        # counts as arrays aligned to `classes` - no string keys to mis-decode
        "before": [S["before"][c] for c in CLASSES],
        "after": [S["after"][c] for c in CLASSES],
        "waterfall": S["levels"], "poi": S["poi"],
    },
    "counts": counts, "geom": flat, "cls": cls, "cls0": cls0, "lvl": lvl,
    "cent": cent, "names": names, "whys": whys,
}
p = os.path.join(WEB, "buildings.json")
json.dump(payload, io.open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("buildings.json {:,} buildings  {:.2f} MB".format(len(cls), os.path.getsize(p) / 1e6))

# --------------------------------------------------------------- basemap ----
MAJOR = {"motorway", "trunk", "primary", "secondary"}
lines = {"major": [], "minor": [], "rail": [], "stream": []}
lcount = {"major": [], "minor": [], "rail": [], "stream": []}
water, green, wc, gc = [], [], [], []


def polyline(geom, tol):
    pts, lx, ly = [], 0, 0
    for q in geom:
        x, y = px(q["lon"]), py(q["lat"])
        if pts and abs(x - lx) + abs(y - ly) < tol:
            continue
        pts.append(x - lx)
        pts.append(y - ly)
        lx, ly = x, y
    return pts


for el in L.load("basemap")["elements"]:
    t = el.get("tags", {})
    g = el.get("geometry")
    if el["type"] == "way" and g and ("highway" in t or "railway" in t
                                      or t.get("waterway") in ("river", "stream", "canal")):
        if "highway" in t:
            kind = "major" if t["highway"] in MAJOR else "minor"
        elif "railway" in t:
            kind = "rail"
        else:
            kind = "stream"
        pts = polyline(g, 6 if kind == "major" else 9)
        if len(pts) >= 4:
            lcount[kind].append(len(pts) // 2)
            lines[kind].extend(pts)
        continue
    rings = L.rings_of(el)
    if not rings:
        continue
    fl, ct = encode(rings, simplify=6)
    if not ct:
        continue
    if t.get("natural") == "water" or t.get("waterway"):
        wc.extend(ct)
        water.extend(fl)
    else:
        gc.extend(ct)
        green.extend(fl)

base = {"water": water, "waterCounts": wc, "green": green, "greenCounts": gc}
for k in lines:
    base[k] = lines[k]
    base[k + "Counts"] = lcount[k]
p = os.path.join(WEB, "basemap.json")
json.dump(base, io.open(p, "w", encoding="utf-8"), separators=(",", ":"))
print("basemap.json   {:.2f} MB".format(os.path.getsize(p) / 1e6))
