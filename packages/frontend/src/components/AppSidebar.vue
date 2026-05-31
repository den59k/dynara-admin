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
  box-sizing: border-box
  display: flex
  flex-direction: column
  padding-top: 20px

  &>h3
    margin-top: 0
    margin-bottom: 16px
    padding: 0 24px

  &>a
    text-decoration: none 
    height: 40px
    padding: 0 16px
    display: flex
    align-items: center
    border-radius: 8px
    margin: 0 6px

    &:hover
      background-color: var(--hover-color)

    &.router-link-active
      background-color: var(--background-active-color)

</style>