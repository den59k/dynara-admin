import { type Table, type TableSchema, type FullSchema, type GetSelect, RawSQL, type GetWhere } from "./schema"

export const getPrimaryKey = (table: Table) => {
  for (let [ key, value ] of Object.entries(table.schema)) {
    if ((value as any).primaryKey) return key
  }
  return null
}

type GeneratedSelect = {
  alias: string,
  table: string,
  columns: Record<string, string>,
  joins: Array<GeneratedSelect & { on: string, field: string, is_array?: boolean }>
}

export const generateSelect = <T extends TableSchema, A extends FullSchema>
  (select: GetSelect<T, A>, alias: string, table: Table<T>, fullSchema: A, includeBaseFields = false): GeneratedSelect => {

  const columns: Record<string, string> = {}
  const joins: any[] = []

  for (let [key, column] of Object.entries(table.schema)) {
    const value = select[key]
    if (!value) {
      if (includeBaseFields && typeof column === "object" && !("ref" in column)) {
        columns[alias+"_"+key] = key
      }
      continue
    }

    if (typeof column === "string") {
      const rightTableName = column.slice(0, -2)
      const rightTable = fullSchema[rightTableName]
      const rightAlias = rightTable.alias

      const primaryKey = getPrimaryKey(table)
      const refColumn = Object.values(rightTable.schema).find(item => (item as any).ref === table) as any
      const on = `${rightAlias}.${refColumn.key} = ${alias}.${primaryKey}`

      const join = value === true? 
        generateSelect({}, rightAlias, rightTable, fullSchema, true): 
        generateSelect(value.select, rightAlias, rightTable, fullSchema);

      (join as any).on = on;
      (join as any).is_array = true;
      (join as any).field = key;
      joins.push(join)

      continue
    }

    if ("ref" in column) {
      const rightTable = column.ref
      const rightAlias = rightTable.alias
      const primaryKey = getPrimaryKey(rightTable) 
      const on = `${rightAlias}.${primaryKey} = ${alias}.${column.key}`

      const join = value === true? 
        generateSelect({}, rightAlias, rightTable, fullSchema, true): 
        generateSelect(value.select, rightAlias, rightTable, fullSchema);

      (join as any).on = on;
      (join as any).field = key;
      
      joins.push(join)
      continue
    }
    
    columns[alias+"_"+key] = key
  }

  return {
    alias,
    table: table.name,
    columns,
    joins
  }
}

export const generateWhere = (args: any[], where: GetWhere<any, any> | RawSQL, table: Table, schema: FullSchema): string => {
  if (where instanceof RawSQL) {
    args.push(...where.args)
    return where.toString(1)
  }

  if ("OR" in where && where.OR) {
    let outputStr = ""
    for (let val of where.OR) {
      const raw = generateWhere(args, val, table, schema)
      outputStr += " OR " + raw
    }
    return outputStr.slice(3)
  }

  let outputStr = []

  for (let [ key, value ] of Object.entries(where)) {
    if (value === undefined) continue
    if (value === null) {
      outputStr.push(`${key} IS NULL`)
      continue
    }
    if (value instanceof RawSQL) {
      outputStr.push(`${table.alias}.${key} ${value.toString(args.length+1)}`)
      args.push(...value.args)
      continue
    }
    if (typeof value === 'object' && "in" in value) {
      const placeholders = value.in.map((_: any, index: number) => "$"+ (index + 1 + args.length)).join(",")
      outputStr.push(`${table.alias}.${key} in (${placeholders})`)
      args.push(...value.in)
      continue
    }
    outputStr.push(`${table.alias}.${key} = $${args.length+1}`)
    args.push(value)
  }

  return outputStr.join(" AND ")
}



export const createAliases = (data: FullSchema) => {
  const aliasesSet = new Set()
  for (let table of Object.values(data)) {
    const splited = table.name.split("_")
    const counters = [ 1, 1, 1 ]
    let counter = 0

    table.alias = splited.map((item, index) => item.slice(0, counters[index]).toLowerCase()).join("")

    while (aliasesSet.has(table.alias)) {
      counter++
      let sum = counter
      for (let i = counters.length-1; i >= 0; i--) {
        counters[i] = 1 + sum % splited[i].length
        if (sum < splited[i].length) break
        sum = Math.trunc(sum / splited[i].length)
      }
      table.alias = splited.map((item, index) => item.slice(0, counters[index]).toLowerCase()).join("")
    }
    aliasesSet.add(table.alias)
  }
}
