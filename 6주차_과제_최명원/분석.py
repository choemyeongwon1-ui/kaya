# -*- coding: utf-8 -*-
"""6주차 과제 — 입지인자 4축 표 · 지표 ⑥ · 배분 대안 3안 · 대안 비교 매트릭스 · 가중치 역전점의 수치를 만든다.

  py 분석.py            (환경변수 VWORLD_KEY · VWORLD_DOMAIN 필요, 기초조사_파이프라인 폴더를 함께 씀)

- 후보지 2곳: 창신초(창신동 128-32) · 종로구청(수송동 146-12), 반경 400 m.
- 지형은 국토지리정보원 공개DEM 90 m(raw/dem_ngii/, 국토정보플랫폼에서 내려받음) — 지표 ⑥ 은 90 m 셀(0.81 ha)로 직접 판정하고,
  배분용 격자 30 m 표본점(0.09 ha)은 자기가 든 90 m 셀의 경사·향·표고를 받는다. 여기에 용도지역, 공원·녹지 결정, 지목, 국가유산, 간선 거리를 붙인다.
- 좌표는 지오코더로 실행 때마다 구하고 파일에 남기지 않는다(브이월드 지오코더 이용조건 — 6주차 32·33쪽).
- 매트릭스의 지표·가중치·채점 구간은 `04_매트릭스_지표가중치_가안.csv` 에 먼저 고정하고, 이 스크립트는 그 파일을 읽어서만 채점한다.
"""
import csv, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# 저장소(kaya)에서는 바로 옆 폴더, 로컬 작업본에서는 바탕화면의 파이프라인을 쓴다
PIPE = next((p for p in (os.path.join(HERE, "..", "기초조사_파이프라인"),
                         os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "기초조사_파이프라인"))
             if os.path.isdir(os.path.join(p, "pipeline"))), None) or sys.exit("기초조사_파이프라인 폴더를 찾지 못했습니다")
sys.path.insert(0, PIPE)
os.environ.setdefault("SURVEY_OUT", os.path.join(HERE, "raw"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from pipeline import common, geocode                       # noqa: E402
from pipeline.common import http, dist_m, TODAY           # noqa: E402
from pipeline.config import KEYS                          # noqa: E402
from pipeline.sources import vworld                       # noqa: E402

SITES = [("창신초", "서울특별시 종로구 창신동 128-32"), ("종로구청", "서울특별시 종로구 수송동 146-12")]
R, STEP, NB = 400, 30.0, 2                                 # 반경 · 격자 간격 · 경사 차분 이웃(±2칸 = ±60 m)
CELL_HA = STEP * STEP / 1e4
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
RES = ("제1종전용주거지역", "제2종전용주거지역", "제1종일반주거지역", "제2종일반주거지역", "제3종일반주거지역")
COM = ("중심상업지역", "일반상업지역", "근린상업지역", "유통상업지역", "준주거지역")
FIXED_JIMOK = {"도": "도로", "철": "철도", "천": "하천", "구": "구거", "학": "학교", "종": "종교"}
GREEN_JIMOK = {"공": "공원", "임": "임야"}


def write(name, rows, cols):
    with open(os.path.join(HERE, name), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def xy(lat0, lon0, la, lo):
    return (lo - lon0) * 111320.0 * math.cos(math.radians(lat0)), (la - lat0) * 111320.0


def seg_dist(p, a, b):
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def overpass(q):
    last = None
    for ep in OVERPASS:
        try:
            return json.loads(http(ep, data={"data": q}, timeout=180, retries=2).decode("utf-8"))
        except Exception as e:                            # 다음 미러로
            last = e
    raise last


# ── 국토지리정보원 공개DEM 90 m ─────────────────────────────────────────────
DEM_DIR = os.path.join(HERE, "raw", "dem_ngii")
_DEM = []


def to5179(lon, lat):
    from rasterio.warp import transform
    xs, ys = transform("EPSG:4326", "EPSG:5179", [lon], [lat])
    return xs[0], ys[0]


def DEM_CELLS():
    """도엽 .img 를 읽어 셀마다 표고·경사(%)·향(°)을 계산 — 도엽 경계 셀은 이웃이 없어 제외."""
    if _DEM:
        return _DEM
    import glob
    import numpy as np
    import rasterio
    files = sorted(glob.glob(os.path.join(DEM_DIR, "*", "*.img")))
    if not files:
        sys.exit("raw/dem_ngii/ 에 국토지리정보원 공개DEM(.img)이 없습니다 — 국토정보플랫폼 > 공간정보받기 > 공개DEM")
    for f in files:
        with rasterio.open(f) as r:
            a = r.read(1).astype("float64")
            a[a == r.nodata] = np.nan
            res = r.res[0]
            for row in range(1, r.height - 1):
                for col in range(1, r.width - 1):
                    w = a[row - 1:row + 2, col - 1:col + 2]
                    if np.isnan(w).any():
                        continue
                    (A, B, C), (D, _, F), (G, H, I) = w
                    dx = ((C + 2 * F + I) - (A + 2 * D + G)) / (8 * res)      # 동쪽 +
                    dy = ((A + 2 * B + C) - (G + 2 * H + I)) / (8 * res)      # 북쪽 +
                    pct = 100 * math.hypot(dx, dy)
                    x, y = r.xy(row, col)
                    _DEM.append({"x": x, "y": y, "z": float(a[row, col]), "slope": pct,
                                 "aspect": (math.degrees(math.atan2(-dx, -dy)) + 360) % 360 if pct > 0 else None})
    return _DEM


def cells_all_near(x0, y0, pad=600):
    return [c for c in DEM_CELLS() if abs(c["x"] - x0) <= R + pad and abs(c["y"] - y0) <= R + pad]


def sample(name, addr):
    key, dom = KEYS["VWORLD_KEY"], KEYS["VWORLD_DOMAIN"]
    lat0, lon0, refined, _ = geocode.request(addr, "PARCEL", key, dom)
    print("[%s] %s — 표본 만드는 중" % (name, refined))
    # 지형 — 국토지리정보원 공개DEM 90 m(EPSG:5179) · 경사·향은 3×3 Horn 법, 셀마다 계산
    x0, y0 = to5179(lon0, lat0)
    cells = [c for c in DEM_CELLS() if math.hypot(c["x"] - x0, c["y"] - y0) <= R]      # ② 셀 판정 — 중심점 규칙
    cand = cells_all_near(x0, y0)
    near = lambda x, y: min(cand, key=lambda c: (c["x"] - x) ** 2 + (c["y"] - y) ** 2)
    n = int(R // STEP) + 1
    dlat, dlon = STEP / 111320.0, STEP / (111320.0 * math.cos(math.radians(lat0)))
    pts = []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            la, lo = lat0 + i * dlat, lon0 + j * dlon
            if dist_m(lat0, lon0, la, lo) > R:
                continue
            c = near(*to5179(lo, la))                          # 30 m 표본은 자기가 든 90 m 셀 값을 받음
            pts.append({"la": la, "lo": lo, "z": c["z"], "slope": c["slope"], "aspect": c["aspect"]})

    common.GEO_MASKED = True
    common.set_out(os.path.join(HERE, "raw", name))
    box = "BOX(%f,%f,%f,%f)" % vworld.bbox(lat0, lon0, R)
    lay = lambda layer, tag="": vworld.get_features(layer, box, key, dom, tag=tag)

    def tag(features, label_fn, field):
        for f in features:
            if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
                continue
            rings = vworld.rings_of(f["geometry"])
            las = [p[0] for r in rings for p in r]
            los = [p[1] for r in rings for p in r]
            lab = label_fn(f["properties"])
            if lab is None:
                continue
            for p in pts:
                if field in p:
                    continue
                if min(las) <= p["la"] <= max(las) and min(los) <= p["lo"] <= max(los) and \
                        sum(common._inside(p["la"], p["lo"], r) for r in rings) % 2:
                    p[field] = lab

    for L in vworld.ZONE_LAYERS:
        tag(lay(L), lambda pr: pr.get("uname") or "도시지역(세분 미표기)", "zone")
    tag(lay("LT_C_UPISUQ153"), lambda pr: pr.get("lcl_nam") if pr.get("lcl_nam") in ("공원", "녹지") else None, "park")
    tag(lay("LT_C_UO301"), lambda pr: pr.get("uname") if pr.get("uname") == "문화재보호구역" else None, "heritage")
    tag(lay("LT_C_UO101"), lambda _: "교육환경보호구역", "edu")
    tag(lay(vworld.PARCEL), lambda pr: (pr.get("jibun") or "?")[-1], "jimok")

    # 간선도로(OSM trunk·primary·secondary)와 도시철도역 — 거리 판정용, 저장하지 않음
    s, w_, n_, e = lat0 - 2 * R / 111320.0, lon0 - 2 * R / 111320.0 / math.cos(math.radians(lat0)), \
        lat0 + 2 * R / 111320.0, lon0 + 2 * R / 111320.0 / math.cos(math.radians(lat0))
    b = "%f,%f,%f,%f" % (s, w_, n_, e)
    cache = os.path.join(HERE, "raw", name + "_osm.json")       # OSM 공개자료 — 다시 받지 않게 보관(지오코더 결과 아님)
    osm = json.load(open(cache, encoding="utf-8")) if os.path.exists(cache) else None
    osm = osm or overpass('[out:json][timeout:120];(way["highway"~"^(trunk|primary|secondary)$"](%s);'
                   'node["railway"="station"](%s);node["station"="subway"](%s););out geom;' % (b, b, b))
    json.dump(osm, open(cache, "w", encoding="utf-8"))
    segs = []
    for el in osm["elements"]:
        if el["type"] == "way":
            g = [xy(lat0, lon0, q["lat"], q["lon"]) for q in el.get("geometry", [])]
            segs += list(zip(g, g[1:]))
    stations = {(el.get("tags", {}).get("name") or "?"): dist_m(lat0, lon0, el["lat"], el["lon"])
                for el in osm["elements"] if el["type"] == "node"}
    for p in pts:
        q = xy(lat0, lon0, p["la"], p["lo"])
        p["arterial_m"] = min((seg_dist(q, a, c) for a, c in segs), default=9999)
        p["xy"] = q
    zmin = min(p["z"] for p in pts)
    for p in pts:
        p["z_ok"] = p["z"] <= zmin + 50                         # 표고 기준: 원 안 최저 표고(간선 기반시설) +50 m — 가정
        p["south"] = p["aspect"] is not None and 135 <= p["aspect"] <= 225
    return {"name": name, "refined": refined, "pts": pts, "zmin": zmin, "stations": stations, "cells": cells}


def pct(a, b):
    return round(100.0 * a / b, 1) if b else 0.0


def indicator6(S):
    """지표 ⑥ — 국토지리정보원 공개DEM 90 m 셀(0.81 ha) 직접 판정(6주차 25·27·28쪽). 표고 기준 = 원 안 최저 셀 +50 m(가정)."""
    C = S["cells"]
    zmin = min(c["z"] for c in C)
    south = lambda c: c["aspect"] is not None and 135 <= c["aspect"] <= 225
    out = []
    for t, label in ((10, "하한"), (15, "기준안"), (25, "상한")):
        ok = sum(c["slope"] <= t and south(c) and c["z"] <= zmin + 50 for c in C)
        out.append({"후보지": S["name"], "임계값": "%s %d%%" % (label, t), "경사 조건 충족(%)": pct(sum(c["slope"] <= t for c in C), len(C)),
                    "경사·향·표고 동시 충족(%)": pct(ok, len(C)), "적합면적(ha)": round(ok * 0.81, 2),
                    "향 기준": "135~225° (북 0° 시계방향)", "표고 기준": "원 안 최저 셀 %.0f m + 50 m 이내(가정)" % zmin,
                    "DEM": "국토지리정보원 공개DEM 90 m (2025, 도엽 37608·37705, EPSG:5179)",
                    "브이월드 레이어": "LT_C_UQ111~114 용도지역(③과 중첩) · LP_PA_CBND_BUBUN 지목",
                    "경계 처리": "90 m 셀 중심이 원(반경 %d m) 안이면 포함 — 중심점 규칙, 도엽 가장자리 셀은 이웃이 없어 제외" % R,
                    "표본": "90 m 셀 %d개(셀 0.81 ha) · 경사·향 3×3 Horn" % len(C), "조회일": TODAY})
    return out

def near_park(P, d=500):
    """주거지역 표본 중 공원·녹지 결정 표본까지 d m 이내 비율 — 근린생활권 근린공원 유치거리 500 m(도시공원법 시행규칙 별표 3)."""
    park = [p["xy"] for p in P if "park" in p]
    res = [p for p in P if p.get("zone") in RES]
    if not res:
        return 0.0
    return pct(sum(any(math.hypot(p["xy"][0] - q[0], p["xy"][1] - q[1]) <= d for q in park) for p in res), len(res))


def axes_values(S):
    P = S["pts"]
    n = len(P)
    zone = {}
    for p in P:
        zone[p.get("zone", "미지정")] = zone.get(p.get("zone", "미지정"), 0) + 1
    st = sorted(S["stations"].items(), key=lambda x: x[1])
    return {
        "평균 경사(%)": round(sum(p["slope"] for p in P) / n, 1),
        "경사 5% 이하(%)": pct(sum(p["slope"] <= 5 for p in P), n),
        "경사 10% 이하(%)": pct(sum(p["slope"] <= 10 for p in P), n),
        "경사 25% 초과(%)": pct(sum(p["slope"] > 25 for p in P), n),
        "남향(%)": pct(sum(p["south"] for p in P), n),
        "표고 범위(m)": "%.0f~%.0f" % (min(p["z"] for p in P), max(p["z"] for p in P)),
        "간선 100 m 이내(%)": pct(sum(p["arterial_m"] <= 100 for p in P), n),
        "최근접 도시철도역": "%s %.0f m" % (st[0][0], st[0][1]) if st else "없음",
        "반경 안 역 수": sum(d <= R for _, d in st),
        "공원·녹지 결정(%)": pct(sum("park" in p for p in P), n),
        "문화재보호구역(%)": pct(sum("heritage" in p for p in P), n),
        "교육환경보호구역(%)": pct(sum("edu" in p for p in P), n),
        "주거지역(%)": pct(sum(p.get("zone") in RES for p in P), n),
        "상업·준주거(%)": pct(sum(p.get("zone") in COM for p in P), n),
        "도로(지목 도)(%)": pct(sum(p.get("jimok") == "도" for p in P), n),
        "임야(지목 임)(%)": pct(sum(p.get("jimok") == "임" for p in P), n),
        "주거지 중 공원·녹지 500 m 이내(%)": near_park(P),
        "표본 수": n,
    }


# ── 배분 대안 3안 (창신초) ───────────────────────────────────────────────
def allocate(S):
    P = S["pts"]
    for p in P:
        j = p.get("jimok")
        if j in FIXED_JIMOK:
            p["base"] = "기반·공공(존치)"
        elif "park" in p or j in GREEN_JIMOK or "heritage" in p or p["slope"] > 25:
            p["base"] = "녹지"                                   # ① 녹지 선확정 — 세 대안 공통
        else:
            p["base"] = None
    rules = {
        "A 근린주거형": lambda p: "상업업무" if p.get("zone") in COM else "주거",
        "B 일자리형": lambda p: ("공업" if p["slope"] <= 5 and p["arterial_m"] <= 150 and p.get("zone") not in COM
                                else "상업업무" if p.get("zone") in COM or (p["arterial_m"] <= 100 and p["slope"] <= 10)
                                else "주거"),
        "C 절충형": lambda p: ("공업" if p["slope"] <= 5 and p["arterial_m"] <= 100 and p.get("zone") not in COM and "edu" not in p
                              else "상업업무" if p.get("zone") in COM else "주거"),
    }
    plans = {}
    for alt, rule in rules.items():
        plans[alt] = [p["base"] or rule(p) for p in P]
    return plans


def evaluate(S, plans):
    P = S["pts"]
    green = [p["xy"] for p, u in zip(P, next(iter(plans.values()))) if u == "녹지"]
    near_green = [min((math.hypot(p["xy"][0] - g[0], p["xy"][1] - g[1]) for g in green), default=9999) <= 250 for p in P]
    area_rows, ind = [], {}
    for alt, use in plans.items():
        R_idx = [k for k, u in enumerate(use) if u not in ("녹지", "기반·공공(존치)")]
        cnt = {u: use.count(u) for u in ("녹지", "기반·공공(존치)", "공업", "상업업무", "주거")}
        for u, c in cnt.items():
            area_rows.append({"대안": alt, "용도": u, "면적(ha)": round(c * CELL_HA, 2), "구성비(%)": pct(c, len(P))})
        ind_ = [k for k in R_idx if use[k] == "공업"]
        res = [k for k in R_idx if use[k] == "주거"]
        dev = [k for k in R_idx if use[k] in ("공업", "상업업무")]
        conflict = [k for k in ind_ if any(use[m] == "주거" and math.hypot(P[k]["xy"][0] - P[m]["xy"][0], P[k]["xy"][1] - P[m]["xy"][1]) <= 50
                                           for m in res)]
        match = sum((use[k] == "주거" and P[k].get("zone") in RES) or (use[k] == "상업업무" and P[k].get("zone") in COM) for k in R_idx)
        ind[alt] = {
            "I1": pct(len(dev), len(R_idx)),
            "I2": pct(sum(near_green[k] for k in res), len(res)),
            "I3": pct(sum(P[k]["arterial_m"] <= 100 for k in dev), len(dev)),
            "I4": pct(len(conflict), len(ind_)) if ind_ else 0.0,
            "I5": pct(sum(P[k]["slope"] <= 15 for k in res), len(res)),
            "I6": pct(match, len(R_idx)),
        }
    return area_rows, ind


def main():
    if not KEYS["VWORLD_KEY"]:
        sys.exit("VWORLD_KEY 가 없습니다 — setx VWORLD_KEY 후 새 터미널에서 실행")
    sites = [sample(n, a) for n, a in SITES]

    write("02_지표6_경사향.csv", [r for S in sites for r in indicator6(S)],
          ["후보지", "임계값", "경사 조건 충족(%)", "경사·향·표고 동시 충족(%)", "적합면적(ha)", "향 기준", "표고 기준", "DEM", "브이월드 레이어", "경계 처리", "표본", "조회일"])
    vals = {S["name"]: axes_values(S) for S in sites}
    with open(os.path.join(HERE, "01_4축표_값.json"), "w", encoding="utf-8") as f:
        json.dump({"조회일": TODAY, "반경_m": R, "값": vals}, f, ensure_ascii=False, indent=1)

    ch = sites[0]
    plans = allocate(ch)
    area_rows, ind = evaluate(ch, plans)
    write("03_배분대안_3안.csv", area_rows, ["대안", "용도", "면적(ha)", "구성비(%)"])
    write("05_매트릭스_지표값.csv", [dict(대안=a, **v) for a, v in ind.items()], ["대안", "I1", "I2", "I3", "I4", "I5", "I6"])
    print(json.dumps({"4축": vals, "지표값": ind}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
