# 에이전트 컴퍼니 (virtual-office)

가상 사무실(3D 로우폴리, Three.js)에서 역할별 에이전트가 걸어 다니며 일하는 회사 데모.
CEO에게 목표를 지시하면 회의실 집결 → 병렬 작업 → 검수 → 최종 보고 흐름이 맵 위에 표시됩니다.

```bash
cd virtual-office
npm install
npm run dev      # http://localhost:5173
npm run build
```

## 구조
- `src/office.js`  방·벽·책상 생성, 좌석/회의실 좌표
- `src/agents.js`  에이전트 캐릭터, 복도 경유 이동, 직원 명단
- `src/sim.js`     업무 흐름 실행기(이동·말풍선·로그)
- `src/brain.js`   **목표 → 계획** 인터페이스. 지금은 규칙 기반 목(mock)

## 다음 단계 (실제 AI 연결)
`brain.js`의 `plan(goal)`을 서버 함수(Claude API) 호출로 바꾸면, 각 단계 `result`를 에이전트별 실제 산출물로
채울 수 있습니다. 이후: 에이전트 추가/역할 편집, 산출물 저장, 실시간 다중 접속(WebSocket).
