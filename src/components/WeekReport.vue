<template>
  <section class="panel">
    <h2>Week report</h2>
    <template v-if="lastWeek !== null">
      <p class="muted small">Week {{ lastWeek }}</p>
      <ul class="plain-list changes small">
        <li v-for="c in changes" :key="c.label">
          <span>{{ c.icon }} {{ c.label }}</span>
          <span class="num" :class="c.amount >= 0 ? 'delta-up' : 'delta-down'">
            {{ c.amount >= 0 ? '+' : '−' }}{{ fmt(Math.abs(c.amount)) }}
          </span>
        </li>
      </ul>
    </template>
    <h2 class="log-head">Log</h2>
    <ol class="plain-list log">
      <li v-for="(e, i) in entries" :key="i" :class="e.tone">
        <span class="week num">{{ e.week }}</span>
        <span>{{ e.text }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { byTier, fmt } from '@/engine/model'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const entries = computed(() => [...game.state.log].reverse().slice(0, 120))
const lastWeek = computed(() => (game.state.lastWeek ? game.state.week - 1 : null))

/** Net change in each stock last week. */
const changes = computed(() => {
  const report = game.state.lastWeek
  if (!report) return []
  return byTier(game.state.resources)
    .filter((r) => r.kind === 'stock')
    .map((r) => ({
      icon: r.icon,
      label: r.name,
      amount: (report.flows[r.id] ?? []).reduce((n, f) => n + f.amount, 0)
    }))
    .filter((c) => Math.abs(c.amount) > 1e-9)
})
</script>

<style scoped>
.changes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
}

.changes li {
  display: flex;
  justify-content: space-between;
}

.log-head {
  margin-top: 4px;
}

.log {
  max-height: 520px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.log li {
  display: flex;
  gap: 8px;
}

.week {
  color: var(--muted);
  min-width: 26px;
  text-align: right;
  font-size: 12px;
  padding-top: 1px;
}
</style>
