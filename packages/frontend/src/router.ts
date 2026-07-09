import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import HomePage from "./pages/HomePage.vue";
import DashboardPage from "./pages/DashboardPage.vue";
import DataPage from "./pages/DataPage.vue";
import AuthPage from "./pages/AuthPage.vue";
import { t } from "./i18n";

const basePath = (window as any).__DYNARA_BASE__
  ?? document.head.querySelector("base")?.getAttribute("href")

const routes: RouteRecordRaw[] = [
  { path: "/:viewId", component: DataPage, meta: { name: "#view" } },
  { path: "/auth", component: AuthPage }
]

// @ts-ignore
if (window.__DYNARA_CUSTOM_HOME_PAGE__) {
  routes.unshift({ path: "/", component: DataPage, meta: { name: "#view" } })
// @ts-ignore
} else if (window.__DYNARA_DASHBOARD__) {
  routes.unshift({ path: "/", component: DashboardPage, name: "main", meta: { name: t('dashboard.title') } })
} else {
  routes.unshift({ path: "/", component: HomePage, name: "main", meta: { name: document.title ?? t('home.welcome') } })
}

export const router = createRouter({
  history: createWebHistory(basePath ?? "/admin"),
  routes
})