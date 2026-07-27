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
- **Image uploads** — the Users form's `avatar` is an `image` field declared
  `imageSize: [512, 512]`, so a picked picture is cropped square on the spot (with
  a **Crop** button to adjust where), and the stored avatar is square. Its `.upload()` handler compresses with
  [`sharp`](https://sharp.pixelplumbing.com): both the 512×512 image and its
  240×240 thumbnail are re-encoded to WebP, EXIF and GPS tags dropped along the
  way, and the pair is stored as `{ src, previewSrc, size }`. The table's
  thumbnail column and the form's preview load the small one. A field without
  `imageSize` just fits inside a max width; non-images are stored as they arrived.

Uploaded files live in a temp dir created at startup and are served from
`/uploads/:name` — the panel only ever stores the `src` a handler returns, so
hosting the bytes is the app's job.

All data lives in an **ephemeral** embedded MarciDB: a fresh temp-dir database
(fsync off) created on start and wiped on exit. The `.marci` schema is applied
declaratively with `$sync`, and [`src/db.ts`](src/db.ts) seeds 25 users and
40 posts so the panel isn't empty. For a persistent DB, swap `openTestDatabase`
for `openDatabase("./data")` + `db.migrate("./migrations")`.

## Files

One file per page: each `src/pages/*.ts` default-exports a function that takes
the panel and configures it, and [`src/main.ts`](src/main.ts) hands them to
`admin.register()` — the same shape as the file-based pages in the
[dynara-admin quick start](../backend/README.md#quick-start), minus the glob.

| Path | What |
|---|---|
| [`schema.marci`](schema.marci) | The MarciDB schema (`User`, `Post`, `Tag`) |
| [`src/main.ts`](src/main.ts) | Builds the panel from the modules below and serves it |
| [`src/auth.ts`](src/auth.ts) | The `User` type, the demo accounts, and the login method |
| [`src/uploads.ts`](src/uploads.ts) | Stores an upload (`sharp` compression) and serves `/uploads/:name` |
| [`src/pages/users.ts`](src/pages/users.ts) | Users: filters, image upload, rows table, custom component, row/bulk actions |
| [`src/pages/tags.ts`](src/pages/tags.ts) | Tags: minimal CRUD, feeds the Posts relation list |
| [`src/pages/posts.ts`](src/pages/posts.ts) | Posts: reference select, relation list, chips field, keyset pagination |
| [`src/pages/dashboard.ts`](src/pages/dashboard.ts) | The home dashboard's stat cards and Vue widget |
| [`src/db.ts`](src/db.ts) | Opens the embedded DB, `$sync`s the schema, seeds data, exports the typed client |
| `src/db/` | The typed client generated from `schema.marci` (committed) |
| `migrations/` | Migration emitted by `marcidb generate` (unused by `$sync`; kept for the persistent-DB path) |

## Regenerating the client

After editing `schema.marci`, regenerate the typed client (and the next
migration):

```bash
bun run generate     # marcidb generate schema.marci src/db
```
