# -*- coding: utf-8 -*-
"""6주차 과제 — 입지인자 4축 표 · 지표 ⑥ · 배분 대안 3안 · 대안 비교 매트릭스 · 가중치 역전점의 수치를 만든다.

  py 분석.py            (환경변수 VWORLD_KEY · VWORLD_DOMAIN 필요, 기초조사_파이프라인 폴더를 함께 씀)

- 후보지 2곳: 창신초(창신동 128-32) · 종로구청(수송동 146-12), 반경 400 m.
- 격자 30 m 표본점(점 하나 0.09 ha)마다 경사·향·표고(DEM), 용도지역, 공원·녹지 결정, 지목, 국가유산, 간선 거리를 붙인다.
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
import time                                               # noqa: E402
from urllib.error import HTTPError                        # noqa: E402


def elevations(pts, cache_name):
    """Open-Meteo 표고 — 100점씩, 요청 사이 쉬고, 429(요청 한도)면 기다렸다 다시. 받은 값은 격자 번호 순서로만 캐시(좌표 없음)."""
    path = os.path.join(HERE, "raw", cache_name + "_dem.json")
    if os.path.exists(path):
        z = json.load(open(path, encoding="utf-8"))
        if len(z) == len(pts):
            return z
    out = []
    for i in range(0, len(pts), 100):
        chunk = pts[i:i + 100]
        for wait in (0, 30, 60, 120, 240):
            time.sleep(wait or 2)
            try:
                res = common.http_json("https://api.open-meteo.com/v1/elevation", {
                    "latitude": ",".join("%.6f" % p[0] for p in chunk),
                    "longitude": ",".join("%.6f" % p[1] for p in chunk)}, retries=1)
                break
            except HTTPError as e:
                if e.code != 429:
                    raise
                print("    표고 요청 한도(429) — %d초 뒤 다시" % (wait * 2 or 30))
        else:
            raise RuntimeError("Open-Meteo 표고 요청 한도 — 잠시 뒤 다시 실행")
        out += res["elevation"]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, "w", encoding="utf-8"))
    return out

SITES = [("창신초", "서울특별시 종로구 창신동 128-32"), ("종로구청", "서울특별시 종로구 수송동 146-12")]
R, STEP, NB = 400, 30.0, 2                                 # 반경 · 격자 간격 · 경사 차분 이웃(±2칸 = ±60 m)
CELL_HA = STEP * STEP / 1e4
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
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


def sample(name, addr):
    key, dom = KEYS["VWORLD_KEY"], KEYS["VWORLD_DOMAIN"]
    lat0, lon0, refined, _ = geocode.request(addr, "PARCEL", key, dom)
    print("[%s] %s — 표본 만드는 중" % (name, refined))
    n = int(R // STEP) + NB + 1
    dlat, dlon = STEP / 111320.0, STEP / (111320.0 * math.cos(math.radians(lat0)))
    grid = [(lat0 + i * dlat, lon0 + j * dlon) for i in range(-n, n + 1) for j in range(-n, n + 1)]
    z = elevations(grid, name)
    W = 2 * n + 1
    Z = lambda i, j: z[(i + n) * W + (j + n)]
    pts = []
    for i in range(-n + NB, n - NB + 1):
        for j in range(-n + NB, n - NB + 1):
            la, lo = lat0 + i * dlat, lon0 + j * dlon
            if dist_m(lat0, lon0, la, lo) > R:
                continue
            gx = (Z(i, j + NB) - Z(i, j - NB)) / (2 * NB * STEP)
            gy = (Z(i + NB, j) - Z(i - NB, j)) / (2 * NB * STEP)
            pct = 100 * math.hypot(gx, gy)
            asp = (math.degrees(math.atan2(-gx, -gy)) + 360) % 360 if pct > 0 else None
            pts.append({"la": la, "lo": lo, "z": Z(i, j), "slope": pct, "aspect": asp})

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
    osm = overpass('[out:json][timeout:120];(way["highway"~"^(trunk|primary|secondary)$"](%s);'
                   'node["railway"="station"](%s);node["station"="subway"](%s););out geom;' % (b, b, b))
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
    return {"name": name, "refined": refined, "pts": pts, "zmin": zmin, "stations": stations}


def pct(a, b):
    return round(100.0 * a / b, 1) if b else 0.0


def indicator6(S):
    P = S["pts"]
    out = []
    for t, label in ((10, "하한"), (15, "기준안"), (25, "상한")):
        ok = sum(p["slope"] <= t and p["south"] and p["z_ok"] for p in P)
        out.append({"후보지": S["name"], "임계값": "%s %d%%" % (label, t), "경사 조건 충족(%)": pct(sum(p["slope"] <= t for p in P), len(P)),
                    "경사·향·표고 동시 충족(%)": pct(ok, len(P)), "적합면적(ha)": round(ok * CELL_HA, 2),
                    "향 기준": "135~225° (북 0° 시계방향)", "표고 기준": "원 안 최저 %.0f m + 50 m 이내(가정)" % S["zmin"],
                    "DEM": "Copernicus GLO-90 90 m (Open-Meteo Elevation API) — 국토지리정보원 90 m 대용", "표본": "격자 30 m · %d점 · 경사 차분 ±60 m" % len(P),
                    "조회일": TODAY})
    return out


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
          ["후보지", "임계값", "경사 조건 충족(%)", "경사·향·표고 동시 충족(%)", "적합면적(ha)", "향 기준", "표고 기준", "DEM", "표본", "조회일"])
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
