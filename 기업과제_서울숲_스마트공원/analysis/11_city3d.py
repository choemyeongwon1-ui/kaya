"""소개 첫 화면 3D 점구름 지도(recovery-station/needs/hero3d.js)가 읽는 data/city3d.json 을 만듭니다.

- 건물: OpenStreetMap(Overpass API, ODbL)의 서울숲·성수 일대 건물 외곽선.
  높이는 height → building:levels×3.3m 순으로 쓰고, 둘 다 없으면 바닥 면적으로 추정합니다(추정값임을 화면에 밝힘).
- 도로·철도·물길·공원 경계: 이미 있는 recovery-station/data/basemap.json, park.geojson 을 그대로 씁니다.
- 좌표: 기준점(127.0430, 37.5440)에서 동쪽·북쪽으로 몇 m인지로 바꿔 저장합니다.

쓰기:  python analysis/11_city3d.py            (Overpass 에서 새로 받음)
       python analysis/11_city3d.py 받아둔.json  (받아 둔 Overpass 응답을 씀)
인증키는 필요 없습니다.
"""
import hashlib, json, math, sys, urllib.parse, urllib.request
from pathlib import Path

R = Path(__file__).resolve().parent.parent / "recovery-station"
LAT0, LON0 = 37.5440, 127.0430
KY = 111320.0
KX = 111320.0 * math.cos(math.radians(LAT0))
QUERY = '[out:json][timeout:150];(way["building"](37.5345,127.030,37.5530,127.066););out tags geom;'
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def fetch():
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    for u in SERVERS:
        try:
            req = urllib.request.Request(u, data=body, headers={"User-Agent": "seoulforest-dashboard-student"})
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.loads(r.read().decode("utf8"))
            if d.get("elements"):
                return d
        except Exception as e:  # 서버가 붐비면 다음 서버로
            print("실패:", u, type(e).__name__)
    raise SystemExit("Overpass 서버에서 받지 못했습니다. 잠시 뒤 다시 해 보세요.")


def xy(lon, lat):
    return [round((lon - LON0) * KX, 1), round((lat - LAT0) * KY, 1)]


def area(p):
    return abs(sum(p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1] for i in range(len(p) - 1))) / 2


def main():
    d = json.loads(Path(sys.argv[1]).read_text(encoding="utf8")) if len(sys.argv) > 1 else fetch()
    B, real = [], 0
    for e in d["elements"]:
        g, t = e.get("geometry"), e.get("tags", {})
        if not g or len(g) < 4:
            continue
        p = [xy(q["lon"], q["lat"]) for q in g]
        a = area(p)
        if a < 25:
            continue
        h = None
        try:
            h = float(str(t.get("height", "")).replace("m", "").strip())
        except ValueError:
            pass
        if not h:
            try:
                h = float(t["building:levels"]) * 3.3
            except (KeyError, ValueError):
                h = None
        if h:
            real += 1
        else:  # 높이 정보가 없으면 면적으로 추정(같은 건물은 늘 같은 값)
            r = int(hashlib.md5(str(e["id"]).encode()).hexdigest()[:4], 16) / 65535
            h = (6 + r * 9) if a < 300 else (9 + r * 15) if a < 1500 else (15 + r * 20)
        B.append([round(max(3, min(h, 220)), 1)] + [c for q in p[:-1] for c in q])

    base = json.loads((R / "data/basemap.json").read_text(encoding="utf8"))
    lines = lambda k: [[c for q in ln for c in xy(*q)] for ln in base.get(k, [])]
    park = json.loads((R / "data/park.geojson").read_text(encoding="utf8"))["features"][0]["geometry"]["coordinates"]
    out = {
        "source": "OpenStreetMap 기여자 (Overpass API, ODbL) · 높이 없는 건물은 면적으로 추정",
        "fetched": d.get("osm3s", {}).get("timestamp_osm_base", "")[:10],
        "origin": [LON0, LAT0],
        "real_heights": real,
        "buildings": B,
        "park": [[c for q in ring for c in xy(*q)] for poly in park for ring in poly[:1]],
        "major": lines("major"), "minor": lines("minor"), "rail": lines("rail"), "water": lines("water"),
    }
    (R / "data/city3d.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"건물 {len(B)}동 (높이 정보 있음 {real}동, 추정 {len(B) - real}동) → recovery-station/data/city3d.json")


if __name__ == "__main__":
    main()
