"""Fetch paid vs free 'staying places' around Seongsu from OpenStreetMap (Overpass).

paid  = cafe / restaurant / fast food / bar / bakery (you must buy something to stay)
free  = park, garden, playground, library, community centre, shelter, bench, picnic table

Output: 부담지도/data/raw/seongsu_stay_<YYYYMMDD_HHMM>.json  (Overpass original, never edited)
Run:    python 부담지도/src/fetch_seongsu.py
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"

# 서울숲 서쪽 끝 ~ 성수동1·2가 ~ 성수역 동쪽 (south, west, north, east)
BBOX = (37.5355, 127.0330, 37.5520, 127.0640)
B = ",".join(map(str, BBOX))

QUERY = f"""
[out:json][timeout:120];
(
  nwr["amenity"~"^(cafe|restaurant|fast_food|bar|pub|ice_cream|bakery)$"]({B});
  nwr["shop"~"^(coffee|bakery|pastry)$"]({B});
  nwr["leisure"~"^(park|garden|playground|picnic_table)$"]({B});
  nwr["amenity"~"^(library|community_centre|social_facility|shelter|bench|drinking_water|toilets)$"]({B});
);
out center geom;
"""

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "park-study-script/0.1"})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except Exception as e:  # try next mirror
            last = e
    else:
        raise SystemExit(f"Overpass failed: {last}")
    out = RAW / f"seongsu_stay_{dt.datetime.now():%Y%m%d_%H%M}.json"
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(out, len(data.get("elements", [])), "elements")


if __name__ == "__main__":
    main()
