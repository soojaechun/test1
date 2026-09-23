# MERGE_GUIDE — main 을 junhee 브랜치로 가져오는 순서

"가이드대로 main 가져와줘" 라고 하면 아래를 그대로 따른다. 내 작업이 하나라도 사라지면 안 된다.

## 0. 원칙

- 어떤 파일도 되돌리거나(discard) 삭제하기 전에 반드시 백업부터 한다.
- `git push` 는 하지 않는다. 합친 결과를 보여주고 멈춘다.
- `git add .` / `git add -A` 를 쓰지 않는다. 파일을 지정해서 추가한다.
- API 키가 들어간 파일(`.env`, `*api 키*.txt`, `credentials/`)은 절대 커밋하지 않는다.

## 1. 현재 상태 백업

1. `git status` 를 보여준다. (브랜치가 `junhee` 인지 확인)
2. 저장소 폴더 밖에 백업 폴더를 만든다: `../_merge_backup/<YYYYMMDD_HHMMSS>/내꺼/`
3. 커밋되지 않은 모든 변경 파일(수정 + 미추적)을 폴더 구조 그대로 복사한다. `templates/home.html`, `templates/workspace.html` 포함.
   비밀정보 패턴(`.env`, `api 키`, `credentials/`)에 걸리는 파일은 복사·커밋 대상에서 뺀다.

## 2. main 버전도 따로 저장

1. `git fetch origin`
2. 내가 바꾼 추적 파일들의 `origin/main` 버전을 같은 구조로 저장한다: `../_merge_backup/<시각>/main/`
   (`git show origin/main:<경로>` 의 바이트를 그대로 저장. 텍스트는 UTF-8 이라 한글이 깨지지 않는다.)

## 3. 비교표 작성

`../_merge_backup/<시각>/비교결과.md` 에 파일별로 정리한다.

- 내 쪽에만 있는 줄 / main 쪽에만 있는 줄 / 양쪽 모두 있지만 내용이 다른 줄
- 각 줄마다 무슨 기능인지 한 줄 (예: `junhee-dashboard.js 연결 — 대시보드 작업`, `chatbot.js 연결 — 챗봇 기능`)
- 특히 `templates/home.html` 변경이 **a) main 에 이미 똑같이 있는 것**인지 **b) 내 쪽에만 있는 것**인지 판정한다.
  문자열이 달라도 속성 순서·자기닫힘 표기만 다르고 기능이 같으면 a) 로 본다.

## 4. 내 작업 커밋

1. a) 로 판정된 줄은 내 쪽 변경을 되돌린다 (백업이 있으니 안전). main 에서 그대로 들어온다.
   - 파일 전체가 a) 면 `git checkout -- <파일>`, 일부만 a) 면 그 줄만 지운다.
2. 나머지 내 작업만 파일을 지정해서 커밋한다.
   ```
   git add junhee static/css/junhee-dashboard.css static/js/junhee-dashboard.js static/data static/samples templates/workspace.html static/js/workspace.js
   git commit -m "feat: 종합 대시보드 점수형 전환 및 더미 기업 업로드 연동"
   ```
   `static/js/workspace.js` 는 대시보드 연결부(초기 파일·업로드 대조·종합 탭 위임)가 들어 있어 함께 커밋한다.
3. 커밋 전 `git diff --cached --name-only` 로 비밀정보 파일이 없는지 확인한다.

## 5. 합치기

1. `git merge origin/main`
2. 충돌이 나면 한쪽을 통째로 고르지 않는다. 대부분 양쪽을 다 살린다.
   - `<link>`, `<script>` 추가 줄 → 양쪽 모두 남기고 중복만 제거
   - `workspace.js?v=숫자` 처럼 버전 번호가 다르면 → 둘보다 큰 번호
   - `junhee-dashboard.js` 줄은 `workspace.js` 줄 바로 위에 둔다 (defer 순서: 모듈이 먼저 정의돼야 함)
   - `{% include "chatbot.html" %}` 가 있으면 `templates/chatbot.html` 도 반드시 존재해야 한다. 없으면 멈추고 알린다.
3. 해결한 충돌마다 '어떻게 합쳤는지' 한 줄씩 적는다.
4. 되돌리기: 병합 중이면 `git merge --abort`. 병합 커밋 뒤라면 `git reset --hard ORIG_HEAD` (내 커밋은 남는다), 파일 단위 복원은 백업 폴더에서 복사.

## 6. 확인

1. `python app.py` 로 서버를 띄운다 (127.0.0.1:5073).
2. 아래가 모두 200 인지 표로 보여준다.
   `/`, `/app`, `/static/css/junhee-dashboard.css`, `/static/js/junhee-dashboard.js`, `/static/js/workspace.js`,
   (챗봇이 있으면) `/static/js/chatbot.js`, `/static/css/chatbot.css`
3. `/app` 에서 더미 기업 파일(한빛·대성)을 열었을 때 대시보드 숫자가 바뀌는지 확인한다. 브라우저가 없으면 jsdom 점검 스크립트로 대신하고, 캔버스 그리기 등 확인 못 한 항목은 '미확인'으로 적는다.
4. 결과가 이상하면 5-4 의 되돌리기 방법을 안내한다.

## 7. 마무리

`git status` 와 `git log --oneline -5` 를 보여주고 멈춘다. push 는 사용자가 한다.
