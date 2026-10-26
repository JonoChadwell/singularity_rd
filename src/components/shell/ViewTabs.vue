<template>
  <div class="tabs" role="tablist">
    <button
      v-for="t in TABS"
      :key="t.id"
      role="tab"
      type="button"
      :aria-selected="ui.tab === t.id"
      :class="{ on: ui.tab === t.id }"
      @click="ui.tab = t.id"
    >
      {{ t.label }}
      <span v-if="t.count()" class="num badge" :class="t.id === 'manual' ? 'new' : ''">{{ t.count() }}</span>
    </button>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useGameStore } from '@/stores/game'
import { useUiStore, type Tab } from '@/stores/ui'

const game = useGameStore()
const ui = useUiStore()

const TABS: { id: Tab; label: string; count: () => number }[] = [
  { id: 'board', label: 'Board', count: () => 0 },
  { id: 'research', label: 'Research', count: () => game.state.research.length },
  { id: 'manual', label: 'Manual', count: () => game.cards.length },
  { id: 'log', label: 'Log', count: () => 0 }
]
</script>

<style scoped>
.tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 6px;
}

[role='tab'] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px 4px;
  border-bottom: 0;
  border-radius: var(--r) var(--r) 0 0;
  font-size: 13px;
  color: var(--muted);
  background: linear-gradient(180deg, var(--chrome-2), var(--chrome-1));
  box-shadow: inset 1px 1px 0 var(--bevel-hi);
}

[role='tab'].on {
  color: var(--silk);
  background: linear-gradient(180deg, var(--chrome-3), var(--chrome-2));
  box-shadow: inset 1px 1px 0 var(--bevel-hi);
  position: relative;
  top: 1px;
}

.badge {
  font-size: 10px;
  padding: 0 4px;
  background: var(--lcd-bg);
  color: var(--lcd-fg);
  border: 1px solid #000;
}

.badge.new {
  color: #2a1a00;
  background: var(--led-a);
}
</style>
