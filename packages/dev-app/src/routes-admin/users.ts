import { type AdminPanel } from "../../../backend/src/main";
// import { ravendb } from "../plugins/ravendb";
import { schema } from 'compact-json-schema'
import { db } from "../plugins/db";

const createSchema = schema({
  name: { type: "string", width: 0.5, label: "Имя" },
  surname: { type: "string", width: 0.5, label: "Фамилия" },
  description: { type: "string", multiline: true, label: "Био" }
})

export default (admin: AdminPanel, path: string) => admin.createPage({ title: "Пользователи", path })
  .data(async ({ take, skip }) => {
    return await db.users.findMany({ select: { id: true, name: true }, take, skip })
  }) 
  .primaryKey("id")
  .table({
    id: true,
    name: { title: "Имя" },
    _actions: { title: "Test", map: item => item.id }
  })
  .createForm(createSchema, async (data) => {
    await db.users.create(data)
  })
  .updateForm(createSchema, async (itemId, data) => { 
    await db.users.update({ id: itemId }, data)
  })
  .onDelete(async (ids) => {
    await db.users.delete({ id: { in: ids }})
  })