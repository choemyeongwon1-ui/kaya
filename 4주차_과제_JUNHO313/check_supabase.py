"""evidence 표 연결·정책 점검 — 코드에는 키를 적지 않고 환경변수 이름만 참조한다.

  python check_supabase.py

S1 공개 키 SELECT      → 성공해야 함
S2 value 숫자 정렬     → 숫자 순서여야 함 (numeric 이라서 가능)
I1 공개 키 INSERT      → RLS 로 거절돼야 함 (42501)
I2 팀원 로그인 INSERT  → 성공 후 바로 지움 (SUPABASE_TEST_EMAIL/PASSWORD 가 있을 때만)
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path


def load_env(path: Path) -> None:
    """.env 를 읽어 os.environ 에 없는 값만 채운다 (python-dotenv 없이)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


load_env(Path(__file__).resolve().parent / ".env")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
if not URL or not KEY:
    sys.exit("SUPABASE_URL · SUPABASE_PUBLISHABLE_KEY 환경변수가 없습니다 (.env.example 참고)")
if KEY.startswith("sb_secret_"):
    sys.exit("비밀 키(sb_secret_)가 들어 있습니다. 공개 키(sb_publishable_)로 바꾸세요.")


def call(method: str, path: str, body=None, token: str | None = None, prefer: str | None = None):
    headers = {"apikey": KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, json.loads(raw) if raw else None


results = []


def check(name: str, ok: bool, detail: str) -> None:
    results.append(ok)
    print(f"[{'통과' if ok else '실패'}] {name} — {detail}")


TEST_ROW = {
    "item": "[테스트] check_supabase.py",
    "value": 1,
    "unit": "%",
    "source": "check_supabase.py 자동 점검 (바로 삭제됨)",
    "queried_on": date.today().isoformat(),
}

# S1
st, body = call("GET", "/rest/v1/evidence?select=id,item,value,unit,queried_on&order=id&limit=3")
check("S1 공개 키 SELECT", st == 200, f"HTTP {st}, {len(body) if isinstance(body, list) else body}행")
if st == 200:
    for r in body:
        print(f"      {r['id']:>3}  {r['item']}  {r['value']}{r['unit'] or ''}  ({r['queried_on']})")

# S2
st, body = call("GET", "/rest/v1/evidence?select=item,value&item=like.*용적률*&order=value.desc&limit=5")
if st == 200 and body:
    vals = [float(r["value"]) for r in body]
    check("S2 value 숫자 정렬", vals == sorted(vals, reverse=True), " > ".join(f"{v:g}" for v in vals))
else:
    check("S2 value 숫자 정렬", False, f"HTTP {st} {body} (04_seed_seoul.sql 을 실행했는지 확인)")

# I1
st, body = call("POST", "/rest/v1/evidence", TEST_ROW)
code = body.get("code") if isinstance(body, dict) else None
check("I1 공개 키 INSERT 거절", st in (401, 403) and code == "42501", f"HTTP {st}, code {code}")
if st in (200, 201):
    print("      !! 공개 키로 쓰기가 됐습니다 — RLS 가 꺼져 있거나 정책이 너무 넓습니다")

# I2
email, pw = os.environ.get("SUPABASE_TEST_EMAIL"), os.environ.get("SUPABASE_TEST_PASSWORD")
if email and pw:
    st, auth = call("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": pw})
    token = auth.get("access_token") if isinstance(auth, dict) else None
    if not token:
        check("I2 팀원 로그인", False, f"HTTP {st} {auth}")
    else:
        st, body = call("POST", "/rest/v1/evidence", TEST_ROW, token=token, prefer="return=representation")
        ok = st == 201 and isinstance(body, list) and body
        check("I2 팀원 INSERT", bool(ok), f"HTTP {st}" + (f", id {body[0]['id']}" if ok else f" {body}"))
        if ok:
            rid = body[0]["id"]
            st, gone = call("DELETE", f"/rest/v1/evidence?id=eq.{rid}", token=token, prefer="return=representation")
            check("I2 테스트 행 삭제", st == 200 and len(gone) == 1, f"HTTP {st}, id {rid}")
else:
    print("[건너뜀] I2 팀원 INSERT — SUPABASE_TEST_EMAIL/PASSWORD 없음 (03_policy_test.sql 의 T4 로 대신 확인)")

print(f"\n{sum(results)}/{len(results)} 통과")
sys.exit(0 if all(results) else 1)
