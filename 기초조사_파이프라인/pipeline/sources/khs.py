# -*- coding: utf-8 -*-
"""국가유산청 국가유산 검색 OPEN API — 인문환경 · 문화재. 인증키 없음."""
import csv, os
import xml.etree.ElementTree as ET
from ..common import row, http, save_raw, dist_m, OUT

URL = "https://www.khs.go.kr/cha/SearchKindOpenapiList.do"
SRC = "국가유산청 국가유산 검색 OPEN API"
CMD = "py run.py --only khs"


def collect(site, r):
    lat, lon = site["lat"], site["lon"]
    items, page = [], 1
    while True:
        raw = http(URL, {"ccbaCtcd": site["khs_ctcd"], "ccbaLcto": site["khs_lcto"], "pageUnit": 200, "pageIndex": page})
        root = ET.fromstring(raw)
        got = root.findall("item")
        items += [{c.tag: (c.text or "").strip() for c in it} for it in got]
        total = int(root.findtext("totalCnt") or 0)
        if not got or len(items) >= total:
            break
        page += 1
    save_raw("khs.json", items)
    items = [it for it in items if it.get("ccbaCncl", "N") == "N"]        # 지정 해제 제외

    near, nocoord = [], 0
    for it in items:
        try:
            la, lo = float(it["latitude"]), float(it["longitude"])
        except (KeyError, ValueError):
            la = lo = 0
        if not la:
            nocoord += 1
            continue
        d = dist_m(lat, lon, la, lo)
        if d <= r:
            near.append((round(d), it.get("ccmaName"), it.get("ccbaMnm1"), la, lo, it.get("ccbaAdmin")))
    near.sort()

    sg = site["sigungu"]
    out = [row("인문환경", "문화재", "%s 지정 국가유산 수(해제 제외)" % sg, len(items), "건", SRC, CMD,
               비고="소재지 코드 기준 · 동산(유물)은 소장처 좌표라 대상지 밖일 수 있음")]
    by = {}
    for x in near:
        by[x[1]] = by.get(x[1], 0) + 1
    out.append(row("인문환경", "문화재", "반경 %d m 안 국가유산 수" % r, len(near), "건", SRC, CMD,
                   비고="좌표 없는 %d건 제외 · 종목별: %s" % (nocoord, ", ".join("%s %d" % kv for kv in sorted(by.items(), key=lambda x: -x[1])))))
    if near:
        out.append(row("인문환경", "문화재", "가장 가까운 국가유산", "%s(%s)" % (near[0][2], near[0][1]), "", SRC, CMD,
                       비고="%d m · 유물(동산)이면 소장처 좌표 — 상세_국가유산목록.csv 에서 건조물 확인" % near[0][0]))
    with open(os.path.join(OUT, "상세_국가유산목록.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["중심거리(m)", "종목", "명칭", "위도", "경도", "관리자"])
        w.writerows(near)
    return out
