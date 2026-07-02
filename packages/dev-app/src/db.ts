import { readFileSync } from "node:fs"
import { openTestDatabase } from "marcidb-embedded"
import { marcidb, type MarciDB } from "./db/index.js"

// The dev-app runs against an *embedded, ephemeral* MarciDB: a fresh temp-dir
// database with fsync off, wiped when the process exits. `$sync` applies the
// `.marci` schema declaratively, so every start comes up on the current schema
// with a clean slate — ideal for a demo / e2e fixture. For a persistent dev DB,
// swap `openTestDatabase(schema)` for `openDatabase("./data")` + `db.migrate("./migrations")`.
const schema = readFileSync(new URL("../schema.marci", import.meta.url), "utf8")

export const db = await openTestDatabase(schema)
export const client: MarciDB = marcidb(db)

// Seed a bit of data so the panel isn't empty on first load. Guarded on count so
// it stays idempotent if this module is ever re-imported against a live DB.
if ((await client.user.count()) === 0) {
  await seed()
}

async function seed() {
  const firstNames = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi", "Ivan", "Judy"]
  const lastNames = ["Smith", "Jones", "Lee", "Garcia", "Nguyen"]

  const userIds: number[] = []
  // 25 users so the pagination UI has more than one page to page through.
  for (let i = 0; i < 25; i++) {
    const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`
    const { id } = await client.user.insert({
      name,
      email: `user${i + 1}@example.com`,
      age: 20 + (i % 40),
    })
    userIds.push(id)
  }

  const titles = [
    "Getting started", "Release notes", "A deep dive", "Weekly update",
    "Design decisions", "Roadmap", "Postmortem", "How it works",
  ]
  for (let i = 0; i < 40; i++) {
    await client.post.insert({
      title: `${titles[i % titles.length]} #${i + 1}`,
      body: i % 3 === 0 ? null : "Lorem ipsum dolor sit amet.",
      published: i % 2 === 0,
      author: { id: userIds[i % userIds.length]! },
    })
  }
}
