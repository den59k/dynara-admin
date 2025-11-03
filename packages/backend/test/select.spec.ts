import { expect, it } from 'bun:test'
import { table } from '../src/db/schema'
import { createAliases, generateSelect } from '../src/db/tools'

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


it("simple select", () => {
  const select = generateSelect({
    id: true
  }, users.alias, users, schema)
  
  expect(select).toEqual({
    table: "users",
    alias: "u",
    columns: {
      "u_id": "id"
    },
    joins: []
  })
})

it("nested select", () => {
  const select = generateSelect({
    id: true,
    sessions: true
  }, users.alias, users, schema)
  
  expect(select).toEqual({
    alias: "u",
    table: "users",
    columns: {
      "u_id": "id"
    },
    joins: [
      {
        alias: "us",
        table: "user_sessions",
        field: "sessions",
        on: "us.user_id = u.id",
        is_array: true,
        columns: {
          us_id: "id",
          us_name: "name",
        },
        joins: []
      }
    ]
  })
})


it("nested select with fields", () => {
  const select = generateSelect({
    id: true,
    sessions: {
      select: { id: true }
    }
  }, users.alias, users, schema)
  
  expect(select).toEqual({
    alias: "u",
    table: "users",
    columns: {
      "u_id": "id"
    },
    joins: [
      {
        alias: "us",
        table: "user_sessions",
        on: "us.user_id = u.id",
        field: "sessions",
        is_array: true,
        columns: {
          us_id: "id"
        },
        joins: []
      }
    ]
  })
})

it("complex select", () => {
  const select = generateSelect({
    id: true,
    sessions: {
      select: { id: true }
    },
    projects: {
      select: { project: { select: { id: true, name: true } } }
    }
  }, users.alias, users, schema)
  
  expect(select).toEqual({
    alias: "u",
    table: "users",
    columns: {
      "u_id": "id"
    },
    joins: [
      {
        alias: "us",
        table: "user_sessions",
        on: "us.user_id = u.id",
        is_array: true,
        field: "sessions",
        columns: {
          us_id: "id"
        },
        joins: []
      },
      {
        alias: "up",
        table: "user_projects",
        field: "projects",
        on: "up.user_id = u.id",
        is_array: true,
        columns: {
          
        },
        joins: [
          {
            alias: "p",
            table: "projects",
            field: "project",
            on: "p.id = up.project_id",
            columns: {
              "p_id": "id",
              "p_name": "name",
            },
            joins: [
              
            ]
          },
        ]
      },
    ],
  })
})