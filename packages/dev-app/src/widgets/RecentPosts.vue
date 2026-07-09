<template>
  <ul class="recent-posts">
    <li v-for="p in data?.posts ?? []" :key="p.id" class="recent-posts__item">
      <span class="recent-posts__title">{{ p.title }}</span>
      <span class="recent-posts__badge" :class="{ 'is-published': p.published }">
        {{ p.published ? 'Published' : 'Draft' }}
      </span>
    </li>
    <li v-if="!(data?.posts?.length)" class="recent-posts__empty">No posts yet</li>
  </ul>
</template>

<script setup lang="ts">
// A custom dashboard widget. It receives whatever the widget's server-side `data`
// resolver returned as its `data` prop — here `{ posts: [...] }`.
defineProps<{ data?: { posts: { id: number; title: string; published: boolean }[] } }>()
</script>

<style>
.recent-posts {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.recent-posts__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
}
.recent-posts__item:last-child {
  border-bottom: none;
}
.recent-posts__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-posts__badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--text-secondary-color);
  background-color: color-mix(in srgb, var(--text-secondary-color) 15%, transparent);
}
.recent-posts__badge.is-published {
  color: #2ecc71;
  background-color: color-mix(in srgb, #2ecc71 15%, transparent);
}
.recent-posts__empty {
  color: var(--text-secondary-color);
  padding: 8px 0;
}
</style>
