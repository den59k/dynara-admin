import type { SQL } from "bun"

export type PgColumn = {
  type: string
  nullable: boolean
  default?: string | null
  primaryKey?: boolean
  unique?: boolean
  // для FK
  references?: {
    table: string
    column: string
    onDelete?: string | null
    onUpdate?: string | null
    constraintName?: string // если есть из интроспекции
  }
}

export type PgTable = Record<string, PgColumn>


export const getCurrentSchema = async (sql: SQL): Promise<Record<string ,PgTable>> => {
  const rows = await sql`
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  is_identity,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
    `

  const pks = await sql`
SELECT
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
AND tc.table_schema = 'public';
    `

  const fks = await sql`
SELECT
    con.conname AS constraint_name,
    tbl.relname AS table_name,
    col.attname AS column_name,
    f_sch.nspname AS foreign_schema_name,
    f_tbl.relname AS foreign_table_name,
    f_col.attname AS foreign_column_name,
    con.confupdtype AS on_update_action_code,
    con.confdeltype AS on_delete_action_code,
    CASE con.confupdtype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
    END AS on_update,
    CASE con.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
    END AS on_delete
FROM pg_constraint con
INNER JOIN pg_class tbl ON tbl.oid = con.conrelid
INNER JOIN pg_namespace sch ON sch.oid = tbl.relnamespace
INNER JOIN pg_class f_tbl ON f_tbl.oid = con.confrelid
INNER JOIN pg_namespace f_sch ON f_sch.oid = f_tbl.relnamespace
INNER JOIN pg_attribute col ON col.attnum = ANY(con.conkey) AND col.attrelid = tbl.oid
INNER JOIN pg_attribute f_col ON f_col.attnum = ANY(con.confkey) AND f_col.attrelid = f_tbl.oid
WHERE con.contype = 'f'
ORDER BY sch.nspname, tbl.relname, con.conname;
    `

  const schema: Record<string, any> = {}

  for (const row of rows) {
    const {
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default,
      is_identity
    } = row

    if (!schema[table_name]) {
      schema[table_name] = {}
    }

    schema[table_name][column_name] = {
      type: data_type,
      nullable: is_nullable === "YES",
      default: is_identity === "YES"? 'inc': (column_default ?? undefined)
    }
  }

  for (const pk of pks) {
    schema[pk.table_name][pk.column_name].primaryKey = true
  }

  for (const fk of fks) {
    schema[fk.table_name][fk.column_name].references = {
      table: fk.foreign_table_name,
      column: fk.foreign_column_name,
      onDelete: fk.on_delete === "NO ACTION"? undefined: fk.on_delete,
      onUpdate: fk.on_update === "NO ACTION"? undefined: fk.on_update
    }
  }

  return schema
}