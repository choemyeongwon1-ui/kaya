# -*- coding: utf-8 -*-
"""SGIS 통계지리정보서비스 OpenAPI3 — 인구·주택·사업체(시군구 + 하위 행정동).

키는 환경변수 SGIS_KEY(consumer_key)·SGIS_SECRET(consumer_secret) 로만 받는다.
응답 errCd 가 0 이 아니면 거절이다 — HTTP 200 만 보고 성공으로 적지 않는다.
"""
import csv, os
from ..common import row, http_json, save_raw, OUT
from ..config import KEYS, SGIS_YEARS

BASE = "https://sgisapi.kostat.go.kr/OpenAPI3"
SRC = "SGIS OpenAPI3 stats/population (통계청 인구주택총조사·등록센서스)"
CMD = "py run.py --only sgis   (환경변수 SGIS_KEY·SGIS_SECRET 필요)"


def token():
    r = http_json(BASE + "/auth/authentication.json",
                  {"consumer_key": KEYS["SGIS_KEY"], "consumer_secret": KEYS["SGIS_SECRET"]})
    if str(r.get("errCd")) != "0":
        raise RuntimeError("SGIS 인증 거절: %s" % r.get("errMsg"))
    return r["result"]["accessToken"]


def pop(tok, year, adm, low=0):
    r = http_json(BASE + "/stats/population.json", {"accessToken": tok, "year": year, "adm_cd": adm, "low_search": low})
    save_raw("sgis_population_%s_%s_%d.json" % (adm, year, low), r)
    if str(r.get("errCd")) != "0":
        raise RuntimeError("%s년: %s" % (year, r.get("errMsg")))
    return r["result"]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def collect(site, r):
    if not (KEYS["SGIS_KEY"] and KEYS["SGIS_SECRET"]):
        base = dict(상태="조회대기", 출처=SRC, 재현=CMD, 비고="SGIS_KEY·SGIS_SECRET 없음 — sgis.kostat.go.kr 개발지원센터에서 발급")
        return [row("인구", "인구총수 변화", "총인구 %s" % "·".join(map(str, SGIS_YEARS)), **base),
                row("인구", "인구밀도", "인구밀도", **base),
                row("인구", "인구구성", "평균연령·노년부양비·노령화지수", **base),
                row("주거", "주택수", "총주택수", **base),
                row("경제", "산업", "사업체수·종사자수", **base)]
    adm, sg = site["sgis_adm_cd"], site["sigungu"]
    tok = token()
    out, series = [], []
    for y in SGIS_YEARS:
        try:
            series.append((y, pop(tok, y, adm)[0]))
        except Exception as e:
            out.append(row("인구", "인구총수 변화", "총인구 %d" % y, 상태="실패", 출처=SRC, 재현=CMD, 비고=str(e)))
    for y, d in series:
        out.append(row("인구", "인구총수 변화", "%s 총인구(%d)" % (sg, y), d.get("tot_ppltn"), "명", SRC, CMD))
    if len(series) >= 2:
        (y0, a), (y1, b) = series[0], series[-1]
        p0, p1 = num(a.get("tot_ppltn")), num(b.get("tot_ppltn"))
        if p0 and p1:
            out.append(row("인구", "인구총수 변화", "총인구 증감률(%d→%d)" % (y0, y1), round(100 * (p1 - p0) / p0, 1), "%", SRC, CMD))
    if series:
        y, d = series[-1]
        for 세부, 지표, k, u in [("인구밀도", "인구밀도", "ppltn_dnsty", "명/km²"),
                              ("인구구성", "평균연령", "avg_age", "세"),
                              ("인구구성", "노령화지수", "aged_child_idx", ""),
                              ("인구구성", "노년부양비", "oldage_suprt_per", "%"),
                              ("인구구성", "유소년부양비", "juv_suprt_per", "%")]:
            out.append(row("인구", 세부, "%s(%d)" % (지표, y), d.get(k), u, SRC, CMD))
        out.append(row("주거", "주택수", "총주택수(%d)" % y, d.get("tot_house"), "호", SRC, CMD))
        out.append(row("주거", "주택수", "총가구수(%d)" % y, d.get("tot_family"), "가구", SRC, CMD,
                       비고="가구 ÷ 주택은 주택보급률이 아님(보급률은 일반가구·다가구 구분 반영)"))
        out.append(row("경제", "산업", "사업체수(%d)" % y, d.get("corp_cnt"), "개", SRC, CMD))
        out.append(row("인구", "산업별 인구", "종사자수(%d)" % y, d.get("employee_cnt"), "명", SRC, CMD,
                       비고="산업별 분해는 SGIS stats/company.json(class_code) 로 추가"))
        # 행정동별 — 대상지 반경에 걸리는 동을 고를 때 쓴다
        try:
            low = pop(tok, y, adm, 1)
            with open(os.path.join(OUT, "상세_행정동별인구.csv"), "w", encoding="utf-8-sig", newline="") as f:
                w = csv.writer(f)
                cols = ["adm_cd", "adm_nm", "tot_ppltn", "ppltn_dnsty", "avg_age", "aged_child_idx", "tot_family", "tot_house", "corp_cnt", "employee_cnt"]
                w.writerow(cols + ["기준연도"])
                for d in low:
                    w.writerow([d.get(c) for c in cols] + [y])
        except Exception as e:
            print("    행정동별 실패 — %s" % e)
    return out
