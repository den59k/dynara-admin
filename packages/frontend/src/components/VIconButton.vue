<template>
  <button class="v-icon-button">
    <VIcon v-if="props.icon" :icon="props.icon"/>
    <slot></slot>
  </button>
</template>

<script lang="ts" setup>
import VIcon from './VIcon.vue';

const props = defineProps<{ icon?: string }>()

</script>

<style lang="sass">
.v-icon-button
  background: none
  border: none
  color: var(--icon-color)
  display: flex
  align-items: center
  justify-content: center
  width: 28px
  height: 28px
  border-radius: 8px
  cursor: pointer
  padding: 0
  outline: none
  flex-shrink: 0
  box-sizing: border-box

  &:hover
    background-color: var(--hover-color)
    color: var(--text-color)

  &:focus-visible
    box-shadow: 0 0 0 2px var(--focus-color)

  &:disabled
    opacity: 0.4
    pointer-events: none

</style>