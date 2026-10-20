<template>
  <dl class="summary small">
    <template v-if="unit.mind">
      <dt>IQ</dt>
      <dd class="num ai">
        {{ Math.round(currentIQ(unit)) }} <span class="muted">(software ceiling {{ Math.round(ceilingIQ(unit)) }})</span>
      </dd>
      <dt>Hardware</dt>
      <dd>{{ unit.hardware.name }} <span class="muted num">IQ {{ unit.hardware.iq }}</span></dd>
      <dt>Software</dt>
      <dd>{{ softwareLabel(unit) }}</dd>
    </template>
    <dt>Work</dt>
    <dd class="num">{{ fmt(labour(unit)) }} Money’s worth a week</dd>
    <template v-if="unit.layers.market">
      <dt>Price</dt>
      <dd class="num">{{ fmt(basePrice(unit)) }} Money, rising as supply runs out</dd>
    </template>
    <dt>Runs on</dt>
    <dd>{{ unit.upkeep.length ? `${describeFlows(state, unit.upkeep)} a week` : 'nothing' }}</dd>
    <dt>Made of</dt>
    <dd>{{ describeFlows(state, unit.parts) }}</dd>
    <dt>Supply</dt>
    <dd>
      <span v-for="l in layerSummary(unit)" :key="l.layer" class="layer" :class="{ locked: !l.size }">
        {{ NAMES[l.layer] }} {{ l.size ? fmtCount(l.size) : '🔒' }}
      </span>
    </dd>
    <template v-if="unit.builderId">
      <dt>Built by</dt>
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
import { layerSummary } from '@/engine/breakthroughProposal'
import { basePrice, ceilingIQ, currentIQ, describeFlows, findUnit, fmt, fmtCount, labour, softwareLabel } from '@/engine/model'
import type { GameState, UnitType } from '@/engine/types'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ unit: UnitType; state: GameState }>()
const NAMES = { market: 'Humanity', own: 'Own industry', earth: 'Earth' }
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

.layer {
  margin-right: 8px;
  white-space: nowrap;
}

.layer.locked {
  color: var(--muted);
}
</style>
