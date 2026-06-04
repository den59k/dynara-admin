<template>
  <AppSidebar v-if="router.currentRoute.value.path !== '/auth'" />
  <VDialogProvider/>
  <RouterView v-if="router.currentRoute.value.path === '/auth'" />
  <div v-else class="app-layout">
    <RouterView />
  </div>
</template>

<script lang="ts" setup>
import { RouterView, useRouter } from 'vue-router';
import AppSidebar from './components/AppSidebar.vue';
import VDialogProvider from './components/VDialogProvider.vue';

const router = useRouter()

const token = window.localStorage.getItem("marci-admin__token")
if (!token) {
  router.push("/auth")
}

</script>

<style lang="sass">
:root 
  --sidebar-width: 220px
  --padding: 40px
.app-layout
  padding: 24px var(--padding)
  padding-left: calc(var(--sidebar-width) + var(--padding))

</style>