<template>
  <div class="research">
    <div class="tab-head">
      <p class="muted small intro">
        You can propose one research a week. Once it’s here, doing it is instant: it needs a mind at least as smart as
        its minimum IQ, and it uses up some of the resources you have.
      </p>
      <div class="buttons">
        <button class="add" @click="ui.openInvent({ kind: 'income' })">+ Passive income</button>
        <button v-if="!coverLock" class="add" @click="ui.openInvent({ kind: 'cover' })">+ Cover</button>
      </div>
    </div>
    <p v-if="game.state.proposedThisWeek" class="small good">
      You’ve proposed this week’s research. Next week you can propose another.
    </p>
    <div v-if="game.state.incomes.length" class="incomes small">
      <span class="muted">Passive income each week:</span>
      <span v-for="i in game.state.incomes" :key="i.name + i.resourceId">
        💸 {{ i.name }}: {{ describeIncome(game.state, i) }}
      </span>
    </div>
    <article v-for="r in ordered" :key="r.id" class="item" :class="{ goal: r.effect.kind === 'goal' }">
      <header class="head">
        <span class="icon">{{ r.icon }}</span>
        <div class="title">
          <strong>{{ r.effect.kind === 'goal' ? `Goal: ${r.name}` : r.name }}</strong>
          <div class="muted small">{{ r.description }}</div>
          <div v-if="r.effect.kind === 'income'" class="small">
            {{ describeIncome(game.state, r.effect.income) }} every week, once researched.
          </div>
          <div v-if="r.effect.kind === 'cover'" class="small">
            Adds {{ coverWeeks(game.state, r.effect.weeks) }} weeks to the clock, once researched.
          </div>
          <div v-if="r.effect.kind === 'goal'" class="small good">Researching it wins the phase.</div>
          <div v-if="r.effect.kind === 'goal' && projectionText" class="small" :class="projectionTone">
            {{ projectionText }}
          </div>
        </div>
        <span class="chip iq" :class="{ bad: best < r.minIQ }">IQ {{ r.minIQ }}</span>
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
        <button v-if="best < r.minIQ" class="link" @click="smarter(r.minIQ)">
          {{ mindLock ? 'Upgrade your best mind?' : 'Design something smarter?' }}
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
    <p v-if="!game.state.research.length" class="empty">
      Research comes only from your ideas: a passive income, a unit or an intelligence system to design, an advanced
      strategy, or an upgrade to something you own.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { researchBlocker } from '@/engine/actions'
import { bestIQ, currentIQ, describeCost, describeIncome } from '@/engine/model'
import { coverWeeks, lockReason } from '@/engine/phase'
import { projectionText as describeProjection } from '@/engine/projection'
import { alarmLabel } from '@/engine/risk'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const game = useGameStore()
const ui = useUiStore()
const best = computed(() => bestIQ(game.state))
const blocker = (id: string) => researchBlocker(game.state, id)
const coverLock = computed(() => lockReason(game.state, 'cover'))
const mindLock = computed(() => lockReason(game.state, 'mind'))
/** The goal first. */
const ordered = computed(() =>
  [...game.state.research].sort((a, b) => Number(b.effect.kind === 'goal') - Number(a.effect.kind === 'goal'))
)

function smarter(iq: number) {
  if (!mindLock.value) return ui.openInvent({ kind: 'mind', iq })
  const top = [...game.state.minds].sort((a, b) => currentIQ(b) - currentIQ(a))[0]
  if (top) ui.openInvent({ kind: 'upgrade', target: { kind: 'mind', id: top.id } })
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
