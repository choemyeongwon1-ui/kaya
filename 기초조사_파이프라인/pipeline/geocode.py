# -*- coding: utf-8 -*-
"""브이월드 지오코더 2.0 — 주소 → 좌표 (6주차 강의자료 32·33·35쪽).

이용조건: 일일 40,000건 · 실시간 사용 · **결과 저장 금지**. 그래서 좌표는 메모리에서만 쓰고
파일(raw·결과 CSV·현황)에 남기지 않는다. 카탈로그에는 주소와 요청 조건(키 제외 URL)만 기록한다.
좌표가 다시 필요하면 같은 요청을 재호출한다.
"""
from urllib.parse import urlencode
from .common import http_json, row

URL = "https://api.vworld.kr/req/address"
TYPES = ("PARCEL", "ROAD")


class GeocodeError(Exception):
    pass


def request(address, typ, key, domain=""):
    """(위도, 경도, 정제주소, 키 제외 요청 URL). 실패하면 응답 본문의 오류를 그대로 올린다."""
    typ = typ.upper()
    if typ not in TYPES:
        raise GeocodeError("type 은 PARCEL(지번) 또는 ROAD(도로명): %s" % typ)
    p = {"service": "address", "request": "getCoord", "version": "2.0", "crs": "epsg:4326",
         "address": address, "type": typ, "refine": "true", "simple": "false", "format": "json", "key": key}
    if domain:                                    # 브라우저 밖 호출 — 발급 시 등록한 서비스 URL
        p["domain"] = domain
    shown = URL + "?" + urlencode({k: v for k, v in p.items() if k != "key"})
    res = http_json(URL, p)["response"]
    if res.get("status") != "OK":                 # NOT_FOUND · ERROR — 원인 판별 전 재시도 금지(35·36쪽)
        err = res.get("error") or {}
        raise GeocodeError("%s %s %s — %s" % (res.get("status"), err.get("code", ""), err.get("text", ""), shown))
    pt = res["result"]["point"]
    refined = (res.get("refined") or {}).get("text", "")
    return float(pt["y"]), float(pt["x"]), refined, shown


def catalog_row(address, typ, refined, shown):
    return row("인문환경", "행정", "대상지 주소(지오코더 입력)", address, "", "브이월드 지오코더 2.0 getCoord",
               "py run.py --addr \"%s\" --addr-type %s   (환경변수 VWORLD_KEY 필요) · 요청 %s" % (address, typ.upper(), shown),
               비고="정제주소 %s · 좌표는 저장하지 않음(이용조건: 결과 저장 금지 · 일 40,000건) — 실행 때마다 재호출" % refined)
