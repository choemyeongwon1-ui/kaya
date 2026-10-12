# -*- coding: utf-8 -*-
"""기초조사 세부항목 수집 파이프라인 — 「도시·군기본계획수립지침」 별표의 열 범주.

  py run.py                         # 전부
  py run.py --only osm khs          # 일부 출처만 (결과 CSV 에서 해당 출처 행만 교체)
  py run.py --radius 800
  py run.py --lat 37.38 --lon 126.80 --name 시흥포동   # 대상지 바꾸기 (코드들은 config.py 에서)
  py run.py --addr "서울특별시 종로구 창신동 128-32" --addr-type PARCEL --name 창신초 --radius 400 --out 결과_창신초_400m
                                    # 주소 → 좌표(지오코더 2.0). 좌표는 저장하지 않고 실행 때마다 재호출

인증키는 환경변수로만 받는다: VWORLD_KEY(·VWORLD_DOMAIN), SGIS_KEY·SGIS_SECRET.
산출: 결과/기초조사_결과.csv · 결과/현황.md · 결과/상세_*.csv · 결과/raw/
"""
import argparse, csv, os, sys, traceback

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if "--out" in sys.argv:                           # pipeline 을 불러오기 전에 결과 폴더를 정한다
    os.environ["SURVEY_OUT"] = os.path.abspath(sys.argv[sys.argv.index("--out") + 1])

from pipeline.config import SITE, 항목표
from pipeline.common import COLS, OUT, TODAY, row
from pipeline.config import KEYS
from pipeline import common
from pipeline import geocode
from pipeline.sources import osm, meteo, khs, sgis, vworld, public, manual

SOURCES = {"osm": osm, "meteo": meteo, "khs": khs, "sgis": sgis, "vworld": vworld, "public": public, "manual": manual}
RESULT = os.path.join(OUT, "기초조사_결과.csv")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", choices=list(SOURCES))
    ap.add_argument("--radius", type=int)
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--name")
    ap.add_argument("--out", help="결과 폴더 (기본 결과/)")
    ap.add_argument("--addr", help="지오코더 2.0 으로 좌표를 구할 주소")
    ap.add_argument("--addr-type", default="PARCEL", choices=geocode.TYPES, help="PARCEL(지번) · ROAD(도로명)")
    a = ap.parse_args()
    site = dict(SITE)
    for k in ("lat", "lon", "name"):
        if getattr(a, k) is not None:
            site[k] = getattr(a, k)
    geo_rows = []
    if a.addr:
        if not KEYS["VWORLD_KEY"]:
            sys.exit("--addr 는 VWORLD_KEY 가 필요하다 (지오코더 2.0)")
        site["lat"], site["lon"], refined, shown = geocode.request(a.addr, a.addr_type, KEYS["VWORLD_KEY"], KEYS["VWORLD_DOMAIN"])
        site["name"] = a.name or a.addr
        common.GEO_MASKED = True
        geo_rows = [dict(geocode.catalog_row(a.addr, a.addr_type, refined, shown), 수집기="geocode")]
    r = a.radius or site["radius_m"]
    names = a.only or list(SOURCES)
    os.makedirs(OUT, exist_ok=True)

    # --only 면 이전 결과에서 다른 출처 행은 남긴다
    kept = []
    if a.only and os.path.exists(RESULT):
        with open(RESULT, encoding="utf-8-sig") as f:
            kept = [d for d in csv.DictReader(f) if d.get("수집기") not in names and not (a.addr and d.get("수집기") == "geocode")]

    rows = []
    print("대상지 %s (%s) 반경 %d m — %s" % (site["name"], "주소 " + a.addr + " → 지오코더 좌표(저장 안 함)" if a.addr else "%s, %s" % (site["lat"], site["lon"]), r, TODAY))
    for n in names:
        print("[%s] 수집 중…" % n)
        try:
            got = SOURCES[n].collect(site, r)
        except Exception as e:
            traceback.print_exc()
            got = [row("(%s)" % n, "-", "수집기 전체 실패", 상태="실패", 출처=n, 재현="py run.py --only %s" % n,
                       비고="%s: %s" % (type(e).__name__, e))]
        for g in got:
            g["수집기"] = n
        print("    %d행" % len(got))
        rows += got
    rows = kept + geo_rows + rows
    order = {g: i for i, g in enumerate(항목표)}
    rows.sort(key=lambda d: (order.get(d["대항목"], 99), 항목표.get(d["대항목"], []).index(d["세부항목"])
                             if d["세부항목"] in 항목표.get(d["대항목"], []) else 99))

    with open(RESULT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, COLS + ["수집기"])
        w.writeheader()
        w.writerows(rows)
    report(site, r, rows)
    print("\n→ %s\n→ %s" % (RESULT, os.path.join(OUT, "현황.md")))


def report(site, r, rows):
    """세부항목마다 무엇이 채워졌는지 — 지침 별표 기준 누락 검사."""
    st = {}
    for d in rows:
        st.setdefault((d["대항목"], d["세부항목"]), []).append(d["상태"])
    L = ["# 기초조사 수집 현황 — %s 반경 %d m (%s)" % (site["name"], r, TODAY), "",
         "상태: **수집** API 로 값을 받음 · **조회대기** 인증키 필요 · **화면열람** 사람이 볼 곳 · **실패** 재실행 필요 · **누락** 결과 행이 하나도 없음", "",
         "| 대항목 | 세부항목 | 수집 | 조회대기 | 화면열람 | 실패 | 판정 |", "|---|---|---:|---:|---:|---:|---|"]
    tot = {"수집": 0, "조회대기": 0, "화면열람": 0, "실패": 0, "누락": 0}
    for g, subs in 항목표.items():
        for s in subs:
            v = st.get((g, s), [])
            c = {k: v.count(k) for k in ("수집", "조회대기", "화면열람", "실패")}
            j = "수집" if c["수집"] else ("실패" if c["실패"] else ("조회대기" if c["조회대기"] else ("화면열람" if c["화면열람"] else "누락")))
            tot[j] += 1
            L.append("| %s | %s | %d | %d | %d | %d | %s |" % (g, s, c["수집"], c["조회대기"], c["화면열람"], c["실패"],
                                                          "**%s**" % j if j in ("누락", "실패") else j))
    L += ["", "세부항목 %d개 중 " % sum(tot.values()) + " · ".join("%s %d" % kv for kv in tot.items()), ""]
    fails = [d for d in rows if d["상태"] == "실패"]
    if fails:
        L += ["## 실패", ""] + ["- %s / %s — %s" % (d["대항목"], d["지표"], d["비고"]) for d in fails] + [""]
    L += ["## 주의", "",
          "- OSM 값은 **대용**이다. 법정 용도지역·도시계획시설(공원·녹지·광장·공공공지) 결정과 다르다 — 결정도로 교차확인.",
          "- 공간시설은 공원녹지기본계획과 정합을 맞춰야 해서 빠뜨리기 쉽다(강의자료 34쪽). '녹지 피복'을 '결정 녹지'로 옮겨 적지 않는다.",
          "- 조회대기 칸은 임의 값을 넣지 않는다. 키를 넣고 `py run.py --only vworld sgis` 로 그 행만 교체한다."]
    with open(os.path.join(OUT, "현황.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n세부항목 판정: " + " · ".join("%s %d" % kv for kv in tot.items()))


if __name__ == "__main__":
    main()
