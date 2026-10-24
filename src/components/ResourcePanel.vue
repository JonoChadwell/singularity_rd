<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Resources</h2>
      <button class="add" @click="ui.openInvent({ kind: 'resource' })">+ Resource</button>
    </div>
    <p class="muted small hint">Hover or focus one to see where next week’s comes from and goes.</p>
    <p v-if="!game.state.resources.length" class="empty">Nothing yet. Propose one: Money, Power, Training Data…</p>
    <ul class="plain-list list">
      <li v-for="r in sorted" :key="r.id" tabindex="0">
        <span class="icon">{{ r.icon }}</span>
        <div class="info">
          <div class="name">
            {{ r.name }}
            <span v-if="wasted(r.id) > 0" class="chip warn" title="Next week, this much won't fit in storage and is lost">
              overflows {{ fmt(wasted(r.id)) }}
            </span>
            <span v-if="share(r.id) < 0.999" class="chip warn" title="Everyone who needs it runs at this share">
              {{ Math.round(share(r.id) * 100) }}%
            </span>
          </div>
          <div class="bar" :title="`${fmt(r.amount)} of ${fmt(capOf(game.state, r))} storage`">
            <div class="fill" :class="{ full: r.amount >= capOf(game.state, r) * 0.999 }" :style="{ width: `${fillPct(r)}%` }" />
          </div>
        </div>
        <div class="amount num">
          {{ fmt(r.amount) }}<span class="muted small"> / {{ fmt(capOf(game.state, r)) }}</span>
          <Delta :value="netFlow(game.preview, r.id)" />
          <button
            class="link small store"
            :disabled="!!lockReason(game.state, 'create')"
            :title="`Have the mind make ${r.name} directly`"
            @click.stop="ui.openInvent({ kind: 'create', outputId: r.id })"
          >
            + Create
          </button>
          <button
            class="link small store"
            :disabled="!!lockReason(game.state, 'storage')"
            :title="`Research more storage for ${r.name}`"
            @click.stop="ui.openInvent({ kind: 'storage', resourceId: r.id })"
          >
            + Store
          </button>
        </div>

        <div class="breakdown" role="tooltip">
          <div class="bd-title">{{ r.name }}: next week</div>
          <p class="muted">{{ r.description }}</p>
          <p class="muted">{{ tierText(r) }} · one is worth: {{ bandText(r) }}</p>
          <p class="muted">
            Holds {{ fmt(capOf(game.state, r)) }}: {{ fmt(r.cap) }} to start<template v-for="e in r.expansions" :key="e.name"
              >, +{{ fmt(e.added) }} from {{ e.name }}{{ e.catch ? ` (${describeCatch(game.state, e.catch).toLowerCase()})` : '' }}</template
            >.
          </p>
          <template v-if="flows(r.id).length">
            <div v-for="f in flows(r.id)" :key="f.label" class="bd-row num">
              <span>{{ f.label }}</span>
              <span :class="f.amount >= 0 ? 'delta-up' : 'delta-down'">
                {{ f.amount >= 0 ? '+' : '−' }}{{ fmt(Math.abs(f.amount)) }}
              </span>
            </div>
            <div class="bd-row bd-total num">
              <span>Net</span>
              <span>{{ signed(netFlow(game.preview, r.id)) }}</span>
            </div>
          </template>
          <p v-else class="muted">Nothing makes or uses this next week.</p>
          <template v-if="pending(r.id).length">
            <div class="bd-title bd-section">Still to come from Create</div>
            <div v-for="(d, i) in pending(r.id)" :key="i" class="bd-row">
              <span>
                {{ d.name }}
                <span class="muted">· {{ deliveryTiming(d) }}</span>
              </span>
              <span class="num delta-up">+{{ fmt(d.amount) }}{{ d.weeks === 1 ? '' : '/wk' }}</span>
            </div>
            <div class="bd-row bd-total num">
              <span>Still owed</span>
              <span>{{ owed(r.id) }}</span>
            </div>
            <p v-if="overflowsLater(r)" class="warn">
              More than its storage holds: {{ fmt(overflowsLater(r)) }} would be lost at today’s level.
            </p>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { netFlow } from '@/engine/economy'
import { bandText, byTier, capOf, deliveryLeft, deliveryTiming, fmt, tierText } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import { describeCatch } from '@/engine/storageProposal'
import type { Resource } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Delta from './DeltaValue.vue'

const game = useGameStore()
const ui = useUiStore()
const sorted = computed(() => byTier(game.state.resources))
const flows = (id: string) => game.preview.flows[id] ?? []
const share = (id: string) => game.preview.shares[id] ?? 1
const wasted = (id: string) => game.preview.wasted[id] ?? 0
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`
/** Create payouts still to come into a resource, soonest first. */
const pending = (id: string) =>
  game.state.deliveries
    .filter((d) => d.target.kind === 'resource' && d.target.id === id)
    .sort((a, b) => a.delay - b.delay)
/** What timed payouts still owe in all, plus any that pay for good. */
function owed(id: string) {
  const list = pending(id)
  const timed = list.filter((d) => d.weeks !== null).reduce((n, d) => n + deliveryLeft(d), 0)
  const forever = list.filter((d) => d.weeks === null).reduce((n, d) => n + d.amount, 0)
  return [timed ? `+${fmt(timed)}` : '', forever ? `+${fmt(forever)}/wk for good` : ''].filter(Boolean).join(' and ')
}
/** How much of the timed payouts wouldn't fit, if what's held now stayed put. */
const overflowsLater = (r: Resource) =>
  Math.max(0, r.amount + pending(r.id).filter((d) => d.weeks !== null).reduce((n, d) => n + deliveryLeft(d), 0) - capOf(game.state, r))
const fillPct = (r: Resource) => Math.min(100, (100 * r.amount) / Math.max(1e-9, capOf(game.state, r)))
</script>

<style scoped>
.hint {
  margin: -4px 0 10px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

li {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px;
  border-radius: 6px;
}

li:hover,
li:focus {
  background: var(--panel-raised);
  outline: none;
}

.icon {
  font-size: 20px;
  width: 26px;
  text-align: center;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.chip.warn {
  border-color: var(--warn);
}

.amount {
  text-align: right;
  white-space: nowrap;
}

.store {
  display: block;
  margin-left: auto;
}

.bar {
  height: 3px;
  margin-top: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--good);
}

.fill.full {
  background: var(--warn);
}

.breakdown {
  display: none;
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--panel-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
  font-size: 12px;
}

li:hover .breakdown,
li:focus .breakdown {
  display: block;
}

.bd-title {
  font-weight: 600;
}

.bd-section {
  margin-top: 10px;
}

.breakdown p {
  margin: 2px 0 8px;
}

.bd-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
}

.bd-total {
  border-top: 1px solid var(--border);
  margin-top: 4px;
  padding-top: 5px;
  font-weight: 600;
}
</style>
