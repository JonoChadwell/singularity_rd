<template>
  <dl class="summary small">
    <dt>Work</dt>
    <dd class="num">{{ fmt(labour(unit)) }} Money’s worth a week</dd>
    <dt>Runs on</dt>
    <dd>{{ unit.upkeep.length ? `${describeFlows(state, unit.upkeep)} a week` : 'nothing' }}</dd>
    <dt>Made from</dt>
    <dd>{{ describeFlows(state, unit.parts) }}</dd>
    <template v-if="unit.builderId">
      <dt>Also built by</dt>
      <dd>{{ builder }}</dd>
    </template>
    <template v-if="unit.traits.length">
      <dt>Traits</dt>
      <dd><TraitChips :traits="unit.traits" :unit="unit" /></dd>
    </template>
  </dl>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { describeFlows, findUnit, fmt, labour } from '@/engine/model'
import type { GameState, UnitType } from '@/engine/types'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ unit: UnitType; state: GameState }>()
const builder = computed(() =>
  props.unit.builderId === props.unit.id ? 'itself' : (findUnit(props.state, props.unit.builderId ?? '')?.name ?? 'a unit you’ll design')
)
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
