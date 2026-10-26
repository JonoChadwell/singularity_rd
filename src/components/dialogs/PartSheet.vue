<template>
  <article class="part" :class="{ chosen, blocked }" @click="emit('select')">
    <header class="band">
      <span class="no num">{{ part }}</span>
      <span class="title">{{ title }}</span>
      <span v-if="chosen" class="pick" aria-label="Chosen">●</span>
    </header>
    <div class="body"><slot /></div>
    <footer v-if="$slots.actions" class="foot" @click.stop>
      <slot name="actions" />
    </footer>
  </article>
</template>

<script setup lang="ts">
defineProps<{ part: string; title: string; chosen?: boolean; blocked?: boolean }>()
const emit = defineEmits<{ select: [] }>()
</script>

<style scoped>
/* One of Jev's options, as a little part datasheet. */
.part {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: var(--ink);
  background:
    repeating-linear-gradient(0deg, rgb(0 0 0 / 0.02) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, var(--paper), var(--paper-2));
  border: 1px solid #000;
  box-shadow: 0 3px 10px rgb(0 0 0 / 0.45);
  cursor: pointer;
  font-size: 12.5px;
  transition: transform 0.12s;
}

.part:hover {
  transform: translateY(-2px);
}

.part.chosen {
  outline: 3px solid var(--led-a);
  outline-offset: 1px;
}

.part.blocked {
  filter: saturate(0.4);
}

.band {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: var(--paper-head);
  color: var(--paper);
}

.no {
  font-size: 10.5px;
  padding: 0 4px;
  border: 1px solid currentColor;
  opacity: 0.8;
}

.title {
  flex: 1;
  min-width: 0;
  font-family: var(--font-label);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.pick {
  color: var(--led-a);
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
}

.body :deep(p) {
  margin: 0;
}

.body :deep(.good) {
  color: #1d6a1a;
}

.body :deep(.warn) {
  color: #8a5300;
}

.body :deep(.bad) {
  color: #a3200f;
}

.body :deep(.muted) {
  color: var(--ink-2);
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px dashed var(--rule);
  cursor: default;
}

.foot :deep(.bad) {
  color: #a3200f;
}
</style>
