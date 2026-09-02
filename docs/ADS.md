# 광고 연동 가이드 (AdSense · AdMob)

## 원칙 (리서치 결론)
- 고객 정보 화면(고객 목록·상세·만남 기록)에는 광고를 두지 않음. AdSense 정책상 "콘텐츠 없는 화면(대시보드·내비게이션)" 게재 금지이기도 함.
- 광고 자리는 **교육센터**, **콘텐츠 만들기** 하단 두 곳(`<AdSlot />`). 프리미엄 사용자는 렌더링하지 않음.
- 앱(네이티브)에서는 상시 배너 대신 **사용자가 직접 누르는 리워드 광고**("광고 보고 AI 5회 충전")만 권장.

## 1. 웹 · Google AdSense
1. AdSense 승인용으로 정적 콘텐츠(랜딩, 영업 노하우 글)가 있는 도메인을 먼저 준비. SPA만으로는 "가치 낮은 콘텐츠"로 거절되기 쉬움.
2. 승인 후 `app/.env`:
   ```
   VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
   VITE_ADSENSE_SLOT_LIST=1234567890
   ```
3. `app/public/ads.txt`에 발급 줄 추가:
   ```
   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
   ```
4. `AdSlot`은 스크립트를 한 번만 로드하고, 마운트마다 `adsbygoogle.push({})`를 호출. 라우트 이동 시 새 `<ins>`가 마운트되므로 "already have ads" 오류가 나지 않음.
5. 카카오 애드핏(웹 스크립트)도 같은 위치에 보조로 넣을 수 있음(최소 지급 ₩50,000).

## 2. 앱 · Google AdMob (Capacitor)
AdMob은 PWA에서 동작하지 않음. Capacitor로 래핑한 뒤 네이티브 플러그인 사용.

```bash
cd app
npm i @capacitor/core @capacitor/cli @capacitor-community/admob
npx cap init "나의 커스텀 AI 비서" com.example.aisecretary --web-dir dist
npm run build && npx cap add android && npx cap add ios && npx cap sync
```

- Android `AndroidManifest.xml`:
  ```xml
  <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-XXXX~YYYY"/>
  ```
- iOS `Info.plist`: `GADApplicationIdentifier`, `SKAdNetworkItems`.
- 코드 예시 (`src/lib/admob.js`로 분리 권장):
  ```js
  import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob'
  export async function initAds() {
    await AdMob.initialize()
    const info = await AdMob.requestConsentInfo()
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') await AdMob.showConsentForm()
  }
  export async function watchRewardForAiCredits(onReward) {
    AdMob.addListener(RewardAdPluginEvents.Rewarded, onReward)
    await AdMob.prepareRewardVideoAd({ adId: 'ca-app-pub-XXXX/ZZZZ' })
    await AdMob.showRewardVideoAd()
  }
  ```
- `AdSlot`은 `window.Capacitor.isNativePlatform()`이 true면 스스로 비워지므로, 네이티브에서는 위 리워드 흐름을 설정 화면의 "AI 충전" 버튼에 연결.
- 개인정보처리방침에 광고 SDK의 기기 식별자 수집을 명시하고, iOS ATT 및 UMP 동의를 반드시 표시.

## 3. 프리미엄 상태와의 관계
`state.profile.premium === true` 이면 `AdSlot` 미표시. 결제 연동(웹 PG → 앱 스토어 결제) 후 이 값을 서버 검증 결과로 채우면 됨.
