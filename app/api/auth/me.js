import { json } from '../_lib/http.js'
import { authEnabled, getUser } from '../_lib/auth.js'
import { cloudEnabled } from '../_lib/db.js'
export default async function handler(req, res) {
  const user = await getUser(req)
  json(res, 200, { user, cloud: authEnabled, persistent: cloudEnabled })
}
