<template>
  <DataSheet v-if="r" :part="researchPartNo(r, game.state.phase.n)" :title="r.name" :icon="r.icon" :subtitle="r.description">
    <section>
      <h4>{{ r.effect.kind === 'goal' ? 'Goal' : 'Work order' }}</h4>
      <p>{{ effectText(game.state, r) }}</p>
    </section>
    <section>
      <h4>Requirements</h4>
      <SpecTable :rows="specs" />
    </section>
    <section v-if="r.effect.kind === 'goal' && game.projection">
      <h4>Projection</h4>
      <p :class="projectionTone">{{ projectionText(game.state, game.projection) }}</p>
    </section>
    <template #foot>
      <button class="small primary" :disabled="!!blocker" :title="blocker ?? ''" @click="game.research(r.id)">Research now</button>
      <span v-if="blocker" class="bad small">{{ blocker }}</span>
      <button v-if="r.effect.kind !== 'goal'" class="small" @click="drop(r.id)">Drop</button>
    </template>
  </DataSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { researchBlocker } from '@/engine/actions'
import { bestIQ, costShortfall, findResearch, researchIQ } from '@/engine/model'
import { projectionText } from '@/engine/projection'
import { alarmLabel } from '@/engine/risk'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable, { type SpecRow } from '../kit/SpecTable.vue'
import { costText, effectText, researchPartNo } from './text'

const props = defineProps<{ id: string }>()
const game = useGameStore()
const ui = useUiStore()
const r = computed(() => findResearch(game.state, props.id))
const blocker = computed(() => researchBlocker(game.state, props.id))

const specs = computed<SpecRow[]>(() => {
  const x = r.value
  if (!x) return []
  const iq = Math.round(researchIQ(game.state, x))
  const rows: SpecRow[] = [
    {
      k: 'Min IQ',
      v: `${x.minIQ} (yours: ${iq}${iq !== Math.round(bestIQ(game.state)) ? ' for this' : ''})`,
      tone: iq >= x.minIQ ? 'good' : 'bad'
    },
    {
      k: 'Uses up',
      v: costText(game.state, x.cost),
      tone: costShortfall(game.state, x.cost) ? 'bad' : 'good',
      title: costShortfall(game.state, x.cost) ?? ''
    },
    { k: 'Proposed', v: `Week ${x.proposedWeek}`, num: true }
  ]
  if (x.risk) rows.push({ k: 'Risk', v: `${alarmLabel(x.risk)}: −${x.risk.weeks} weeks`, tone: 'bad' })
  return rows
})
const projectionTone = computed(() => {
  const p = game.projection
  return !p || p.week === null ? 'bad' : p.iqOk ? 'good' : 'warn'
})

function drop(id: string) {
  game.dropResearch(id)
  ui.backSheet()
}
</script>
