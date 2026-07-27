// Who the panel lets in. `User` is what every page handler receives as
// `ctx.user`, so it lives here with the login method that produces it.

import type { AdminPanel } from "../../backend/src/main"

export type User = { id: number; name: string; role: "admin" | "viewer" }

// Two accounts so the access-control demo has something to show: `admin` has
// full access; `viewer` is read-only and can't see the Users page at all.
const ACCOUNTS: Record<string, User> = {
  admin: { id: 1, name: "admin", role: "admin" },
  viewer: { id: 2, name: "viewer", role: "viewer" },
}

// The predicate the pages gate themselves on — as a bare `access` (the whole
// page) or under `write`/`delete` (parts of it).
export const isAdmin = (user: User) => user.role === "admin"

export const registerAuth = (admin: AdminPanel<User>) => {
  admin.registerAuthMethod({
    title: "Sign in (admin/admin or viewer/viewer)",
    fields: { login: "string", password: "string" },
    onLogin: async ({ login, password }) => {
      // Demo-only: the token is the username; a real app would sign a JWT.
      if (ACCOUNTS[login] && password === login) return { token: login }
      return null
    },
    onRequest: async (token) => ACCOUNTS[token] ?? null,
  })
}
