// "두뇌" 인터페이스: 목표 문장 -> 실행 계획.
// 지금은 규칙 기반 목(mock)입니다. 실제 Claude 연동 시 plan()만 서버 API 호출로 교체하면 됩니다.
//   예) const res = await fetch('/api/plan', { method:'POST', body: JSON.stringify({ goal }) }); return res.json();
//
// 계획 형식:
// { summary, phases: [ { meet?: '회의 때 CEO가 할 말', work: [ { agent, doing, result, ms } ] } ] }

export async function plan(goal) {
  const g = goal.trim();
  return {
    summary: `「${g}」 완료 보고`,
    phases: [
      { meet: `이번 목표는 「${g}」입니다. 나래가 정리하고 모두 병렬로 진행합시다.` },
      { work: [{ agent: 'planner', doing: '요구사항·범위 정리 중…', result: `「${g}」 요구사항 문서 v1 작성`, ms: 3500 }] },
      { work: [
        { agent: 'dev',      doing: '핵심 기능 구현 중…',     result: '핵심 기능 구현 완료',          ms: 4500 },
        { agent: 'designer', doing: '화면 시안 그리는 중…',   result: '메인 화면 시안 3종 제작',       ms: 4000 },
        { agent: 'marketer', doing: '홍보 문구 작성 중…',     result: '홍보 카피·SNS 게시글 초안 작성', ms: 3500 },
      ] },
      { work: [{ agent: 'qa', doing: '테스트·검수 중…', result: '검수 통과 (이슈 0건)', ms: 3000 }] },
      { meet: '모두 수고했습니다. 결과를 합쳐 최종 보고하겠습니다.' },
    ],
  };
}
