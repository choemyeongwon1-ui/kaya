"""법적 구역 자료 legal.json — 맞춤 추천 화면(recovery-station/needs/data/)과 메인 대시보드(recovery-station/data/)가 함께 씀
  브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지마다 토지이음 토지이용계획을 조회해 지정(공원·하천구역·유수지·수도시설)을 붙이고,
  팀 20m 격자 칸 · 거점 · 보행망 구간(큰비 때 피할 곳)에 옮깁니다.
사용: python -I analysis/07_legal.py <프로젝트 폴더>
  브이월드 인증키는 환경변수 VWORLD_KEY 에서 읽습니다(키는 출력하거나 저장하지 않음). 원자료는 data/raw/legal/ 에 캐시합니다."""
import json, sys, math, os, re, html, time, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from shapely.geometry import shape, Point, mapping
from shapely.ops import unary_union
from shapely import affinity

ROOT = Path(sys.argv[1]); RAW = ROOT/"data/raw/legal"; RAW.mkdir(parents=True, exist_ok=True)
APP = str(ROOT/"recovery-station/data"); OUT = str(ROOT/"recovery-station/needs/data/legal.json")
BOX = "BOX(127.0330,37.5370,127.0480,37.5515)"

def fetch_cbnd(path):
    key = os.environ.get("VWORLD_KEY")
    if not key: sys.exit("환경변수 VWORLD_KEY 가 없습니다 (브이월드 오픈API 인증키)")
    feats, page = [], 1
    while True:
        q = {"service": "data", "request": "GetFeature", "data": "LP_PA_CBND_BUBUN", "key": key, "format": "json", "crs": "EPSG:4326",
             "size": "1000", "page": str(page), "geometry": "true", "attribute": "true", "geomFilter": BOX, "domain": "localhost"}
        d = json.loads(urllib.request.urlopen(urllib.request.Request("https://api.vworld.kr/req/data?" + urllib.parse.urlencode(q), headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8"))
        r = d.get("response", {})
        if r.get("status") != "OK": sys.exit(f"브이월드 응답: {r.get('status')} {json.dumps(r.get('error'), ensure_ascii=False)}")
        feats += r["result"]["featureCollection"]["features"]
        if page >= int(r["page"]["total"]): break
        page += 1
    json.dump({"type": "FeatureCollection", "features": feats}, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print("연속지적도", len(feats), "필지 받음")

def eum_tags(pnu):
    """토지이음 토지이용계획 열람 페이지에서 지역·지구 지정 문구를 찾습니다"""
    url = ("https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?selSido=11&selSgg=200&selUmd=" + pnu[6:10] +
           f"&selRi=00&landGbn=1&bobn={pnu[11:15]}&bubn={pnu[15:19]}&pnu={pnu}&scale=&isNoScr=script&chk=0&mode=search&selGbn=umd")
    s = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode("cp949", "ignore")
    s = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", "", s); s = html.unescape(re.sub(r"<[^>]+>", " ", s)); s = re.sub(r"\s+", " ", s)
    i = s.find("지역지구등 지정여부 지역지구등"); seg = s[i:i + 3000]; j = seg.find("「토지이용규제 기본법"); seg = seg[:j] if j > 0 else seg
    tags = []
    for k, pat in [("근린공원", r"근린공원"), ("공원", r"(?<![가-힣])공원(?![가-힣])"), ("유수지", r"유수지"), ("하천구역", r"하천구역<하천법>"),
                   ("수도공급설비", r"수도공급설비"), ("문화유산보호구역", r"문화유산보호구역"), ("광장", r"(?<![가-힣])광장")]:
        if re.search(pat, seg): tags.append(k)
    time.sleep(0.5)
    return tags


lat0 = 37.544; kx = 111320 * math.cos(math.radians(lat0)); ky = 110540
tom = lambda g: affinity.scale(affinity.translate(g, -127.04, -lat0), kx, ky, origin=(0, 0))
tog = lambda g: affinity.translate(affinity.scale(g, 1 / kx, 1 / ky, origin=(0, 0)), 127.04, lat0)

park = shape(json.load(open(APP + "/park.geojson", encoding="utf-8"))["features"][0]["geometry"])
parkm = tom(park).buffer(0)
cbnd_p, cache_p = RAW/"vworld_cbnd.json", RAW/"eum_cache.json"
if not cbnd_p.exists(): fetch_cbnd(cbnd_p)
fc = json.load(open(cbnd_p, encoding="utf-8"))
cache = json.load(open(cache_p, encoding="utf-8")) if cache_p.exists() else {}

def cls(t, jm):
    t = [x for x in t if x != "수도공급설비"] + (["수도공급설비"] if jm == "수" else [])
    if "유수지" in t: return "detention"
    p = "공원" in t or "근린공원" in t
    if p and "하천구역" in t: return "park_river"
    if p and "수도공급설비" in t: return "park_plant"
    if p: return "park"
    if "하천구역" in t: return "river"
    if "수도공급설비" in t: return "plant"
    return "other"

parts = {}
miss = 0
for f in fc["features"]:
    g = tom(shape(f["geometry"]))
    if not g.is_valid: g = g.buffer(0)
    it = g.intersection(parkm)
    if it.area < 50: continue
    pnu = f["properties"]["pnu"]
    if pnu not in cache:
        try: cache[pnu] = eum_tags(pnu)
        except Exception as e: print("토지이음 조회 실패", pnu, e); miss += 1; continue
    k = cls(cache[pnu], f["properties"].get("jibun", "").strip()[-1:])
    parts.setdefault(k, []).append(it)
json.dump(cache, open(cache_p, "w", encoding="utf-8"), ensure_ascii=False)
zones = {k: unary_union(v).buffer(0.3).buffer(-0.3) for k, v in parts.items()}
print("토지이음 조회 실패 필지:", miss)
print("구역 면적(팀 공원 경계 안):", {k: round(z.area) for k, z in zones.items()}, "공원", round(parkm.area))

def zone_at(gm):
    best, ba = None, 0
    for k, z in zones.items():
        a = z.intersection(gm).area
        if a > ba: best, ba = k, a
    return best

team = json.load(open(APP + "/team.json", encoding="utf-8"))
cells, cnt = {}, {}
for f in team["grid"]["features"]:
    k = zone_at(tom(shape(f["geometry"])))
    if k:
        cells[str(f["properties"]["id"])] = k
    cnt[k or "none"] = cnt.get(k or "none", 0) + 1
print("팀 격자", len(team["grid"]["features"]), "칸:", cnt)

hubs = {}
for h in json.load(open(APP + "/hubs.json", encoding="utf-8")):
    if h.get("type") == "gate": continue
    k = zone_at(tom(Point(h["lon"], h["lat"])).buffer(15))
    hubs[h["id"]] = k
    print(" 거점", h["id"], h["name"], "→", k)

# 보행망 구간 중 가운데 점이 물이 차는 구역(유수지·하천구역)에 있는 것 — 큰비 때 길 찾기에서 피함
net = json.load(open(APP + "/network.json", encoding="utf-8"))
floodZ = unary_union([zones[k] for k in ("detention", "park_river", "river") if k in zones])
flood_edges = []
for i, e in enumerate(net["edges"]):
    a, b = net["nodes"][e[0]], net["nodes"][e[1]]
    if floodZ.contains(tom(Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))): flood_edges.append(i)
print("물이 차는 구역을 지나는 보행 구간:", len(flood_edges), "/", len(net["edges"]))

def rnd(o):
    if isinstance(o, float): return round(o, 6)
    if isinstance(o, (list, tuple)): return [rnd(x) for x in o]
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    return o
feats = []
for k, z in zones.items():
    gg = tog(z.simplify(1.5, preserve_topology=True))
    feats.append({"type": "Feature", "properties": {"zone": k, "m2": round(z.area)}, "geometry": rnd(mapping(gg))})

meta = {
    "park":       {"label": "공원",            "law": "도시공원법",                 "agency": "공원 관리 기관",                 "rule": "공원시설 기준으로 설치",                         "flood": False},
    "park_river": {"label": "공원 + 하천구역",  "law": "도시공원법 + 하천법",         "agency": "공원 관리 기관 + 하천 관리청",     "rule": "하천점용허가가 필요",              "flood": True},
    "park_plant": {"label": "공원 + 정수장 부지", "law": "도시공원법 + 수도시설(지목 수도용지)", "agency": "공원 관리 기관 + 상수도사업본부", "rule": "수도시설과 겹쳐 상수도사업본부와 협의가 필요",     "flood": False},
    "detention":  {"label": "유수지",           "law": "국토계획법 도시계획시설(유수지)", "agency": "유수지 관리 부서",               "rule": "큰비 때 빗물을 담는 기능이 우선 · 시설은 기능을 해치지 않는 범위에서만", "flood": True},
    "plant":      {"label": "정수장(공원 아님)", "law": "수도시설",                    "agency": "상수도사업본부",                 "rule": "공원 시설 설치 대상이 아님",                      "flood": False},
    "river":      {"label": "하천구역(공원 아님)", "law": "하천법",                     "agency": "하천 관리청",                    "rule": "하천점용허가가 필요",                             "flood": True},
    "other":      {"label": "기타",             "law": "—",                          "agency": "확인 필요",                      "rule": "지정 확인 필요",                                 "flood": False},
}
out = {
    "note": "브이월드 연속지적도(LP_PA_CBND_BUBUN) 필지마다 토지이음 토지이용계획을 조회해 법적 지정을 붙인 자료. 칸은 가장 넓게 겹치는 필지의 지정을 따름. 50㎡ 미만 조각 필지 제외. 토지이음 열람 정보는 법적 효력이 없으므로 실제 설치 전에는 토지이용계획확인서로 확인.",
    "checked": time.strftime("%Y-%m-%d"),
    "zones": meta, "cells": cells, "hubs": hubs, "floodEdges": flood_edges,
    "areaM2": {k: round(z.area) for k, z in zones.items()},
    "shapes": {"type": "FeatureCollection", "features": feats},
}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
# 메인 대시보드(「머무는 숲」 React 빌드본)도 같은 파일을 data/legal.json 으로 읽습니다
import shutil; shutil.copyfile(OUT, ROOT/"recovery-station/data/legal.json")
print("저장", OUT, "+ recovery-station/data/legal.json", os.path.getsize(OUT), "bytes")
