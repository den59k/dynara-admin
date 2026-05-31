<template>
  <component :is="props.component ?? 'button'" class="v-button" :class="{ disabled, flat, outline }">
    <slot></slot>
  </component>
</template>

<script lang="ts" setup>

const props = defineProps<{ 
  component?: string, 
  disabled?: boolean, 
  outline?: boolean,
  flat?: boolean 
}>()

</script>

<style lang="sass">
.v-button
  display: flex
  align-items: center
  height: 38px
  padding: 0 20px
  border: none
  border-radius: 4px
  background: none
  box-sizing: border-box
  background-color: var(--primary-color)
  border-radius: 8px
  color: white
  font-size: 13px
  font-weight: 500
  gap: 6px
  cursor: pointer
  justify-content: center
  
  &:hover
    background-color: var(--primary-color-hover)
    text-decoration: none

  &:active
    background-color: var(--primary-color-pressed)

  svg
    margin-left: -4px

  &:focus-visible
    box-shadow: 0 0 0 2px var(--focus-color)
    outline: none

  &.outline
    background: none
    border: 1px solid var(--input-border-color)

    &:hover
      background-color: var(--hover-color)

  &.flat
    background: none

    &:hover
      background-color: var(--hover-color)

  &.disabled
    pointer-events: none
    opacity: 0.5

</style>