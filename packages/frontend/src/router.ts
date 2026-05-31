import { createRouter, createWebHistory } from "vue-router";
import HomePage from "./pages/HomePage.vue";
import DataPage from "./pages/DataPage.vue";
import AuthPage from "./pages/AuthPage.vue";

const basePath = document.head.querySelector("base")?.getAttribute("href")

export const router = createRouter({
  history: createWebHistory(basePath ?? "/admin"),
  routes: [
    { path: "/", component: HomePage, name: "main", meta: { name: document.title ?? "Добро пожаловать" } },
    { path: "/data/:viewId", component: DataPage, meta: { name: "#view" } },
    { path: "/auth", component: AuthPage }
  ]
})