<template>
  <button
    v-if="goal"
    type="button"
    class="goal"
    :title="projection ? projectionText(game.state, projection) : 'Open the goal’s datasheet'"
    @click="ui.openSheet({ kind: 'research', id: goal.id })"
  >
    <span class="lbl">Goal</span>
    <span class="name">{{ goal.name }}</span>
    <span class="checks">
      <span class="check"><Led :tone="iqOk ? 'good' : 'bad'" :title="`IQ ${goal.minIQ} (yours: ${Math.round(best)})`" /><span class="lbl">IQ {{ goal.minIQ }}</span></span>
      <span class="check"
        ><Led :tone="costOk ? 'good' : 'bad'" :title="goal.cost.length ? describeCost(game.state, goal.cost) : 'nothing to use up'" /><span class="lbl">Cost</span></span
      >
    </span>
    <span v-if="eta" class="eta" :class="eta.tone">
      <span class="lbl">ETA</span>
      <span class="num">{{ eta.text }}</span>
    </span>
  </button>
  <div v-else-if="phase.n === 3" class="goal still">
    <span class="lbl">No clock</span>
    <span class="name">The AI has ascended. Play on.</span>
  </div>
  <div v-else-if="phase.status === 'planning'" class="goal still">
    <span class="lbl">Goal</span>
    <span class="name">Not planned yet</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { bestIQ, costShortfall, describeCost } from '@/engine/model'
import { goalOf, projectionText } from '@/engine/projection'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Led from '../kit/StatusLed.vue'

const game = useGameStore()
const ui = useUiStore()
const phase = computed(() => game.state.phase)
const goal = computed(() => goalOf(game.state))
const best = computed(() => bestIQ(game.state))
const iqOk = computed(() => !!goal.value && best.value >= goal.value.minIQ)
const costOk = computed(() => !!goal.value && !costShortfall(game.state, goal.value.cost))
const projection = computed(() => game.projection)
/** When the goal's cost will be in hand, at today's rates. */
const eta = computed(() => {
  const p = projection.value
  if (!p) return null
  if (p.week === game.state.week) return { text: 'NOW', tone: p.iqOk ? 'good' : 'warn' }
  if (p.week !== null) return { text: `WK ${p.week}`, tone: p.iqOk ? 'good' : 'warn' }
  return { text: `${Math.floor(p.share * 100)}%`, tone: 'bad' }
})
</script>

<style scoped>
.goal {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 4px 10px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  text-align: left;
}

.goal.still {
  border: 1px solid var(--chrome-0);
  box-shadow: inset 1px 1px 0 var(--bevel-lo);
  background: var(--chrome-1);
}

.name {
  font-family: var(--font-label);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.03em;
  color: var(--silk);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.checks {
  display: flex;
  gap: 8px;
}

.check {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.eta {
  display: inline-flex;
  gap: 4px;
  align-items: baseline;
  padding-left: 8px;
  border-left: 1px solid var(--chrome-3);
}

.eta .num {
  font-size: 13px;
}
</style>
