# -*- coding: utf-8 -*-
"""브이월드 데이터 API(GetFeature) — 용도지역 구성비, 필지 지목·공시지가.

토지이음은 공개 API가 없어 같은 레이어를 브이월드로 부른다(4주차 강의자료 40쪽).
키는 환경변수 VWORLD_KEY 로만 받는다. 없으면 '조회대기' 행을 남기고 끝낸다.
응답이 status=OK 가 아니거나 건수가 0 이면 레이어 코드·범위·좌표계를 먼저 의심한다.
"""
import csv, math, os
from urllib.parse import urlencode
from .. import common
from ..common import row, http_json, save_raw, Disk, join_rings, OUT, TODAY
from ..config import KEYS

URL = "https://api.vworld.kr/req/data"
SRC = "브이월드 데이터 API GetFeature"
CMD = "py run.py --only vworld   (환경변수 VWORLD_KEY 필요)"
ZONE_LAYERS = {"LT_C_UQ111": "도시지역", "LT_C_UQ112": "관리지역", "LT_C_UQ113": "농림지역", "LT_C_UQ114": "자연환경보전지역"}
PARCEL = "LP_PA_CBND_BUBUN"
SIDO, SIGG = "LT_C_ADSIDO_INFO", "LT_C_ADSIGG_INFO"     # 행정경계 시도·시군구
# 계획·규제 레이어 (158개 서비스 목록 중 선택 — docs/vworld_서비스목록.csv) → (대항목, 세부항목, 이름)
PLAN_LAYERS = {
    "LT_C_UPISUQ161": ("토지이용", "용도별 분포", "지구단위계획구역"),
    "LT_C_UPISUQ171": ("토지이용", "용도별 분포", "개발행위허가제한지역"),
    "LT_C_UQ121": ("토지이용", "용도별 분포", "경관지구"),
    "LT_C_UQ123": ("토지이용", "용도별 분포", "고도지구"),
    "LT_C_UO101": ("공공·문화체육시설", "교육문화시설", "교육환경보호구역"),
    "LT_C_UO301": ("인문환경", "문화재", "국가유산보호도"),
}
MAX_PAGES = 30                                  # 1,000건 × 30 — OVER_REQUEST_LIMIT 방지


class VWorldError(Exception):
    pass


def bbox(lat, lon, r):
    dlat = r / 111320.0
    dlon = r / (111320.0 * math.cos(math.radians(lat)))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


def get_features(layer, geom_filter, key, domain, tag=""):
    """강의자료 30쪽 네 단계 중 ③ 요청 조립 · ④ 응답 읽기.
    status 를 먼저 보고 OK 일 때만 result 를 쌓는다. 1,000건을 넘으면 page 를 올려 이어 받는다.
    raw 파일에는 지오메트리·속성과 함께 요청 URL(키 제외)·조회일·응답 필드(status·record·page)를 남긴다."""
    feats, page, log = [], 1, []
    while page <= MAX_PAGES:
        p = {"service": "data", "request": "GetFeature", "data": layer, "key": key, "format": "json",
             "size": 1000, "page": page, "geometry": "true", "attribute": "true",
             "crs": "EPSG:4326", "geomFilter": geom_filter}
        if domain:                                # 브라우저 밖(파이썬)에서 부를 때 발급 시 등록한 서비스 URL
            p["domain"] = domain
        res = http_json(URL, p)["response"]
        st = res.get("status")
        shown = {k: v for k, v in p.items() if k != "key"}
        if common.GEO_MASKED:                      # 지오코더 좌표에서 만든 범위는 남기지 않는다 — 재현은 주소로 재호출
            shown["geomFilter"] = common.MASK
        log.append({"page": page, "status": st, "record": res.get("record"), "pageInfo": res.get("page"),
                    "url": URL + "?" + urlencode(shown)})
        if st == "NOT_FOUND":
            break
        if st != "OK":
            raise VWorldError("%s: %s %s" % (layer, (res.get("error") or {}).get("code"), (res.get("error") or {}).get("text")))
        feats += res["result"]["featureCollection"]["features"]
        if page >= int(res.get("page", {}).get("total", 1)):
            break
        page += 1
    save_raw("vworld_%s%s.json" % (layer, tag), {"type": "FeatureCollection", "조회일": TODAY, "요청": log, "features": feats})
    return feats


def rings_of(geom):
    """GeoJSON (Multi)Polygon → [(lat,lon)] 고리 목록 (외곽·구멍 모두, 짝홀 규칙으로 처리)."""
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [[(y, x) for x, y in ring[:]] for poly in polys for ring in poly]


def prop(p, *names):
    for n in names:
        if p.get(n):
            return p[n]
    return ""


def collect(site, r):
    key, domain = KEYS["VWORLD_KEY"], KEYS["VWORLD_DOMAIN"]
    if not key:
        return [
            row("토지이용", "용도별 면적", "용도지역 구성비(법정)", 상태="조회대기", 출처=SRC + " " + "/".join(ZONE_LAYERS), 재현=CMD,
                비고="VWORLD_KEY 없음 — vworld.kr 오픈API 인증키 발급 후 환경변수로 설정. 임의 값을 넣지 않는다"),
            row("토지이용", "지목별 면적", "지목 구성비", 상태="조회대기", 출처=SRC + " " + PARCEL, 재현=CMD, 비고="VWORLD_KEY 없음"),
            row("토지이용", "지가", "중심 필지 개별공시지가", 상태="조회대기", 출처=SRC + " " + PARCEL, 재현=CMD, 비고="VWORLD_KEY 없음"),
            row("인문환경", "행정", "대상지 중심 소재 시도·시군구", 상태="조회대기", 출처=SRC + " " + SIDO + "/" + SIGG, 재현=CMD, 비고="VWORLD_KEY 없음"),
        ]
    lat, lon = site["lat"], site["lon"]
    disk = Disk(lat, lon, r)
    N = len(disk.pts)
    box = "BOX(%f,%f,%f,%f)" % bbox(lat, lon, r)
    out = []

    # 1) 용도지역 구성비 — 네 레이어를 받아 원 안 면적비로
    owner = {}
    for layer, big in ZONE_LAYERS.items():
        for f in get_features(layer, box, key, domain):
            name = prop(f["properties"], "uname", "UNAME", "dgm_nm", "prpos_area_dstrc_nm") or big + "(세분 미표기)"
            for p in disk.hits(rings_of(f["geometry"])):
                owner.setdefault(p, name)
    comp = {}
    for v in owner.values():
        comp[v] = comp.get(v, 0) + 1
    for k, n in sorted(comp.items(), key=lambda x: -x[1]):
        out.append(row("토지이용", "용도별 면적", "용도지역 — %s" % k, round(100 * n / N, 1), "%", SRC, CMD,
                       비고="반경 %d m 원 면적 기준 · 면적 %.3f km²" % (r, n * disk.cell / 1e6)))
    if N - len(owner):
        out.append(row("토지이용", "용도별 면적", "용도지역 — 미지정/미조회", round(100 * (N - len(owner)) / N, 1), "%", SRC, CMD,
                       비고="하천·도로 등 경계 밖이거나 레이어 누락 — 0 이 아니면 레이어 코드 확인"))

    # 2) 중심 필지 — 지번·지목·개별공시지가
    c = get_features(PARCEL, "POINT(%f %f)" % (lon, lat), key, domain, tag="_중심")
    if c:
        p = c[0]["properties"]
        out.append(row("토지이용", "지가", "중심 필지 개별공시지가", prop(p, "jiga"), "원/m²", SRC, CMD,
                       비고="%s · PNU %s · 기준 %s년 %s월" % (prop(p, "addr"), prop(p, "pnu"), prop(p, "gosi_year"), prop(p, "gosi_month"))))

    # 3) 지목 구성 — 원 안 필지 전체 (지번 끝 글자가 지목: '146-12대')
    parcels = get_features(PARCEL, box, key, domain)
    jimok, prices, det = {}, [], []
    for f in parcels:
        p = f["properties"]
        hit = disk.hits(rings_of(f["geometry"]))
        if not hit:
            continue
        jb = prop(p, "jibun")
        jm = jb[-1] if jb and not jb[-1].isdigit() else "?"
        jimok[jm] = jimok.get(jm, 0) + len(hit)
        if prop(p, "jiga"):
            prices.append(float(prop(p, "jiga")))
        det.append([prop(p, "pnu"), prop(p, "addr"), jm, prop(p, "jiga"), round(len(hit) * disk.cell)])
    for k, n in sorted(jimok.items(), key=lambda x: -x[1]):
        out.append(row("토지이용", "지목별 면적", "지목 — %s" % k, round(100 * n / N, 1), "%", SRC, CMD,
                       비고="필지 %d개 기준 · 도로·하천 필지 포함" % len(det)))
    if prices:
        prices.sort()
        out.append(row("토지이용", "지가", "원 안 필지 공시지가 중앙값", round(prices[len(prices) // 2]), "원/m²", SRC, CMD,
                       비고="필지 %d개" % len(prices)))
    with open(os.path.join(OUT, "상세_필지목록.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["PNU", "주소", "지목", "공시지가(원/m²)", "원 안 면적(m²)"])
        w.writerows(det)

    # 4) 행정경계 — 중심이 속한 시도·시군구와, 반경 원이 시군구 경계 안팎으로 나뉘는 비율(6주차 33쪽 ③)
    sido = get_features(SIDO, "POINT(%f %f)" % (lon, lat), key, domain, tag="_중심")
    sigg = get_features(SIGG, "POINT(%f %f)" % (lon, lat), key, domain, tag="_중심")
    name = " ".join(x for x in (prop(sido[0]["properties"], "ctp_kor_nm") if sido else "",
                                prop(sigg[0]["properties"], "sig_kor_nm") if sigg else "") if x)
    want = "%s %s" % (site.get("sido", ""), site.get("sigungu", ""))
    out.append(row("인문환경", "행정", "대상지 중심 소재 시도·시군구", name, "", SRC + " " + SIDO + "/" + SIGG, CMD,
                   비고="경계 안팎 판정 기준 · crs EPSG:4326" + ("" if name == want.strip() else " · config 의 %s 와 다름 — 행정코드(sgis_adm_cd 등) 확인" % want.strip())))
    share = {}
    for f in get_features(SIGG, box, key, domain):
        n = len(disk.hits(rings_of(f["geometry"])))
        if n:
            share[prop(f["properties"], "sig_kor_nm") or "?"] = n
    for k, n in sorted(share.items(), key=lambda x: -x[1]):
        out.append(row("인문환경", "행정", "반경 원 중 %s 비율" % k, round(100 * n / N, 1), "%", SRC + " " + SIGG, CMD,
                       비고="반경 %d m 원 면적 기준 — 100 이 아니면 원이 시군구 경계를 넘음(시군구 단위 통계 적용 주의)" % r))

    # 5) 계획·규제 레이어 — 대시보드 ④ 고시 이력. 현행 지정만 오므로 결정도·고시문(토지이음)과 병기한다
    for layer, (g, s, label) in PLAN_LAYERS.items():
        names = {}
        for f in get_features(layer, box, key, domain):
            if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
                continue
            n = len(disk.hits(rings_of(f["geometry"])))
            if not n:
                continue
            p = f["properties"]
            nm = prop(p, "dgm_nm", "alias", "remark", "uname") or label
            when = prop(p, "ntfc_sn") or ("%s-%s" % (prop(p, "dyear"), prop(p, "dnum")) if prop(p, "dyear") else "")
            k = (nm, when)
            names[k] = names.get(k, 0) + n
        for (nm, when), n in sorted(names.items(), key=lambda x: -x[1]):
            out.append(row(g, s, "%s — %s" % (label, nm), round(100 * n / N, 1), "%", SRC + " " + layer, CMD,
                           비고="고시 %s · 현행 지정(계획안 미반영) · 결정도·고시문은 토지이음에서 확인" % (when or "표기 없음")))
    if c:
        pnu = prop(c[0]["properties"], "pnu")
        out.append(row("토지이용", "용도별 분포", "중심 필지 고시 이력(토지이음 열람)", 상태="화면열람", 출처="토지이음 토지이용계획열람",
                       재현="https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?pnu=%s" % pnu,
                       비고="API 없음 — 필지 관련 고시·지형도면은 화면 열람(법적 효력 없음, 효력은 고시문 기준)"))
    return out
