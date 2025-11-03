import { RawSQL, type FullSchema, type GetInclude, type GetSelect, type GetWhere, type SchemaInsertType, type SchemaReturnType, type SchemaReturnTypeOpt, type SchemaUpdateType, type Table, type TableSchema } from './schema'
import { SQL } from 'bun'
import { createAliases, generateSelect, generateWhere } from './tools'

type ReturnData<T extends Table, A extends FullSchema> = 
  { returning<S extends GetSelect<T["schema"], A>>(select: S): Promise<SchemaReturnTypeOpt<T["schema"], A, S>> }

type SelectOptions <T extends Table, A extends FullSchema> = {
  select?: GetSelect<T["schema"], A>,
  include?: GetInclude<T["schema"], A>,
  take?: number,
  skip?: number,
  where?: GetWhere<T["schema"], A> | RawSQL
}

// type UpdateOptions <T extends Table, A extends FullSchema> = {
//   where: GetWhere<T["schema"], A>,
//   data: SchemaUpdateType<T["schema"], A>
// }

// type DeleteOptions <T extends Table, A extends FullSchema> = {
//   where: GetWhere<T["schema"], A>
// }

type MarciData<T extends FullSchema> = {
  connect(): Promise<void>
} & {
  [ K in keyof T ]: {
    // find<S extends GetSelect<T[K], T> | undefined, I extends GetInclude<T[K], T> | undefined>(options: { select?: S, include?: I }): Promise<
    //   S extends GetSelect<T[K], T> ?  SchemaReturnTypeOpt<T[K], T, S> : 
    //   I extends GetInclude<T[K], T> ? SchemaReturnType<T[K], T> :
    //     SchemaReturnType<T[K], T>
    // >,
    findFirst<O extends SelectOptions<T[K], T>>(options?: O): 
      O extends { select: any } ? Promise<SchemaReturnTypeOpt<T[K]["schema"], T, O["select"]>> :
      O extends { include: any } ? Promise<SchemaReturnType<T[K]["schema"], T> & SchemaReturnTypeOpt<T[K]["schema"], T, O["include"]>> :
        Promise<SchemaReturnType<T[K]["schema"], T> | null>

    findFirstOrThrow<O extends SelectOptions<T[K], T>>(options?: O): 
      O extends { select: any } ? Promise<SchemaReturnTypeOpt<T[K]["schema"], T, O["select"]>> :
      O extends { include: any } ? Promise<SchemaReturnType<T[K]["schema"], T> & SchemaReturnTypeOpt<T[K]["schema"], T, O["include"]>> :
        Promise<SchemaReturnType<T[K]["schema"], T>>

    // find<S extends GetSelect<T[K], T>>(options: { include: S, select?: never }): Promise<SchemaReturnType<T[K], T> & SchemaReturnTypeOpt<T[K], T, S>>,

    findMany<O extends SelectOptions<T[K], T>>(options?: O): 
      O extends { select: any } ? Promise<SchemaReturnTypeOpt<T[K]["schema"], T, O["select"]>[]> :
      O extends { include: any } ? Promise<SchemaReturnType<T[K]["schema"], T> & SchemaReturnTypeOpt<T[K]["schema"], T, O["include"]>[]> :
        Promise<SchemaReturnType<T[K]["schema"], T>[]>

    create(data: SchemaInsertType<T[K]["schema"], T>): Promise<void> & ReturnData<T[K], T>

    update(where: GetWhere<T[K]["schema"], T>, data: SchemaUpdateType<T[K]["schema"], T>): 
      Promise<void> & ReturnData<T[K], T>

    delete(where: GetWhere<T[K]["schema"], T>): Promise<void> & ReturnData<T[K], T>
  }
}


export function sql(strings: TemplateStringsArray, ...args: any) {
  return new RawSQL(strings, args)
}

enum Alias {
  None,
  Alias,
  Following,
  FollowingAlias
}

const collect = (select: ReturnType<typeof generateSelect>, schema: FullSchema, aliasType = Alias.None): [ string[], string[], boolean ] => {
  const columns: string[] = []
  const joins: string[] = []
  let hasArray = false

  for (let [aliasKey, value] of Object.entries(select.columns)) {
    if (aliasType === Alias.Alias) {
      columns.push(`${select.alias}.${value} as ${aliasKey}`)
    } else if (aliasType === Alias.Following) {
      columns.push(`'${value}'`, `${select.alias}.${value}`)
    } else if (aliasType === Alias.FollowingAlias) { 
      columns.push(`'${aliasKey}'`, `${select.alias}.${value}`)
    } else {
      columns.push(`${select.alias}.${value}`)
    }
  }

  for (let join of select.joins) {
    joins.push(`left join ${join.table} as ${join.alias} on ${join.on}`)
    const [ _columns, _joins, _hasArray ] = collect(join, schema, join.is_array? Alias.Following: Alias.Following)
    const primaryKey =`${join.alias}.${schema[join.table].primaryKey[0]}`
    if (join.is_array) {
      hasArray = true
      columns.push(`COALESCE(json_agg(json_build_object(${_columns.join(",")})) FILTER (WHERE ${primaryKey} IS NOT NULL), '[]') AS ${join.field}`)
    } else {
      hasArray = hasArray || _hasArray
      columns.push(`CASE WHEN ${primaryKey} IS NULL THEN NULL ELSE json_build_object(${_columns.join(",")}) END AS ${join.field}`)
    }
    joins.push(..._joins)
  }

  return [ columns, joins, hasArray ]
}

const generateSelectSQL = <T extends TableSchema>(args: any[], table: Table<T>, schema: any, options: SelectOptions<Table<T>, any>): string => {
  const select = generateSelect(options.select ?? options.include ?? {} as any, table.alias, table, schema, !options.select)

  const [columns,joins,hasArray] = collect(select, schema)

  let str = `SELECT ${columns.join(",")} FROM ${table.name} as ${table.alias} ${joins.join(" ")}`

  if (options.where) {
    const sql = generateWhere(args, options.where, table, schema)
    if (sql) {
      str += ` WHERE ${sql}`
    }
  }

  if (hasArray) {
    str += ` GROUP BY ${table.alias}.id`
  }
  if (options.take) {
    str += ` LIMIT ${options.take}`
  }

  return str
}

const generateDeleteSQL = <T extends TableSchema>(args: any[], table: Table<T>, schema: any, where: GetWhere<T, any>): string => {
  let str = `DELETE FROM ${table.name}`

  const sql = generateWhere(args, where, table, schema)
  if (sql) {
    str += ` WHERE ${sql}`
  }

  return str
}

const generateInsertSQL = <T extends TableSchema>(args: any[], table: Table<T>, schema: any, data: SchemaUpdateType<T, any>): string => {

  const values = []
  const keys = []

  for (let [key, column] of Object.entries(table.schema)) {
    const value = data[key]
    if (value === undefined) continue
    if (typeof column === "string") continue

    if ("ref" in column) {
      keys.push(column.key)
      values.push("$"+args.length+1)
      args.push((value as any)[column.ref.primaryKey[0]])
      continue
    }

    keys.push(key)
    if (value === null) {
      values.push(`NULL`)
    } else if (column.default) {
      values.push(column.default)
    } else {
      values.push("$"+(args.length+1))
      args.push(value)
    }
  }

  return `INSERT INTO ${table.name} (${keys.join(",")}) VALUES (${values.join(",")})`
}

const generateUpdateSQL = <T extends TableSchema>(args: any[], table: Table<T>, schema: any, where: GetWhere<T, any>, data: SchemaUpdateType<T, any>): string => {

  const values = []

  for (let [key, column] of Object.entries(table.schema)) {
    const value = data[key]
    if (value === undefined) continue
    if (typeof column === "string") continue
    if ("ref" in column) {
      if (value === null) {
        values.push(`${column.key} = NULL`)
      } else {
        console.warn("Nested update is not implemented yet")
      }
      continue
    }

    if (value === null) {
      values.push(`${key} = NULL`)
    } else {
      values.push(`${key} = $${args.length+1}`)
      args.push(value)
    }
    
  }
  let str = `UPDATE ${table.name} AS ${table.alias} SET ${values.join(",")}`

  const sql = generateWhere(args, where, table, schema)
  if (sql) {
    str += ` WHERE ${sql}`
  }

  return str
}


export const createReturning = <T extends any[]>(callback: (returning: string[] | null, ...data: T) => Promise<any>) => {
  let returning: string[] | null = null
  return (...data: T) => ({
    returning(cols: any) {
      returning = Object.keys(cols);
      return this; 
    },
    async then(onFulfilled: any, onRejected: any) {
      try {
        const resp = await callback(returning, ...data)
        return onFulfilled?.(resp);
      } catch (e) {
        return onRejected?.(e);
      }
    }
  })
}

const createMethods = <T extends TableSchema>(sql: SQL, table: Table<T>, schema: any) => {
  return {

    async findFirst(options: SelectOptions<Table<T>, any>): Promise<void> {
      const args: any[] = []
      const str = generateSelectSQL(args, table, schema, options) + " LIMIT 1"
      const result = await sql.unsafe(str, args)   
      return result[0]
    },
    async findMany(options: SelectOptions<Table<T>, any>): Promise<void> {
      const args: any[] = []
      const str = generateSelectSQL(args, table, schema, options)
      const result = await sql.unsafe(str, args)   
      return result 
    },

    create: createReturning(async (returning, data: SchemaInsertType<T, any>) => {
      const args: any[] = []
      let str = generateInsertSQL(args, table, schema, data)

      if (returning) {
        str += ` RETURNING ${returning.join(",")}`
        const result = await sql.unsafe(str, args)
        return result[0]
      } else {
        await sql.unsafe(str, args)
      }
    }),

    update: createReturning(async (returning, where: GetWhere<T, any>, data: SchemaUpdateType<T, any>) => {
      const args: any[] = []
      let str = generateUpdateSQL(args, table, schema, where, data)
      if (returning) {
        str += ` RETURNING ${returning.join(",")}`
        const result = await sql.unsafe(str, args)
        return result[0]
      } else {
        await sql.unsafe(str, args)
      }
    }),

    delete: createReturning(async (returning, where: GetWhere<T, any>) => {
      const args: any[] = []
      let str = generateDeleteSQL(args, table, schema, where)
      if (returning) {
        str += ` RETURNING ${returning.join(",")}`
        const result = await sql.unsafe(str, args)
        return result[0]
      } else {
        await sql.unsafe(table.name, args)
      }
    }),

    get name() {
      return sql(table.name)
    }
  }
}

export const createData = <T extends FullSchema>(schema: T): MarciData<T> => {

  const pg = new SQL('postgres://postgres:5678@localhost:5432/marci-test');

  createAliases(schema)

  const data: any = {
    connect() {
      return pg.connect()
    }
  }
  for (let [key,value] of Object.entries(schema)) {
    data[key] = createMethods(pg, value, schema)
  }

  return data
}

