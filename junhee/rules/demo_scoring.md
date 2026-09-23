# 시연용 점수 산식 (demo_scoring v0.1)

`junhee/scripts/score_companies.py` 가 그대로 구현한다. **가상 데이터 · 시연용 산식**이며 팀이 확정한 채점 기준이 아니다.
입력은 더미 엑셀 2개(`junhee/data/samples/`)와 `junhee/data/raw/` 의 공개자료다.

## 공통 규칙

- 기준월 `as_of` = 수출실적에서 유효한 가장 최근 거래월.
- 평가월 M 마다 "M 말까지의 데이터"만 써서 같은 산식을 계산한다.
  - `series` = 최근 6개월(M = as_of−5 … as_of) 각각의 점수.
  - `delta` = score(M) − score(M−1). 전월 값도 같은 산식을 한 달 전 데이터로 계산한 것이다.
- 추적 창(trailing window) = M 을 포함한 최근 12개월.
- 수출실적 유효 행: 거래일이 날짜로 읽히고, 취소반품 ≠ Y, 수량 > 0, 금액 > 0. 모든 열이 같은 중복 행은 1건만 센다.
  (검증케이스 시트의 오류 행은 이 규칙으로 자연히 제외된다.)
- 계산에 필요한 값이 없으면 점수를 만들지 않고 `state: "insufficient"` 로 두고 `note` 에 필요한 자료를 적는다.
- 모든 점수는 0~100 으로 자르고 소수 1자리로 반올림한다. `clip(x) = min(100, max(0, x))`.

## 규제 (regulation) — 관문, 종합 점수에 넣지 않음

`score = clip(100 − P1 − P2 − P3)`

| 감점 | 조건 | 값 | 출처 |
|---|---|---|---|
| P1 | 추적 창의 (목적국, HS6) 조합 중 하나라도 KOTRA 수입규제 현황에서 규제시행국 = 목적국 ISO2, 한국대상여부 = Y, HS 코드 열 중 HS6 로 시작하는 행이 있음 | 30 | 대한무역투자진흥공사_국별 대세계 수입규제 현황_20260603.csv |
| P2 | 거래처 시트의 법인명(정규화: 대문자, 영숫자만)이 CSL 의 name 또는 alt_names 와 정확히 일치 | 40 | ITA_consolidated_screening_list.csv |
| P3 | HSK 연계표에 HS6 로 시작하는 HSK 코드가 있고 통제번호(CNTRLNO)가 비어 있지 않은 제품의 수출액 비중 s (0~1) | 20 × s | HSK연계표_20260901.xlsx |

- P3 는 "통제번호 후보가 있어 검토가 필요하다"는 뜻이지 "전략물자에 해당한다"는 뜻이 아니다. 화면에도 그렇게 쓴다.
- `needs_review = (P1 + P2 + P3) > 0` 이면 종합 옆에 '규제 검토 필요' 배지를 표시한다.

## 시장성 (market) — 가중치 35

`score = 0.5 × f + 0.5 × g`

- f = clip(50 + wsts_yoy / 2). wsts_yoy = M 이전(포함) 가장 최근 WSTS Worldwide 월간 출하액의 전년동월비(%). 그 월이 M 보다 3개월 넘게 오래됐으면 자료 부족.
  출처: WSTS-Historical-Billings-Report-Jul_2026.xlsx (Monthly Data, Worldwide).
- g = clip(50 + growth3m). growth3m = (M 포함 최근 3개월 수출액 합 ÷ 그 전 3개월 합 − 1) × 100. 전 3개월 합이 0 이면 자료 부족.

## 가격 (price) — 가중치 30

`score = 0.5 × t + 0.5 × m`

- t = clip(100 − 2 × r). r = 목적국별 수출액 비중으로 가중한 적용관세율(%). 관세율은 `C<reporter>_C410.csv` 에서 reporter = 목적국, hs_code = HS6, year_dt ≤ M 말인 조치 중 최신 행의 `best_avlbl`. 목적국 파일이 없거나 HS 행이 없으면 자료 부족.
  reporter 코드: 미국 C840 · 중국 C156 · 영국 C826 · EU U918 · 캐나다 C124 · 멕시코 C484 · 인도 C356 · 스위스 C756 · 콜롬비아 C170 · 에콰도르 C218 · 캄보디아 C116 · 짐바브웨 C716.
- m = clip(2.5 × margin). margin(%) = 수출액 가중 평균 [(단가 − 단위원가) ÷ 단가 × 100]. 단가 = 금액 ÷ 수량, 단위원가 = 원가·비용 시트의 제품원가 + 운송비 + 보험료 + 포장비(단위당, 같은 통화). 원가 행이 없는 제품은 제외하고, 원가 행이 하나도 없으면 자료 부족.

## 물류 (logistics) — 가중치 20

`score = 0.7 × ontime + 0.3 × c`

- ontime(%) = 추적 창에서 예정도착일이 M 말 이전이고 실제도착일이 있는 물류 행 중 실제도착일 ≤ 예정도착일 인 비율 × 100. 해당 행이 없으면 자료 부족.
- c = clip(100 − 10 × fr). fr(%) = 물류 행의 운임 합 ÷ 연결된 수출실적(거래ID = 실적ID) 금액 합 × 100. 연결된 금액이 0 이면 자료 부족.

## 안정성 (stability) — 가중치 15

기업 내부 거래의 안정성이다. 국가위험등급·신용등급이 아니다.

`score = 0.5 × conc + 0.5 × cv`

- conc = clip((1 − HHI) × 100). HHI = 추적 창 수출액의 거래처별 HHI 와 목적국별 HHI 의 평균. HHI = Σ(비중²).
- cv = clip(100 − 2 × CV). CV(%) = 추적 창 월별 수출액의 표준편차 ÷ 평균 × 100 (모표준편차). 유효한 달이 6개 미만이면 자료 부족.

## 종합 (overall)

- `overall = (35 × 시장성 + 30 × 가격 + 20 × 물류 + 15 × 안정성) ÷ 100`. 가중치는 workspace.js 의 `defaults` 와 같다.
- 규제는 더하지 않는다(관문 고정). 네 항목 중 하나라도 자료 부족이면 종합도 자료 부족이다. 0점 치환·재배분을 하지 않는다.
- `delta_vs_prev_month = overall(as_of) − overall(as_of − 1)`.

## 산출물

- `junhee/data/processed/companies/<company_id>.json`, `index.json` (파일 SHA-256 포함)
- `publish_static.py` 가 `static/data/companies/` 로 복사하고, 샘플 엑셀을 `static/samples/` 로 복사한다.
