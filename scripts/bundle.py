# -*- coding: utf-8 -*-
"""Step 7 - fold the data files into index.html so the page opens from file://.

Browsers refuse fetch() on file:// URLs, so the folder build only works behind a
server. This writes a second, self-contained copy for double-click use.
"""
import base64, io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")
DATA = os.path.join(WEB, "data")
OUT = os.path.join(WEB, "dashboard_standalone.html")

html = io.open(os.path.join(WEB, "index.html"), encoding="utf-8").read()

bundle = {}
for name in ("buildings", "basemap", "satellite"):
    p = os.path.join(DATA, name + ".json")
    if os.path.exists(p):
        bundle[name] = json.load(io.open(p, encoding="utf-8"))

jpg = os.path.join(DATA, "satellite.jpg")
if os.path.exists(jpg):
    bundle["satelliteJpg"] = ("data:image/jpeg;base64," +
                              base64.b64encode(open(jpg, "rb").read()).decode("ascii"))

payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
payload = payload.replace("<", "\\u003c").replace(">", "\\u003e")   # keep </script> safe

marker = "<script>"
assert marker in html, "no inline script found in index.html"
inject = ('<meta charset="utf-8">\n'
          "<script>window.__BUNDLE__=" + payload + ";</script>\n")
html = inject + html

io.open(OUT, "w", encoding="utf-8").write(html)
print("dashboard_standalone.html  {:.2f} MB".format(os.path.getsize(OUT) / 1e6))
