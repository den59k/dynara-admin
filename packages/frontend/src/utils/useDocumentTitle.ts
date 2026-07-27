// Keeps the browser tab named after where you are: "Users · Acme Admin", and
// just the panel's name where the page has no name of its own (the home page,
// whose heading *is* the panel's name).
//
// The backend already serves the panel's name in <title>, so this only ever
// refines it — a slow bundle or a failed page list leaves a correct tab, not a
// blank one.

import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRequest } from 'vuesix'
import { dataApi, type FullPage } from '../api/dataApi'
import { PANEL_TITLE } from '../constants'
import { t } from '../i18n'

const routePathOf = (page: Pick<FullPage, 'path'>) =>
  page.path.startsWith('/') ? page.path : `/${page.path}`

export const useDocumentTitle = () => {
  const route = useRoute()
  // The page list the sidebar already loads — `useRequest` caches per method,
  // so this shares that one request, and page titles are known before the page
  // itself has fetched anything.
  const { data: pages } = useRequest(dataApi.getPages)

  // What this route is called, or "" for a page that is the panel itself.
  const pageName = computed(() => {
    if (route.path === '/auth') return t('auth.title')
    const page = (pages.value ?? []).find((one) => routePathOf(one) === route.path)
    return page?.title ?? ''
  })

  watch(pageName, (name) => {
    document.title = name ? `${name} · ${PANEL_TITLE}` : PANEL_TITLE
  }, { immediate: true })
}
