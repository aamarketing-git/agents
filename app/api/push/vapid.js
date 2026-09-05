import { json } from '../_lib/http.js'
import { pushEnabled, vapidPublicKey } from '../_lib/push.js'
export default async function handler(req, res) { json(res, 200, { enabled: pushEnabled, publicKey: vapidPublicKey }) }
