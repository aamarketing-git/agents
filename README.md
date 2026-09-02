# 나의 커스텀 AI 비서 (고객관리 · AI 코칭 웹앱)

40~60대 개인 영업인을 위한, **내가 이름 지어 준 AI 비서**. 매일 아침 모바일에서 일정관리 → 고객관리 → 자기관리 → 성장 → 성공으로 가는 로드맵을 그려 줍니다.

- 기획서: [docs/PLAN.md](docs/PLAN.md)
- 리서치 1 · 직종·기능·영업 베스트프랙티스: [docs/RESEARCH_MARKET.md](docs/RESEARCH_MARKET.md)
- 리서치 2 · 수익모델(광고 vs 구독): [docs/RESEARCH_MONETIZATION.md](docs/RESEARCH_MONETIZATION.md)
- 리서치 3 · 다음 기능 우선순위: [docs/RESEARCH_NEXT_FEATURES.md](docs/RESEARCH_NEXT_FEATURES.md)
- 광고 연동(AdSense · AdMob): [docs/ADS.md](docs/ADS.md)
- 앱 소스: [app/](app/)

## 바로 열기

- 휴대폰·PC 공용 주소(GitHub Pages): https://aamarketing-git.github.io/agents/  
  휴대폰 브라우저에서 열고 "홈 화면에 추가"하면 앱처럼 사용할 수 있습니다.

## 실행

```bash
cd app
npm install
npm run dev        # http://localhost:5173  (휴대폰에서는 같은 와이파이의 PC IP:5173)
npm run build      # dist/ 생성 (PWA 포함)
npm run preview
```

AI 코칭을 실제 모델로 쓰려면 `app/api/coach.js`를 Vercel 등 서버 함수로 배포하고 `ANTHROPIC_API_KEY`를 설정합니다. 없으면 규칙 기반 로컬 응답으로 동작합니다. 광고는 `app/.env.example` 참고.

## 주요 기능
1. **너는 누구야?** — 사용자가 비서 이름을 직접 지어 줌. 홈 첫 화면 "당신의 커스텀 AI 비서 ○○ 입니다."
2. **오늘 할 일** — 일정별 **7단계 만남 흐름**(일정 → 고객체크 → 몇 번째 만남 → 이전 대화 기억 → 오늘 무엇을 풀어갈까 → 직접 만나기·기록(타자+음성) → AI 피드백). 막대를 누르면 전 단계로.
3. **AI 코치** — 5단계 성장 로드맵 + 제품·사업·SNS 질문 + 성장 노트.
4. **콘텐츠 만들기** — SNS 게시글 · 카톡 메시지 · 교육자료 개요, 복사·카톡 공유.
5. **고객 관리** — 관심도(별점) 기반 연락 주기 자동 계산, 오늘 연락할 고객, 전화·문자 바로가기, CSV 내보내기.
6. **교육센터** — 건강 · 제품 · AI · 사업 · 리더.
7. **리더 대시보드** — 팀(파트너) · 리더 후보 · 그룹 활동 기록.

디자인: 보라 · 초록 · 아이보리, 큰 글자(18px 기본, 3단계 조절), 60px 버튼, 클릭하면 열리는 버튼형 UI.
