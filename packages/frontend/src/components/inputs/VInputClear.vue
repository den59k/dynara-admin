<template>
  <button
    type="button"
    class="v-input-clear"
    :aria-label="t('input.clear')"
    :title="t('input.clear')"
    @click.stop="emit('clear')"
    @pointerdown.stop
  >
    <VIcon icon="close" />
  </button>
</template>

<script lang="ts" setup>
import VIcon from '../VIcon.vue'
import { t } from '../../i18n'

const emit = defineEmits<{ clear: [] }>()
</script>

<style lang="sass">
.v-input-clear
  display: flex
  align-items: center
  justify-content: center
  flex-shrink: 0
  align-self: center
  width: 22px
  height: 22px
  padding: 0
  border: none
  border-radius: 6px
  background: none
  cursor: pointer
  color: var(--text-secondary-color)
  // The input itself is z-index: 1 inside the outline; keep the button above it.
  position: relative
  z-index: 2

  &:hover
    background-color: var(--hover-color)
    color: var(--text-color)

  svg
    width: 14px
    height: 14px
</style>
