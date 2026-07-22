<template>
  <ul class="user-posts">
    <li v-for="p in modelValue ?? []" :key="p.id" class="user-posts__item">
      <span class="user-posts__title">{{ p.title }}</span>
      <span class="user-posts__badge" :class="{ 'is-published': p.published }">
        {{ p.published ? 'Published' : 'Draft' }}
      </span>
    </li>
    <li v-if="!(modelValue?.length)" class="user-posts__empty">No posts yet</li>
  </ul>
</template>

<script setup lang="ts">
// A custom form-field component (display-only, declared with `type:
// "component"` in the update form schema). `modelValue` is whatever the page's
// `.item()` returned under the field's key — here the user's recent posts. The
// whole form's current values (including the record id) are also available as
// a `values` prop for components that need sibling fields.
defineProps<{ modelValue?: { id: number; title: string; published: boolean }[] }>()
</script>

<style>
.user-posts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.user-posts__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}
.user-posts__item:last-child {
  border-bottom: none;
}
.user-posts__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-posts__badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  color: var(--text-secondary-color);
  background-color: color-mix(in srgb, var(--text-secondary-color) 15%, transparent);
}
.user-posts__badge.is-published {
  color: var(--success-color);
  background-color: color-mix(in srgb, var(--success-color) 15%, transparent);
}
.user-posts__empty {
  color: var(--text-secondary-color);
  padding: 7px 12px;
  font-size: 13px;
}
</style>
