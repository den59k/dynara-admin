<template>
  <h1>{{ title }}</h1>
  <div v-if="widgets && widgets.length" class="dashboard__grid">
    <DashboardWidget v-for="(w, i) in widgets" :key="i" :widget="w" :index="i" />
  </div>
  <div v-else-if="!pending" class="dashboard__empty">{{ t('dashboard.empty') }}</div>
</template>

<script lang="ts" setup>
import { useRequest } from 'vuesix'
import { dashboardApi } from '../api/dashboardApi'
import { t } from '../i18n'
import DashboardWidget from '../components/dashboard/DashboardWidget.vue'

const title = (window as any).__DYNARA_TITLE__ ?? 'Dashboard'
const { data: widgets, pending } = useRequest(dashboardApi.getWidgets)
</script>

<style lang="sass">
.dashboard__grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: 16px
  margin-top: 16px

  @media (max-width: 900px)
    grid-template-columns: repeat(2, minmax(0, 1fr))

  @media (max-width: 560px)
    grid-template-columns: minmax(0, 1fr)

.dashboard__empty
  margin-top: 16px
  color: var(--text-secondary-color)
</style>
