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
  border-radius: 9999px
  cursor: pointer
  padding: 0
  outline: none
  flex-shrink: 0

  &:hover
    background-color: var(--hover-color)

</style>