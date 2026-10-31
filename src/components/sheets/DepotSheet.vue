<template>
  <DataSheet v-if="d" :part="partNo('DEP', d.id)" :title="d.name" :icon="d.icon" :subtitle="d.description">
    <section>
      <h4>Specifications</h4>
      <SpecTable :rows="specs" />
    </section>

    <section>
      <h4>About depots</h4>
      <p class="note">
        A depot only holds: it does no work, so it has no strategies, upkeep or upgrades, and isn’t Procured. Build them
        from <b>Storage</b> on the {{ r?.name ?? '' }} bus, at no action. Room past how much {{ r?.name ?? '' }} can exist is no use.
      </p>
    </section>
  </DataSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ceilingLabel } from '@/engine/ceilings'
import { depotLimit, depotRoom, describeFlows, findDepot, findResource, fmt, fmtCount, tierLabel, unitValueText } from '@/engine/model'
import { useGameStore } from '@/stores/game'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable, { type SpecRow } from '../kit/SpecTable.vue'
import { partNo } from './text'

const props = defineProps<{ id: string }>()
const game = useGameStore()
const d = computed(() => findDepot(game.state, props.id))
const r = computed(() => (d.value ? findResource(game.state, d.value.resourceId) : undefined))

const specs = computed<SpecRow[]>(() => {
  const x = d.value
  if (!x) return []
  const res = r.value
  const ceiling = res?.ceiling ?? null
  return [
    { k: 'Holds', v: `${res?.icon ?? ''} ${res?.name ?? '?'}` },
    { k: 'Each holds', v: fmt(x.holds), num: true },
    { k: 'Tier', v: tierLabel(x.tier) },
    { k: 'One is worth', v: unitValueText(x.value) },
    { k: 'Parts each', v: x.parts.length ? describeFlows(game.state, x.parts) : 'nothing' },
    { k: 'Built', v: ceiling === null ? fmtCount(x.count) : `${fmtCount(x.count)} of the ${fmtCount(depotLimit(game.state, x))} that are of use`, num: true },
    { k: 'Room added', v: `+${fmt(depotRoom(x))}`, num: true },
    { k: 'Can exist', v: ceiling === null ? 'no limit' : `${ceilingLabel(ceiling)} ${res?.name ?? ''}` },
    { k: 'Jev', v: `${Math.round(x.plausibility * 100)}% plausible` }
  ]
})
</script>
