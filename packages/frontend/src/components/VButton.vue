<template>
  <component :is="props.component ?? 'button'" class="v-button" :class="{ disabled, flat, outline, small }">
    <slot></slot>
  </component>
</template>

<script lang="ts" setup>

const props = defineProps<{
  component?: string,
  disabled?: boolean,
  outline?: boolean,
  flat?: boolean,
  small?: boolean
}>()

</script>

<style lang="sass">
.v-button
  display: inline-flex
  align-items: center
  justify-content: center
  height: 36px
  padding: 0 16px
  border: 1px solid transparent
  border-radius: 8px
  box-sizing: border-box
  background-color: var(--primary-color)
  color: white
  font-size: 13px
  font-weight: 550
  gap: 6px
  cursor: pointer
  white-space: nowrap
  flex-shrink: 0
  transition: background-color 0.1s, border-color 0.1s

  &:hover
    background-color: var(--primary-color-hover)
    text-decoration: none

  &:active
    background-color: var(--primary-color-pressed)

  svg
    width: 16px
    height: 16px
    margin-left: -4px
    flex-shrink: 0

  &:focus-visible
    box-shadow: 0 0 0 2px var(--focus-color)
    outline: none

  &.small
    height: 32px
    padding: 0 12px

  &.outline
    background: none
    border-color: var(--input-border-color)
    color: var(--text-color)

    &:hover
      background-color: var(--hover-color)

    &:active
      background-color: var(--background-active-color)

  &.flat
    background: none
    color: var(--text-color)

    &:hover
      background-color: var(--hover-color)

    &:active
      background-color: var(--background-active-color)

  &.disabled
    pointer-events: none
    opacity: 0.5

  // Destructive variant — combines with the base, outline and flat styles.
  &.danger
    background-color: var(--error-color)

    &:hover
      background-color: color-mix(in srgb, var(--error-color) 88%, white)

    &:active
      background-color: color-mix(in srgb, var(--error-color) 88%, black)

    &.outline, &.flat
      background: none
      color: var(--error-color)

      &:hover
        background-color: color-mix(in srgb, var(--error-color) 10%, transparent)

    &.outline
      border-color: color-mix(in srgb, var(--error-color) 35%, transparent)

</style>