<template>
  <div class="v-form-control" :class="{ error: !!props.error, disabled: props.disabled }">
    <label v-if="!!props.label" :for="props.labelId" class="v-form-control__label">
      {{ props.label }}<span v-if="props.required" class="v-form-control__required-marker">*</span>
    </label>
    <div v-if="props.outline" class="v-form-control__outline">
      <slot></slot>
    </div>
    <slot v-else></slot>
    <div v-if="$slots.actions" class="v-form-control__actions">
      <slot name="actions"></slot>
    </div>
    <Transition>
      <div v-if="!!props.error" class="v-form-control__error">
        {{ error }}
      </div>
    </Transition>
  </div>
</template>

<script lang="ts">

export type VFormControlProps = {
  error?: { message?: string, code?: string } | string,
  label?: string,
  labelId?: string,
  required?: boolean,
  disabled?: boolean
}

</script>

<script lang="ts" setup>
import { computed, inject } from 'vue';
import { t } from '../i18n';

const props = defineProps<VFormControlProps & { outline?: boolean }>()

const error = computed(() => {
  if (!props.error) return ""
  if (typeof props.error === "string") return errorMap[props.error] ?? props.error
  const code = props.error["code"]
  if (code && code in errorMap) {
    return errorMap[code] ?? ""
  }
  return props.error.message ?? t('common.error')
})

const errorMap = inject("errorMap", {}) as Record<string, string>

</script>

<style lang="sass">

.v-form-control
  display: flex
  flex-direction: column
  align-items: stretch
  position: relative
  transition: padding-bottom 0.12s cubic-bezier(0.4, 0, 0.2, 1)

  &.error
    &:not(.disablePadding)
      padding-bottom: 16px

    .v-form-control__label
      color: var(--error-color)

    .v-form-control__outline
      border-color: var(--error-color)

  &.disabled
    pointer-events: none
    opacity: 0.6

.v-form-control .v-icon-button
  background-color: var(--placeholder-color)
  color: white
  width: 20px
  height: 20px
  border: 2px solid var(--blocks-color)

  &:hover
    background-color: var(--input-border-color)

  &:focus-within
    background-color: var(--input-border-color)

.v-form-control__outline
  display: flex
  border-radius: 8px
  font-size: 13px
  position: relative
  box-sizing: border-box
  border: 1px solid var(--input-border-color)
  background-color: var(--input-background)
  transition: border-color 0.12s, box-shadow 0.12s

  &:hover
    border-color: color-mix(in srgb, var(--input-border-color) 60%, var(--text-secondary-color))

  &:focus-within
    border-color: var(--primary-color)
    box-shadow: 0 0 0 3px var(--shadow-color)

.v-form-control__label
  font-size: 13px
  margin-bottom: 6px
  white-space: nowrap
  font-weight: 500
  user-select: none
  color: var(--text-color-alt)

.v-form-control__required-marker
  color: var(--primary-color)
  user-select: none
  margin-left: 0.15em

.v-form-control__error
  position: absolute
  bottom: 0
  font-size: 12px
  color: var(--error-color)
  transition: opacity 0.12s, transform 0.12s cubic-bezier(0.4, 0, 0.2, 1)
  width: 100%

  &.v-enter-from, &.v-leave-to
    opacity: 0

.v-form-control.disablePadding .v-form-control__error
  bottom: -16px
  &.v-enter-from, &.v-leave-to
    transform: translateY(-16px)

.v-form-control__actions
  position: absolute
  top: -4px
  right: 0
  display: flex
  align-items: center

  .v-icon-button
    width: 24px
    height: 24px
    color: var(--text-secondary-color)

  svg
    max-width: 16px
    max-height: 16px

</style>