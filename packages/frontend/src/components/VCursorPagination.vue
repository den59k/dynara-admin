<template>
  <!-- Keyset (next/prev) pager for pages without a `.count()`: no total is known,
       so we only offer stepping forward and back. -->
  <nav class="v-pagination v-pagination--cursor" role="navigation">
    <button
      type="button"
      class="v-pagination__button"
      :disabled="!hasPrev"
      :title="t('pager.prev')"
      @click="emit('prev')"
    >
      <VIcon icon="chevron-left" />
    </button>
    <button
      type="button"
      class="v-pagination__button"
      :disabled="!hasNext"
      :title="t('pager.next')"
      @click="emit('next')"
    >
      <VIcon icon="chevron-right" />
    </button>
  </nav>
</template>

<script lang="ts" setup>
import VIcon from './VIcon.vue'
import { t } from '../i18n'

defineProps<{
  hasPrev: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{ prev: []; next: [] }>()
</script>

<style lang="sass">
.v-pagination--cursor
  gap: 4px
</style>
