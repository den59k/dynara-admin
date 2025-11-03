<template>
  <JsonInput 
    v-for="(schema, key) in props.schema.properties"
    :model-value="modelValue[key]"
    :schema="schema"
  />
</template>

<script lang="ts" setup>
import { JsonInput, type Schema } from './GetInput';

const props = defineProps<{ schema: Schema }>()

const modelValue = defineModel<Record<string, any>>({ default: {} })

</script>

<style lang="sass">

</style>