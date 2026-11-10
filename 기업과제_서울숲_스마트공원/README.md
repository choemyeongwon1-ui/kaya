# 기업과제(한국종합기술) — 서울숲 취약지역 진단·개선 대시보드

2026-2 AI-CCS 학부생 주제 01 「AI 기반 이용자 맞춤형 스마트 공원 이용 프로그램 대시보드」의 서울숲 1차본입니다.
필수 범위(모듈 1 + 취약지역 분석)를 공개 데이터로 계산했고, 다음 주 진행상황 공유용입니다. (기준일 2026-11-09)

**대시보드** `서울숲_진행현황_대시보드.html` — 파일을 내려받아 브라우저로 열면 됩니다. 로컬에서 열면 기상·대기 값을 실시간으로 불러옵니다.

## 폴더

| 경로 | 내용 |
|---|---|
| `analysis/01_fetch.py` | 공개 데이터 수집 (OSM, Landsat·Sentinel-2·WorldCover·DEM, Open-Meteo). API 키 불필요 |
| `analysis/02_vulnerability.py` | 20m 격자 취약도(열·혼잡·접근성·대기), 우선 구역, 개선 시나리오 |
| `analysis/03_climate.py` | 모듈 1 임계치 발생 통계와 현재 스냅샷 |
| `analysis/04_build.py` | `dashboard_template.html`에 결과를 넣어 대시보드 생성 |
| `output/` | GIS 산출물(`.gpkg`, `.csv`)과 대시보드용 JSON |

## 다시 만들기

`data/raw/`는 팀 `.gitignore` 규칙대로 올리지 않았습니다. 이 폴더에서 아래 순서로 실행합니다.

```
python analysis/01_fetch.py .
python analysis/02_vulnerability.py .
python analysis/03_climate.py .
python analysis/04_build.py .
```

필요 패키지: geopandas, rasterio, networkx, scipy, requests. 위성 검색 결과는 실행 날짜에 따라 장면이 늘 수 있어 수치가 조금 달라질 수 있습니다.
진행상태 표는 `analysis/dashboard_template.html`의 `PROGRESS` 배열을 고친 뒤 `04_build.py`만 다시 실행하면 됩니다.

## 주의할 점

- OSM 서울숲 경계에 **뚝도아리수정수센터(60,214㎡)** 가 들어 있어 제외했습니다. **청계천용수공급지**는 부지 성격을 확인하기 전까지 보류 구역으로 두었습니다.
- 열만 실측 위성 자료이고, 대기는 도로 거리, 접근성·혼잡은 보행망 기반 대리지표입니다. 현장 계수와 만족도 설문은 아직 하지 않았습니다.
- 지표 가중치(열 35·접근성 25·대기 25·혼잡 15)와 지표 안의 배분은 근거 문헌이나 전문가 조사 없이 정한 가안입니다. 취약 등급도 상위 20%라는 상대 기준입니다.
- 개선 후 수치는 시나리오 추정입니다.
