# 기초조사 세부항목 수집 파이프라인

「도시·군기본계획수립지침」 별표의 열 범주(4주차 강의자료 34쪽) 세부항목 51개를 출처별 수집기로 모아
**한 행 = 값 · 단위 · 출처 · 조회일 · 재현** 형식(팀 카탈로그와 같은 칸)으로 남긴다. 표준 라이브러리만 쓴다.

```
py run.py                      # 전부 (대상지 종로구청, 반경 1,000 m)
py run.py --only vworld sgis   # 키를 넣은 뒤 그 출처 행만 교체
py run.py --radius 400
```

## 출처별 수집기

| 수집기 | 채우는 세부항목 | 키 |
|---|---|---|
| `osm` Overpass | 도로·철도·버스·공항·항만, 전기·상수도·통신, 교육문화·복지·공공청사, 공원·광장·녹지 피복, 하천, OSM landuse(대용), 상점·사무소 | 없음 |
| `meteo` Open-Meteo | 표고·경사(DEM 90 m), 기온·강수·폭염·호우(재분석) | 없음 |
| `khs` 국가유산청 | 문화재 — 시군구 전체와 반경 안, 목록 | 없음 |
| `vworld` 브이월드 데이터 API | **용도지역 구성비**(LT_C_UQ111~114), 지목 구성, 공시지가 | `VWORLD_KEY` |
| `sgis` SGIS OpenAPI3 | 인구 변화·밀도·구성, 주택수, 사업체·종사자, 행정동별 | `SGIS_KEY` `SGIS_SECRET` |
| `public` 공개통계(SGIS 대체) | 종로구 주민등록인구·증감률·밀도·노령화지수·노년부양비, 주택수, 사업체·종사자 — `입력/공개통계.csv` 값 칸에 옮겨 적은 값. 반경 원이 아니라 **종로구 전체** | 없음 |
| `manual` | API 가 없는 항목 — 볼 곳 목록(값 빈칸) | — |

키는 코드·프롬프트에 넣지 않고 환경변수로 둔다(강의자료 40쪽):

```
setx VWORLD_KEY "발급받은키"
setx VWORLD_DOMAIN "http://localhost"
setx SGIS_KEY "consumer_key"
setx SGIS_SECRET "consumer_secret"
```

## 브이월드 2D 데이터 API 2.0 — 요청 네 단계 (강의자료 30쪽)

| 단계 | 작업 | 이 파이프라인에서 |
|---|---|---|
| ① 키와 서비스 URL | vworld.kr 오픈API 인증키 개별 발급, 발급 시 서비스 URL 기록 | `setx VWORLD_KEY …` · `setx VWORLD_DOMAIN "등록한 서비스 URL"` — 코드·문서·화면에 키를 적지 않는다 |
| ② 서비스 ID 확정 | 158개 서비스 목록 중 레이어 선택 | 용도지역 `LT_C_UQ111~114`, 연속지적도 `LP_PA_CBND_BUBUN` |
| ③ 요청 조립 | `api.vworld.kr/req/data` GetFeature · data · key · geomFilter · crs(EPSG:4326) · size(≤1000) · page, 브라우저 밖이면 domain | `vworld.get_features()` |
| ④ 응답 읽기 | status 먼저 확인 후 result 저장, 1,000건 초과 시 page 올려 연속 수신 | `결과/raw/vworld_*.json` 에 지오메트리·속성 + 요청 URL(키 제외)·조회일·status·record·page |

## 대시보드 — 주소를 치면 대상지 정보를 뽑는다

```
py dashboard/server.py        # → http://127.0.0.1:8765
```

- 주소(지번 PARCEL · 도로명 ROAD)와 반경을 넣으면 지오코더 → DEM → 브이월드 레이어 순으로 조회해 **6주차 38쪽 여섯 칸**(① 기온·강수 ② 격자 인구밀도 ③ 용도지역 구성비 ④ 고시 이력 ⑤ 용도별 소요면적 ⑥ 경사·향 적합)을 채운다.
- 인증키는 서버 환경변수에만 있고 브라우저로 가지 않는다. 지오코더 좌표는 화면(실시간)에만 쓰고 파일·DB에 남기지 않는다.
- 대상지마다 `결과_대시보드/<시각>_<이름>/` 에 기초조사_결과.csv · raw/ 를 남긴다.
- **③×⑥ 중첩**(`pipeline/overlay.py`): 용도지역별로 경사 ≤15% · 남향 동시 충족 비율. 구성비가 큰 지역의 적합 비율이 낮으면 현행 지정과 지형이 어긋난다는 신호(38쪽). meteo·vworld 를 같은 실행에서 돌릴 때만 나온다. 표본 간격 100 m 라 작은 지역은 참고값.

### 팀 DB (Supabase 'kaya')

- 표: `survey_runs`(대상지 조회 1건) · `survey_rows`(그 행들). 스키마 `dashboard/supabase_schema.sql`. **좌표 열은 없다** — 다시 보려면 같은 주소로 재조회.
- **로그인 없음.** 대시보드에서 작성자 이름을 적고 "팀 DB에 저장" → 팀 기록 목록에서 누구나 "열기".
- 저장한 기록은 API 로 고치거나 지울 수 없다(정책 없음). 잘못 저장한 것은 관리자가 Supabase 대시보드 Table Editor 에서 지운다.
- 접속 정보는 `dashboard/supabase_config.json` 의 publishable 키(공개용). 저장소가 공개면 외부인도 저장할 수 있으니 저장소는 비공개로 둔다.
- 팀원도 각자 브이월드 키를 발급받아 `setx VWORLD_KEY` 후 자기 PC에서 대시보드를 켠다(키는 공유하지 않는다).

## 레이어별 출처·조회 방식·계산 — 다섯 줄 대조표 (강의자료 33쪽)

| 자료 | 구분 | 출처·서비스 | 조회 방식 | 계산·저장 규칙 → 이 파이프라인 |
|---|---|---|---|---|
| 필지 경계 | API 수집 | 2D 데이터 API 2.0 `LP_PA_CBND_BUBUN` | GetFeature · geomFilter(BOX) · size ≤1,000 · page | 요청 URL(키 제외)·조회일을 `raw/vworld_*.json` 에, 값은 카탈로그 행에 |
| 용도지역·지구 | API 수집 | 2D 데이터 API 2.0 `LT_C_UQ111~114` | GetFeature · 비브라우저 호출이라 domain | 현행 지정만 수신 — 계획안은 반영 안 됨 |
| 행정경계 | API 수집 | 2D 데이터 API 2.0 `LT_C_ADSIDO_INFO` · `LT_C_ADSIGG_INFO` | GetFeature · crs EPSG:4326 · format json | 중심의 시도·시군구 + 반경 원의 시군구별 비율 = 경계 안팎 판정 기준 |
| 경사·향 | **DEM 계산** | Copernicus GLO-90 (Open-Meteo) — 국토지리정보원 DEM 대용 | 표고 받은 뒤 계산 | 셀 90 m = 0.81 ha · 경사 % 10/15/25 시나리오 · 향 북 0° 시계방향 135~225° — 조건을 비고에 병기 |
| 주소 → 좌표 | 지오코더 호출 | 지오코더 2.0 `/req/address` getCoord | type PARCEL·ROAD · address | **결과 저장 금지** — 좌표는 메모리에서만, 카탈로그엔 주소·요청 조건만 (`--addr`) |

```
py run.py --addr "서울특별시 종로구 창신동 128-32" --addr-type PARCEL --name 창신초 --radius 400
```

## 산출

- `결과/기초조사_결과.csv` — 전체 행 (상태: 수집 / 조회대기 / 화면열람 / 실패)
- `결과/현황.md` — 세부항목 51개별 판정. 결과 행이 하나도 없으면 **누락**으로 표시한다
- `결과/상세_*.csv` — 시설·국가유산·필지·행정동 목록, `결과/raw/` — 원 응답

## 주의

- **용도지역은 토지이음에서 직접 못 받는다.** 공개 API가 없고 화면은 내부 AJAX로 그린다. 같은 LURIS 자료를 브이월드 `LT_C_UQ111~114` 로 부른다.
- OSM 값은 대용이다. 도시계획시설 결정(공원·녹지·광장·공공공지)과 다르므로 결정도로 교차확인한다.
- 대상지를 바꾸면 `pipeline/config.py` 의 `sgis_adm_cd`, `khs_ctcd`, `khs_lcto` 도 같이 바꾼다.
