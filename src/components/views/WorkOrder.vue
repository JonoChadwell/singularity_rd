<template>
  <article class="order" :class="{ goal: isGoal, ready: !blocker }">
    <header class="head">
      <span class="no num">{{ researchPartNo(r, game.state.phase.n) }}</span>
      <span class="kind lbl">{{ KIND[r.effect.kind] }}</span>
      <Led :tone="blocker ? 'off' : 'good'" :title="blocker ?? 'Ready to research'" />
    </header>
    <button type="button" class="title" @click="ui.openSheet({ kind: 'research', id: r.id })">
      <span class="icon">{{ r.icon }}</span>
      <strong>{{ isGoal ? `Goal: ${r.name}` : r.name }}</strong>
    </button>
    <p class="effect">{{ effectText(game.state, r) }}</p>

    <div class="reqs">
      <div class="req" :title="iqTitle">
        <Led :tone="iq >= r.minIQ ? 'good' : 'bad'" />
        <span class="lbl">IQ</span>
        <Gauge :value="Math.max(0, Math.min(iq, r.minIQ) - IQ_FLOOR)" :max="Math.max(1, r.minIQ - IQ_FLOOR)":segments="10" :tone="iq >= r.minIQ ? 'good' : 'bad'" />
        <span class="num">{{ Math.round(iq) }}/{{ r.minIQ }}</span>
      </div>
      <div v-for="c in r.cost" :key="c.resourceId" class="req">
        <Led :tone="have(c.resourceId) >= c.amount ? 'good' : 'bad'" />
        <span class="lbl">{{ icon(c.resourceId) }}</span>
        <Gauge :value="Math.min(have(c.resourceId), c.amount)" :max="c.amount" :segments="10" :tone="have(c.resourceId) >= c.amount ? 'good' : 'warn'" />
        <span class="num">{{ fmt(have(c.resourceId)) }}/{{ fmt(c.amount) }}</span>
      </div>
      <p class="uses small">Uses up {{ costText(game.state, r.cost) }}</p>
    </div>

    <p v-if="isGoal && game.projection" class="proj small" :class="projectionTone">{{ projectionText(game.state, game.projection) }}</p>
    <p v-if="r.risk" class="stamp">Risky · −{{ r.risk.weeks }} wk · {{ alarmLabel(r.risk) }}</p>

    <footer class="foot">
      <button class="small primary" :disabled="!!blocker" @click="game.research(r.id)">Research now</button>
      <button v-if="iq < r.minIQ" class="link" @click="smarter()">{{ softwareLeft ? 'Upgrade your software?' : 'Build a smarter platform?' }}</button>
      <button v-if="!isGoal" class="link drop" title="Drop this research" @click="game.dropResearch(r.id)">Drop</button>
    </footer>
    <p v-if="blocker" class="why small">{{ blocker }}</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { researchBlocker } from '@/engine/actions'
import { bestIQ, bestMind, findResource, fmt, researchIQ } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import { projectionText } from '@/engine/projection'
import { alarmLabel } from '@/engine/risk'
import type { Research } from '@/engine/types'
import { mindUpgradeBlocker } from '@/engine/upgrade'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Gauge from '../kit/SegGauge.vue'
import Led from '../kit/StatusLed.vue'
import { costText, effectText, researchPartNo } from '../sheets/text'

const props = defineProps<{ r: Research }>()
/** The IQ bar's empty end: an IQ of 100 is an unfilled bar. */
const IQ_FLOOR = 100
const game = useGameStore()
const ui = useUiStore()

const KIND: Record<Research['effect']['kind'], string> = {
  goal: 'Phase goal',
  unit: 'Unit design',
  mind: 'Platform',
  strategy: 'Strategy',
  upgrade: 'Upgrade',
  storage: 'Storage',
  cover: 'Cover'
}

const isGoal = computed(() => props.r.effect.kind === 'goal')
const blocker = computed(() => researchBlocker(game.state, props.r.id))
/** The IQ that counts for this research: your best mind's, moved by its traits. */
const iq = computed(() => researchIQ(game.state, props.r))
const iqTitle = computed(() =>
  Math.round(iq.value) === Math.round(bestIQ(game.state))
    ? `Needs IQ ${props.r.minIQ}`
    : `Your platform counts as IQ ${Math.round(iq.value)} for this, not ${Math.round(bestIQ(game.state))}.`
)
const have = (id: string) => findResource(game.state, id)?.amount ?? 0
const icon = (id: string) => findResource(game.state, id)?.icon ?? '?'
const softwareLeft = computed(() => {
  const m = bestMind(game.state)
  return !!m && !mindUpgradeBlocker(game.state, m)
})
const projectionTone = computed(() => {
  const p = game.projection
  return !p || p.week === null ? 'bad' : p.iqOk ? 'good' : 'warn'
})

function smarter() {
  const top = bestMind(game.state)
  if (top && softwareLeft.value) return ui.openInvent({ kind: 'upgrade', target: { kind: 'mind', id: top.id } })
  if (!lockReason(game.state, 'mind')) ui.openInvent({ kind: 'mind' })
}
</script>

<style scoped>
/* A work order: a paper ticket clipped to the board. */
.order {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  color: var(--ink);
  background:
    repeating-linear-gradient(0deg, rgb(0 0 0 / 0.02) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, var(--paper), var(--paper-2));
  border: 1px solid #000;
  border-top: 6px solid var(--paper-head);
  box-shadow: 0 3px 10px rgb(0 0 0 / 0.45);
  min-width: 0;
}

.order.goal {
  border-top-color: var(--gold);
  background:
    repeating-linear-gradient(0deg, rgb(0 0 0 / 0.02) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, #e6dcb6, #d3c79b);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.no {
  font-size: 10.5px;
  padding: 0 4px;
  border: 1px solid var(--ink-2);
  color: var(--ink-2);
}

.kind {
  flex: 1;
  color: var(--ink-2);
}

.title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--ink);
  text-transform: none;
  font-family: var(--font-label);
  font-size: 17px;
  letter-spacing: 0.02em;
  text-align: left;
}

.title:hover:not(:disabled) {
  background: none;
  text-decoration: underline;
}

.icon {
  font-size: 18px;
}

.effect {
  margin: 0;
  font-size: 12.5px;
  color: var(--ink-2);
}

.reqs {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 0;
  border-top: 1px dashed var(--rule);
  border-bottom: 1px dashed var(--rule);
}

.req {
  display: grid;
  grid-template-columns: 10px 26px 1fr auto;
  gap: 6px;
  align-items: center;
  font-size: 11.5px;
}

.req .lbl {
  color: var(--ink-2);
}

.req .num {
  min-width: 90px;
  text-align: right;
}

.uses {
  margin: 2px 0 0;
  color: var(--ink-2);
}

.proj {
  margin: 0;
}

.proj.good {
  color: #1d6a1a;
}

.proj.warn {
  color: #8a5300;
}

.proj.bad {
  color: #a3200f;
}

/* A rubber stamp. */
.stamp {
  align-self: flex-start;
  margin: 0;
  padding: 1px 8px;
  border: 2px solid #a3200f;
  color: #a3200f;
  font-family: var(--font-label);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  transform: rotate(-2deg);
  opacity: 0.85;
}

.foot {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.foot .link {
  color: #6a3d00;
  border-color: var(--rule);
}

.drop {
  margin-left: auto;
}

.why {
  margin: 0;
  color: #a3200f;
}
</style>
