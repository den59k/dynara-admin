// Home dashboard: three built-in stat cards plus a custom Vue widget. The stat
// `data` resolvers run server-side per request; the component widget's resolver
// output is passed to RecentPosts.vue as its `data` prop.

import { join } from "node:path"
import type { AdminPanel } from "../../../backend/src/main"
import type { User } from "../auth"
import { client } from "../db"

export default (admin: AdminPanel<User>) => {
  admin.dashboard([
    {
      type: "stat", title: "Users", icon: "users", link: "users",
      data: async () => ({ value: await client.user.count() }),
    },
    {
      type: "stat", title: "Posts", icon: "file", link: "posts",
      data: async () => ({ value: await client.post.count() }),
    },
    {
      type: "stat", title: "Published", icon: "check",
      data: async () => {
        const total = await client.post.count()
        const published = await client.post.count({ $where: { published: true } })
        return { value: published, label: `of ${total}`, delta: total ? Math.round((published / total) * 100) : 0 }
      },
    },
    {
      type: "component", title: "Recent posts", span: 2,
      component: join(import.meta.dir, "../widgets/RecentPosts.vue"),
      data: async () => ({
        posts: await client.post.findMany({ id: true, title: true, published: true, $order: { id: "desc" }, $limit: 6 }),
      }),
    },
  ])
}
