"""서울숲 분석용 공개 데이터 수집 (API 키 불필요)
OSM(Overpass) / Landsat C2 L2 · Sentinel-2 L2A · Copernicus DEM(Planetary Computer) / Open-Meteo"""
import json, sys, datetime as dt
from pathlib import Path
import numpy as np, requests, rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds

ROOT = Path(sys.argv[1]); RAW = ROOT / "data" / "raw"
BBOX = (127.024, 37.532, 127.050, 37.556)  # W,S,E,N
UA = {"User-Agent": "park-analysis-student-project"}
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token/"

def osm():
    s, w, n, e = BBOX[1], BBOX[0], BBOX[3], BBOX[2]
    b = f"{s},{w},{n},{e}"
    keys = "highway landuse natural leisure building amenity tourism waterway water barrier railway shop".split()
    body = "".join(f'nwr["{k}"]({b});' for k in keys)
    q = f"[out:json][timeout:170];({body});out geom;"
    r = requests.post("https://overpass-api.de/api/interpreter", data={"data": q}, headers=UA, timeout=180)
    r.raise_for_status()
    (RAW / "osm" / "osm.json").write_bytes(r.content)
    print("osm", len(r.json()["elements"]))
    q = "[out:json][timeout:60];relation(17338887);out geom;"
    r = requests.post("https://overpass-api.de/api/interpreter", data={"data": q}, headers=UA, timeout=90)
    r.raise_for_status(); (RAW / "osm" / "park.json").write_bytes(r.content)

def search(col, dates, cloud, limit=60):
    body = {"collections": [col], "bbox": list(BBOX), "datetime": dates, "limit": limit,
            "query": {"eo:cloud_cover": {"lt": cloud}}, "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}]}
    r = requests.post(STAC, json=body, headers=UA, timeout=60); r.raise_for_status()
    return r.json()["features"]

def clip(href, token, out=None):
    url = href + ("&" if "?" in href else "?") + token
    with rasterio.open(url) as src:
        l, b, r, t = transform_bounds("EPSG:4326", src.crs, *BBOX)
        win = from_bounds(l, b, r, t, src.transform).round_offsets().round_lengths()
        a = src.read(1, window=win, boundless=False)
        prof = src.profile.copy()
        prof.update(driver="GTiff", height=a.shape[0], width=a.shape[1], transform=src.window_transform(win), count=1)
        for k in ("blockxsize", "blockysize", "tiled", "interleave", "compress", "predictor"): prof.pop(k, None)
    if out:
        with rasterio.open(out, "w", **prof) as d: d.write(a, 1)
    return a

def landsat():
    tok = requests.get(SAS + "landsat-c2-l2", headers=UA, timeout=30).json()["token"]
    feats = []
    for y in (2023, 2024, 2025, 2026):
        feats += search("landsat-c2-l2", f"{y}-05-15T00:00:00Z/{y}-09-20T00:00:00Z", 50)
    feats = [f for f in feats if f["properties"].get("platform") in ("landsat-8", "landsat-9")]
    print("landsat candidates", len(feats))
    meta = []
    for f in sorted(feats, key=lambda x: x["properties"]["datetime"]):
        d = f["properties"]["datetime"][:10]
        try:
            qa = clip(f["assets"]["qa_pixel"]["href"], tok)
        except Exception as e:
            print("skip", d, e); continue
        # bit 1 dilated, 2 cirrus, 3 cloud, 4 shadow, fill bit 0
        bad = (qa & 0b11111) > 0
        frac = float(bad.mean())
        print(d, f["properties"]["platform"], "scene", f["properties"]["eo:cloud_cover"], "local bad", round(frac, 3))
        if frac > 0.02: continue
        out = RAW / "landsat" / f"{d}_{f['id'][:4]}"
        out.mkdir(exist_ok=True)
        clip(f["assets"]["lwir11"]["href"], tok, out / "st.tif")
        clip(f["assets"]["qa_pixel"]["href"], tok, out / "qa.tif")
        meta.append(dict(date=d, id=f["id"], platform=f["properties"]["platform"], local_bad=frac,
                         scene_cloud=f["properties"]["eo:cloud_cover"]))
    (RAW / "landsat" / "scenes.json").write_text(json.dumps(meta, indent=1))
    print("landsat kept", len(meta))

def s2():
    tok = requests.get(SAS + "sentinel-2-l2a", headers=UA, timeout=30).json()["token"]
    feats = []
    for y in (2024, 2025, 2026):
        feats += search("sentinel-2-l2a", f"{y}-06-01T00:00:00Z/{y}-09-15T00:00:00Z", 25, 40)
    meta = []; kept = 0
    for f in sorted(feats, key=lambda x: x["properties"]["eo:cloud_cover"]):
        if kept >= 4: break
        d = f["properties"]["datetime"][:10]
        scl = clip(f["assets"]["SCL"]["href"], tok)
        bad = np.isin(scl, [0, 1, 3, 8, 9, 10]).mean()
        print("s2", d, "local bad", round(float(bad), 3))
        if bad > 0.01 or any(m["date"] == d for m in meta): continue
        out = RAW / "s2" / d; out.mkdir(exist_ok=True)
        for b in ("B04", "B08"): clip(f["assets"][b]["href"], tok, out / f"{b}.tif")
        meta.append(dict(date=d, id=f["id"], local_bad=float(bad))); kept += 1
    (RAW / "s2" / "scenes.json").write_text(json.dumps(meta, indent=1))
    print("s2 kept", meta)

def dem():
    tok = requests.get(SAS + "cop-dem-glo-30", headers=UA, timeout=30).json()["token"]
    r = requests.post(STAC, json={"collections": ["cop-dem-glo-30"], "bbox": list(BBOX), "limit": 4}, headers=UA, timeout=60).json()
    f = r["features"][0]; print("dem", f["id"], len(r["features"]))
    clip(f["assets"]["data"]["href"], tok, RAW / "dem" / "dem.tif")

def climate():
    lat, lon = 37.5444, 127.0374
    h = "temperature_2m,relative_humidity_2m,precipitation"
    r = requests.get("https://archive-api.open-meteo.com/v1/archive", params=dict(latitude=lat, longitude=lon, start_date="2024-05-01",
        end_date="2026-10-31", hourly=h, timezone="Asia/Seoul"), headers=UA, timeout=120)
    r.raise_for_status(); (RAW / "climate" / "era.json").write_bytes(r.content)
    r = requests.get("https://air-quality-api.open-meteo.com/v1/air-quality", params=dict(latitude=lat, longitude=lon, start_date="2024-05-01",
        end_date="2026-10-31", hourly="pm2_5,pm10,uv_index", timezone="Asia/Seoul"), headers=UA, timeout=120)
    r.raise_for_status(); (RAW / "climate" / "aq.json").write_bytes(r.content)
    r = requests.get("https://api.open-meteo.com/v1/forecast", params=dict(latitude=lat, longitude=lon, hourly=h+",precipitation_probability,uv_index",
        forecast_days=2, timezone="Asia/Seoul"), headers=UA, timeout=60)
    r.raise_for_status(); (RAW / "climate" / "now.json").write_bytes(r.content)
    r = requests.get("https://air-quality-api.open-meteo.com/v1/air-quality", params=dict(latitude=lat, longitude=lon, hourly="pm2_5,pm10",
        forecast_days=2, timezone="Asia/Seoul"), headers=UA, timeout=60)
    r.raise_for_status(); (RAW / "climate" / "now_aq.json").write_bytes(r.content)
    print("climate ok")

def osm_extra():
    """비공원 시설(정수센터·용수공급지)·주차장·민간 부지 — 02 단계 제외/보류 처리에 사용"""
    q = '''[out:json][timeout:60];
(nwr["man_made"](37.536,127.032,37.551,127.046);
 nwr["landuse"~"industrial|commercial|military|construction|brownfield|railway|institutional"](37.536,127.032,37.551,127.046);
 nwr["amenity"="parking"](37.536,127.032,37.551,127.046);
 nwr["access"~"private|no"](37.536,127.032,37.551,127.046););out geom;'''
    r = requests.post("https://overpass-api.de/api/interpreter", data={"data": q}, headers=UA, timeout=90)
    r.raise_for_status(); (RAW / "osm" / "extra.json").write_bytes(r.content); print("osm extra", len(r.json()["elements"]))

def worldcover():
    tok = requests.get(SAS + "esa-worldcover", headers=UA, timeout=30).json()["token"]
    r = requests.post(STAC, json={"collections": ["esa-worldcover"], "bbox": list(BBOX), "limit": 5}, headers=UA, timeout=60).json()
    f = sorted(r["features"], key=lambda x: x["properties"].get("start_datetime") or x["properties"].get("datetime") or "")[-1]
    clip(f["assets"]["map"]["href"], tok, RAW / "worldcover" / "wc.tif"); print("worldcover", f["id"])

for d in ("osm", "climate", "landsat", "s2", "dem", "worldcover"):
    (RAW / d).mkdir(parents=True, exist_ok=True)
STEPS = dict(osm=osm, osm_extra=osm_extra, climate=climate, dem=dem, worldcover=worldcover, s2=s2, landsat=landsat)
for name in (sys.argv[2].split(",") if len(sys.argv) > 2 else STEPS):   # 예: ... osm_extra,worldcover
    try: STEPS[name]()
    except Exception as e: print("FAILED", name, repr(e))
