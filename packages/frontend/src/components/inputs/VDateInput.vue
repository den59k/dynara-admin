<template>
  <VFormControl class="v-input-text v-date-input" :label-id="labelId" :label="props.label" :error="error" outline>
    <input
      :id="labelId"
      ref="inputRef"
      :type="props.datetime ? 'datetime-local' : 'date'"
      :name="name"
      :value="displayValue"
      @input="onInput"
    />
    <VInputClear v-if="nullable && model != null && model !== ''" @clear="model = null" />
  </VFormControl>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, useId } from 'vue';
import VFormControl from '../VFormControl.vue';
import VInputClear from './VInputClear.vue';

const props = defineProps<{
  id?: string,
  label?: string,
  error?: string,
  autofocus?: boolean,
  name?: string,
  datetime?: boolean,
  nullable?: boolean
}>()

// The value is the native input string ("YYYY-MM-DD" / "YYYY-MM-DDTHH:mm").
// A cleared field is null when the schema allows it, otherwise undefined so
// the key is dropped from the JSON body.
const model = defineModel<string | number | null | undefined>()

const labelId = props.id ?? useId()

// Stored values may be full ISO strings or an epoch-millis number (however the
// page's `item()` serialized its Date); the native input only accepts its exact
// format, so normalize before trimming to it.
const displayValue = computed(() => {
  const v = model.value
  if (v == null || v === '') return ''
  const iso = typeof v === 'number' ? new Date(v).toISOString() : v
  return props.datetime ? iso.slice(0, 16) : iso.slice(0, 10)
})

const onInput = (e: Event) => {
  const raw = (e.target as HTMLInputElement).value
  model.value = raw === "" ? (props.nullable ? null : undefined) : raw
}

const inputRef = ref<HTMLInputElement>()
onMounted(() => {
  if (props.autofocus || props.error) {
    inputRef.value?.focus()
  }
})
</script>

<style lang="sass">
.v-date-input
  input::-webkit-calendar-picker-indicator
    cursor: pointer
    opacity: 0.6
</style>
