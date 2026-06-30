import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import HomePage from "./pages/HomePage.vue";
import DataPage from "./pages/DataPage.vue";
import AuthPage from "./pages/AuthPage.vue";

const basePath = document.head.querySelector("base")?.getAttribute("href")

const routes: RouteRecordRaw[] = [
  { path: "/:viewId", component: DataPage, meta: { name: "#view" } },
  { path: "/auth", component: AuthPage }
]

// @ts-ignore
if (window.__DYNARA_CUSTOM_HOME_PAGE__) {
  routes.unshift({ path: "/", component: DataPage, meta: { name: "#view" } })
} else {
  routes.unshift({ path: "/", component: HomePage, name: "main", meta: { name: document.title ?? "Добро пожаловать" } })
}

export const router = createRouter({
  history: createWebHistory(basePath ?? "/admin"),
  routes
})