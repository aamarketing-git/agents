/**
 * Claude API 호출 — 영수증·주문 캡처·주문 메일에서 결제 정보를 뽑습니다.
 * Apps Script에는 공식 SDK가 없어 UrlFetchApp으로 Messages API를 직접 부릅니다.
 * API 키: 프로젝트 설정 → 스크립트 속성 → ANTHROPIC_API_KEY
 */

var CLAUDE_MODEL = 'claude-opus-5-5';

// 파일 로드 순서와 무관하도록 함수로 만듭니다 (EXPENSE_CATS는 Logic.gs).
function extractSchema_() {
  return {
  type: 'object',
  additionalProperties: false,
  required: ['is_transaction', 'type', 'date', 'time', 'merchant', 'payment_method', 'total', 'items', 'business_likely'],
  properties: {
    is_transaction: { type: 'boolean', description: '결제·입금 내역이 맞으면 true' },
    type: { type: 'string', enum: ['지출', '수입'] },
    date: { type: 'string', description: 'YYYY-MM-DD, 알 수 없으면 빈 문자열' },
    time: { type: 'string', description: 'HH:mm (24시간), 알 수 없으면 빈 문자열' },
    merchant: { type: 'string', description: '가게·판매처·보낸 사람 이름. 예: 쿠팡, 이마트 성수점' },
    payment_method: { type: 'string', description: '카드사·결제수단. 예: 신한카드, 네이버페이, 현금. 모르면 빈 문자열' },
    total: { type: 'integer', description: '실제로 결제한 최종 금액(원). 할인·포인트 반영 후' },
    business_likely: { type: 'boolean', description: '사무용품·소프트웨어·촬영장비 등 일(프리랜서 사업)에 쓴 것으로 보이면 true' },
    items: {
      type: 'array',
      description: '품목별 줄. 품목을 알 수 없으면 가게 이름 한 줄',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount', 'category', 'sub'],
        properties: {
          name: { type: 'string', description: '품목 이름을 짧게. 예: 하기스 기저귀 대형 1팩' },
          amount: { type: 'integer', description: '이 품목에 낸 금액(원, 수량 반영)' },
          category: { type: 'string', enum: EXPENSE_CATS.concat(INCOME_CATS) },
          sub: { type: 'string', description: '소분류. 예: 장보기, 배달, 카페, 육아, 구독' }
        }
      }
    }
  }
  };
}

function extractSystemPrompt_(today, rules) {
  var ruleText = (rules || []).slice(0, 60).map(function (r) {
    return '- "' + r.keyword + '" → ' + r.cat + (r.sub ? '/' + r.sub : '') + (r.biz ? ' (' + r.biz + ')' : '');
  }).join('\n');
  return [
    '당신은 한국 가계부 앱의 영수증·결제내역 읽기 담당입니다. 프리랜서와 일하는 주부가 올린 영수증 사진, 쇼핑앱 주문내역 캡처, 주문확인 메일에서 결제 정보를 정확히 뽑아 JSON으로 돌려줍니다.',
    '오늘 날짜는 ' + today + ' 입니다. 연도가 안 보이면 오늘에 가장 가까운 과거 날짜로 판단하세요.',
    '',
    '규칙:',
    '- total은 실제로 결제된 최종 금액입니다. 할인·쿠폰·포인트 사용 후 금액, 배송비 포함.',
    '- items의 amount 합이 total과 같도록 나누세요. 할인은 품목에 나눠 반영하기 어려우면 그대로 두세요(앱이 차액을 조정합니다).',
    '- 한 결제에 성격이 다른 물건이 섞여 있으면 품목마다 category를 따로 정하세요. 예: 기저귀는 육아·교육, 과자는 식비, 세제는 생활·쇼핑.',
    '- 지출 대분류: 고정비(월세·관리비·통신·보험·구독), 식비(장보기·외식·카페·배달·편의점), 생활·쇼핑, 육아·교육, 교통, 건강, 경조사, 사업경비(일에 쓴 비용), 기타.',
    '- 수입 대분류: 사업소득(거래처 입금·원고료·용역비), 근로소득(급여), 기타수입(환급·이자·중고판매).',
    '- 결제·입금 내역이 아닌 이미지나 메일(광고, 배송 안내만 있는 메일 등)이면 is_transaction을 false로 하고 나머지는 빈 값·0으로 채우세요.',
    '- 금액이 안 보이거나 확실하지 않은 칸은 지어내지 말고 빈 문자열이나 0으로 두세요.',
    ruleText ? '\n이 사용자가 직접 고친 분류 규칙입니다. 해당하면 따르세요:\n' + ruleText : ''
  ].join('\n');
}

/**
 * @param {Array} content Messages API user content 블록들 (image/document/text)
 * @return {Object} extractSchema_() 모양의 결과
 */
function claudeExtract_(content, today, rules) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았어요. 스크립트 속성에 API 키를 넣어 주세요.');

  var body = {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: extractSystemPrompt_(today, rules),
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: extractSchema_() } },
    fallbacks: 'default',
    messages: [{ role: 'user', content: content }]
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  var res, code, attempt = 0;
  while (true) {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
    code = res.getResponseCode();
    // 429(요청 과다)·5xx·529(과부하)는 잠시 뒤 다시 시도
    if ((code === 429 || code >= 500) && attempt < 2) {
      attempt++;
      Utilities.sleep(2000 * attempt);
      continue;
    }
    break;
  }
  var json;
  try { json = JSON.parse(res.getContentText()); } catch (e) { json = null; }
  if (code !== 200 || !json) {
    var msg = json && json.error ? json.error.type + ': ' + json.error.message : 'HTTP ' + code;
    if (code === 401) msg = 'API 키가 올바르지 않아요 (401).';
    throw new Error('영수증 읽기 실패 — ' + msg);
  }
  if (json.stop_reason === 'refusal') throw new Error('이 이미지는 읽을 수 없어요. 다른 사진으로 시도해 주세요.');
  if (json.stop_reason === 'max_tokens') throw new Error('영수증이 너무 길어 끝까지 읽지 못했어요. 나눠서 올려 주세요.');

  var text = '';
  (json.content || []).forEach(function (b) { if (b.type === 'text') text += b.text; });
  return JSON.parse(text);
}

function imageBlock_(base64, mime) {
  if (mime === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: mime, data: base64 } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };
}
