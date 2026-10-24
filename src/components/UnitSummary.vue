<template>
  <dl class="summary small">
    <dt>Tier</dt>
    <dd>{{ tierLabel(unit.tier) }} · one is worth: {{ unitValueText(unit.value) }}</dd>
    <dt>Work</dt>
    <dd class="num">{{ fmt(labour(unit)) }} Money’s worth a week</dd>
    <dt>Runs on</dt>
    <dd>{{ unit.upkeep.length ? `${describeFlows(state, unit.upkeep)} a week` : 'nothing' }}</dd>
    <dt>Sourcing</dt>
    <dd>{{ contracts ? `${contracts} contract${contracts === 1 ? '' : 's'}` : 'none yet: find sourcing to own some' }}</dd>
    <template v-if="unit.traits.length">
      <dt>Traits</dt>
      <dd><TraitChips :traits="unit.traits" :unit="unit" /></dd>
    </template>
  </dl>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { contractsFor, describeFlows, fmt, labour, tierLabel, unitValueText } from '@/engine/model'
import type { GameState, UnitType } from '@/engine/types'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ unit: UnitType; state: GameState }>()
const contracts = computed(() => contractsFor(props.state, props.unit.id).length)
</script>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 3px 10px;
  margin: 0;
}

dt {
  color: var(--muted);
}

dd {
  margin: 0;
}
</style>
