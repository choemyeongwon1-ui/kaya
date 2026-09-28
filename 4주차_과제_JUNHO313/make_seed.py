"""3주차 '서울시 조례 21종 표' CSV → evidence 초기 행 INSERT 문 (supabase/04_seed_seoul.sql).

값은 3주차에 법령 API 로 직접 받아 온 것만 쓴다. 조례에 없는 17~21행(비도시지역)은 건너뛴다.
"""
import csv
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
# kaya 저장소 안(3주차_과제_JUNHO313) 또는 로컬 실습 폴더(스마트도시계획3주차)
SRC = next(
    p for p in (
        HERE.parent / "3주차_과제_JUNHO313" / "03_서울시_조례_21종표.csv",
        HERE.parent / "스마트도시계획3주차" / "03_서울시_조례_21종표.csv",
    ) if p.exists()
)
OUT = HERE / "supabase" / "04_seed_seoul.sql"

# "서울특별시 도시계획 조례 제44조제5호·제48조제5호 (자치법규ID 2000719, MST 2149501, 시행 2026-07-13)"
SRC_RE = re.compile(r"^(?P<law>.+?) (?P<bcr>제44조제\d+호)·(?P<far>제48조제\d+호) \((?P<meta>[^)]*)\)$")


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    rows = []
    with SRC.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if not r["서울조례_용적률(%)"]:
                continue
            m = SRC_RE.match(r["출처_조례"])
            if not m:
                raise SystemExit(f"출처 형식이 예상과 다름: {r['출처_조례']}")
            zone, day = r["용도지역"], r["조회일"]
            for label, col, art in (("건폐율", "서울조례_건폐율(%)", "bcr"), ("용적률", "서울조례_용적률(%)", "far")):
                source = f"{m['law']} {m[art]} ({m['meta']})"
                rows.append(f"  ({q(f'서울 {zone} {label}')}, {r[col]}, '%', {q(source)}, {q(day)})")

    OUT.write_text(
        "-- make_seed.py 가 3주차 03_서울시_조례_21종표.csv 에서 만든 파일 — 손으로 고치지 말 것\n"
        "-- 02 까지 실행한 뒤 SQL Editor 에서 실행 (SQL Editor 는 postgres 권한이라 RLS 를 거치지 않음)\n"
        "insert into public.evidence (item, value, unit, source, queried_on) values\n"
        + ",\n".join(rows)
        + ";\n",
        encoding="utf-8",
    )
    print(f"{len(rows)}행 → {OUT.relative_to(HERE)}")


if __name__ == "__main__":
    main()
