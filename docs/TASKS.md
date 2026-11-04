# 낚시배 승선명부 — 할 일

## 다음 세션 시작점 (2026-11-04)
📋 다음: 3단계 결과 확인 받기 → 4단계(GitHub Pages 배포, 사용 안내 페이지·배에 붙일 안내 QR)

- 3단계 끝: 신분증 확인(시각 기록), 승선 제외·지우기·정보 수정, 경고 3종, 명부 확정·잠금·PIN 풀기, PDF·엑셀 보내기(안 되면 다운로드), 지난 명부(미전송 표시·월 전체 엑셀), 명단 합치기(JSON), 자동 삭제(건수 안내)
- PDF 한글: pdf-lib + HarfBuzz 로 쓴 글자만 남긴 Pretendard 를 심음(약 28KB). pdf-lib 자체 subset 은 한글이 사라져서 안 씀. 자세한 건 CLAUDE.md
- 확인: 헤드리스 크롬 전 과정 통과, PDF는 pdf.js로 열어 화면 캡처, 엑셀은 이 PC의 실제 Excel로 열어 셀 확인 → docs/screens/
- 아직 안 한 것: 실제 폰에서 Web Share(카톡·메일·드라이브) 확인 — 안드로이드 크롬이 .xlsx 공유를 막으면 PDF만 공유되고 엑셀은 다운로드됨. 아이폰 사파리 확인
- 규칙: 실제 폰(R3CM80RH7BH)에 adb 명령 금지 — 삼월이가 허락할 때만 (CLAUDE.md 맨 위)
- 다시 시작할 때: boat-manifest 폴더에서 `node tools/serve.mjs 8123` → http://localhost:8123/guest/ , /captain/

## 실제 폰 카메라 테스트 순서 (폰이 빌 때, 삼월이가 직접 — Claude 는 허락 없이 이 폰에 adb 금지)
1. PC에서 `node tools/serve.mjs 8123` 실행, PC 크롬으로 `http://localhost:8123/test-qr/` 를 띄워 둔다
2. 폰을 USB로 연결하고 `adb -s R3CM80RH7BH reverse tcp:8123 tcp:8123` → 폰 크롬에서 `http://localhost:8123/captain/` 열기
3. 설정 → 항차 열기 → "QR 스캔" → 카메라 허용 → PC 모니터의 QR 5장을 차례로 비춤 (같은 QR을 오래 비춰도 1번만 등록되는지, 진동·소리)
4. 다른 폰에 손님 QR(`/guest/`)을 만들어 실제 폰 화면 → 폰 카메라로 찍기, 밝은 곳(창가)에서도 시험

## 단계
- [x] 1단계: 뼈대, CLAUDE.md, PWA, 손님용 /guest/
- [x] 2단계: 선장용 설정, 항차, 연속 스캔, 수동 입력, 중복 처리
- [x] 3단계: 신분증 확인, 경고, 확정 잠금, PDF/엑셀, 지난 명부, 명단 합치기, 자동 삭제
- [ ] 4단계: GitHub Pages 배포, 사용 안내 페이지(배에 붙일 안내 QR)
