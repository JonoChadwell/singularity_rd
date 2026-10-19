<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Resources</h2>
      <button class="add" @click="ui.openInvent({ kind: 'resource' })">+ Resource</button>
    </div>
    <p class="muted small hint">Hover or focus one to see where next week’s comes from and goes.</p>
    <ul class="plain-list list">
      <li v-for="r in game.state.resources" :key="r.id" tabindex="0">
        <span class="icon">{{ r.icon }}</span>
        <div class="info">
          <div class="name">
            {{ r.name }}
            <span class="chip" :title="r.kind === 'stock' ? 'Keeps from week to week' : 'Made and used within a week; unused flow is lost'">
              {{ r.kind }}
            </span>
            <span v-if="share(r.id) < 0.999" class="chip warn" title="Everyone who needs it runs at this share">
              {{ Math.round(share(r.id) * 100) }}%
            </span>
          </div>
          <button
            v-if="unmade(r.id)"
            class="link"
            :title="`Propose a strategy that makes ${r.name}`"
            @click.stop="ui.openInvent({ kind: 'strategy', outputId: r.id })"
          >
            How will you get this?
          </button>
        </div>
        <div class="amount num">
          <template v-if="r.kind === 'stock'">
            {{ fmt(r.amount) }}
            <Delta :value="netFlow(game.preview, r.id)" />
          </template>
          <template v-else>
            <span :title="'Made next week'">{{ fmt(made(r.id)) }}</span>
            <span class="muted small">/wk</span>
          </template>
        </div>

        <div class="breakdown" role="tooltip">
          <div class="bd-title">{{ r.name }}: next week</div>
          <p class="muted">{{ r.description }}</p>
          <template v-if="flows(r.id).length">
            <div v-for="f in flows(r.id)" :key="f.label" class="bd-row num">
              <span>{{ f.label }}</span>
              <span :class="f.amount >= 0 ? 'delta-up' : 'delta-down'">
                {{ f.amount >= 0 ? '+' : '−' }}{{ fmt(Math.abs(f.amount)) }}
              </span>
            </div>
            <div class="bd-row bd-total num">
              <span>{{ r.kind === 'flow' ? 'Left over' : 'Net' }}</span>
              <span>{{ signed(netFlow(game.preview, r.id)) }}</span>
            </div>
            <p v-if="r.kind === 'flow' && netFlow(game.preview, r.id) > 0" class="muted">
              Unused flow is lost, unless something Stores it.
            </p>
          </template>
          <p v-else class="muted">Nothing makes or uses this next week.</p>
          <p v-if="r.market" class="muted">
            Humanity sells {{ fmt(r.market) }} a week at {{ fmt(r.value) }} Money each.
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { netFlow } from '@/engine/economy'
import { fmt, MONEY_ID } from '@/engine/model'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Delta from './DeltaValue.vue'

const game = useGameStore()
const ui = useUiStore()
const flows = (id: string) => game.preview.flows[id] ?? []
const made = (id: string) => flows(id).reduce((n, f) => n + Math.max(0, f.amount), 0)
const share = (id: string) => game.preview.shares[id] ?? 1
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`
/** Nothing makes it, and it can't simply be bought. */
const unmade = (id: string) =>
  id !== MONEY_ID &&
  !game.state.strategies.some((s) => s.kind === 'make' && s.outputId === id) &&
  !game.state.resources.find((r) => r.id === id)?.market
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
