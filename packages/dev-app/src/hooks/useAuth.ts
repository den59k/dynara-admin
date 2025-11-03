import { HTTPError, MarciApp } from "@den59k/marci"
import { JwtError, JwtServer } from "../utils/jwt"

const jwt = new JwtServer({ secret: "mechanics-v2" })

export type UserContext = { user: { id: number } }

export const useAuth = (app: MarciApp<UserContext>) => {
  app.addHook("onRequest", async (req) => {
    const auth = req.raw.headers.get('authorization')

    if (!auth || !auth.startsWith("Bearer")) {
      throw new HTTPError("Authorization required", 403)
    }

    const token = auth.slice(7)
    
    try {
      const resp = jwt.verifyAndDecode(token)
      req.user = { id: resp.id }
    } catch(e) {
      if (e instanceof JwtError) {
        throw new HTTPError(e.message, 403)
      }
      console.warn(e)
      throw new HTTPError("Wrong authorization token", 403)
    }
  })
}