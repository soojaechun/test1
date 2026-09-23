# AXPORT 프론트엔드 시안

홈 화면과 데스크톱형 대시보드 앱을 확인하는 Flask 기반 프로토타입입니다.

## 실행

PowerShell에서 프로젝트 폴더를 연 뒤 실행합니다.

```powershell
.\start.ps1
```

스크립트 실행이 제한된 환경에서는 다음 명령을 사용합니다.

```powershell
.\.venv\Scripts\python.exe app.py
```

최초 설치가 필요한 PC:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

- 홈: http://127.0.0.1:5073/
- 작업공간: http://127.0.0.1:5073/app
- 종료: 서버 터미널에서 Ctrl+C
- Python 3.14.7 / Flask 3.1.3에서 검증. 로컬 개발용 서버입니다.

## 확인할 수 있는 동작

- 첨부 로고·뇌/반도체 이미지를 사용한 홈, 서비스 소개, 앱 전환 로딩
- 파일 선택·드롭, 기업명·HS 코드·대상국 입력, 샘플 분석 진입
- 파일 아이콘 더블클릭, 격자 이동, Delete 키/휴지통 드롭, 복원
- 창 이동·크기 조절·최소화·최대화·배치 초기화
- 5개 요약 항목과 오른쪽 책갈피별 예시 차트·표
- 가중치 합계 100% 검증, 기본값 복원, 규제 관문 별도 표시
- 보고서 화면 미리보기와 HTML 다운로드 링크. HTML을 브라우저로 열면 인쇄로 PDF 저장 가능
- 모바일 단일 창과 하단 탭, 메뉴, 키보드·움직임 줄이기 대응

## 이번 범위

외부 API, 법령·관세·거래제한 등 실제 자료, 엑셀 내용 분석, 실제 수출 판정은 연결하지 않았습니다. `.env`는 읽거나 사용하지 않습니다.

파일 선택은 브라우저의 파일명·크기만 사용합니다. 파일 내용을 읽거나 서버에 전송하지 않습니다. 가중치와 모든 숫자는 UI 예시이며 가중치를 바꿔도 예시 점수가 재계산되지는 않습니다.

파일 목록·분석 조건·가중치는 현재 페이지에서만 유지되며 새로고침하면 초기화됩니다. 창 위치·크기만 브라우저 localStorage에 저장합니다. 휴지통은 이 화면의 파일 항목을 숨기고 복원하며 실제 PC 원본을 삭제하지 않습니다.

## 수정 위치

| 화면/기능 | 파일 |
|---|---|
| 홈 구조 | `templates/home.html` |
| 홈 디자인 | `static/css/home.css` |
| 홈 메뉴·전환 | `static/js/home.js` |
| 작업공간 구조·모달 | `templates/workspace.html` |
| 작업공간 디자인 | `static/css/workspace.css` |
| 아이콘·창·탭·예시 데이터 | `static/js/workspace.js` |
| Flask 화면 경로 | `app.py` |

이미지는 `static/assets`, 로컬 폰트·아이콘·차트는 `static/vendor`에 있습니다. 실행 시 CDN 호출은 하지 않습니다. 첨부 이미지는 원본을 복사했으며 CSS로 배치했습니다.

## 개발 도구

Node는 정적 패키지 갱신과 포매팅에만 사용합니다. Flask 실행에는 Node가 필요하지 않습니다. 패키지 버전은 `package-lock.json`으로 고정합니다.

```powershell
npm ci
npm run format
npm run check
```

Chart.js(MIT), Phosphor Icons(MIT), Noto Sans KR(OFL) 라이선스는 vendor 폴더에 포함되어 있습니다. 원래 기획 문서는 유지했습니다.
