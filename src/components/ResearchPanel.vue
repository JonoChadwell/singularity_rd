<template>
  <div class="research">
    <div class="tab-head">
      <p class="muted small intro">
        One action a week: propose a research, or Create. Once research is here, doing it is instant: it needs a mind
        at least as smart as its minimum IQ, and it uses up some of the resources you have.
      </p>
      <div class="buttons">
        <button class="add" @click="ui.openInvent({ kind: 'create' })">+ Create</button>
        <button v-if="!coverLock" class="add" @click="ui.openInvent({ kind: 'cover' })">+ Cover</button>
      </div>
    </div>
    <p v-if="game.state.proposedThisWeek" class="small good">
      You’ve taken this week’s action. Next week you can take another.
    </p>
    <div v-if="game.state.deliveries.length" class="incomes small">
      <span class="muted">Still to come from Create:</span>
      <span v-for="(d, i) in game.state.deliveries" :key="i">⚗️ {{ d.name }}: {{ describeDelivery(game.state, d) }}</span>
    </div>
    <section v-for="e in entries" :key="e.key" :class="{ set: e.items.length > 1 }">
    <p v-if="e.items.length > 1" class="set-head small">
      <strong>🔀 Pick one of {{ e.items.length }}</strong>
      <span class="muted">: saved together from one idea. Researching one drops the others.</span>
    </p>
    <div :class="{ 'set-items': e.items.length > 1 }">
    <article v-for="r in e.items" :key="r.id" class="item" :class="{ goal: r.effect.kind === 'goal' }">
      <header class="head">
        <span class="icon">{{ r.icon }}</span>
        <div class="title">
          <strong>{{ r.effect.kind === 'goal' ? `Goal: ${r.name}` : r.name }}</strong>
          <div class="muted small">{{ r.description }}</div>
          <div v-if="r.effect.kind === 'sourcing'" class="small">
            Room for {{ fmt(r.effect.sourcing.total) }}, each made from {{ describeFlows(game.state, r.effect.sourcing.parts) }}.
          </div>
          <div v-if="r.effect.kind === 'storage'" class="small">
            Room for {{ fmt(r.effect.expansion.added) }} more{{
              r.effect.expansion.catch ? `. ${describeCatch(game.state, r.effect.expansion.catch)}` : ''
            }}.
          </div>
          <div v-if="r.effect.kind === 'cover'" class="small">
            Adds {{ coverWeeks(game.state, r.effect.weeks) }} weeks to the clock, once researched.
          </div>
          <div v-if="r.effect.kind === 'goal'" class="small good">Researching it wins the phase.</div>
          <div v-if="r.effect.kind === 'goal' && projectionText" class="small" :class="projectionTone">
            {{ projectionText }}
          </div>
        </div>
        <span class="chip iq" :class="{ bad: iqFor(r) < r.minIQ }" :title="iqTitle(r)">IQ {{ r.minIQ }}</span>
      </header>
      <div class="small row cost">
        <span class="muted">Uses up</span>
        <span>{{ r.cost.length ? describeCost(game.state, r.cost) : 'nothing: you have nothing to spend yet' }}</span>
      </div>
      <div v-if="r.risk" class="small bad">
        ⚠️ Risky: {{ alarmLabel(r.risk).toLowerCase() }}. −{{ r.risk.weeks }} weeks when you research it.
      </div>
      <div class="row small actions">
        <button class="small primary" :disabled="!!blocker(r.id)" @click="game.research(r.id)">
          Research now
        </button>
        <span v-if="blocker(r.id)" class="warn">{{ blocker(r.id) }}</span>
        <button v-if="iqFor(r) < r.minIQ" class="link" @click="smarter(r.minIQ)">
          {{ softwareLeft ? 'Upgrade your software?' : 'Build a smarter platform?' }}
        </button>
        <button
          v-if="r.effect.kind !== 'goal'"
          class="link drop"
          title="Drop this research"
          @click="game.dropResearch(r.id)"
        >
          Drop
        </button>
      </div>
    </article>
    </div>
    </section>
    <p v-if="!game.state.research.length" class="empty">
      Research comes only from your ideas: a unit or an intelligence system to design, sourcing or storage, an advanced
      strategy, or an upgrade to something you own.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { researchBlocker } from '@/engine/actions'
import { bestIQ, bestMind, describeCost, describeDelivery, describeFlows, fmt, researchIQ } from '@/engine/model'
import { describeCatch } from '@/engine/storageProposal'
import { coverWeeks, lockReason } from '@/engine/phase'
import { projectionText as describeProjection } from '@/engine/projection'
import { alarmLabel } from '@/engine/risk'
import { mindUpgradeBlocker } from '@/engine/upgrade'
import type { Research } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const game = useGameStore()
const ui = useUiStore()
const blocker = (id: string) => researchBlocker(game.state, id)
/** The IQ that counts for this research: your best mind's, moved by its traits. */
const iqFor = (r: Research) => researchIQ(game.state, r)
const iqTitle = (r: Research) =>
  Math.round(iqFor(r)) === Math.round(bestIQ(game.state))
    ? ''
    : `Your platform counts as IQ ${Math.round(iqFor(r))} for this, not ${Math.round(bestIQ(game.state))}.`
/** Whether the platform's one software upgrade is still to come. */
const softwareLeft = computed(() => {
  const m = bestMind(game.state)
  return !!m && !mindUpgradeBlocker(game.state, m)
})
const coverLock = computed(() => lockReason(game.state, 'cover'))
const mindLock = computed(() => lockReason(game.state, 'mind'))
/** The goal first. */
const ordered = computed(() =>
  [...game.state.research].sort((a, b) => Number(b.effect.kind === 'goal') - Number(a.effect.kind === 'goal'))
)

/** The list in order, with options saved together from one idea gathered into a set. */
const entries = computed(() => {
  const out: { key: string; items: Research[] }[] = []
  for (const r of ordered.value) {
    const set = r.group ? out.find((e) => e.key === r.group) : undefined
    if (set) set.items.push(r)
    else out.push({ key: r.group ?? r.id, items: [r] })
  }
  return out
})

function smarter(iq: number) {
  const top = bestMind(game.state)
  if (top && softwareLeft.value) return ui.openInvent({ kind: 'upgrade', target: { kind: 'mind', id: top.id } })
  if (!mindLock.value) ui.openInvent({ kind: 'mind', iq })
}

const projectionText = computed(() => (game.projection ? describeProjection(game.state, game.projection) : ''))
const projectionTone = computed(() => {
  const p = game.projection
  return !p || p.week === null ? 'bad' : p.iqOk ? 'good' : 'warn'
})
</script>

<style scoped>
.research {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tab-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.intro {
  margin: 0;
}

.incomes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--panel-raised);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.set {
  border: 1px dashed var(--accent);
  border-radius: var(--radius);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.set-head {
  margin: 0;
}

.set-items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
}

.item.goal {
  border-color: var(--accent);
}

.head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.icon {
  font-size: 22px;
}

.title {
  flex: 1;
  min-width: 0;
}

.chip.bad,
.bad {
  color: var(--bad);
}

.cost,
.actions {
  gap: 8px;
}

.drop {
  margin-left: auto;
}
</style>
