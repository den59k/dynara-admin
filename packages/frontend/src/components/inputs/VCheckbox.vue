<template>
  <div class="v-checkbox" :class="{ active: model, disabled }" role="checkbox" @click="onClick">
    <div v-if="labelPosition === 'left'" class="v-checkbox__label left">
      <slot name="label">{{ props.label }}</slot>
    </div>
    <div class="v-checkbox__icon" :class="{ active: model }">
      <VIcon icon="check"/>
    </div>
    <div v-if="labelPosition === 'right'" class="v-checkbox__label">
      <slot name="label">{{ props.label }}</slot>
    </div>
  </div>
</template>

<script lang="ts" setup>
import VIcon from '../VIcon.vue';
import { computed, useSlots } from 'vue';

const props = defineProps<{ label?: string, disabled?: boolean, labelPosition?: "left" | "right" }>()
const model = defineModel<boolean>()

const onClick = (_e: MouseEvent) => {
  model.value = !model.value
}

const slots = useSlots()
const labelPosition = computed(() => {
  if (!props.label && !slots.label) return "none"
  if (props.labelPosition === "left") return "left"
  return "right"
})

</script>

<style lang="sass">

.v-checkbox
  display: flex
  align-items: center
  cursor: pointer
  gap: 10px
  user-select: none

  .v-checkbox__label
    color: var(--text-color)
    font-size: 13px

    a
      color: var(--text-color)
      text-decoration: underline

    &.left
      margin-left: 0
  
  &.disabled
    pointer-events: none
    opacity: 0.5

.v-checkbox__icon.active
  color: white
  background-color: var(--primary-color)
  border-color: var(--primary-color)

  svg
    opacity: 1

  &:hover
    background-color: var(--primary-color-hover)

  &:active
    background-color: var(--primary-color-active)

.v-checkbox__icon
  width: 16px
  height: 16px
  border: 1px solid #CCCCCC
  border-radius: 4px
  display: flex
  align-items: center
  justify-content: center
  transition: background-color 0.1s

  &.light
    border-color: var(--input-border-color)
    cursor: pointer

  &:hover
    border-color: #999999

  &:active
    border-color: #777777
  
  @media(max-width: 800px)
    margin-top: 0
  
  svg
    width: 18px
    height: 18px
    opacity: 0

</style>