<template>
  <aside class="app-sidebar">
    <h3>Marci Admin</h3>
    <RouterLink v-for="page in data" :to="`/data/${page.path}`">
      {{ page.title }}
    </RouterLink>
  </aside>
</template>

<script lang="ts" setup>
import { useRequest } from 'vuesix';
import { dataApi } from '../api/dataApi';

const { data } = useRequest(dataApi.getPages)

</script>

<style lang="sass">
.app-sidebar
  position: fixed
  left: 0
  bottom: 0
  top: 0
  width: var(--sidebar-width)
  border-right: 1px solid var(--border-color)
  padding: 20px
  box-sizing: border-box

  h3
    margin-top: 0
    margin-bottom: 32px
  
</style>