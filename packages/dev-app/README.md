# dev-app

A runnable demo that dogfoods **`dynara-admin`** against an **embedded MarciDB**
([`marcidb-embedded`](https://www.npmjs.com/package/marcidb-embedded)). It's the
fixture app the panel is developed and (eventually) e2e-tested against — not
published.

## Run it

```bash
bun install                       # from the repo root
bun run --filter dev-app dev      # or: cd packages/dev-app && bun run dev
```

Then open <http://localhost:3000/admin> and log in with **`admin` / `admin`**.
Set `PORT` to use a different port.

`dev` runs under `bun --watch`; because the panel is imported straight from
`packages/backend/src` (not the built `dist`), editing the backend source
reloads the running panel — no build step.

## What it shows

- **Auth** — a single-account login gate (`admin` / `admin`).
- **Users page** — full CRUD with list pagination, per-column sorting, and
  free-text search (by name).
- **Posts page** — CRUD plus a foreign-key **`reference` field** (`authorId`)
  that renders as a searchable select backed by the Users page.

All data lives in an **ephemeral** embedded MarciDB: a fresh temp-dir database
(fsync off) created on start and wiped on exit. The `.marci` schema is applied
declaratively with `$sync`, and [`src/db.ts`](src/db.ts) seeds 25 users and
40 posts so the panel isn't empty. For a persistent DB, swap `openTestDatabase`
for `openDatabase("./data")` + `db.migrate("./migrations")`.

## Files

| Path | What |
|---|---|
| [`schema.marci`](schema.marci) | The MarciDB schema (`User`, `Post`) |
| [`src/db.ts`](src/db.ts) | Opens the embedded DB, `$sync`s the schema, seeds data, exports the typed client |
| [`src/main.ts`](src/main.ts) | The dynara app: auth + the Users/Posts panel pages |
| `src/db/` | The typed client generated from `schema.marci` (committed) |
| `migrations/` | Migration emitted by `marcidb generate` (unused by `$sync`; kept for the persistent-DB path) |

## Regenerating the client

After editing `schema.marci`, regenerate the typed client (and the next
migration):

```bash
bun run generate     # marcidb generate schema.marci src/db
```
