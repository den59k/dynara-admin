// Tags — a minimal CRUD page; its rows feed the Posts form's relation list.

import type { AdminPanel } from "../../../backend/src/main"
import { isAdmin, type User } from "../auth"
import { client } from "../db"

export default (admin: AdminPanel<User>) => {
  admin
    .createPage({ title: "Tags", path: "tags", icon: "tag", search: true, access: { write: isAdmin, delete: isAdmin } })
    .data(async ({ take, skip, sort, search }) => {
      const $where = search ? { title: { $includes: search } } : undefined
      const $order = sort ? { [sort.field]: sort.dir } : { id: "asc" }
      return client.tag.findMany({ id: true, title: true, $where, $order: $order as any, $limit: take, $skip: skip })
    })
    .count(async ({ search }) => {
      return client.tag.count(search ? { $where: { title: { $includes: search } } } : undefined)
    })
    .primaryKey("id", "number")
    .item(async (id) => client.tag.findFirst({ id: true, title: true, $where: { id } }))
    .table([
      { title: "ID", field: "id", width: 60, sortable: true },
      { title: "Title", field: "title", sortable: true },
    ])
    .createForm({ title: "string" }, async (data) => {
      await client.tag.insert(data)
    })
    .updateForm({ title: "string" }, async (id, data) => {
      await client.tag.update({ id }, data)
    })
    .onDelete(async (ids) => {
      await client.$transaction(ids.map((id) => client.tag.delete({ id })))
    })
}
