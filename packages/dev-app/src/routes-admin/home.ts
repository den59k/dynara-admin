import type { AdminPanel } from "../../../backend/src/main";
import Dashboard from "../admin-components/Dashboard.vue";
import { db } from "../plugins/db";

export default (admin: AdminPanel) => admin.createPage({ title: "Домашняя страница", path: "/" })
  .component(Dashboard)
  .componentData("chart", async () => {
    const users = await db.users.findMany({ })
    return [
      { day: Date.now(), users: users.length }
    ]
  })