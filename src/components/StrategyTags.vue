<template>
  <span v-if="word || fit" class="tags">
    <span v-if="word" class="chip" :class="wordClass" title="How well Jev rates this way of doing it">{{ word }}</span>
    <span v-if="fit" class="chip" :class="fit.good ? 'good' : 'bad'" :title="fitTitle">{{ fit.text }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { efficiencyWord, findResource, findUnit, tierFit, tierLabel } from '@/engine/model'
import type { Strategy } from '@/engine/types'
import { useGameStore } from '@/stores/game'

const props = defineProps<{ strategy: Strategy }>()
const game = useGameStore()

const unit = computed(() => findUnit(game.state, props.strategy.unitId))
const target = computed(() =>
  props.strategy.kind === 'make' ? findResource(game.state, props.strategy.outputId) : undefined
)

const word = computed(() => efficiencyWord(props.strategy))
const wordClass = computed(() => {
  const efficiency = props.strategy.efficiency ?? 1
  return efficiency > 1 ? 'good' : efficiency < 1 ? 'bad' : ''
})
const fit = computed(() => (unit.value && target.value ? tierFit(unit.value.tier, target.value.tier) : null))
const fitTitle = computed(() =>
  unit.value && target.value ? `${unit.value.name} are ${tierLabel(unit.value.tier)}; ${target.value.name} is ${tierLabel(target.value.tier)}.` : ''
)
</script>

<style scoped>
.tags {
  display: inline-flex;
  gap: 4px;
  flex-wrap: wrap;
}

.chip {
  cursor: help;
}
</style>
