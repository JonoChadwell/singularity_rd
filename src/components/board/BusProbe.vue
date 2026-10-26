<template>
  <div class="probe" role="tooltip">
    <div class="head">
      <span class="lbl">Probe</span>
      <strong>{{ resource.name }}</strong>
      <span class="lbl">next week</span>
    </div>
    <template v-if="flows.length">
      <div v-for="f in flows" :key="f.label" class="row" :class="{ loss: isLoss(f.label) }">
        <span class="bar" :class="f.amount >= 0 ? 'in' : 'out'" :style="{ width: `${Math.max(2, (46 * Math.abs(f.amount)) / biggest)}px` }" />
        <span class="what">{{ f.label }}</span>
        <span class="num" :class="f.amount >= 0 ? 'delta-up' : 'delta-down'">{{ signed(f.amount) }}</span>
      </div>
      <div class="row total num">
        <span class="bar" />
        <span class="what">Net</span>
        <span>{{ signed(netFlow(game.preview, resource.id)) }}</span>
      </div>
    </template>
    <p v-else class="muted">Nothing makes or uses this next week.</p>

    <template v-if="pending.length">
      <div class="head sub"><span class="lbl">Still to come</span></div>
      <div v-for="(d, i) in pending" :key="i" class="row">
        <span class="bar cap" />
        <span class="what">{{ d.name }} <span class="muted">· {{ deliveryTiming(d) }}</span></span>
        <span class="num delta-up">+{{ fmt(d.amount) }}{{ d.weeks === 1 ? '' : '/wk' }}</span>
      </div>
      <div class="row total num">
        <span class="bar" />
        <span class="what">Still owed</span>
        <span>{{ owed }}</span>
      </div>
      <p v-if="overflowsLater" class="warn">
        More than its storage holds: {{ fmt(overflowsLater) }} would be lost at today’s level.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { netFlow } from '@/engine/economy'
import { capOf, deliveryLeft, deliveryTiming, fmt, isLoss } from '@/engine/model'
import type { Resource } from '@/engine/types'
import { useGameStore } from '@/stores/game'

const props = defineProps<{ resource: Resource }>()
const game = useGameStore()

const flows = computed(() => game.preview.flows[props.resource.id] ?? [])
const biggest = computed(() => Math.max(1e-9, ...flows.value.map((f) => Math.abs(f.amount))))
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`
/** Create payouts still to come into it, soonest first. */
const pending = computed(() =>
  game.state.deliveries
    .filter((d) => d.target.kind === 'resource' && d.target.id === props.resource.id)
    .sort((a, b) => a.delay - b.delay)
)
/** What timed payouts still owe in all, plus any that pay for good. */
const owed = computed(() => {
  const timed = pending.value.filter((d) => d.weeks !== null).reduce((n, d) => n + deliveryLeft(d), 0)
  const forever = pending.value.filter((d) => d.weeks === null).reduce((n, d) => n + d.amount, 0)
  return [timed ? `+${fmt(timed)}` : '', forever ? `+${fmt(forever)}/wk for good` : ''].filter(Boolean).join(' and ')
})
/** How much of the timed payouts wouldn't fit, if what's held now stayed put. */
const overflowsLater = computed(() =>
  Math.max(
    0,
    props.resource.amount +
      pending.value.filter((d) => d.weeks !== null).reduce((n, d) => n + deliveryLeft(d), 0) -
      capOf(game.state, props.resource)
  )
)
</script>

<style scoped>
.probe {
  position: absolute;
  z-index: 30;
  top: calc(100% + 4px);
  left: 0;
  width: 330px;
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--lcd-fg);
  background: var(--lcd-bg);
  border: 1px solid #000;
  box-shadow: inset 0 0 18px rgb(0 0 0 / 0.6), 0 10px 26px rgb(0 0 0 / 0.6);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
  font-family: var(--font-label);
  font-size: 13px;
}

.head .lbl {
  color: var(--lcd-dim);
}

.head strong {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.head.sub {
  margin-top: 8px;
}

.row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  padding: 1px 0;
}

.row.loss .what {
  color: var(--led-r);
}

.bar {
  height: 6px;
  justify-self: end;
}

.bar.in {
  background: var(--led-g);
}

.bar.out {
  background: var(--led-r);
}

.bar.cap {
  width: 6px;
  height: 6px;
  border: 1px solid var(--lcd-fg);
}

.what {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.total {
  border-top: 1px solid var(--lcd-dim);
  margin-top: 3px;
  padding-top: 3px;
  font-weight: 600;
}

p {
  margin: 4px 0 0;
}

.muted {
  color: var(--lcd-dim);
}
</style>
