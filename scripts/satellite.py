# -*- coding: utf-8 -*-
"""Step 6 - fetch Esri World Imagery tiles over the study area and stitch one JPEG.

The published dashboard cannot reach a tile server (its CSP blocks every external
host), so the imagery has to ship with the page as a single baked raster.
"""
import io, json, math, os, time, urllib.request, concurrent.futures as cf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web", "data")
os.makedirs(WEB, exist_ok=True)

LAT, LON, RAD, Z = 37.5735, 126.9790, 3000, 16
URL = ("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery"
       "/MapServer/tile/{z}/{y}/{x}")
UA = {"User-Agent": "Mozilla/5.0 (capstone urban-analysis; academic use)"}


def lon2x(lon, z):
    return (lon + 180.0) / 360.0 * (1 << z)


def lat2y(lat, z):
    r = math.radians(lat)
    return (1.0 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2.0 * (1 << z)


def x2lon(x, z):
    return x / (1 << z) * 360.0 - 180.0


def y2lat(y, z):
    n = math.pi * (1 - 2 * y / (1 << z))
    return math.degrees(math.atan(math.sinh(n)))


# bounding box a touch wider than the 3 km circle
pad = RAD * 1.06
dlat = pad / 111320.0
dlon = pad / (111320.0 * math.cos(math.radians(LAT)))
x0, x1 = int(lon2x(LON - dlon, Z)), int(lon2x(LON + dlon, Z))
y0, y1 = int(lat2y(LAT + dlat, Z)), int(lat2y(LAT - dlat, Z))
cols, rows = x1 - x0 + 1, y1 - y0 + 1
print("zoom {}  tiles {}x{} = {}".format(Z, cols, rows, cols * rows))

canvas = Image.new("RGB", (cols * 256, rows * 256), (24, 28, 34))


def grab(job):
    cx, cy = job
    url = URL.format(z=Z, x=cx, y=cy)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return job, Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception as e:
            if attempt == 3:
                print("  miss", cx, cy, type(e).__name__)
                return job, None
            time.sleep(1.5 * (attempt + 1))


jobs = [(cx, cy) for cy in range(y0, y1 + 1) for cx in range(x0, x1 + 1)]
done = 0
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for job, img in ex.map(grab, jobs):
        done += 1
        if img is not None:
            canvas.paste(img, ((job[0] - x0) * 256, (job[1] - y0) * 256))
        if done % 24 == 0:
            print("  {}/{}".format(done, len(jobs)))

out = os.path.join(WEB, "satellite.jpg")
canvas.save(out, "JPEG", quality=78, optimize=True, progressive=True)
print("satellite.jpg {}x{}  {:.2f} MB".format(canvas.width, canvas.height,
                                              os.path.getsize(out) / 1e6))

meta = {
    "zoom": Z, "width": canvas.width, "height": canvas.height,
    "lonWest": x2lon(x0, Z), "lonEast": x2lon(x1 + 1, Z),
    "latNorth": y2lat(y0, Z), "latSouth": y2lat(y1 + 1, Z),
    "center": [LAT, LON],
    "attribution": "Esri, Maxar, Earthstar Geographics",
}
json.dump(meta, io.open(os.path.join(WEB, "satellite.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(json.dumps(meta, ensure_ascii=False))
