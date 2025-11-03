export declare interface SchemaTypesMap {
  "text": string;
  "integer": number;
  "bigint": number;
}

export type Field = {
  [K in keyof SchemaTypesMap]: {
    type: K
    nullable?: boolean
    unique?: boolean
    default?: SchemaTypesMap[K] | RawSQL | (K extends "integer" ? "inc" : never),
    primaryKey?: boolean
  }
}[keyof SchemaTypesMap]

type GetFieldType<T extends Field> = 
  T["nullable"] extends true? SchemaTypesMap[T["type"]] | null :
  SchemaTypesMap[T["type"]]

type TableRef = { 
  ref: Table<TableSchema>, 
  key: string 
  nullable?: boolean
  unique?: boolean
  onDelete?: "SET NULL" | "SET DEFAULT" | "CASCADE" | "RESTRICT"
  onUpdate?: "SET NULL" | "SET DEFAULT" | "CASCADE" | "RESTRICT"
}

export type TableSchema = {
  [ key: string ]: Field | TableRef | `${string}[]`
}

export type Table<T extends TableSchema = {}> = {
  name: string,
  alias: string,
  primaryKey: string[],
  schema: T
}

export type FullSchema = Record<string, Table<TableSchema>>

type OptionalField = { nullable: true } | { default: any } | string

export const table = <T extends TableSchema> (name: string, t: T): Table<T> => { 
  const primaryKey: string[] = []
  for (let [ key, value ] of Object.entries(t)) {
    if ((value as any).primaryKey) {
      primaryKey.push(key)
    }
  }
  return { name, schema: t, alias: "", primaryKey: primaryKey }
}

type OmitKey <T extends TableSchema, T2 extends TableSchema> = {
  [ K in keyof T as T[K] extends { ref: T2 } ? never: K ]: T[K]
}

export type GetPrimaryKey <T extends TableSchema> = {
  [ K in keyof T as T[K] extends { primaryKey: true } ? K : never ]: T[K] extends Field ? GetFieldType<T[K]> : never
}

export type GetSelect<T extends TableSchema, S extends FullSchema> = {
  [K in keyof T]?: 
    T[K] extends TableRef? true | { select: GetSelect<T[K]["ref"]["schema"], S> } :
    T[K] extends `${infer TableName}[]`? true | { select: GetSelect<S[TableName]["schema"], S> } :
    true
}

export type GetInclude<T extends TableSchema, S extends FullSchema> = {
  [K in keyof T as T[K] extends Field ? never : K ]?: 
    T[K] extends TableRef? true | { select: GetSelect<T[K]["ref"]["schema"], S> } :
    T[K] extends `${infer TableName}[]`? true | { select: GetSelect<S[TableName]["schema"], S> } :
    true
}

export class RawSQL {
  sql: TemplateStringsArray
  args: any[]
  constructor(sql: TemplateStringsArray, args: any[]) {
    this.sql = sql
    this.args = args
  }

  toString(counter = 1) { 
    let str = this.sql[0]
    for (let i = 1; i < this.sql.length; i++) {
      str += `$${i+counter}${this.sql[i]}`
    }
    return str
  }
}

export type GetWhere<T extends TableSchema, A extends FullSchema> = {
  [K in keyof T]?: 
    T[K] extends Field? GetFieldType<T[K]> | RawSQL | { in: GetFieldType<T[K]>[] } : 
    T[K] extends TableRef? GetWhere<T[K]["ref"]["schema"], A> : 
    T[K] extends `${infer TableName}[]`? { 
      every?: GetWhere<A[TableName]["schema"], A>, 
      some?: GetWhere<A[TableName]["schema"], A>, 
      none?: GetWhere<A[TableName]["schema"], A> 
    } :
    never
} & {
  OR?: GetWhere<T, A>[]
}

export type SchemaReturnType<T extends TableSchema, A extends FullSchema> = {
  [ K in keyof T as T[K] extends Field? K: never ]: 
    T[K] extends Field? GetFieldType<T[K]> : 
    never 
}

export type SchemaReturnTypeOpt<T extends TableSchema, A extends FullSchema, S extends GetSelect<T, A> = any> = {
  [ K in keyof T as S[K] extends true ? K : never ]: 
    T[K] extends TableRef? SchemaReturnType<T[K]["ref"]["schema"], A> : 
    T[K] extends Field? GetFieldType<T[K]> : 
    T[K] extends `${infer TableName}[]`? Array<SchemaReturnType<A[TableName]["schema"], A>> :
    never 
}

export type SchemaUpdateType<T extends TableSchema, A extends FullSchema> = {
  [ K in keyof T ]?: 
      T[K] extends Field? GetFieldType<T[K]> | null : 
      T[K] extends `${infer TableName}[]`? Array<{ create: SchemaInsertType<OmitKey<A[TableName]["schema"], T>, A> } | { connect: GetPrimaryKey<A[TableName]["schema"]> }> :
      T[K] extends TableRef? GetPrimaryKey<T[K]["ref"]["schema"]> | null :
      never
}

export type SchemaInsertType<T extends TableSchema, A extends FullSchema> = SchemaUpdateType<T, A> & {
  [ K in keyof T as T[K] extends OptionalField ? never : K ]: 
    T[K] extends Field? GetFieldType<T[K]> : 
    T[K] extends TableRef? GetPrimaryKey<T[K]["ref"]["schema"]> :
    never
}
