<template>
  <AppSidebar v-if="router.currentRoute.value.path !== '/auth'" />
  <VDialogProvider/>
  <VToastProvider/>
  <RouterView v-if="router.currentRoute.value.path === '/auth'" />
  <div v-else class="app-layout">
    <RouterView />
  </div>
</template>

<script lang="ts" setup>
import { RouterView, useRouter } from 'vue-router';
import AppSidebar from './components/AppSidebar.vue';
import VDialogProvider from './components/VDialogProvider.vue';
import VToastProvider from './components/VToastProvider.vue';

const router = useRouter()

const token = window.localStorage.getItem("dynara-admin__token")
if (!token) {
  router.push("/auth")
}

</script>

<style lang="sass">
:root
  --sidebar-width: 220px
  --topbar-height: 52px
  --padding: 36px
.app-layout
  padding: 28px var(--padding) 48px
  padding-left: calc(var(--sidebar-width) + var(--padding))

// Mobile: the sidebar is an off-canvas drawer (see AppSidebar.vue), so the
// content takes the full width, below the fixed top bar.
@media (max-width: 800px)
  :root
    --padding: 16px
  .app-layout
    padding: calc(var(--topbar-height) + 16px) var(--padding) 32px

</style>