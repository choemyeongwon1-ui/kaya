# -*- coding: utf-8 -*-
"""OpenStreetMap(Overpass) — 교통·유통공급·공공문화체육·공간시설, 그리고 자연환경·토지이용의 대용값.

한 번의 질의로 반경 안 요소를 모두 받아 raw/osm.json 에 남기고, 거기서 셈한다.
OSM 은 법정 자료가 아니다. 용도지역·도시계획시설 결정과 다를 수 있으므로 비고에 '대용'을 적는다.
"""
import csv, json, os
from ..common import row, http, save_raw, dist_m, Disk, join_rings, OUT, RAW

EPS = ["https://overpass-api.de/api/interpreter",
       "https://overpass.kumi.systems/api/interpreter",
       "https://overpass.private.coffee/api/interpreter"]
SRC = "OpenStreetMap(ODbL) Overpass API"
CMD = "py run.py --only osm"

SEL = [
    'nwr["amenity"~"^(school|kindergarten|university|college|library|community_centre|social_facility|'
    'childcare|hospital|clinic|townhall|police|fire_station|post_office|courthouse|theatre|arts_centre|'
    'cinema|bus_station)$"]',
    'nwr["office"="government"]',
    'nwr["tourism"~"^(museum|gallery)$"]',
    'nwr["leisure"~"^(park|playground|garden|sports_centre|stadium|pitch|nature_reserve|fitness_station)$"]',
    'nwr["place"="square"]',
    'nwr["railway"~"^(station|halt)$"]', 'nwr["station"="subway"]',
    'node["highway"="bus_stop"]', 'nwr["amenity"="bus_station"]',
    'nwr["aeroway"="aerodrome"]', 'nwr["landuse"="port"]', 'nwr["harbour"]',
    'nwr["power"~"^(substation|plant|tower)$"]',
    'nwr["man_made"~"^(water_tower|water_works|reservoir_covered|wastewater_plant|mast|communications_tower)$"]',
    'nwr["telecom"]',
    'nwr["landuse"]',
    'nwr["natural"~"^(wood|water|scrub|grassland|wetland|heath|bare_rock|peak|spring)$"]',
    'way["waterway"]',
    'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|'
    'service|pedestrian|footway|cycleway|motorway_link|trunk_link|primary_link|secondary_link)$"]',
    'way["railway"~"^(rail|subway|light_rail)$"]',
    'nwr["historic"]',
    'nwr["shop"]', 'nwr["office"]', 'nwr["craft"]',
]


def fetch(lat, lon, r):
    body = "[out:json][timeout:300];(\n%s\n);out geom tags;" % "\n".join(
        "%s(around:%d,%s,%s);" % (s, r, lat, lon) for s in SEL)
    last = None
    for ep in EPS * 2:
        try:
            raw = http(ep, data={"data": body}, timeout=320, retries=1, wait=8)
            data = json.loads(raw.decode("utf-8"))
            save_raw("osm.json", raw)
            return data
        except Exception as e:
            last = e
    raise last


def geom(e):
    """요소 → (대표점, 고리 목록, 선 목록)."""
    if e["type"] == "node":
        return (e["lat"], e["lon"]), [], []
    if e["type"] == "way":
        pts = [(p["lat"], p["lon"]) for p in e.get("geometry", []) if p]
        if not pts:
            return None, [], []
        c = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        closed = len(pts) >= 4 and pts[0] == pts[-1]
        return c, ([pts] if closed else []), ([] if closed else [pts])
    parts = [[(p["lat"], p["lon"]) for p in m.get("geometry", []) if p]
             for m in e.get("members", []) if m["type"] == "way" and m.get("role") in ("outer", "inner", "")]
    rings = join_rings(parts)
    pts = [p for r in rings for p in r] or [p for w in parts for p in w]
    if not pts:
        return None, [], []
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)), rings, []


def classify(t):
    """태그 → (대항목, 세부항목, 구분). 해당 없으면 None. 순서가 우선순위다."""
    a, le, lu = t.get("amenity"), t.get("leisure"), t.get("landuse")
    if a in ("school", "kindergarten", "university", "college", "library") or t.get("tourism") in ("museum", "gallery") \
            or a in ("theatre", "arts_centre", "cinema"):
        k = {"school": "학교", "kindergarten": "유치원", "university": "대학", "college": "대학",
             "library": "도서관", "theatre": "공연장", "arts_centre": "문화시설", "cinema": "영화관"}.get(a)
        return "공공·문화체육시설", "교육문화시설", k or {"museum": "박물관", "gallery": "미술관·갤러리(상업 포함)"}[t["tourism"]]
    if le in ("sports_centre", "stadium", "pitch", "fitness_station"):
        return "공공·문화체육시설", "교육문화시설", "체육시설"
    if a in ("community_centre", "social_facility", "childcare", "hospital", "clinic"):
        return "공공·문화체육시설", "복지시설", {"community_centre": "주민·복지회관", "social_facility": "사회복지시설",
                                          "childcare": "어린이집", "hospital": "병원", "clinic": "의원"}[a]
    if a in ("townhall", "police", "fire_station", "post_office", "courthouse") or t.get("office") == "government":
        return "공공·문화체육시설", "공공청사", {"townhall": "시청·구청·주민센터", "police": "경찰", "fire_station": "소방",
                                         "post_office": "우체국", "courthouse": "법원"}.get(a, "행정기관")
    if le in ("park", "garden", "nature_reserve"):
        return "공간시설", "공원·유원지", "공원" if le == "park" else ("정원(사유 포함)" if le == "garden" else "보호구역")
    if le == "playground":
        return "공간시설", "공원·유원지", "어린이놀이터"
    if t.get("place") == "square":
        return "공간시설", "광장", "광장"
    if t.get("railway") in ("station", "halt") or t.get("station") == "subway":
        return "교통시설", "철도", "역"
    if t.get("highway") == "bus_stop":
        return "교통시설", "버스터미널", "버스정류장"
    if a == "bus_station":
        return "교통시설", "버스터미널", "버스터미널"
    if t.get("aeroway") == "aerodrome":
        return "교통시설", "공항", "공항"
    if lu == "port" or "harbour" in t:
        return "교통시설", "항만", "항만"
    if t.get("power") in ("substation", "plant"):
        return "유통·공급시설", "전기", {"substation": "변전소", "plant": "발전소"}[t["power"]]
    mm = t.get("man_made")
    if mm in ("water_tower", "water_works", "reservoir_covered", "wastewater_plant"):
        return "유통·공급시설", "상수도", {"water_tower": "배수탑", "water_works": "정수장",
                                       "reservoir_covered": "배수지", "wastewater_plant": "하수처리장"}[mm]
    if mm in ("mast", "communications_tower") or "telecom" in t:
        return "유통·공급시설", "통신", "통신시설"
    return None


ROAD_CLASS = {"motorway": "고속도로", "motorway_link": "고속도로", "trunk": "주간선", "trunk_link": "주간선",
              "primary": "주간선", "primary_link": "주간선", "secondary": "보조간선", "secondary_link": "보조간선",
              "tertiary": "집산도로", "unclassified": "국지도로", "residential": "국지도로",
              "living_street": "국지도로", "service": "국지도로",
              "pedestrian": "보행자전용", "footway": "보행자전용", "cycleway": "자전거도로"}
LANDUSE_KO = {"residential": "주거", "commercial": "상업", "retail": "상업", "industrial": "공업",
              "construction": "공사중", "education": "교육", "religious": "종교", "military": "군사",
              "cemetery": "묘지", "farmland": "농지", "orchard": "농지", "meadow": "초지", "grass": "초지",
              "forest": "산림", "recreation_ground": "여가", "railway": "철도"}


def collect(site, r):
    lat, lon = site["lat"], site["lon"]
    els = fetch(lat, lon, r)["elements"]
    disk = Disk(lat, lon, r)
    A = disk.cell / 1e6                                   # 표본점 1개 = km²
    circle_km2 = len(disk.pts) * A
    out, detail = [], []
    counts, areas = {}, {}
    road_len, rail_len, stream = {}, 0.0, {}
    land_owner, green, water = {}, set(), set()

    for e in els:
        t = e.get("tags", {})
        c, rings, lines = geom(e)
        if c is None:
            continue
        name = t.get("name:ko") or t.get("name") or ""
        d = dist_m(lat, lon, c[0], c[1])

        # 선형 — 도로·철도·하천: 반경 안 선분 길이 (선분 중점이 원 안이면 셈)
        hw, rw, ww = t.get("highway"), t.get("railway"), t.get("waterway")
        segs = lines or rings
        if e["type"] == "way" and (hw in ROAD_CLASS or rw in ("rail", "subway", "light_rail") or ww):
            L = 0.0
            for s in segs:
                for p, q in zip(s, s[1:]):
                    if dist_m(lat, lon, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2) <= r:
                        L += dist_m(p[0], p[1], q[0], q[1])
            if hw in ROAD_CLASS:
                road_len[ROAD_CLASS[hw]] = road_len.get(ROAD_CLASS[hw], 0) + L
            elif rw:
                rail_len += L
            elif L:
                key = name or "(무명 %s)" % ww
                stream[key] = stream.get(key, 0) + L
            continue

        # 면 — 토지이용(OSM landuse)·녹지·수면 구성: 표본점은 먼저 잡은 쪽이 가진다
        lu = t.get("landuse")
        nat = t.get("natural")
        if rings and (lu or nat in ("wood", "scrub", "grassland", "heath", "wetland", "water")):
            hit = disk.hits(rings)
            if lu:
                k = LANDUSE_KO.get(lu, "기타(%s)" % lu)
                for p in hit:
                    land_owner.setdefault(p, k)
            if nat == "water" or lu in ("reservoir", "basin"):
                water |= hit
            if nat in ("wood", "scrub", "grassland", "heath") or lu in ("forest", "grass", "meadow"):
                green |= hit

        # 점 — 시설
        cl = classify(t)
        if t.get("historic"):
            cl = ("인문환경", "문화재", "OSM historic 요소")
        if t.get("shop") or t.get("office") and t.get("office") != "government" or t.get("craft"):
            if not cl and d <= r:
                k = "상점(shop)" if t.get("shop") else ("사무소(office)" if t.get("office") else "공방(craft)")
                counts[("경제", "특화산업", k)] = counts.get(("경제", "특화산업", k), 0) + 1
                sub = t.get("shop") or t.get("office") or t.get("craft")
                detail.append(["경제", "특화산업", k + ":" + sub, name, round(d), round(c[0], 6), round(c[1], 6),
                               "%s/%s" % (e["type"], e["id"])])
            if not cl:
                continue
        if not cl or d > r:
            continue
        counts[cl] = counts.get(cl, 0) + 1
        if rings and cl[0] == "공간시설":
            areas[cl] = areas.get(cl, set()) | disk.hits(rings)
        detail.append([cl[0], cl[1], cl[2] + ((":" + t["historic"]) if t.get("historic") else ""), name, round(d), round(c[0], 6), round(c[1], 6),
                       "%s/%s" % (e["type"], e["id"])])

    note = "반경 %d m 원 안(면적 %.2f km²)" % (r, circle_km2)
    for (g, s, k), n in sorted(counts.items()):
        if g == "경제":
            continue
        out.append(row(g, s, "%s 개수" % k, n, "개소", SRC, CMD, 비고=note))
    for (g, s, k), hit in sorted(areas.items()):
        out.append(row(g, s, "%s 면적(원 안)" % k, round(len(hit) * A * 1e6), "m²", SRC, CMD,
                       비고="%s · 원 대비 %.1f%%" % (note, 100 * len(hit) / len(disk.pts))))
    # 없는 것도 0 으로 적는다 — '안 셈'과 '없음'을 구분하기 위해
    for g, s, k in [("교통시설", "공항", "공항"), ("교통시설", "항만", "항만"), ("교통시설", "버스터미널", "버스터미널"),
                    ("공간시설", "광장", "광장"), ("공간시설", "공원·유원지", "공원")]:
        if (g, s, k) not in counts:
            out.append(row(g, s, "%s 개수" % k, 0, "개소", SRC, CMD, 비고=note + " · OSM 에 없음(실제 없음인지 결정도로 확인)"))

    for k in ["고속도로", "주간선", "보조간선", "집산도로", "국지도로", "보행자전용", "자전거도로"]:
        if k in road_len:
            out.append(row("교통시설", "도로", "%s 연장" % k, round(road_len[k] / 1000, 2), "km", SRC, CMD,
                           비고=note + " · OSM highway 등급을 도로 기능 구분에 대응시킨 값(법정 도로등급 아님) · 상·하행이 따로 그려진 도로는 두 번 셈"))
    tot = sum(v for k, v in road_len.items() if k not in ("보행자전용", "자전거도로"))
    out.append(row("교통시설", "도로", "차도 연장 밀도", round(tot / 1000 / circle_km2, 2), "km/km²", SRC, CMD, 비고=note))
    out.append(row("교통시설", "철도", "철도·도시철도 선로 연장", round(rail_len / 1000, 2), "km", SRC, CMD,
                   비고=note + " · 지하 구간 포함"))

    # 수리·수문 — 하천
    if stream:
        for k, v in sorted(stream.items(), key=lambda x: -x[1]):
            out.append(row("자연환경", "수리", "하천·수로 연장 — %s" % k, round(v), "m", SRC, CMD,
                           비고=note + " · 복개 구간은 OSM 에 없을 수 있음"))
    else:
        out.append(row("자연환경", "수리", "하천·수로 연장", 0, "m", SRC, CMD, 비고=note + " · OSM waterway 없음"))
    out.append(row("자연환경", "수문", "수면 면적", round(len(water) * A * 1e6), "m²", SRC, CMD,
                   비고="%s · 원 대비 %.1f%%" % (note, 100 * len(water) / len(disk.pts))))
    out.append(row("자연환경", "식생", "녹지 피복(OSM wood·scrub·grass 등) 면적", round(len(green) * A * 1e6), "m²", SRC, CMD,
                   비고="%s · 원 대비 %.1f%% · 대용값 — 현존식생도·생태자연도로 대체해야 함" % (note, 100 * len(green) / len(disk.pts))))
    out.append(row("공간시설", "녹지", "녹지 피복 비율(대용)", round(100 * len(green) / len(disk.pts), 1), "%", SRC, CMD,
                   비고="도시계획시설 '녹지'(완충·경관·연결녹지)가 아니라 피복 — 결정도로 확인"))

    # 토지이용 — OSM landuse 구성(대용)
    comp = {}
    for k in land_owner.values():
        comp[k] = comp.get(k, 0) + 1
    unk = len(disk.pts) - len(land_owner)
    for k, n in sorted(comp.items(), key=lambda x: -x[1]):
        out.append(row("토지이용", "용도별 분포", "OSM landuse — %s" % k, round(100 * n / len(disk.pts), 1), "%", SRC, CMD,
                       비고="대용값(법정 용도지역 아님) · 원 면적 기준"))
    out.append(row("토지이용", "용도별 분포", "OSM landuse — 미표기", round(100 * unk / len(disk.pts), 1), "%", SRC, CMD,
                   비고="OSM 에 landuse 가 안 그려진 면적"))

    # 경제 — 상점·사무소 개수 (특화산업의 단서, 업종 상위 5)
    for k in ("상점(shop)", "사무소(office)", "공방(craft)"):
        n = counts.get(("경제", "특화산업", k), 0)
        top = {}
        for d_ in detail:
            if d_[2].startswith(k + ":"):
                s = d_[2].split(":", 1)[1]
                top[s] = top.get(s, 0) + 1
        t5 = ", ".join("%s %d" % kv for kv in sorted(top.items(), key=lambda x: -x[1])[:5])
        out.append(row("경제", "특화산업", "%s 개수" % k, n, "개소", SRC, CMD, 비고="%s · 상위: %s" % (note, t5 or "-")))

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "상세_OSM시설목록.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["대항목", "세부항목", "구분", "명칭", "중심거리(m)", "위도", "경도", "OSM 식별자"])
        w.writerows(sorted(detail, key=lambda x: (x[0], x[1], x[4])))
    return out
