import { SQL } from "bun";
import { getCurrentSchema } from "../src/db/get_schema";
import { createTable, updateTable } from "../src/db/migrate_tools";
import { join } from 'node:path'
import type { FullSchema } from "../src/db/schema";

const migrate = async () => {

  const schema = await import(join(process.cwd(), "packages/dev-app/src/plugins/schema")) as FullSchema

  const sql = new SQL('postgres://postgres:5678@localhost:5432/marci-test');
  await sql.connect()

  const currentSchema = await getCurrentSchema(sql)

  const updates: { sql: string, name: string, deps: any[] }[] = []
  for (let table of Object.values(schema)) {
    if (table.name in currentSchema) {
      const sql = updateTable(currentSchema[table.name], table)
      if (!sql) continue

      const deps: string[] = []
  
      updates.push({ sql, deps, name: table.name })

    } else {
      const sql = createTable(table)
      if (!sql) continue

      const deps = Object.values(table.schema)
        .filter(column => typeof column !== "string" && ("ref" in column))
        .map(column => column.ref.name)
  
      updates.push({ sql, deps, name: table.name })
    }
  }  

  updates.sort((a, b) => a.deps.includes(b.name)? 1: b.deps.includes(a.name)? -1: 0)

  console.log(updates.map(i => i.sql).join("\n"))
}

migrate()