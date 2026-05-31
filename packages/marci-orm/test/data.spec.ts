import { expect, it } from 'bun:test'
import { table, createAliases } from '../src/index'

const users = table("users", {
  id: { type: "integer", primaryKey: true },
  name: { type: "text" },
  sessions: "user_sessions[]",
  projects: "user_projects[]"
})
const user_sessions = table("user_sessions", {
  id: { type: "integer", primaryKey: true },
  name: { type: "text" },
  user: { ref: users, key: "user_id" }
})
const projects = table("projects", {
  id: { type: "integer", primaryKey: true },
  name: { type: "text" },
  users: "user_projects[]"
})
const user_projects = table("user_projects", {
  user: { ref: users, key: "user_id", primaryKey: true },
  project: { ref: projects, key: "project_id", primaryKey: true },
})

const schema = {
  users, user_sessions, projects, user_projects
}
createAliases(schema)

it("base checks", () => { 
  
  expect(users.alias).toEqual("u")  

})