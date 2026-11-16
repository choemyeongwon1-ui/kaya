"""서울숲 프로그램 가져오기 — 서울시 공공서비스예약 통합 목록(tvYeyakCOllect)에서 서울숲 것만 골라
recovery-station/needs/data/programs.json 으로 저장합니다. 시민 화면 '오늘 서울숲 소식'에 보입니다.

필요한 것: 서울 열린데이터광장 일반 인증키를 환경변수 SEOUL_KEY 에 넣기 (키는 출력하거나 파일에 남기지 않음)
  - sample 키는 5건까지만 주어서(전체 약 2,400건) 서울숲 것을 골라낼 수 없습니다.
골라내는 기준: 장소명·서비스명에 '서울숲'이 들어가거나, 좌표가 서울숲 중심에서 RADIUS_M 안
실행: python analysis/08_programs.py
"""
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "recovery-station" / "needs" / "data" / "programs.json"
SERVICE = "tvYeyakCOllect"
CENTER = (37.5443, 127.0374)   # 대시보드 기준점
RADIUS_M = 700                 # 서울숲(약 66만㎡) 안쪽으로 보는 거리
PAGE = 1000                    # 서울 열린데이터광장 한 번에 최대 1,000건


def dist_m(lat, lon):
    dy = (lat - CENTER[0]) * 111_320
    dx = (lon - CENTER[1]) * 111_320 * math.cos(math.radians(CENTER[0]))
    return math.hypot(dx, dy)


def fetch(key, start, end):
    url = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(key)}/json/{SERVICE}/{start}/{end}/"
    with urllib.request.urlopen(url, timeout=30) as r:
        body = json.load(r)
    if SERVICE not in body:
        raise RuntimeError(body.get("RESULT", {}).get("MESSAGE", "알 수 없는 응답"))
    return body[SERVICE]


def day(s):
    return (s or "")[:10] or None


def main():
    key = os.environ.get("SEOUL_KEY", "").strip()
    if not key or key == "sample":
        sys.exit("환경변수 SEOUL_KEY(서울 열린데이터광장 일반 인증키)가 필요합니다.")
    first = fetch(key, 1, PAGE)
    total, rows = first["list_total_count"], list(first.get("row", []))
    for start in range(PAGE + 1, total + 1, PAGE):
        rows += fetch(key, start, min(start + PAGE - 1, total)).get("row", [])

    items = []
    for r in rows:
        try:
            lat, lon = float(r.get("Y") or 0), float(r.get("X") or 0)
        except ValueError:
            lat = lon = 0
        named = "서울숲" in (r.get("PLACENM") or "") or "서울숲" in (r.get("SVCNM") or "")
        near = lat and lon and dist_m(lat, lon) <= RADIUS_M
        if not (named or near):
            continue
        items.append({
            "id": r["SVCID"], "title": r["SVCNM"].replace("&#39;", "'").replace("&quot;", '"'), "place": r.get("PLACENM"),
            "kind": r.get("MINCLASSNM"), "status": r.get("SVCSTATNM"), "fee": r.get("PAYATNM"), "target": (r.get("USETGTINFO") or "").strip(),
            "useFrom": day(r.get("SVCOPNBGNDT")), "useTo": day(r.get("SVCOPNENDDT")),
            "applyFrom": day(r.get("RCPTBGNDT")), "applyTo": day(r.get("RCPTENDDT")),
            "url": r.get("SVCURL"), "lat": lat or None, "lon": lon or None,
        })
    items.sort(key=lambda x: (x["status"] != "접수중", x["useFrom"] or ""))
    OUT.write_text(json.dumps({
        "note": f"서울시 공공서비스예약({SERVICE})에서 장소·이름에 '서울숲'이 있거나 서울숲 중심 {RADIUS_M}m 안인 서비스",
        "checked": date.today().isoformat(), "total": total, "items": items,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"전체 {total}건 중 서울숲 {len(items)}건 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
