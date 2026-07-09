<template>
  <nav class="v-pagination" role="navigation">
    <button
      type="button"
      class="v-pagination__button"
      :disabled="page === 0"
      :title="t('pager.prev')"
      @click="go(page - 1)"
    >
      <VIcon icon="chevron-left" />
    </button>
    <template v-for="(entry, i) in entries" :key="i">
      <span v-if="entry === '…'" class="v-pagination__ellipsis">…</span>
      <button
        v-else
        type="button"
        class="v-pagination__button"
        :class="{ active: entry === page }"
        @click="go(entry)"
      >{{ entry + 1 }}</button>
    </template>
    <button
      type="button"
      class="v-pagination__button"
      :disabled="page >= totalPages - 1"
      :title="t('pager.next')"
      @click="go(page + 1)"
    >
      <VIcon icon="chevron-right" />
    </button>
    <span class="v-pagination__range">
      {{ t('pager.range', { from: page * pageSize + 1, to: Math.min((page + 1) * pageSize, total), total }) }}
    </span>
  </nav>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import VIcon from './VIcon.vue'
import { t } from '../i18n'

const props = defineProps<{
  // 0-based current page.
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{ 'update:page': [page: number] }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

// Numbered pages with ellipsis: always the first and last page, the current
// page ±1, and "…" where pages are skipped — at most 7 slots.
const entries = computed<(number | '…')[]>(() => {
  const count = totalPages.value
  const current = Math.min(props.page, count - 1)
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)
  const shown = new Set<number>([0, count - 1])
  for (let i = current - 1; i <= current + 1; i++) {
    if (i > 0 && i < count - 1) shown.add(i)
  }
  // Near an edge, widen the window so the control keeps a stable size.
  if (current <= 2) { shown.add(1); shown.add(2); shown.add(3) }
  if (current >= count - 3) { shown.add(count - 2); shown.add(count - 3); shown.add(count - 4) }
  const sorted = [...shown].sort((a, b) => a - b)
  const result: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…')
    result.push(sorted[i])
  }
  return result
})

const go = (target: number) => {
  const clamped = Math.min(Math.max(target, 0), totalPages.value - 1)
  if (clamped !== props.page) emit('update:page', clamped)
}
</script>

<style lang="sass">
.v-pagination
  display: flex
  align-items: center
  gap: 4px

.v-pagination__button
  display: flex
  align-items: center
  justify-content: center
  min-width: 30px
  height: 30px
  padding: 0 6px
  box-sizing: border-box
  background: none
  border: none
  border-radius: 8px
  color: var(--text-unselected-color)
  font-size: 13px
  font-weight: 500
  font-variant-numeric: tabular-nums
  cursor: pointer

  svg
    width: 16px
    height: 16px

  &:hover
    background-color: var(--hover-color)
    color: var(--text-color)

  &.active
    background-color: var(--background-active-color)
    color: var(--text-color)
    font-weight: 600

  &:disabled
    opacity: 0.35
    pointer-events: none

  &:focus-visible
    outline: none
    box-shadow: 0 0 0 2px var(--focus-color)

.v-pagination__ellipsis
  min-width: 22px
  text-align: center
  color: var(--text-secondary-color)
  font-size: 13px
  user-select: none

.v-pagination__range
  margin-left: 10px
  font-size: 13px
  color: var(--text-secondary-color)
  font-variant-numeric: tabular-nums
</style>
