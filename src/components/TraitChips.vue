<template>
  <span class="traits">
    <span
      v-for="t in traits"
      :key="t"
      class="chip trait"
      :class="TRAITS[t].kind"
      :title="`${TRAITS[t].name} (${TRAITS[t].kind}): ${TRAITS[t].rule}${detail(t)}`"
    >
      {{ TRAITS[t].icon }} {{ TRAITS[t].name }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { FIELD_LABELS } from '@/engine/balance'
import { findResource, findUnit } from '@/engine/model'
import { TRAITS, type TraitId } from '@/engine/traits'
import type { UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'

const props = defineProps<{ traits: TraitId[]; unit?: UnitType }>()
const game = useGameStore()

function detail(t: TraitId): string {
  const u = props.unit
  if (!u) return ''
  const unitName = (id: string | null) => (id && findUnit(game.state, id)?.name) || '?'
  const resName = (id: string | null) => (id && findResource(game.state, id)?.name) || '?'
  switch (t) {
    case 'needs-crew':
      return u.crew ? ` Each needs ${u.crew.per} ${unitName(u.crew.unitId)}.` : ''
    case 'boosts':
      return ` Boosts ${unitName(u.boosts)}.`
    case 'by-product':
      return ` Also makes ${resName(u.byproduct)}.`
    case 'stores':
      return ` Stores ${resName(u.stores)}.`
    case 'specialist':
      return u.field ? ` Field: ${FIELD_LABELS[u.field]}.` : ''
    case 'makes-waste':
      return ` Waste: ${resName(u.waste)}.`
    default:
      return ''
  }
}
</script>

<style scoped>
.traits {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.trait {
  cursor: help;
}

.trait.perk {
  color: var(--good);
  border-color: var(--accent-dim);
}

.trait.drawback {
  color: var(--warn);
  border-color: rgb(251 191 36 / 0.35);
}

.trait.mixed {
  color: var(--ai);
  border-color: rgb(167 139 250 / 0.35);
}
</style>
