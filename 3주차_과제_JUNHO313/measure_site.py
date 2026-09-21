"""가설 H-C 의 기각조건 R1·R2·R3 판정 자료 — 서울창신초 반경 400 m.

    python measure_site.py            # data/ 의 저장된 Overpass 응답으로 계산
    python measure_site.py --fetch    # Overpass API 에서 다시 받아 저장한 뒤 계산

출력: data/계측_창신초_400m.csv, data/계측_요약.json
"""
import csv
import json
import math
import sys
import urllib.parse
import urllib.request
from datetime import date

CENTER = (37.576052, 127.014370)  # 창신초등학교 (OSM way, amenity=school) 중심점
R = 400
MIRRORS = ["https://overpass-api.de/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter",
           "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
QUERIES = {
    # 이름으로 찾는 쪽이 태그로 찾는 쪽보다 누락이 적었음 (amenity=school 로는 창신초가 빠짐)
    "data/osm_changsin_named_900m.json":
        '[out:json][timeout:60];nwr["name"~"(초등학교|공원|어린이공원)$"](around:900,{lat},{lon});out tags center;',
    "data/osm_changsin_900m.json":
        '[out:json][timeout:60];(nwr["railway"="station"](around:900,{lat},{lon});'
        'way["highway"~"^(primary|secondary|tertiary|trunk)$"](around:700,{lat},{lon}););out tags center geom;',
}


def fetch():
    for path, q in QUERIES.items():
        data = urllib.parse.urlencode({"data": q.format(lat=CENTER[0], lon=CENTER[1])}).encode()
        for m in MIRRORS:
            try:
                req = urllib.request.Request(m, data=data, headers={"User-Agent": "smu-class-assignment/1.0"})
                body = urllib.request.urlopen(req, timeout=120).read()
                open(path, "wb").write(body)
                print(f"저장 {path} ← {m}")
                break
            except Exception as e:  # Overpass 는 504 가 잦아 미러를 순회
                print(f"실패 {m}: {e}")
        else:
            sys.exit(f"모든 미러 실패: {path}")


def dist(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def xy(lat, lon):
    """중심 기준 동(+x)·북(+y) 미터 — 400 m 범위에서는 평면 근사로 충분"""
    return ((lon - CENTER[1]) * 111320 * math.cos(math.radians(CENTER[0])), (lat - CENTER[0]) * 110540)


def main():
    if "--fetch" in sys.argv:
        fetch()
    rows = []
    named = json.load(open("data/osm_changsin_named_900m.json", encoding="utf-8"))["elements"]
    for e in named:
        t = e["tags"]
        kind = "초등학교" if t.get("amenity") == "school" else "공원" if t.get("leisure") == "park" else None
        if not kind:
            continue
        c = e.get("center") or e
        x, y = xy(c["lat"], c["lon"])
        rows.append({"구분": kind, "이름": t["name"], "OSM": f"{e['type']}/{e['id']}",
                     "거리_m": round(dist(CENTER, (c["lat"], c["lon"]))), "x_m": round(x), "y_m": round(y),
                     "비고": "근린공원" if "근린공원" in t["name"] else ("어린이공원" if "어린이" in t["name"] else "")})

    other = json.load(open("data/osm_changsin_900m.json", encoding="utf-8"))["elements"]
    roads = {}
    for e in other:
        t = e.get("tags", {})
        if "highway" in t and e.get("geometry"):
            name = t.get("name") or "(무명)"
            pts = [(p["lat"], p["lon"]) for p in e["geometry"]]
            dmin = min(dist(CENTER, p) for p in pts)
            k = (name, t["highway"])
            if k not in roads or dmin < roads[k]["거리_m"]:
                roads[k] = {"구분": f"도로({t['highway']})", "이름": name, "OSM": f"way/{e['id']}",
                            "거리_m": round(dmin), "x_m": "", "y_m": "", "비고": "최근접 꼭짓점 거리"}
            roads[k].setdefault("_pts", []).extend(xy(*p) for p in pts)
        elif t.get("railway") == "station":
            c = e.get("center") or e
            x, y = xy(c["lat"], c["lon"])
            rows.append({"구분": "역", "이름": t.get("name", ""), "OSM": f"{e['type']}/{e['id']}",
                         "거리_m": round(dist(CENTER, (c["lat"], c["lon"]))), "x_m": round(x), "y_m": round(y), "비고": ""})

    # R2: 지봉로가 원을 얼마나 가르는가 — 원 안 구간의 평균 x 로 현(弦)까지 거리를 잡고 원의 활꼴 면적비 계산
    jb = [p for (n, _), r in roads.items() if n == "지봉로" for p in r["_pts"] if math.hypot(*p) <= R]
    d = sum(p[0] for p in jb) / len(jb)
    seg = R * R * math.acos(d / R) - d * math.sqrt(R * R - d * d)
    east_share = seg / (math.pi * R * R)

    for r in roads.values():
        r.pop("_pts", None)
        rows.append(r)
    rows.sort(key=lambda r: (r["구분"], r["거리_m"]))
    for r in rows:
        r["400m안"] = "예" if r["거리_m"] <= R else ""
        r["조회일"] = date.today().isoformat()

    with open("data/계측_창신초_400m.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["구분", "이름", "거리_m", "400m안", "x_m", "y_m", "OSM", "비고", "조회일"])
        w.writeheader()
        w.writerows(rows)

    inside = lambda k: [r for r in rows if r["구분"] == k and r["400m안"]]
    summary = {
        "중심": {"이름": "서울창신초등학교", "좌표": CENTER, "반경_m": R},
        "R1_초등학교_400m안": [r["이름"] for r in inside("초등학교")],
        "R3_근린공원_400m안": [r["이름"] for r in inside("공원") if r["비고"] == "근린공원"],
        "R2_지봉로_중심에서_동쪽_m": round(d),
        "R2_지봉로_동쪽_원면적비": round(east_share, 3),
        "간선도로_400m안": [f"{r['이름']}({r['구분'][3:-1]}) {r['거리_m']}m" for r in rows
                        if r["구분"].startswith("도로") and r["400m안"]],
        "조회일": date.today().isoformat(),
        "출처": "OpenStreetMap via Overpass API",
    }
    json.dump(summary, open("data/계측_요약.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
