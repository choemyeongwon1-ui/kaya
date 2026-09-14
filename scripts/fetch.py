# -*- coding: utf-8 -*-
"""Step 1 - pull raw OSM data for the 3 km study area around Jongno-gu Office."""
import json, os, sys, io
import oxq

LAT, LON, RAD = 37.5735, 126.9790, 3000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
os.makedirs(OUT, exist_ok=True)
A = f"(around:{RAD},{LAT},{LON})"

QUERIES = {
    # 1) every building footprint, with full geometry (needed for point-in-polygon)
    "buildings": f"""[out:json][timeout:900];
(way["building"]{A};relation["building"]{A};);
out geom;""",

    # 2) every use-bearing POI (node or area) - the evidence used to fill building=yes
    "pois": f"""[out:json][timeout:900];
(
 node["amenity"]{A};way["amenity"]{A};
 node["shop"]{A};way["shop"]{A};
 node["office"]{A};way["office"]{A};
 node["tourism"]{A};way["tourism"]{A};
 node["healthcare"]{A};way["healthcare"]{A};
 node["leisure"]{A};way["leisure"]{A};
 node["craft"]{A};way["craft"]{A};
 node["historic"]{A};way["historic"]{A};
 node["government"]{A};way["government"]{A};
 node["club"]{A};way["club"]{A};
 node["man_made"="works"]{A};
 node["emergency"="ambulance_station"]{A};
);
out tags center;""",

    # 3) land-use / functional-area polygons - last-resort context evidence
    "landuse": f"""[out:json][timeout:900];
(
 way["landuse"]{A};relation["landuse"]{A};
 way["amenity"~"^(school|university|college|kindergarten|hospital|place_of_worship|prison|police|fire_station|marketplace|research_institute)$"]{A};
 relation["amenity"~"^(school|university|college|kindergarten|hospital|place_of_worship|marketplace)$"]{A};
 way["leisure"~"^(park|sports_centre|stadium|pitch)$"]{A};
 relation["leisure"~"^(park|sports_centre|stadium)$"]{A};
 way["tourism"]{A};relation["tourism"]{A};
 way["historic"]{A};relation["historic"]{A};
 way["office"]{A};relation["office"]{A};
 way["military"]{A};relation["military"]{A};
);
out geom;""",

    # 4) context layer for the map only (water, green, road network, rail)
    "basemap": f"""[out:json][timeout:900];
(
 way["natural"~"^(water|wood|scrub)$"]{A};relation["natural"="water"]{A};
 way["waterway"="riverbank"]{A};
 way["landuse"~"^(forest|grass|meadow|cemetery)$"]{A};
 way["leisure"~"^(park|garden|pitch)$"]{A};relation["leisure"="park"]{A};
 way["highway"~"^(motorway|trunk|primary|secondary)$"]{A};
 way["highway"~"^(tertiary|residential|unclassified|living_street|pedestrian)$"]{A};
 way["railway"~"^(rail|subway|light_rail)$"]{A};
 way["waterway"~"^(river|stream|canal)$"]{A};
);
out geom;""",
}

for name, q in QUERIES.items():
    path = os.path.join(OUT, name + ".json")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print(f"[skip] {name} already cached ({os.path.getsize(path)/1e6:.1f} MB)")
        continue
    print(f"[get ] {name} ...", file=sys.stderr)
    j = oxq.run(q)
    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(j, f)
    print(f"[done] {name}: {len(j['elements'])} elements -> {os.path.getsize(path)/1e6:.1f} MB")
