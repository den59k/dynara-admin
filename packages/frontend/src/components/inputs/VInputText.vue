<template>
  <VFormControl class="v-input-text" :label-id="labelId" :label="props.label" :error="error" outline>
    <input ref="inputRef" :id="labelId" v-model="model" :name="name" :placeholder="placeholder"/>
  </VFormControl>
</template>

<script lang="ts" setup>
import { onMounted, ref, useId } from 'vue';
import VFormControl from '../VFormControl.vue';

const props = defineProps<{ 
  id?: string, 
  label?: string, 
  error?: string, 
  autofocus?: boolean, 
  name?: string, 
  placeholder?: string 
}>()
const model = defineModel<string>()

const labelId = props.id ?? useId()

const inputRef = ref<HTMLInputElement>()
onMounted(() => {
  if (props.autofocus || props.error) {
    inputRef.value?.focus()
  }
})

</script>

<style lang="sass">

.v-input-text
  min-width: 200px
  .v-form-control__outline
    height: 40px
    &>svg
      align-self: center
      color: #CED4DA

  input, textarea
    height: 100%
    flex-grow: 1
    background: none
    border: none
    padding: 0 12px
    outline: none
    position: relative
    z-index: 1
    width: 20px
    color: var(--text-color)
    font-size: 13px
    border-radius: 7px

    &::placeholder
      color: var(--placeholder-color)

  input
    padding-right: 4px

  textarea
    box-sizing: border-box
    line-height: 1.4em
    padding: 10px 14px
    resize: none
    min-height: 60px

.v-input-textarea .v-form-control__outline
  height: auto

.v-input-text__start-adornment
  padding: 0 16px
  border-right: 1px solid #CED4DA
  display: flex
  align-items: center
  justify-content: center

.v-input-text__max-length
  position: absolute
  bottom: 2px
  right: 10px
  font-size: 12px
  color: #C8CCD0

.v-input-text.disabled .v-input-text__input-wrapper
  background-color: #F2F2F4
  pointer-events: none



</style>