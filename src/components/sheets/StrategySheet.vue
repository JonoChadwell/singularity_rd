<template>
  <DataSheet v-if="s" :part="partNo('STR', s.id)" :title="s.name" :subtitle="s.description">
    <section>
      <h4>Specifications</h4>
      <SpecTable :rows="specs" />
    </section>
    <section v-if="s.quirk">
      <h4>Quirk</h4>
      <p>{{ QUIRKS[s.quirk].icon }} <strong>{{ QUIRKS[s.quirk].name }}</strong>: {{ QUIRKS[s.quirk].rule }}</p>
    </section>
    <template #foot>
      <button v-if="unit" class="small" @click="ui.openSheet({ kind: 'unit', id: unit.id }, true)">{{ unit.name }} datasheet</button>
      <button v-if="unit" class="small" :disabled="!!lockReason(game.state, 'unit-upgrade')" @click="ui.openInvent({ kind: 'upgrade', target: { kind: 'unit', id: unit.id } })">
        Upgrade
      </button>
    </template>
  </DataSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { describeFlows, efficiencyWord, findResource, findStrategy, findUnit, fmt, fmtCount, tierFit } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import { effectiveTier } from '@/engine/resourceTraits'
import { strategyRate } from '@/engine/research'
import { QUIRKS } from '@/engine/traits'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable, { type SpecRow } from '../kit/SpecTable.vue'
import { partNo } from './text'

const props = defineProps<{ id: string }>()
const game = useGameStore()
const ui = useUiStore()
const s = computed(() => findStrategy(game.state, props.id))
const unit = computed(() => (s.value ? findUnit(game.state, s.value.unitId) : undefined))

const specs = computed<SpecRow[]>(() => {
  const x = s.value
  if (!x) return []
  const rows: SpecRow[] = [{ k: 'Run by', v: unit.value?.name ?? '?' }]
  if (x.kind === 'crew') {
    rows.push({ k: 'Crews', v: `${fmt(x.amount)} ${findUnit(game.state, x.outputId)?.name ?? '?'} each` })
  } else {
    const rate = strategyRate(game.state, x)
    const out = findResource(game.state, x.outputId)
    rows.push({ k: 'Uses, each', v: rate.inputs.length ? describeFlows(game.state, rate.inputs) : 'nothing' })
    rows.push({ k: 'Makes, each', v: `${fmt(rate.amount)} ${out?.icon ?? ''} ${out?.name ?? '?'}` })
    const word = efficiencyWord(x)
    if (word) rows.push({ k: 'Jev rates it', v: word, tone: (x.efficiency ?? 1) > 1 ? 'good' : (x.efficiency ?? 1) < 1 ? 'bad' : undefined })
    const fit = unit.value && out ? tierFit(unit.value.tier, effectiveTier(out, 'make')) : null
    if (fit) rows.push({ k: 'Tier fit', v: fit.text, tone: fit.good ? 'good' : 'bad' })
  }
  const run = game.preview.runs[x.id]
  if (run) {
    rows.push({ k: 'Next week', v: `${fmtCount(run.units)} running${run.fraction < 0.999 ? ` at ${Math.round(run.fraction * 100)}%` : ''}`, tone: run.fraction < 0.999 ? 'warn' : undefined })
    if (run.limitedBy) rows.push({ k: 'Short of', v: findResource(game.state, run.limitedBy)?.name ?? '?', tone: 'bad' })
  } else {
    rows.push({ k: 'Next week', v: 'Nobody on it' })
  }
  return rows
})
</script>
