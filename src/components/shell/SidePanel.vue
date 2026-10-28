<template>
  <aside class="side">
    <section class="panel slot" :class="{ used }" :title="slotTitle">
      <header class="slot-head">
        <Led :tone="used ? 'off' : 'good'" />
        <h2>{{ used ? 'Action used' : 'Action available' }}</h2>
        <span class="lbl">1 / week</span>
      </header>
      <p class="sr-only">{{ slotTitle }}</p>
      <div class="actions">
        <button
          v-for="a in ACTIONS"
          :key="a.kind"
          type="button"
          class="small act"
          :disabled="used || !!lockReason(game.state, a.feature)"
          :title="lockReason(game.state, a.feature) ?? a.title"
          @click="ui.openInvent({ kind: a.kind })"
        >
          {{ a.label }}
        </button>
      </div>
    </section>

    <section v-if="memo" class="memo" aria-label="Memo">
      <div class="pin" aria-hidden="true" />
      <span class="lbl">Memo {{ game.cards.length > 1 ? `1/${game.cards.length}` : '' }}</span>
      <strong>{{ memo.title }}</strong>
      <p>{{ memo.text }}</p>
      <div class="row">
        <button class="small" @click="game.dismissCard(memo.id)">Got it</button>
        <button class="link" @click="ui.tab = 'manual'">Manual</button>
      </div>
    </section>

    <FaultList class="panel" />

    <section v-if="tape.length" class="tape" aria-label="Latest log">
      <ol class="plain-list">
        <li v-for="(e, i) in tape" :key="i" :class="e.tone">
          <span class="wk num">{{ String(e.week).padStart(3, '0') }}</span>
          <span>{{ e.text }}</span>
        </li>
      </ol>
      <button class="link more" @click="ui.tab = 'log'">Full log</button>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { lockReason, type Feature } from '@/engine/phase'
import { useGameStore } from '@/stores/game'
import { useUiStore, type InventKind } from '@/stores/ui'
import Led from '../kit/StatusLed.vue'
import FaultList from './FaultList.vue'

const game = useGameStore()
const ui = useUiStore()
const used = computed(() => game.state.proposedThisWeek)
const memo = computed(() => game.cards[0])
/** The newest log lines, newest first, like the end of a printer tape. */
const tape = computed(() => [...game.state.log].reverse().slice(0, 5))

const ACTIONS: { kind: InventKind; feature: Feature; label: string; title: string }[] = [
  { kind: 'create', feature: 'create', label: 'Procure', title: 'Have the mind get something directly: a resource, or units' },
  { kind: 'storage', feature: 'storage', label: 'Storage', title: 'Hold more of a resource' },
  { kind: 'cover', feature: 'cover', label: 'Cover', title: 'Buy weeks back on the clock' },
  { kind: 'unit', feature: 'unit', label: 'Unit', title: 'Design an industry unit' },
  { kind: 'strategy', feature: 'strategy', label: 'Strategy', title: 'Something a unit does every week' },
  { kind: 'mind', feature: 'mind', label: 'Platform', title: 'A new intelligence platform' }
]

const kinds = computed(() => {
  const list = ACTIONS.filter((a) => !lockReason(game.state, a.feature)).map((a) => a.label.toLowerCase())
  list.push('an upgrade')
  return `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`
})
const slotTitle = computed(() =>
  used.value ? 'You’ve taken this week’s action. Next week you can take another.' : `You have one action this week: ${kinds.value}.`
)
</script>

<style scoped>
.side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.slot-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.slot-head h2 {
  flex: 1;
  font-size: 15px;
  color: var(--led-g);
}

.used .slot-head h2 {
  color: var(--muted);
}

.actions {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 4px;
}

.act {
  padding: 3px 4px;
}

/* A paper memo pinned to the bench. */
.memo {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 12px 10px;
  color: var(--ink);
  background: linear-gradient(180deg, #e9e3c2, #d8d1ac);
  box-shadow: 0 3px 10px rgb(0 0 0 / 0.5);
  transform: rotate(-0.6deg);
  font-size: 12.5px;
}

.memo .lbl {
  color: var(--ink-2);
}

.memo strong {
  font-family: var(--font-label);
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.memo p {
  margin: 0;
  line-height: 1.35;
}

.memo button.link {
  color: #6a3d00;
  border-color: var(--rule);
}

/* Printer tape: the end of the log. */
.tape {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  color: #2b2b26;
  background:
    repeating-linear-gradient(180deg, transparent 0 17px, rgb(0 0 0 / 0.05) 17px 18px),
    #e8e6dc;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 18px;
  mask-image: linear-gradient(180deg, #000 70%, rgb(0 0 0 / 0.5));
}

.tape li {
  display: flex;
  gap: 8px;
}

.tape li.good {
  color: #1d6a1a;
}

.tape li.bad {
  color: #a3200f;
}

.tape .wk {
  color: #8a887c;
}

.tape .more {
  align-self: flex-end;
  color: #6a3d00;
  border-color: #b5b2a5;
}

.pin {
  position: absolute;
  top: 4px;
  left: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ff9b8a, #b3261e);
  box-shadow: 0 2px 2px rgb(0 0 0 / 0.5);
}
</style>
