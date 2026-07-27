// The dev app itself: build a panel out of the modules around this file, mount
// it on a dynara router, and serve.
//
// dynara-admin is imported straight from the local package source (not the
// built `dist`) so this harness dogfoods whatever you're editing in
// `packages/backend` with no build step — `bun --watch` reloads on every change.

import { Router } from "dynara"
import { createAdminPanel } from "../../backend/src/main"
import { registerAuth, type User } from "./auth"
import { db } from "./db"
import { serveUploads } from "./uploads"
import dashboard from "./pages/dashboard"
import posts from "./pages/posts"
import tags from "./pages/tags"
import users from "./pages/users"

const admin = createAdminPanel<User>({ title: "Dynara Dev App" })

registerAuth(admin)

// One file per page, each a plugin the panel calls when it mounts. Registration
// order is sidebar order.
admin.register(users)
admin.register(tags)
admin.register(posts)
admin.register(dashboard)

const app = new Router()
app.register(admin)
serveUploads(app)

const port = Number(process.env.PORT ?? 3000)
await app.listen(port)

// Release the embedded DB handle (and its temp dir) on a clean shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    db.close()
    process.exit(0)
  })
}

console.log(`\n  Dynara dev app → http://localhost:${port}/admin`)
console.log(`  Login with  admin / admin\n`)
