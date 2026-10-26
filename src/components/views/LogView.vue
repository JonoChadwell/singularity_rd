<template>
  <div class="logview">
    <section v-if="lastWeek !== null" class="scope" aria-label="Last week">
      <header class="scope-head">
        <h2>Week {{ lastWeek }}</h2>
        <span class="lbl">Change in each stock</span>
      </header>
      <div v-if="changes.length" class="bars">
        <div v-for="c in changes" :key="c.id" class="bar-row">
          <span class="name">{{ c.icon }} {{ c.label }}</span>
          <span class="axis">
            <span class="half neg"><span v-if="c.amount < 0" class="bar out" :style="{ width: `${pct(c.amount)}%` }" /></span>
            <span class="half pos"><span v-if="c.amount > 0" class="bar in" :style="{ width: `${pct(c.amount)}%` }" /></span>
          </span>
          <span class="num" :class="c.amount >= 0 ? 'delta-up' : 'delta-down'">{{ c.amount >= 0 ? '+' : '−' }}{{ fmt(Math.abs(c.amount)) }}</span>
        </div>
      </div>
      <p v-else class="lbl">Nothing changed.</p>
    </section>

    <section class="tape" aria-label="Log">
      <ol class="plain-list">
        <li v-for="(e, i) in entries" :key="i" :class="e.tone">
          <span class="wk num">{{ String(e.week).padStart(3, '0') }}</span>
          <span>{{ e.text }}</span>
        </li>
      </ol>
      <p v-if="!entries.length" class="wk">— no entries —</p>
    </section>
  </div>
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
    .map((r) => ({
      id: r.id,
      icon: r.icon,
      label: r.name,
      amount: (report.flows[r.id] ?? []).reduce((n, f) => n + f.amount, 0)
    }))
    .filter((c) => Math.abs(c.amount) > 1e-9)
})
/** Bars share a log scale, so a small trickle still shows next to a flood. */
const biggest = computed(() => Math.max(1, ...changes.value.map((c) => Math.log10(1 + Math.abs(c.amount)))))
const pct = (n: number) => Math.max(2, (100 * Math.log10(1 + Math.abs(n))) / biggest.value)
</script>

<style scoped>
.logview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.scope {
  padding: 10px 12px;
  background: var(--lcd-bg);
  border: 1px solid #000;
  box-shadow: inset 0 0 24px rgb(0 0 0 / 0.6);
  color: var(--lcd-fg);
  font-family: var(--font-mono);
  font-size: 12px;
}

.scope-head {
  display: flex;
  gap: 10px;
  align-items: baseline;
  margin-bottom: 8px;
}

.scope-head h2 {
  color: var(--lcd-fg);
}

.scope .lbl {
  color: var(--lcd-dim);
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bar-row {
  display: grid;
  grid-template-columns: minmax(0, 150px) 1fr 70px;
  gap: 8px;
  align-items: center;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.axis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 10px;
}

.half {
  display: flex;
}

.half.neg {
  justify-content: flex-end;
  border-right: 1px solid var(--lcd-dim);
}

.bar {
  height: 100%;
}

.bar.in {
  background: var(--led-g);
  box-shadow: 0 0 4px var(--led-g);
}

.bar.out {
  background: var(--led-r);
  box-shadow: 0 0 4px var(--led-r);
}

.bar-row .num {
  text-align: right;
}

.tape {
  padding: 10px 14px;
  color: #2b2b26;
  background:
    repeating-linear-gradient(180deg, transparent 0 19px, rgb(0 0 0 / 0.05) 19px 20px),
    #e8e6dc;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 20px;
  max-height: 70vh;
  overflow-y: auto;
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.5);
}

.tape li {
  display: flex;
  gap: 10px;
}

.tape li.good {
  color: #1d6a1a;
}

.tape li.bad {
  color: #a3200f;
}

.tape li.ai {
  color: #1f4f8a;
}

.wk {
  color: #8a887c;
  flex: none;
}

@media (max-width: 1150px) {
  .logview {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
