# shop-order — 소상공인 주문·결제 시트앱 (토스페이먼츠)

로그인 없이 상품 수량 선택 → 토스 결제 → 구글 시트에 주문 저장, 이름+전화로 주문 조회.

| 파일 | 역할 |
|---|---|
| `Code.gs` | Google Apps Script 백엔드 (상품/주문/결제승인/조회, JSONP) |
| `index.html` | 주문서 (상품 선택, 주소, 토스 결제 요청) |
| `order-status.html` | 내 주문 조회 |
| `fail.html` | 결제 실패 페이지 |
| `success.html` | **아직 없음** — 토스 successUrl, `action=confirm` 호출 필요 |

## 설정 위치
- `Code.gs` → `TOSS_SECRET_KEY` (test_sk_…)
- `index.html` → `API_URL`, `TOSS_CLIENT_KEY` (test_ck_…), `SHOP_NAME`
- `order-status.html` → `API_URL`

키 값은 실제 값으로 커밋하지 말 것 (특히 시크릿키).
