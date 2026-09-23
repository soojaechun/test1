# junhee — 대시보드 요약 실제 데이터 연결

다른 조원과 겹치지 않도록 새 파일은 모두 이 폴더에 둔다.
프로젝트 파일 중에는 `templates/workspace.html`(요약 카드 자리), `static/js/workspace.js`(데이터 연결부), `.gitignore`, 새 폴더 `static/data/` 만 손댔다.

## 구성

```
junhee/
  data/raw/         test1_data 원본 복사본 (수정 금지, API 키 파일 제외)
  data/raw/external/  fetch_fx.py 가 내려받은 환율 시계열 (FRED H.10 일별 9종 + 월평균 1종) + 수집 기록
  config/           stability_method.json — 안정성 산식 설정 v1.0 (2026-09-23 팀 확정)
  data/processed/   항목별 JSON + dashboard_summary.json
  data/samples/     업로드 시연용 가상 기업 엑셀 2개
  scripts/          추출·검증·복사 스크립트
  MANIFEST.csv      원본 출처·기준일·SHA256/MD5·이용조건
```

## 실행 순서

```
python junhee/scripts/fetch_fx.py               # 환율 시계열 10종 수집 → data/raw/external/ (API 키 불필요)
$env:ECOS_API_KEY = "<키>"; python junhee/scripts/fetch_fx_ecos.py   # COP·KHR·VND·ZiG (한국은행 ECOS, 키는 환경변수로만)
python junhee/scripts/extract_summary.py        # 원본 → processed/*.json, dashboard_summary.json
python junhee/scripts/publish_static.py         # → static/data/dashboard_summary.json (app.py 수정 없이 /static 로 서빙)
python junhee/scripts/build_manifest.py         # → junhee/MANIFEST.csv
python junhee/scripts/make_sample_companies.py  # → junhee/data/samples/*.xlsx
```

필요 패키지: `openpyxl` (requirements.txt 는 수정 금지라 추가하지 않음).

## dashboard_summary.json 항목 스키마

```
{ "key": "regulation", "headline": "핵심 결과 1개", "note": "짧은 설명 1줄",
  "state": "ok" | "insufficient", "source": "파일명", "as_of": "YYYY-MM-DD" | null,
  "data_class": "실제자료" | "가상데이터" | "가정값", "detail": { ... } }
```

- `state = insufficient` 면 headline 은 "자료 부족" 이고 숫자를 넣지 않는다. note 에 필요한 자료를 적는다.
- `as_of` 가 없는 항목은 `checked_on`(확인일)을 둔다.
- `publish_static.py` 가 복사 전에 위 규칙을 검증한다.

HS 는 `HS_LIST = ["854231", "854232"]` 두 개를 본다 (샘플 회사가 메모리 회사라 854232 가 필요). 규제·가격은 HS 별로 detail 에 나눠 담고 headline 은 합쳐서 표시한다.

## 항목별 추출 근거와 한계

| 항목 | 값 | 출처 | 한계 |
|---|---|---|---|
| 규제 | 미국의 대한국 수입규제 55건, HS 854231·854232 모두 미포함, CSL 26,146건 | KOTRA 수입규제 현황(2026-06-03), ITA CSL, HSK연계표(2026-09-01) | 별표1~4 는 파싱하지 않음(원문 확보, 판정 미적용). HSK 연계표상 8542.31 하위 4개·8542.32 하위 7개 코드가 통제번호(3A001 등)에 연계돼 있으나 해당 여부는 원문 대조 후 판정 |
| 시장성 | 2026-07 세계 출하액 1,425억 달러, 전년동월비 +129.4% | WSTS Historical Billings (Monthly Data, Worldwide) | 파일 값 그대로. 전년동월비가 매우 큰 값이므로 원자료 재확인 권장 |
| 가격 | 미국 적용관세 0.0%(두 HS 동일), 대한국 수입액 854231 11.1억 + 854232 4.3억 달러 / 수출물가 컴퓨터·전자·광학 222.17 (2026-08p, 전월비 -3.1%) | C840_C410.csv(조치일 2026-09-03), 한국은행 수출입물가지수 | 물가지수 파일에 '반도체' 세부 행이 없어 상위 분류를 표시하고 그 사실을 note 에 적음 |
| 물류 | 한국→미국 서부 해상수출 8,589천원/2TEU (전월비 +0.5%), 동부 9,973천원 | 관세청 보도자료 hwpx (2026-08 자료, 2026-09-15 배포) | hwpx 의 section0.xml 문단 텍스트를 정규식으로 추출. 표 구조가 바뀌면 `insufficient` 로 떨어지도록 방어 |
| 안정성 | 목적국 결제통화의 원/외화 월평균 최근 12개월 평균 월간 변동폭(%) + 과거 10년 롤링 분포 대비 3분위 등급. 보조로 한국→미국서부 해상운임 변동폭(등급 없음) | FRED H.10 일별 환율(DEXKOUS 등 9종)로 교차환율 계산, 관세청 hwpx 월별 운임 표 | 산식 v1.0 팀 확정(2026-09-23). USD·CNY·JPY·GBP·EUR·CAD·MXN·INR·CHF 가능, COP·KHR·ZiG·VND 는 H.10 미수록으로 자료 부족. 운임은 20개월뿐이라 등급 없음. ECOS 교체는 API 키 필요 |

## 가상 기업 샘플 (junhee/data/samples/)

- `한빛반도체_수출데이터_v0.1.xlsx` — 규모 큼, DRAM·HBM 중심 + NAND, 거래처 6곳
- `대성일렉트로닉스_수출데이터_v0.1.xlsx` — 규모 작음, NAND 중심, 거래처 4곳
- 시트: 제품정보 / 수출예정거래 / 수출실적 / 원가·비용 / 재고·생산 / 물류 / 거래처 / 증빙목록 + 검증케이스
- 첫 시트 상단에 "시연용 가상 데이터. 실제 기업 자료가 아님", `template_version 0.1` 명시. 매크로·수식 없음.
- 수출실적은 2025-09~2026-09 13개월을 고정 시드(random.Random)로 생성한다. 한빛 35행, 대성 23행. 시드·기준 수량·단가는 스크립트의 `actuals_spec` 참조.
- 검증 케이스(값 0 / 빈칸 / 거래처 연결 오류 / 날짜 형식 오류 / 중복 행)의 위치는 `검증케이스` 시트 참조. 실적 오류 행은 항상 시트 끝 3~4행.
- 목적국은 관세 CSV 가 있는 12개국 범위(미국·중국·영국·인도·멕시코·캐나다·스위스)만 사용. 대만은 12개국에 없어 제외.

## 안정성 산식 v1.0 (2026-09-23 팀 확정)

- 지표: 목적국 결제통화 환율. 원/달러(DEXKOUS) 일별 값에 다른 통화의 대달러 환율을 곱하거나 나눠 원/외화 일별 교차환율을 만든 뒤 월평균(거래일 10일 미만·진행 중인 달 제외).
- 기간: 최근 12개월 (13개 월평균 → 12개 전월비).
- headline: 전월비 등락률 절대값 평균 (%) = "한 달에 평균 ±n%". note: 최근 12개월 최고·최저. detail: 변동계수.
- 등급: 과거 10년(120개) 롤링 12개월 구간 분포에서 최근 값의 위치. 하위 1/3 안정, 중간 보통, 상위 1/3 불안정. 과거 구간 36개 미만이면 등급 없음.
- 보조 지표: 한국→목적국 해상수출 운임(관세청 월별 표). note 에 변동폭만 표시, 등급·점수에 미반영(물류와 중복 방지).
- 화면: `detail.per_country` 에 나라별 결과가 있고 workspace.js 가 현재 목적국 것을 카드에 보여준다. 통화 자료가 없는 나라는 자료 부족.
- H.10 에 없는 COP·KHR·VND·ZiG 는 `fetch_fx_ecos.py` 가 한국은행 ECOS 731Y001 에서 받는다. 키는 환경변수 `ECOS_API_KEY` 로만 넘기고 파일·로그·메타에 남기지 않는다. 파일이 없으면 해당 나라는 자료 부족으로 표시된다.
- 남은 일: fetch_fx_ecos.py 를 키와 함께 1회 실행 → extract → publish. ECOS 에 항목이 없는 통화가 있으면 대체 출처.

## 대시보드 표시 규칙 (workspace.js)

- 로딩 / 정상 / 자료 부족 / 조회 실패를 카드 문구("상태: …")로 구분한다. 색상만으로 구분하지 않는다.
- 각 카드에 출처·기준일을 표시하고, `data_class` 를 그대로 표시한다(가상데이터면 "가상데이터").
- 요약 자료의 대상국·HS 와 화면 조건이 다르면 하단에 주의 문구를 낸다. 안정성 카드만 목적국별 결과로 바뀐다.
- 보고서 표의 5개 영역 값도 같은 요약값을 쓴다. 상세(책갈피) 탭은 아직 예시 데이터다.
