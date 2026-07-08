<template>
  <aside class="app-sidebar">
    <h3>{{ title }}</h3>
    <RouterLink v-for="page in sections.ungrouped" :key="page.path" :to="pageTo(page)">
      <VIcon v-if="page.icon" :icon="page.icon" />
      {{ page.title }}
    </RouterLink>
    <template v-for="[group, pages] in sections.groups" :key="group">
      <div class="app-sidebar__group">{{ group }}</div>
      <RouterLink v-for="page in pages" :key="page.path" :to="pageTo(page)">
        <VIcon v-if="page.icon" :icon="page.icon" />
        {{ page.title }}
      </RouterLink>
    </template>
    <button style="margin-top: auto" @click="logout">
      <VIcon icon="logout"/>
      {{ t('sidebar.logout') }}
    </button>
  </aside>
</template>

<script lang="ts" setup>
import { useRequest } from 'vuesix';
import { dataApi, type FullPage } from '../api/dataApi';
import { computed, watch } from 'vue';
import { HTTPError } from '../api/request';
import { useRouter } from 'vue-router';
import VIcon from './VIcon.vue';
import { t } from '../i18n';

const title = (window as any).__DYNARA_TITLE__ ?? "Dynara Admin"

const { data, error } = useRequest(dataApi.getPages)

type SidebarPage = Pick<FullPage, 'title' | 'path' | 'group' | 'icon'>

// Ungrouped pages first (registration order), then each group (in first-seen order).
const sections = computed(() => {
  const ungrouped: SidebarPage[] = []
  const groups = new Map<string, SidebarPage[]>()
  for (const page of (data.value ?? []) as SidebarPage[]) {
    if (!page.group) { ungrouped.push(page); continue }
    if (!groups.has(page.group)) groups.set(page.group, [])
    groups.get(page.group)!.push(page)
  }
  return { ungrouped, groups: [...groups.entries()] }
})

const pageTo = (page: SidebarPage) => page.path.startsWith('/') ? page.path : `/${page.path}`

const router = useRouter()
// Redirect to the login page whenever the panel rejects us — a missing token
// (403) or an invalid/expired one (401). The sidebar's page request runs on
// every view, so an expired session is caught here instead of stranding the user.
watch(error, (error) => {
  if (error && error instanceof HTTPError && (error.statusCode === 401 || error.statusCode === 403)) {
    router.push("/auth")
  }
})

const logout = () => {
  window.localStorage.removeItem("dynara-admin__token")
  router.push("/auth")
}

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

    &>svg
      width: 18px
      height: 18px
      flex-shrink: 0

.app-sidebar__group
  font-size: 11px
  font-weight: 600
  text-transform: uppercase
  letter-spacing: 0.04em
  color: var(--text-secondary-color)
  padding: 16px 22px 6px
  user-select: none

</style>