import { table } from "marci-orm"

export const users = table("users", {
  id: { type: "integer", primaryKey: true, default: "inc" },
  name: { type: "text", nullable: true },
  // surname: { type: "text", nullable: true },
  sessions: "user_sessions[]"
})

export const user_sessions = table("user_sessions", {
  id: { type: "integer", primaryKey: true },
  ip: { type: "text", default: "" },
  user: { ref: users, key: "user_id", onDelete: "CASCADE" }
})

export const projects = table("projects", {
  id: { type: "integer", primaryKey: true },
  name: { type: "text" }
})

export const user_projects = table("user_projects", {
  project: { ref: projects, key: "project_id", primaryKey: true },
  user: { ref: users, key: "user_id", primaryKey: true },
})