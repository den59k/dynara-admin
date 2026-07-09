<template>
  <!-- Mobile-only top bar: on narrow screens the sidebar collapses into a
       drawer, and this bar (hamburger + title) is the way to open it. -->
  <header class="app-topbar">
    <button class="app-topbar__menu" :aria-label="t('sidebar.menu')" @click="drawerOpen = true">
      <VIcon icon="menu" />
    </button>
    <span class="app-topbar__title">{{ title }}</span>
  </header>
  <div v-if="drawerOpen" class="app-sidebar__scrim" @click="drawerOpen = false"></div>
  <aside class="app-sidebar" :class="{ open: drawerOpen }">
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
import { computed, shallowRef, watch } from 'vue';
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

// The drawer state only matters under the mobile breakpoint — on desktop the
// sidebar ignores it and stays pinned. Any navigation closes the drawer, so
// tapping a link doesn't leave it covering the new page.
const drawerOpen = shallowRef(false)
watch(() => router.currentRoute.value.fullPath, () => {
  drawerOpen.value = false
})

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
  gap: 1px
  overflow-y: auto

  &>h3
    margin-top: 0
    margin-bottom: 16px
    padding: 0 22px
    font-size: 15px
    font-weight: 650
    letter-spacing: -0.01em

  &>a, &>button
    text-decoration: none
    height: 36px
    padding: 0 12px
    display: flex
    align-items: center
    border-radius: 8px
    margin: 0 10px
    background: none
    border: none
    color: var(--text-unselected-color)
    font-size: 13.5px
    font-weight: 500
    gap: 10px
    cursor: pointer
    flex-shrink: 0

    &:hover
      background-color: var(--hover-color)
      color: var(--text-color)
      text-decoration: none

    &.router-link-active
      background-color: var(--background-active-color)
      color: var(--text-color)

    &>svg
      width: 17px
      height: 17px
      flex-shrink: 0
      opacity: 0.75

.app-sidebar__group
  font-size: 11px
  font-weight: 600
  text-transform: uppercase
  letter-spacing: 0.05em
  color: var(--text-secondary-color)
  padding: 16px 22px 6px
  user-select: none

// Desktop: no top bar, no scrim — the sidebar is simply pinned.
.app-topbar
  display: none

.app-sidebar__scrim
  display: none

@media (max-width: 800px)
  .app-topbar
    position: fixed
    top: 0
    left: 0
    right: 0
    z-index: 800
    display: flex
    align-items: center
    gap: 6px
    height: var(--topbar-height)
    padding: 0 8px
    box-sizing: border-box
    background-color: var(--background-color)
    border-bottom: 1px solid var(--border-color)

  .app-topbar__menu
    display: flex
    align-items: center
    justify-content: center
    width: 40px
    height: 40px
    background: none
    border: none
    border-radius: 8px
    color: var(--text-color)
    cursor: pointer

    &:hover
      background-color: var(--hover-color)

    svg
      width: 20px
      height: 20px

  .app-topbar__title
    font-size: 15px
    font-weight: 650
    letter-spacing: -0.01em

  .app-sidebar__scrim
    display: block
    position: fixed
    inset: 0
    z-index: 900
    background-color: rgba(0, 0, 0, 0.55)

  // The sidebar becomes an off-canvas drawer: opaque (it overlays content),
  // slid off-screen until `.open`, above the scrim but below dialogs/menus.
  .app-sidebar
    z-index: 901
    width: min(280px, 84vw)
    background-color: var(--paper-color)
    transform: translateX(-100%)
    transition: transform 0.2s ease
    // Comfortable touch targets in the drawer.
    &>a, &>button
      height: 42px

    &.open
      transform: translateX(0)
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5)

</style>