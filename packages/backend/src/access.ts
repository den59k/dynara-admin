// Per-page access policies: the public `PageAccess` shape and the helpers the
// route builders use to enforce it.

import { HTTPError } from "dynara"

// A per-user predicate deciding whether a user may access something. Receives the
// value `onRequest` resolved (`ctx.user`); the host owns the rule — no DB needed.
export type AccessFn<User = unknown> = (user: User) => boolean | Promise<boolean>

// A page's access policy. A bare function gates the whole page (visibility + every
// operation). The granular object form gates independently: `read` controls
// sidebar visibility and list/item data; `write` controls create/update and
// actions; `delete` controls delete. An unspecified facet defaults to allowed —
// so `{ write: isAdmin }` yields a read-only page for everyone else. Any facet
// that returns false makes its routes 403 and hides the matching UI affordance.
export type PageAccess<User = unknown> = AccessFn<User> | {
  read?: AccessFn<User>,
  write?: AccessFn<User>,
  delete?: AccessFn<User>,
}

// The normalized, always-present internal form.
export type NormalizedAccess = { read: AccessFn<any>, write: AccessFn<any>, del: AccessFn<any> }

const allowAll: AccessFn<any> = () => true

export const normalizeAccess = (access?: PageAccess<any>): NormalizedAccess | undefined => {
  if (!access) return undefined
  if (typeof access === "function") return { read: access, write: access, del: access }
  return { read: access.read ?? allowAll, write: access.write ?? allowAll, del: access.delete ?? allowAll }
}

// Resolves a single facet for a user (true when unrestricted / no policy).
export const canAccess = async (access: NormalizedAccess | undefined, facet: keyof NormalizedAccess, user: any): Promise<boolean> => {
  if (!access) return true
  return !!(await access[facet](user))
}

// Throws 403 unless the user is allowed the given facet. `read` gates data GETs,
// `write` gates create/update/upload/actions, `del` gates delete.
export const requireAccess = async (access: NormalizedAccess | undefined, facet: keyof NormalizedAccess, user: any) => {
  if (!(await canAccess(access, facet, user))) throw new HTTPError("Forbidden", 403)
}
