# -*- coding: utf-8 -*-
"""SGIS 대신 키 없는 공개 통계(행정안전부 주민등록 · KOSIS)로 인구·주택·사업체를 채운다.

값은 사람이 내려받은 표에서 옮겨 `입력/공개통계.csv` 의 '값' 칸에 적는다. 내려받은 원본은 `입력/원본/` 에 둔다.
단위가 종로구 전체라 반경 원 기준(SGIS 집계구)과 다르다 — 비고에 남긴다.
값이 빈 행은 '화면열람'(받는 곳 안내)으로 남고, 임의 값은 넣지 않는다.
"""
import csv, os
from ..common import row

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHEET = os.path.join(BASE, "입력", "공개통계.csv")
CMD = "입력/공개통계.csv 값 입력 후 py run.py --only public"
SCOPE = "종로구 전체(반경 원 기준 아님)"


def num(s):
    try:
        return float(str(s).replace(",", "").strip())
    except ValueError:
        return None


def collect(site, r):
    with open(SHEET, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    out, v = [], {}
    for d in rows:
        src = "%s (%s)" % (d["출처"], d["기준시점"]) if d["기준시점"] else d["출처"]
        note = " · ".join(x for x in (SCOPE, d["비고"]) if x)
        if not d["값"].strip():
            out.append(row(d["대항목"], d["세부항목"], d["지표"], 상태="화면열람", 출처=src, 재현=d["받는 곳"],
                           비고="값 미입력 — " + note))
            continue
        v[d["지표"]] = num(d["값"])
        out.append(row(d["대항목"], d["세부항목"], d["지표"], d["값"].strip(), d["단위"], src, CMD, 비고=note))

    # 파생 지표 — 입력한 값으로만 계산한다
    pop = {y: v.get("종로구 주민등록인구(%d)" % y) for y in (2015, 2020, 2024)}
    if pop[2015] and pop[2024]:
        out.append(row("인구", "인구총수 변화", "종로구 인구 증감률(2015→2024)", round(100 * (pop[2024] - pop[2015]) / pop[2015], 1),
                       "%", "위 주민등록인구로 계산", CMD, 비고=SCOPE))
    area = v.get("종로구 행정구역 면적")
    if pop[2024] and area:
        out.append(row("인구", "인구밀도", "종로구 인구밀도(2024)", round(pop[2024] / area), "명/km²",
                       "주민등록인구 ÷ 행정구역 면적", CMD, 비고=SCOPE))
    old, young, mid = (v.get("종로구 %s 인구(2024)" % k) for k in ("65세 이상", "0~14세", "15~64세"))
    if old and young:
        out.append(row("인구", "인구구성", "종로구 노령화지수(2024)", round(100 * old / young, 1), "",
                       "65세 이상 ÷ 0~14세 × 100", CMD, 비고=SCOPE))
    if old and mid:
        out.append(row("인구", "인구구성", "종로구 노년부양비(2024)", round(100 * old / mid, 1), "",
                       "65세 이상 ÷ 15~64세 × 100", CMD, 비고=SCOPE))
    return out
