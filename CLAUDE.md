# 낚시어선 승선명부 앱 (boat-manifest) — 프로젝트 안내

진행 상태·다음 할 일은 `docs/TASKS.md` 를 먼저 본다.

## ⚠ 꼭 지킬 규칙
- **실제 폰(R3CM80RH7BH)에 adb 명령 금지 — 삼월이가 허락할 때만.** `adb devices` 로 목록 보는 것 말고는 install·reverse·shell·push 등 어떤 adb 명령도 이 폰에 보내지 않는다. 테스트는 PC(헤드리스 크롬)나 에뮬레이터(`adb -s <에뮬레이터>` 로 대상 명시)로 한다
- **문서(CLAUDE.md, docs/TASKS.md, 그 밖의 .md 등)는 파일 편집 도구(Edit/Write)로만 고친다. 셸 명령(sed, echo, heredoc, node -e 등) 금지.**
  문구 속 백틱(`)이 셸에서 명령으로 실행된 일이 두 번 있었다(2026-11-02, 11-04)

## 한 줄 요약
낚시어선 손님이 자기 정보로 **승선 QR**을 만들어 폰에 저장 → 선장/사무실 폰이 그 QR을 스캔해 그날 **항차 승선자명부**를 만든다 → 확정한 명부를 PDF(제출용)·엑셀(보관용)로 내보내 컴퓨터로 보내 보관.

- 근거 법: 「낚시 관리 및 육성법」 제33조 — 승선자명부 작성, 신분증 대조 의무, 미작성·신분증 제시 거부 시 승선 거부 의무
- 배포: GitHub Pages (계정 kimmoongu-bot). **서버·DB 없음**
  - 저장소 https://github.com/kimmoongu-bot/boat-manifest , Pages main / (root), Jekyll 끔(.nojekyll)
  - 주소: https://kimmoongu-bot.github.io/boat-manifest/ (손님 guest/, 선장 captain/, 처리방침 privacy.html)
  - 모든 경로는 상대 경로(./, ../)라 /boat-manifest/ 아래에서 그대로 동작. 절대 경로(/로 시작) 쓰지 말 것
  - 올리기: sw.js VERSION 올리기 → 커밋 → git push (이 PC git 저장 로그인으로 됨)
- 화면 두 개: `/guest/`(손님용), `/captain/`(선장용). 둘 다 설치형 PWA, 오프라인 동작(service worker 캐시)
- 프레임워크 없음. 정적 HTML + JS. 라이브러리는 `vendor/` 에 로컬로 둔다(항구에서 인터넷 안 될 수 있음)
- 화면 작업 시 `.claude/skills/` 의 frontend-design, korean-mobile-ui 스킬을 따른다

## 손님용 /guest/
1. 내 정보 입력: 성명, 생년월일, 성별, 주소, 휴대전화, 비상연락처(이름+번호) — 모두 필수
   - 개인정보 수집·이용 동의 체크 필수. 안내: 수집 목적(승선자명부 작성·출입항신고기관 제출), 항목, 보관(선장 기기에 최대 3개월)
   - **주민번호·신분증 사진은 절대 받지 않는다**
   - 정보는 이 폰의 localStorage 에만 저장(전송 없음)
2. 내 승선 QR: 큰 QR, 화면 밝기 안내, 만든 날짜, "이 QR을 사진으로 남에게 보내지 마세요" 안내. QR 하나로 어느 배든 사용
3. 오늘 동행자 추가: 동행자 정보 입력 → 일행 QR. 한 사람당 QR 한 장, 좌우로 넘김(1/2, 2/2). 동행자는 "다음에도 쓰기"로 저장 여부 선택
4. 정보 수정·삭제

## QR 형식 (승객 1명 = QR 1장) — 손님 앱은 BM2 를 만든다, 선장 앱은 BM1·BM2 둘 다 읽는다
- **BM2 (2026-11-02부터 기본)**: `"BM2:"` + base45(`LZString.compressToUint8Array(JSON 순서 배열)`), QR **영숫자 모드**(`BMQR.qrMode`)
  - 순서 배열: `[성명, 생년월일 YYYYMMDD, 성별 1=남 2=여, 주소, 휴대전화 숫자만, 비상연락처 이름, 비상연락처 번호 숫자만, 일행ID, 순번, 인원, 만든 날짜 YYMMDD]`
  - 항목은 BM1과 같다. 줄인 것은 표현 방식뿐(키 이름 없음, 하이픈 없음, 영숫자 모드). 읽을 때 하이픈·날짜 형식을 되살린다
  - 긴 주소 기준 QR 버전: BM1 v13(69칸) → BM2 v8(49칸). 점검: `node tools/check-qr-format.mjs`
- **BM1 (예전)**: `"BM1:"` + `LZString.compressToEncodedURIComponent(JSON)`, 바이트 모드
  - JSON 키: `v`(버전=1), `name`, `birth`(YYYY-MM-DD), `sex`("남"/"여"), `addr`, `phone`, `emerName`, `emerPhone`, `grp`(일행ID, 혼자면 ""), `idx`(일행 중 순번, 1부터), `cnt`(일행 인원), `made`(만든 날짜 YYYY-MM-DD)
- 읽은 결과는 두 형식 모두 BM1 키 이름의 객체로 같다(`BMQR.decode`)
- 일반 카메라로 찍었을 때 내용이 바로 안 보이면 된다(암호화 불필요)
- 배 이름·날짜·항차는 QR에 넣지 않는다 — 스캔하는 선장 앱이 붙인다
- 인코딩/디코딩 코드: `shared/bmqr.js` (손님·선장 공용)

## 선장용 /captain/
1. 초기 설정: 선박명, 선박번호, 정원, 기기 이름(선장폰/사무실폰), 선장·선원 명단(명부에 매번 자동 포함), 앱 잠금 PIN(선택)
2. 오늘 항차: "항차 열기" → 날짜 + 항차 번호(1항차, 2항차…). 현재 인원/정원 표시
3. 연속 스캔: 카메라 계속 켜 두고 스캔마다 진동 + 이름 토스트. QR 이미지 파일 불러오기 버튼(에뮬레이터 테스트 겸 예비)
   - 같은 항차에서 성명+생년월일+전화번호가 같으면 중복 → 무시
4. 수동 입력: 폰 없는 손님을 선장이 직접 입력
5. 명단/신분증 확인: 승객마다 "신분증 확인" 체크 + 확인 시각 기록. "승선 제외" 처리. 일행은 "대표자 ○○○ 외 N명"으로 묶어 표시
   - 경고: 정원 초과, 보호자 없는 14세 미만(생년월일로 계산), QR 만든 지 1년 넘음(정보 확인 권유)
6. 명부 확정: 제외되지 않은 전원 신분증 확인 끝나야 확정 버튼 켜짐. 확정하면 수정 잠김(해제는 PIN)
7. 내보내기: 확정 시 PDF(제출용)·엑셀(보관용) → Web Share API 공유(카톡 PC, 메일, 구글 드라이브)
   - 보내기는 미리보기 화면(`#/v/:id/sheet`, 확정 뒤)에서: PDF 보내기 · 사진 보내기(Export.png, 캔버스 PNG) · 엑셀 저장(11-10). 안드로이드 크롬은 .xlsx 공유를 막아 엑셀은 바로 다운로드 → "카톡 ＋ → 파일 → 다운로드" 안내 창
   - 파일 이름: `2026-10-30_1항차_선박명.pdf` / `.xlsx`
   - **PDF = 법정 서식(시행규칙 별지 제16호서식, 11-10)**: A4 세로, 제목 "승선자 명부", "승선일: YYYY년 MM월 DD일", 칸 순서 성명·생년월일·성별·주소·전화번호(휴대전화)·비상연락처(직계가족 등 휴대전화)·비고(선원 또는 승객). 선원 비고는 "선원 / 면허·수첩 번호"(crew.license, 선택). 장이 넘어가면 머리줄 반복. 아래쪽에 선박명·항차·확정 시각·쪽수를 작게. 칸 정의는 export.js FORM_COLUMNS
   - 엑셀·사진·명부 보기는 앱 칸(COLUMNS): 번호, 구분, 성명, 생년월일, 성별, 주소, 휴대전화, 비상연락처, 일행, 신분증 확인 시각 — 일행·신분증 확인은 PDF에 안 넣음
   - PDF 한글 깨짐 주의 — 한글 폰트 임베드 등 안정적 방법, 고른 방법과 이유를 보고
8. 지난 명부: 날짜별 목록, 다시 내보내기, 공유 안 한 항차 "미전송" 표시, "이번 달 전체 엑셀"
9. ~~명단 합치기~~ — 2026-11-10 삼월이 요청으로 뺌(폰에서 JSON 파일 보내기가 다운로드 창으로만 떠서 불편). 대신 "명부 보기"(제출 양식 순서로 화면에서 확인)
10. 자동 삭제: 보관 기간(기본 3개월, 설정에서 변경) 지난 명부는 앱 열 때 삭제
- 저장소: IndexedDB(DB 이름 boat-manifest). 테이블: vessel, crew, voyage, passenger — 구조는 `captain/db.js` 맨 위 주석
- 항차 id = `YYYY-MM-DD_N`. 항차를 열 때 선장·선원 명단을 사본으로 넣고, 확정 전이면 설정에서 명단을 고칠 때 같이 바뀐다
- 스캔: jsQR(웹 워커, `captain/scan-worker.js`)로 카메라 화면 가운데 정사각형을 0.12초마다 읽음. 같은 QR은 3초 안에 다시 보이면 무시(계속 비춰도 한 번)
- 알림: 진동(안드로이드) + 소리(아이폰은 진동 API가 없어서). 소리는 "QR 스캔" 버튼을 누를 때 켜 둔다
- 경고(`captain/rules.js`, 항차 날짜 기준): 정원 초과(제외한 사람 빼고 선원 포함), 14세 미만인데 같은 일행에 19세 이상이 없음, QR 만든 지 365일 넘음(직접 입력은 제외). 경고가 있어도 확정은 되지만 확인 창에 다시 보여 줌
- 확정: 제외 안 한 승객 전원 신분증 확인이 끝나야 버튼이 켜짐. 확정하면 스캔·입력·수정 잠김. 풀기는 PIN(없으면 확인만). 다시 확정하면 "미전송"으로 돌아감
- **PDF 한글**: pdf-lib + HarfBuzz(`vendor/hb-subset.wasm`, `captain/font-subset.js`)로 Pretendard TTF에서 쓴 글자만 남긴 글꼴을 만들어 통째로 심는다. 승객 5명 + 선원 2명 PDF 약 28KB
  - pdf-lib 자체 `subset:true`(fontkit)는 **한글 대부분이 사라진다** — 쓰지 말 것
  - 줄인 글꼴에서 GSUB·GPOS 를 뺀다. 남겨 두면 숫자 사이 '-' ':' 가 대체 글자로 바뀌는데 pdf-lib 가 그 너비를 안 적어 간격이 벌어진다
- 엑셀: `captain/xlsx.js` 가 외부 라이브러리 없이 직접 만든다(zip 무압축). 이 PC의 실제 Excel로 열어 셀 내용 확인함
- 공유: Web Share(파일)가 되면 공유, 안 되면 다운로드. 안드로이드 크롬은 .xlsx 공유를 막을 수 있어 그때는 PDF만 공유하고 엑셀은 다운로드("mixed")
- 명부 보기(#/v/항차id/sheet): PDF와 같은 줄·항목(Export.manifestRows·summary)을 카드로 보여 줌. 확정 전에도 볼 수 있고 "확인 안 함"은 빨간 글씨
- 안드로이드 크롬 Web Share 는 .json 같은 파일 형식을 받지 않아 다운로드 창으로 넘어간다(명단 파일 보내기를 뺀 이유)
- 자동 삭제: 앱을 열 때(잠금 푼 뒤) 보관 기간(설정, 기본 3개월)보다 오래된 항차를 건수·미전송 건수와 함께 알리고 지움. "나중에"를 누르면 다음에 열 때 다시 물음

## 개발 순서 — 단계마다 멈추고 보고, 삼월이가 확인하면 다음 단계
1. 프로젝트 뼈대, CLAUDE.md, PWA 설정, 손님용 /guest/ 완성
2. 선장용 설정, 항차, 연속 스캔, 수동 입력, 중복 처리
3. 신분증 확인, 경고, 확정 잠금, PDF/엑셀 내보내기, 지난 명부, 명단 합치기, 자동 삭제
4. GitHub Pages 배포, 사용 안내 페이지(배에 붙일 "승선 QR 만들기" 안내 QR 포함)

## 테스트
- PC 안드로이드 에뮬레이터(AVD `quote-test`) 크롬에서 확인. 카메라 스캔이 어려우면 QR 이미지 불러오기로
- 테스트용 손님 QR 5장(혼자 3명, 일행 2명, BM2 형식): `test-qr/` (`node tools/make-test-qr.mjs` 로 다시 만듦)
- 화면 글씨는 크게: 선장님들은 50~60대가 많고 바다 햇빛 아래에서 쓴다

### 로컬 실행
- PC: `node tools/serve.mjs 8123` (boat-manifest 폴더에서, 이 PC엔 Python 없음) → http://localhost:8123/guest/ , /captain/
- 실제 폰(R3CM80RH7BH): 맨 위 규칙대로 adb 금지(허락할 때만)
- 에뮬레이터: `adb -s <에뮬레이터 이름> reverse tcp:8123 tcp:8123` 후 에뮬레이터 크롬에서 `http://localhost:8123/...`
  - 10.0.2.2 로 열면 "보안 출처"가 아니어서 service worker·카메라가 안 된다. 꼭 adb reverse + localhost
- Claude 앱 내장 브라우저는 service worker 가 안 된다 → 오프라인·카메라 확인은 헤드리스 크롬(CDP)으로
- 연속 스캔 PC 테스트: `node tools/make-fake-camera.mjs <파일.y4m>` 로 테스트 QR 5장 영상을 만들고 크롬을
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=<파일.y4m>` 로 띄운다
- service worker: 인터넷이 되면 새 파일(3초 넘으면 저장본), 안 되면 저장본. 파일 목록을 바꾸면 sw.js 의 VERSION 을 올린다

## 폴더 구조
```
index.html          첫 화면(손님/선장 고르기)
guest/              손님용 PWA (index.html, app.js, style.css, manifest, sw.js, 아이콘)
captain/            선장용 PWA (app.js 화면, db.js IndexedDB, scanner.js 카메라·사진, scan-worker.js jsQR,
                    rules.js 경고, export.js PDF·엑셀·공유, xlsx.js 엑셀 만들기, font-subset.js PDF 글꼴 줄이기)
shared/             공용 코드 (bmqr.js QR 형식, person-form.js 입력칸·검사, ui.js 토스트·확인 창, base.css 토큰, ui.css 공용 부품)
vendor/             외부 라이브러리 로컬 사본 (lz-string 1.5.0, qrcode-generator 1.4.4, jsQR 1.4.0, pdf-lib 1.17.1,
                    @pdf-lib/fontkit 1.1.1, harfbuzzjs 1.6.4 의 hb-subset.wasm, fonts/Pretendard 1.3.9 Regular·Bold TTF)
docs/screens/       단계별 확인 화면 캡처
test-qr/            테스트용 손님 QR PNG
tools/              개발용 스크립트 (serve.mjs 로컬 서버, make-test-qr, make-fake-camera, make-icons, test-people, check-qr-format)
```

## 디자인
- 바다 햇빛·50~60대 기준: 본문 18px, 버튼 높이 60px(스캔 버튼 72px), 밝은 배경 + 진한 글자(대비 7:1 이상 목표). 폰트 Pretendard → 시스템 한글 폰트
- 색 토큰: 깊은 바다 남색 `--primary #0B3A5B` 하나만 포인트, 경고는 부표 주황 `--warn #C2410C`, 위험 `--danger #B91C1C`. 모서리 12px 통일
- 입력은 큰 칸 + 숫자 키패드(생년월일 8자리·전화번호 자동 하이픈), 성별은 큰 세그먼트 버튼
