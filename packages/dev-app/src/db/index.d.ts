type ServiceKeys = "$where" | "$order" | "$limit" | "$skip" | "$cursor";

// A `Json` field: any JSON value. Stored as a JSONB binary blob server-side; on the wire it is a plain
// decoded JSON value.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// Aggregate query over related records inside select
type AggregateKeys = { $count: true } | { $sum: string } | { $avg: string } | { $min: string } | { $max: string }

// Distributive over union models (discriminated union for payload enums):
// keys not present in the current union branch are dropped
type GetResult<TModel, TSelect extends Record<string, any>> = TModel extends any ? {
  [K in keyof Omit<TSelect, ServiceKeys> as TSelect[K] extends false | undefined ? never : K extends keyof TModel ? K : never]:
    K extends keyof TModel
      ? TSelect[K] extends true
        ? TModel[K]                          // selected the whole field
        : TSelect[K] extends Record<string, any>
          ? TModel[K] extends readonly object[]
            ? TSelect[K] extends AggregateKeys
              ? AggregateResult<NonNullable<TModel[K][number]>, TSelect[K]>   // aggregate over the relation
              : GetResult<NonNullable<TModel[K][number]>, TSelect[K]>[]
            : GetResult<NonNullable<TModel[K]>, TSelect[K]> | Extract<TModel[K], null>
          : TModel[K]                        // fallback
      : never
} : never

type RefUpdate<I> = {
  "$connect"?: I
}

type RefUpdateStruct<I,U> = {
  "$update"?: U,
  "$ensure"?: I,
  "$set"?: I
}

type RefListUpdate<I> = {
  "$connect"?: I | I[],
  "$remove"?: I | I[],
}

type RefListUpdateStruct<I,U> = {
  "$push"?: I | I[],
  "$remove"?: I | I[],
  "$set"?: I[]
}

type WhereValue<T> = T | { "$and": T[] } | { "$or": T[] } | { "$not": T }

type CompareValue<T> = T | { "$eq": T } | { "$not": T } | { "$in": T[] } | { "$notIn": T[] }
type CompareNumValue<T> = { "$gt": T } | { "$gte": T } | { "$lt": T } | { "$lte": T }
type CompareStrValue = { "$includes": string,  } | { "$startsWith": string }

// Filtering into a Json field by dot-path. Keys are JSON paths (e.g. "address.city", "items.0"); a numeric
// segment indexes an array. A bare value is shorthand for `$eq` (a plain object matches the whole subtree).
// Path keys must not start with `$`. A missing leaf or a type mismatch simply doesn't match.
type JsonType = "string" | "number" | "boolean" | "object" | "array" | "null"
type JsonCondition =
  | JsonValue
  | { "$eq": JsonValue } | { "$ne": JsonValue } | { "$not": JsonValue }
  | { "$gt": number | string } | { "$gte": number | string } | { "$lt": number | string } | { "$lte": number | string }
  | { "$in": JsonValue[] } | { "$notIn": JsonValue[] }
  | { "$startsWith": string } | { "$includes": string }
  | { "$contains": JsonValue }
  | { "$exists": boolean }
  | { "$type": JsonType }
type JsonPathWhere = { [path: string]: JsonCondition }
type CompareRefValue<T> = T | { "$not": T }
type CompareRefListValue<T> = { "$every": T } | { "$some": T } | { "$none": T }

// Module-index search (@custom): $near/$search hand a raw payload to the field's index provider.
type VectorSearch = { vector: number[], k?: number, threshold?: number }      // @custom(vector, …)
type FullTextSearch = string | { query: string, limit?: number }             // @custom(fulltext, …)
type CustomSearch = Record<string, any>                                       // other providers
type CustomSearchValue<P> = { "$near": P } | { "$search": P }

// Aggregate result: only the requested keys; an empty set yields null (except count)
type AggregateResult<TModel, T> =
  (T extends { $count: true } ? { count: number } : {}) &
  (T extends { $sum: string } ? { sum: number | null } : {}) &
  (T extends { $avg: string } ? { avg: number | null } : {}) &
  (T extends { $min: infer F } ? { min: (F extends keyof TModel ? TModel[F] : never) | null } : {}) &
  (T extends { $max: infer F } ? { max: (F extends keyof TModel ? TModel[F] : never) | null } : {})

// A lazily-executed operation. `await` runs it as a single request;
// passing it into `db.$transaction([...])` bundles it into one atomic transaction
declare const __op: unique symbol
export type Op<T> = PromiseLike<T> & { readonly [__op]: T }

// A reference to a previous operation's result inside $transaction (resolved by the server).
// "0.id" — the id field of operation #0's result; "1.author.id" — a nested path
export declare function ref(path: string): any

// A transport-neutral operation descriptor and the pluggable transport that runs it. The HTTP transport
// is selected by passing a URL string; marcidb-embedded provides an in-process FFI transport.
export type MarciOp = { model: string, action: string, query?: any, data?: any, id?: any }
export type MarciTransport = {
  exec(op: MarciOp): Promise<any>
  batch(ops: MarciOp[]): Promise<any[]>
}

export declare function marcidb(transport: string | MarciTransport): MarciDB;

// User
type UserModelId = {
  id: number
}
type UserModel = UserModelId & {
  name: string
  email: string | null
  age: number
  role: string
  balance: number
  birthday: Date | number | null
  posts: PostModel[]
}
type UserModelInsert = {
  id?: number
  name: string
  email?: string | null
  age: number
  role: string
  balance: number
  birthday?: Date | number | null
  posts?: PostModelId[]
}
type UserModelUpdate = {
  id?: number
  name?: string
  email?: string | null
  age?: number
  role?: string
  balance?: number
  birthday?: Date | number | null
  posts?: RefListUpdate<PostModelId>[]
}
type UserModelSelect = {
  id?: boolean
  name?: boolean
  email?: boolean
  age?: boolean
  role?: boolean
  balance?: boolean
  birthday?: boolean
  posts?: PostModelQuery | PostModelAggregateQuery | boolean
}
type UserModel$Where = {
  id?: CompareValue<number> | CompareNumValue<number>
  name?: CompareValue<string> | CompareStrValue
  email?: CompareValue<string | null> | CompareStrValue
  age?: CompareValue<number> | CompareNumValue<number>
  role?: CompareValue<string> | CompareStrValue
  balance?: CompareValue<number> | CompareNumValue<number>
  birthday?: CompareValue<Date | number | null> | CompareNumValue<Date | number>
  posts?: CompareRefListValue<PostModel$Where>
}
type UserModel$Order = {
  id?: "asc" | "desc"
  name?: "asc" | "desc"
  email?: "asc" | "desc"
  age?: "asc" | "desc"
  role?: "asc" | "desc"
  balance?: "asc" | "desc"
  birthday?: "asc" | "desc"
}
type UserModelQuery = UserModelSelect & {
  $where?: UserModel$Where
  $order?: UserModel$Order
  $limit?: number
  $skip?: number
  $cursor?: UserModelId
}
type UserModelAggregateQuery = {
  $where?: UserModel$Where
  $count?: true
  $sum?: "id" | "age" | "balance"
  $avg?: "id" | "age" | "balance"
  $min?: "id" | "name" | "email" | "age" | "role" | "balance" | "birthday"
  $max?: "id" | "name" | "email" | "age" | "role" | "balance" | "birthday"
}

// Post
type PostModelId = {
  id: number
}
type PostModel = PostModelId & {
  title: string
  body: string | null
  published: boolean
  author: UserModel | null
}
type PostModelInsert = {
  id?: number
  title: string
  body?: string | null
  published: boolean
  author?: UserModelId | null
}
type PostModelUpdate = {
  id?: number
  title?: string
  body?: string | null
  published?: boolean
  author?: RefUpdate<UserModelId> | null
}
type PostModelSelect = {
  id?: boolean
  title?: boolean
  body?: boolean
  published?: boolean
  author?: UserModelSelect | boolean
}
type PostModel$Where = {
  id?: CompareValue<number> | CompareNumValue<number>
  title?: CompareValue<string> | CompareStrValue
  body?: CompareValue<string | null> | CompareStrValue
  published?: CompareValue<boolean>
  author?: CompareRefValue<UserModel$Where | null>
}
type PostModel$Order = {
  id?: "asc" | "desc"
  title?: "asc" | "desc"
  body?: "asc" | "desc"
  published?: "asc" | "desc"
}
type PostModelQuery = PostModelSelect & {
  $where?: PostModel$Where
  $order?: PostModel$Order
  $limit?: number
  $skip?: number
  $cursor?: PostModelId
}
type PostModelAggregateQuery = {
  $where?: PostModel$Where
  $count?: true
  $sum?: "id"
  $avg?: "id"
  $min?: "id" | "title" | "body" | "published"
  $max?: "id" | "title" | "body" | "published"
}

export interface MarciDB {
  user: {
    findMany<T extends UserModelQuery>(select: T): Op<GetResult<UserModel, T>[]>
    findFirst<T extends UserModelQuery>(select: T): Op<GetResult<UserModel, T> | null>
    insert(data: UserModelInsert): Op<UserModelId>
    update(id: UserModelId, data: UserModelUpdate): Op<void>
    delete(id: UserModelId): Op<void>
    count(query?: { $where?: UserModel$Where }): Op<number>
    aggregate<T extends UserModelAggregateQuery>(query: T): Op<AggregateResult<UserModel, T>>
  }
  post: {
    findMany<T extends PostModelQuery>(select: T): Op<GetResult<PostModel, T>[]>
    findFirst<T extends PostModelQuery>(select: T): Op<GetResult<PostModel, T> | null>
    insert(data: PostModelInsert): Op<PostModelId>
    update(id: PostModelId, data: PostModelUpdate): Op<void>
    delete(id: PostModelId): Op<void>
    count(query?: { $where?: PostModel$Where }): Op<number>
    aggregate<T extends PostModelAggregateQuery>(query: T): Op<AggregateResult<PostModel, T>>
  }
  $transaction<P extends readonly Op<any>[]>(ops: [...P]): Promise<{ [K in keyof P]: P[K] extends Op<infer T> ? T : never }>
}