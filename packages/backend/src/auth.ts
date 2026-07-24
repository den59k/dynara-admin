// Authentication: resolving the user from a request, the onRequest hook that
// guards every API route, and the login endpoints.

import { HTTPError, type Router } from "dynara"
import type { SchemaItem } from "compact-json-schema"
import type { PanelState } from "./types.ts"

// Resolves the authenticated user from a request, or throws the HTTPError the
// client should see. The token is read from the `Authorization: Bearer` header,
// falling back to a `?token=` query param (browsers cannot set headers on a
// dynamic `import()`, so `/admin/custom/*` relies on the query form).
export const authenticate = async (state: PanelState, req: Request): Promise<any> => {
  let token = req.headers.get("Authorization")
  if (token?.startsWith("Bearer ")) token = token.slice(7)
  if (!token) token = new URL(req.url).searchParams.get("token")
  if (!token) throw new HTTPError("Authorization required", 403)
  const user = await state.authMethod!.onRequest(token)
  if (!user) throw new HTTPError("Invalid token", 401)
  return user
}

// Installs the auth hook and the login endpoints. No-op when no auth method is
// registered — the panel then runs open, with `ctx.user` undefined.
export const installAuthRoutes = (state: PanelState, app: Router) => {
  const { authMethod, apiBase } = state
  if (!authMethod) return

  app.addHook("onRequest", async (req) => {
    // Exempt only the exact auth endpoint — matching a suffix would exempt any
    // URL ending in "/auth" (e.g. a string primary key or a componentData name).
    if (new URL(req.raw.url).pathname === `${apiBase}/auth`) return
    ;(req as any).user = await authenticate(state, req.raw)
  })

  app.get(`${apiBase}/auth`, () => {
    return { title: authMethod.title, fields: authMethod.fields }
  })
  const loginSchema: SchemaItem = authMethod.fields
  app.post(`${apiBase}/auth`, [{}, loginSchema], async (req) => {
    const result = await authMethod.onLogin(req.body)
    if (!result) throw new HTTPError("Invalid credentials", 401)
    return { token: result.token }
  })
}
