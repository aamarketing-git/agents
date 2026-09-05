# Vercel 배포 가이드 (베타 · 계정 · 클라우드 저장 · 알림)

## 0. 구성 요약
- 한 프로젝트에 프론트(React, `app/dist`)와 서버 함수(`app/api/*`)를 함께 배포합니다.
- 데이터: Upstash Redis(Vercel 마켓플레이스, 무료 티어). 사용자별 상태 문서 1개(`state:{uid}`), 계정(`user:*`), 푸시 구독(`push:{uid}`), AI 사용량(`usage:{uid}:{날짜}`).
- 인증: 이메일+비밀번호(scrypt 해시), 30일 httpOnly 쿠키 세션(HS256 JWT).
- 3단계 기능: 아침 브리핑 푸시(매일 07:30 KST 크론), 주간 리포트(월 08:00 KST), 만남 기록 AI 자동 정리, 클라우드 동기화. 베타 기간에는 `BETA_ALL_ACCESS=1`로 모든 가입자에게 프리미어 기능 개방.

## 1. Vercel 프로젝트 만들기
1. https://vercel.com → Add New → Project → GitHub 저장소 `aamarketing-git/agents` 선택.
2. **Root Directory 를 `app` 으로 지정** (Edit 클릭). Framework: Vite 자동 인식. Build `npm run build`, Output `dist` (vercel.json 에 명시됨).
3. Production Branch 를 `claude/new-session-6pgmjv` (또는 main 으로 옮긴 뒤 main)로 설정.

## 2. 저장소 연결
### 2-1. Blob (자료실 파일)
Vercel 프로젝트 → Storage → **Blob** → Create → Connect. `BLOB_READ_WRITE_TOKEN` 이 자동으로 들어갑니다. 파일당 4MB 제한, 사용자별 경로(`{uid}/…`)로 저장됩니다.

### 2-2. Redis (계정·데이터)
1. Vercel 프로젝트 → Storage → **Upstash for Redis** (Marketplace) → Create → 프로젝트에 Connect.
2. 자동으로 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경변수가 들어갑니다. (Upstash 콘솔에서 만들었다면 `UPSTASH_REDIS_REST_URL/TOKEN` 도 인식)

## 3. 환경변수 (Settings → Environment Variables)
| 이름 | 값 | 용도 |
|---|---|---|
| `AUTH_SECRET` | 긴 임의 문자열 (`openssl rand -hex 32`) | 세션 서명. **없으면 로그인 기능이 꺼지고 기기 전용 모드로 동작** |
| `ANTHROPIC_API_KEY` | Anthropic 콘솔 키 | AI 코칭·에이전트·자동 정리 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `cd app && node scripts/gen-vapid.mjs` 출력 | 웹 푸시 알림 |
| `CRON_SECRET` | 임의 문자열 | 크론 엔드포인트 보호 (Vercel 이 자동으로 헤더에 넣어 호출) |
| `BETA_ALL_ACCESS` | `1` | 베타: 전원 프리미어. 정식 출시 시 `0` |
| `BLOB_READ_WRITE_TOKEN` | Storage → **Blob** 생성·연결 시 자동 | 자료실 파일(PDF·이미지) 저장. 없으면 파일은 기기 안(IndexedDB)에만 저장 |
| `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_SLOT_LIST` | 선택 | 광고 |
| `VITE_KAKAO_JS_KEY` | 선택 | 카카오톡 보내기 |

저장 후 **Redeploy** 하세요 (VITE_ 변수는 빌드 시 반영).

## 4. 크론
`app/vercel.json` 에 정의되어 있어 배포하면 자동 등록됩니다.
- `/api/cron/morning` 매일 22:30 UTC = **07:30 KST** 아침 브리핑
- `/api/cron/weekly` 일요일 23:00 UTC = **월요일 08:00 KST** 주간 리포트
Hobby 플랜은 크론이 하루 1회 실행 제한이 있어 위 스케줄은 그대로 동작합니다.

## 5. 배포 후 확인
1. `https://<프로젝트>.vercel.app/api/health` → `{"ok":true,"cloud":true,"ai":true,"push":true,"beta":true}` 인지 확인.
2. 앱 첫 화면이 **로그인** 화면인지 확인 → 가입 → 온보딩 → 고객 등록 → 다른 기기에서 같은 계정 로그인 → 같은 데이터 표시.
3. 설정 → 내 계정 → "아침 브리핑 알림 켜기" → 테스트 알림 수신. (아이폰은 홈 화면에 추가한 앱에서만 가능)
4. 비서 탭에서 "오늘 연락할 고객 누구야?" → AI 에이전트 응답(연결 표시 ✅).
5. 만남 기록 6단계 → "자동 정리" → 반응·관심도·단계·다음 행동 자동 채움.
6. 자료실 → PDF 업로드 → AI가 요약·핵심·태그·고객 전달 문장 생성 → 비서에게 "○○ 자료 찾아줘" → 자료 근거로 답변.

## 6. 운영 메모
- 비밀번호 재설정은 베타 미구현. Upstash 콘솔에서 `user:email:{이메일}` → `user:{id}` 의 `pass` 를 삭제 후 사용자가 재가입하거나, 운영자가 임시 비밀번호 해시를 넣어 주세요. 정식 출시 전 이메일 발송(Resend 등) 기반 재설정을 추가할 것.
- 개인정보: 고객 데이터는 사용자 계정 문서에만 저장되며 광고·분석에 쓰지 않습니다. 개인정보처리방침에 Upstash(저장)·Anthropic(AI 처리, 국외 이전) 명시 필요.
- 로컬 통합 테스트: `cd app && npm run build && AUTH_SECRET=dev node scripts/dev-server.mjs` → http://127.0.0.1:4180 (메모리 DB).
- GitHub Pages 배포(`/agents/`)는 서버가 없어 자동으로 "기기 전용 모드"로 동작합니다.
