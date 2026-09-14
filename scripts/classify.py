# -*- coding: utf-8 -*-
"""Step 2 - six-level evidence waterfall that turns building=yes into a land-use class.

L1 building=* value                L4 POI inside the footprint
L2 use tags on the same object     L5 POI snapped to the nearest footprint (<=10 m)
L3 Korean name keyword             L6 containing land-use / facility polygon
"""
import json, os, csv, io, collections
import taxonomy as T
import names as NM
import classify_lib as L

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.environ.get("OUTDIR", os.path.join(HERE, "out"))
os.makedirs(OUTDIR, exist_ok=True)
SNAP_M = 10.0
L2KEYS = ("amenity", "shop", "office", "tourism", "healthcare", "leisure",
          "craft", "historic", "government", "club", "building:use", "religion")

B = L.load_buildings()
N = len(B)
print("대상 건물 (반경 {} m, 중심 {}, {}) : {:,}동".format(L.RAD, L.LAT, L.LON, N))

step = collections.OrderedDict()


def remaining():
    return sum(1 for b in B if not b["cls"])


def note(tag, label, before):
    step[tag] = {"label": label, "gained": before - remaining(), "left": remaining()}
    print("  {:<3} {:<26} +{:>6,}동   남은 미분류 {:>6,}동".format(
        tag, label, step[tag]["gained"], step[tag]["left"]))


# ---------------------------------------------------- L1 building=* value ---
start = N
for b in B:
    c = T.classify_building_value(b["tags"].get("building"))
    if c:
        b["cls"], b["level"], b["why"] = c, "L1", "building=" + b["tags"]["building"]
base_unknown = remaining()
BEFORE = collections.Counter(b["cls"] for b in B if b["cls"])
note("L1", "building=* 값", start)

# --------------------------------------- L2 use tags on the same OSM object --
r = remaining()
for b in B:
    if b["cls"]:
        continue
    c = T.classify_tags(b["tags"])
    if c:
        key = next((k for k in L2KEYS if k in b["tags"]), "?")
        b["cls"], b["level"] = c, "L2"
        b["why"] = "{}={}".format(key, b["tags"].get(key))
note("L2", "동일 객체의 용도 태그", r)

# ------------------------------------------------- L3 Korean name keyword ----
r = remaining()
for b in B:
    if b["cls"]:
        continue
    hit = NM.classify_name(b["tags"].get("name"))
    if hit:
        b["cls"], b["level"] = hit[0], "L3"
        b["why"] = "명칭 '{}' 중 '{}'".format(b["tags"]["name"], hit[1])
note("L3", "건물명 키워드", r)

# ------------------------------------------------ L4/L5 POI spatial join -----
r = remaining()
unk = [b for b in B if not b["cls"]]
uidx = L.grid_index(unk)
allidx = L.grid_index(B)
votes = collections.defaultdict(collections.Counter)
ev = collections.defaultdict(list)
snap_votes = collections.defaultdict(collections.Counter)
snap_ev = collections.defaultdict(list)
n_in = n_snap = n_drop = 0

for x, y, cls, label in L.poi_points(L.load("pois")["elements"], T.classify_tags):
    tgt = list(L.hits(allidx, B, x, y))          # POI inside ANY building?
    if tgt:
        n_in += 1
        for b in tgt:
            if not b["cls"]:
                votes[b["id"]][cls] += 1
                ev[b["id"]].append(label)
        continue
    near = L.nearest(uidx, unk, x, y, SNAP_M)     # else snap to nearest unclassified
    if near:
        n_snap += 1
        b, d = near
        snap_votes[b["id"]][cls] += 1
        snap_ev[b["id"]].append("{} ({:.0f}m)".format(label, d))
    else:
        n_drop += 1


def apply_votes(votes, ev, level, prefix):
    for b in unk:
        if b["cls"]:
            continue
        v = votes.get(b["id"])
        if not v:
            continue
        top = max(v.items(), key=lambda kv: (kv[1], -T.PRIORITY.index(kv[0])))
        b["cls"], b["level"] = top[0], level
        b["why"] = "{} {}개: {}".format(prefix, sum(v.values()), ", ".join(ev[b["id"]][:3]))


apply_votes(votes, ev, "L4", "내부 POI")
note("L4", "건물 내부 POI 공간결합", r)
r = remaining()
apply_votes(snap_votes, snap_ev, "L5", "인접 POI 스냅")
note("L5", "최근접 POI 스냅(<={:.0f}m)".format(SNAP_M), r)
print("     POI 판정: 내부 {:,} / 스냅 {:,} / 미사용 {:,}".format(n_in, n_snap, n_drop))

# ------------------------------------- L6 containing land-use / facility area -
r = remaining()
areas = []
for el in L.load("landuse")["elements"]:
    rings = L.rings_of(el)
    if not rings:
        continue
    tags = el.get("tags", {})
    hit = T.classify_area(tags)
    if not hit:
        continue
    c, why = hit
    if tags.get("name"):
        why += " ({})".format(tags["name"])
    x0, y0, x1, y1 = L.bbox(rings)
    areas.append({"rings": rings, "bbox": (x0, y0, x1, y1), "cls": c, "why": why,
                  "area": (x1 - x0) * (y1 - y0)})
aidx = L.grid_index(areas)
for b in B:
    if b["cls"]:
        continue
    x, y = b["c"]
    found = list(L.hits(aidx, areas, x, y))
    if found:
        a = min(found, key=lambda a: a["area"])   # smallest = most specific
        b["cls"], b["level"], b["why"] = a["cls"], "L6", "포함 영역: " + a["why"]
note("L6", "상위 용도영역 포함관계", r)
for b in B:
    if not b["cls"]:
        b["cls"], b["level"], b["why"] = T.UNK, "-", "OSM 내 용도 근거 없음"

# ---------------------------------------------------------------- outputs ----
AFTER = collections.Counter(b["cls"] for b in B)
lvl = collections.Counter(b["level"] for b in B)
BEFORE[T.UNK] = base_unknown
final_unknown = AFTER[T.UNK]

summary = {
    "source": "Overpass API (OpenStreetMap)",
    "center": [L.LAT, L.LON], "center_name": "서울 종로구청",
    "radius_m": L.RAD, "total_buildings": N,
    "before": {k: BEFORE.get(k, 0) for k in T.ORDER},
    "after": {k: AFTER.get(k, 0) for k in T.ORDER},
    "levels": [{"code": k, "label": v["label"], "gained": v["gained"], "left": v["left"]}
               for k, v in step.items()],
    "level_counts": {k: lvl.get(k, 0) for k in ("L1", "L2", "L3", "L4", "L5", "L6", "-")},
    "poi": {"inside": n_in, "snapped": n_snap, "unused": n_drop},
    "areas_used": len(areas),
    "unknown_before_pct": round(100.0 * base_unknown / N, 1),
    "unknown_after_pct": round(100.0 * final_unknown / N, 1),
}
json.dump(summary, io.open(os.path.join(OUTDIR, "summary.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)

with io.open(os.path.join(OUTDIR, "buildings_classified.csv"), "w",
             encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["osm_id", "lon", "lat", "building_tag", "name", "용도분류", "판정단계", "판정근거"])
    for b in B:
        w.writerow([b["id"], "{:.6f}".format(b["c"][0]), "{:.6f}".format(b["c"][1]),
                    b["tags"].get("building", ""), b["tags"].get("name", ""),
                    b["cls"], b["level"], b["why"]])

print("\n{:<12}{:>9}{:>9}   {:>9}{:>9}".format("용도", "기존", "기존%", "보완", "보완%"))
for k in T.ORDER:
    print("{:<12}{:>9,}{:>8.1f}%   {:>9,}{:>8.1f}%".format(
        k, BEFORE.get(k, 0), 100.0 * BEFORE.get(k, 0) / N,
        AFTER.get(k, 0), 100.0 * AFTER.get(k, 0) / N))
print("\n미분류 {:.1f}% -> {:.1f}%   (해소 {:,}동)".format(
    100.0 * base_unknown / N, 100.0 * final_unknown / N, base_unknown - final_unknown))
print("저장 ->", OUTDIR)
