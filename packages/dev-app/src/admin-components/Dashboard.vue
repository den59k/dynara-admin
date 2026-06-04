<template>
  <div class="dashboard__main">
    {{ data }}
  </div>
</template>

<script lang="ts" setup>
import { useData } from 'marci-admin/ui'

const { data, error } = useData("chart")

</script>

<style lang="sass">
.dashboard__main
  height: 400px
  border: 1px solid var(--border-color)
  border-radius: 10px
</style>