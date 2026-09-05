/* 웹 푸시용 VAPID 키 생성 : node scripts/gen-vapid.mjs → 출력값을 Vercel 환경변수에 넣기 */
import webpush from 'web-push'
const k = webpush.generateVAPIDKeys()
console.log('VAPID_PUBLIC_KEY=' + k.publicKey)
console.log('VAPID_PRIVATE_KEY=' + k.privateKey)
console.log('VAPID_SUBJECT=mailto:you@example.com')
