<template>
  <!-- Built-in stat card -->
  <component
    :is="widget.link ? 'button' : 'div'"
    v-if="widget.type === 'stat'"
    class="dash-widget dash-widget--stat"
    :class="{ 'dash-widget--link': widget.link }"
    :style="spanStyle"
    @click="widget.link && router.push(pageTo(widget.link))"
  >
    <div class="dash-widget__head">
      <span class="dash-widget__title">{{ widget.title }}</span>
      <VIcon v-if="widget.icon" :icon="widget.icon" class="dash-widget__icon" />
    </div>
    <div v-if="pending" class="dash-widget__value dash-widget__muted">—</div>
    <template v-else>
      <div class="dash-widget__value">{{ statData?.value ?? '—' }}</div>
      <div v-if="statData?.label || statData?.delta != null" class="dash-widget__sub">
        <span
          v-if="statData?.delta != null"
          class="dash-widget__delta"
          :class="statData.delta >= 0 ? 'dash-widget__delta--up' : 'dash-widget__delta--down'"
        >
          <VIcon :icon="statData.delta >= 0 ? 'arrow-up' : 'arrow-down'" />
          {{ Math.abs(statData.delta) }}%
        </span>
        <span v-if="statData?.label" class="dash-widget__label">{{ statData.label }}</span>
      </div>
    </template>
  </component>

  <!-- Custom Vue widget -->
  <div v-else class="dash-widget dash-widget--component" :style="spanStyle">
    <div v-if="widget.title" class="dash-widget__head">
      <span class="dash-widget__title">{{ widget.title }}</span>
    </div>
    <div v-if="pending" class="dash-widget__muted">{{ t('data.loading') }}</div>
    <component v-else-if="custom" :is="custom" :data="data" />
  </div>
</template>

<script lang="ts" setup>
import { computed, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRequestWatch } from 'vuesix'
import { dashboardApi, type DashboardWidget, type StatValue } from '../../api/dashboardApi'
import { UI_BASE } from '../../api/request'
import { t } from '../../i18n'
import VIcon from '../VIcon.vue'

const props = defineProps<{ widget: DashboardWidget, index: number }>()

const router = useRouter()
const pageTo = (path: string) => (path.startsWith('/') ? path : `/${path}`)

const spanStyle = computed(() => ({
  gridColumn: `span ${Math.min(Math.max(props.widget.span ?? 1, 1), 4)}`,
}))

// Fetch the widget's server-resolved data (only when it has a resolver).
const indexRef = computed(() => props.index)
const { data, pending } = props.widget.hasData
  ? useRequestWatch(dashboardApi.getWidgetData, indexRef)
  : { data: shallowRef(null), pending: shallowRef(false) }

const statData = computed<StatValue | null>(() => (props.widget.type === 'stat' ? data.value : null))

// For a component widget, dynamically import its compiled module (same pipeline
// as custom page components), passing the auth token so the import is authorized.
const custom = shallowRef<any>(null)
watch(() => props.widget, async (widget) => {
  if (widget.type !== 'component' || !widget.component) { custom.value = null; return }
  const jwt = window.localStorage.getItem('dynara-admin__token')
  const suffix = jwt ? `?token=${encodeURIComponent(jwt)}` : ''
  const mod = await import(/* @vite-ignore */ `${UI_BASE}/custom/${widget.component}${suffix}`)
  custom.value = mod.default
}, { immediate: true })
</script>

<style lang="sass">
.dash-widget
  border: 1px solid var(--border-color)
  border-radius: 12px
  background-color: var(--paper-color)
  padding: 18px 20px
  box-sizing: border-box
  min-width: 0

.dash-widget__head
  display: flex
  align-items: center
  justify-content: space-between
  gap: 8px

.dash-widget__title
  font-size: 13px
  font-weight: 500
  color: var(--text-secondary-color)

.dash-widget__icon
  width: 18px
  height: 18px
  color: var(--text-secondary-color)

.dash-widget--stat
  text-align: left
  font: inherit
  width: 100%
  display: block

  &.dash-widget--link
    cursor: pointer

    &:hover
      border-color: var(--primary-color)

.dash-widget__value
  font-size: 28px
  font-weight: 650
  color: var(--text-color)
  margin-top: 10px
  line-height: 1.1

.dash-widget__muted
  color: var(--text-secondary-color)

.dash-widget__sub
  display: flex
  align-items: center
  gap: 8px
  margin-top: 6px
  font-size: 13px

.dash-widget__delta
  display: inline-flex
  align-items: center
  gap: 2px
  font-weight: 600

  svg
    width: 12px
    height: 12px

  &.dash-widget__delta--up
    color: var(--success-color)

  &.dash-widget__delta--down
    color: var(--error-color)

.dash-widget__label
  color: var(--text-secondary-color)
</style>
