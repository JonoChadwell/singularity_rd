<template>
  <article class="sheet" :class="{ compact }">
    <header class="band">
      <span class="part num">{{ part }}</span>
      <span class="title">
        <span v-if="icon" class="icon">{{ icon }}</span>
        <h3>{{ title }}</h3>
      </span>
      <slot name="head" />
    </header>
    <p v-if="subtitle" class="sub">{{ subtitle }}</p>
    <div class="body"><slot /></div>
    <footer v-if="$slots.foot" class="foot"><slot name="foot" /></footer>
  </article>
</template>

<script setup lang="ts">
defineProps<{ part: string; title: string; icon?: string; subtitle?: string; compact?: boolean }>()
</script>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: var(--ink);
  background:
    repeating-linear-gradient(0deg, rgb(0 0 0 / 0.018) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, var(--paper), var(--paper-2));
  border: 1px solid #000;
  box-shadow: 0 2px 0 rgb(0 0 0 / 0.4), 0 6px 18px rgb(0 0 0 / 0.35);
  font-family: var(--font-paper);
  font-size: 13px;
}

.band {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--paper-head);
  color: var(--paper);
}

.part {
  font-size: 11px;
  padding: 0 4px;
  border: 1px solid currentColor;
  opacity: 0.8;
}

.title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon {
  font-size: 16px;
}

h3 {
  font-size: 15px;
  letter-spacing: 0.06em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  margin: 0;
  padding: 8px 12px 0;
  color: var(--ink-2);
  font-style: italic;
}

.body {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.compact .body {
  padding: 6px 10px 8px;
  gap: 6px;
}

.foot {
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px dashed var(--rule);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

/* Section headings and paper text inside any sheet. */
.sheet :deep(h4) {
  margin: 0 0 4px;
  font-family: var(--font-label);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
  border-bottom: 2px solid var(--ink);
  padding-bottom: 1px;
}

.sheet :deep(p) {
  margin: 0;
}

.sheet :deep(.note) {
  color: var(--ink-2);
  font-size: 12px;
}

.sheet :deep(.good) {
  color: #1d6a1a;
}

.sheet :deep(.warn) {
  color: #8a5300;
}

.sheet :deep(.bad) {
  color: #a3200f;
}

.sheet :deep(.muted) {
  color: var(--ink-2);
}

.sheet :deep(.chip) {
  color: var(--ink-2);
}

.sheet :deep(button.link) {
  color: #6a3d00;
  border-color: var(--rule);
}

.sheet :deep(button.link:hover:not(:disabled)) {
  background: rgb(0 0 0 / 0.06);
}
</style>
