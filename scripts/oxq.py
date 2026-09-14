"""Overpass query helper: mirror rotation + retry."""
import json, time, urllib.request, urllib.parse, urllib.error, sys

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]

def run(query, tries=3, timeout=600):
    last = None
    for attempt in range(tries):
        for url in MIRRORS:
            try:
                data = urllib.parse.urlencode({"data": query}).encode()
                req = urllib.request.Request(
                    url, data=data,
                    headers={"User-Agent": "capstone-urban-analysis/1.0 (student project)"})
                t0 = time.time()
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    raw = r.read()
                print(f"  [ok] {url}  {len(raw)/1e6:.1f} MB  {time.time()-t0:.0f}s", file=sys.stderr)
                return json.loads(raw)
            except Exception as e:
                last = e
                print(f"  [..] {url} -> {type(e).__name__}: {e}", file=sys.stderr)
        time.sleep(5)
    raise last
