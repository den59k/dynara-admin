<template>
  <aside class="app-sidebar">
    <h3>Marci Admin</h3>
    <RouterLink v-for="page in data" :to="page.path.startsWith('/')? page.path: `/${page.path}`">
      {{ page.title }}
    </RouterLink>
    <button style="margin-top: auto">
      <VIcon icon="logout"/>
      Выйти из аккаунта
    </button>
  </aside>
</template>

<script lang="ts" setup>
import { useRequest } from 'vuesix';
import { dataApi } from '../api/dataApi';
import { watch } from 'vue';
import { HTTPError } from '../api/request';
import { useRouter } from 'vue-router';
import VIcon from './VIcon.vue';

const { data, error } = useRequest(dataApi.getPages)

const router = useRouter()
watch(error, (error) => {
  if (error && error instanceof HTTPError && error.statusCode === 403) {
    router.push("/auth")
  }
})

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
  padding: 20px 0

  &>h3
    margin-top: 0
    margin-bottom: 16px
    padding: 0 24px

  &>a, &>button
    text-decoration: none 
    height: 40px
    padding: 0 16px
    display: flex
    align-items: center
    border-radius: 8px
    margin: 0 6px
    background: none
    border: none
    color: var(--text-unselected-color)
    gap: 8px
    cursor: pointer

    &:hover
      background-color: var(--hover-color)
      text-decoration: none

    &.router-link-active
      background-color: var(--background-active-color)
      color: var(--text-color)

</style>