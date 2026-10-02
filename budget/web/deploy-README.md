# 찰칵 가계부 — 배포 안내

이 폴더를 인터넷에 올리면 누구나 주소로 여는 가계부 앱이 됩니다. 휴대폰 홈 화면에 앱처럼 설치되고, 인터넷이 끊겨도 열립니다.

| 파일 | 하는 일 |
|---|---|
| `index.html` | 앱 화면 전체 (기록 · 한눈에 · 리포트 · 내 데이터) |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | 홈 화면 설치용 이름·아이콘 |
| `sw.js` | 오프라인에서도 열리게 화면을 저장 |
| `api/extract.js`, `package.json` | 영수증·캡처 사진 읽기 서버 (Claude API) |
| `google-sheet-version/` | 구글 시트에 설치하는 판 (아래 4번) |

## 1. Vercel로 배포 (권장 · 영수증 읽기까지 전부)

준비물: Vercel 계정(무료, 구글이나 GitHub로 가입), Anthropic API 키(console.anthropic.com → API Keys).

**GitHub 저장소에서 가져오기**
1. vercel.com → **Add New… → Project** → GitHub의 `agents` 저장소 선택 → **Import**
2. **Root Directory**를 `budget/deploy`로 바꿈
3. **Environment Variables**에 두 개 추가
   - `ANTHROPIC_API_KEY` = 발급받은 키
   - `APP_PASSCODE` = 내가 정한 비밀번호 (아무나 내 키로 사진을 읽히지 못하게)
4. **Deploy** → 1분 뒤 `https://<이름>.vercel.app` 주소가 나옵니다.
5. 앱을 열고 **내 데이터 → 설정**에 `APP_PASSCODE`와 같은 비밀번호를 넣고 저장합니다. 기기마다 한 번씩 넣으면 됩니다.

**또는 컴퓨터에서 명령 한 줄**: 이 폴더에서 `npx vercel` → 안내대로 진행 → Vercel 대시보드에서 위 환경 변수 두 개를 넣고 `npx vercel --prod`.

## 2. Netlify Drop (가장 쉬움 · 영수증 읽기 제외)

1. app.netlify.com/drop 에 이 폴더를 통째로 끌어다 놓기
2. 바로 주소가 나옵니다.

이 방법은 서버 함수가 없어서 **사진 읽기는 안 되고**, 결제 문자 붙여 넣기·한 줄 입력·한눈에 보기·리포트·CSV는 모두 됩니다. GitHub Pages 같은 다른 정적 호스팅도 같습니다.

## 3. 휴대폰에 설치

- **아이폰**: Safari로 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- **안드로이드**: Chrome으로 주소 열기 → 메뉴(⋮) → **앱 설치** 또는 **홈 화면에 추가**

## 알아 둘 점

- **기록은 각 기기의 브라우저에 저장됩니다.** 휴대폰과 컴퓨터의 기록이 따로이고, 브라우저 데이터를 지우면 함께 지워집니다. **내 데이터 → CSV 내려받기**로 가끔 백업하고, 구글 시트에서 **파일 → 가져오기**로 열 수 있습니다.
- **비용**: 사진 한 장 읽을 때마다 Anthropic API 사용료가 듭니다. 결제 문자·한 줄 입력은 기기 안에서 해석해 무료입니다.
- **비밀번호**: `APP_PASSCODE`를 정하지 않으면 주소를 아는 누구나 내 API 키로 사진을 읽힐 수 있습니다. 꼭 정해 두세요.
- **여러 사람이 쓰려면**: 주소를 알려 주면 각자 자기 기기에 따로 기록합니다. 서로의 기록은 보이지 않습니다.

## 4. 구글 시트 판 (기록이 내 구글 시트에 자동으로 쌓이는 판)

결제 문자 자동 수집(아이폰 단축어), 쿠팡·네이버페이 주문 메일 자동 읽기까지 쓰려면 이 판을 쓰세요.

1. 새 구글 시트 → **확장 프로그램 → Apps Script**
2. `google-sheet-version/`의 `Code.gs`, `Logic.gs`, `Claude.gs`, `Index.html`(HTML 파일로)을 같은 이름으로 만들어 붙여 넣기. 프로젝트 설정에서 ‘appsscript.json 표시’를 켜고 `appsscript.json`도 붙여 넣기
3. 프로젝트 설정 → 스크립트 속성에 `ANTHROPIC_API_KEY` 추가
4. 편집기에서 `setup` 실행 → 권한 허용
5. **배포 → 새 배포 → 웹 앱** (실행: 나, 액세스: 모든 사용자)
6. 시트 메뉴 **가계부 → 앱 주소 보기**의 주소를 휴대폰에서 열기
