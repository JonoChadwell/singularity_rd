<template>
  <article class="card small" :class="{ chosen, blocked }" @click="emit('select')">
    <div class="body"><slot /></div>
    <footer class="foot" @click.stop>
      <slot name="actions" />
    </footer>
  </article>
</template>

<script setup lang="ts">
defineProps<{ chosen?: boolean; blocked?: boolean }>()
const emit = defineEmits<{ select: [] }>()
</script>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  min-width: 0;
}

.card.chosen {
  border-color: var(--accent);
  color: var(--text);
}

.card.blocked {
  opacity: 0.75;
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: default;
}
</style>
