<template>
  <VFormControl class="v-input-text v-input-number" :label-id="labelId" :label="props.label" :error="error" outline>
    <input
      :id="labelId"
      ref="inputRef"
      type="number"
      :step="props.integer ? 1 : 'any'"
      :name="name"
      :placeholder="placeholder"
      :value="model ?? ''"
      @input="onInput"
    />
    <VInputClear v-if="nullable && model != null" @clear="model = null" />
  </VFormControl>
</template>

<script lang="ts" setup>
import { onMounted, ref, useId } from 'vue';
import VFormControl from '../VFormControl.vue';
import VInputClear from './VInputClear.vue';

const props = defineProps<{
  id?: string,
  label?: string,
  error?: string,
  autofocus?: boolean,
  name?: string,
  placeholder?: string,
  integer?: boolean,
  nullable?: boolean
}>()

// A cleared field is null when the schema allows it, otherwise undefined — so
// the key is dropped from the JSON body and required-field validation fires
// instead of sending a bogus "" or NaN.
const model = defineModel<number | null | undefined>()

const labelId = props.id ?? useId()

const onInput = (e: Event) => {
  const raw = (e.target as HTMLInputElement).value
  if (raw === "") {
    model.value = props.nullable ? null : undefined
    return
  }
  const parsed = props.integer ? parseInt(raw, 10) : parseFloat(raw)
  if (!Number.isNaN(parsed)) model.value = parsed
}

const inputRef = ref<HTMLInputElement>()
onMounted(() => {
  if (props.autofocus || props.error) {
    inputRef.value?.focus()
  }
})
</script>

<style lang="sass">
.v-input-number
  input
    -moz-appearance: textfield

  input::-webkit-outer-spin-button, input::-webkit-inner-spin-button
    -webkit-appearance: none
    margin: 0
</style>
