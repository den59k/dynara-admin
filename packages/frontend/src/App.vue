<template>
  <AppSidebar />
  <VDialogProvider/>
  <div class="app-layout">
    <RouterView />
  </div>
</template>

<script lang="ts" setup>
import { RouterView } from 'vue-router';
import AppSidebar from './components/AppSidebar.vue';
import VDialogProvider from './components/VDialogProvider.vue';


</script>

<style lang="sass">
:root 
  --sidebar-width: 220px
  --padding: 40px
.app-layout
  padding: 24px var(--padding)
  padding-left: calc(var(--sidebar-width) + var(--padding))

</style>