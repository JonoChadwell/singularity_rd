<template>
  <section class="panel phase" :class="{ urgent }" aria-label="Phase">
    <div class="name">
      <div class="muted small">Phase {{ phase.n }}</div>
      <strong>{{ PHASE_NAMES[phase.n] }}</strong>
    </div>
    <div v-if="goal" class="goal">
      <div class="muted small">Goal</div>
      <strong>🎯 {{ goal.name }}</strong>
      <div class="small needs">
        <span :class="iqOk ? 'good' : 'warn'">{{ iqOk ? '✓' : '✗' }} IQ {{ goal.minIQ }} (yours: {{ Math.round(best) }})</span>
        <span :class="costOk ? 'good' : 'warn'">
          {{ costOk ? '✓' : '✗' }} {{ goal.cost.length ? describeCost(game.state, goal.cost) : 'nothing to use up' }}
        </span>
      </div>
    </div>
    <div v-else-if="phase.n === 3" class="goal">
      <div class="muted small">No clock</div>
      <strong>🌌 The AI has ascended. Play on.</strong>
    </div>
    <div v-else-if="phase.status === 'planning'" class="goal">
      <div class="muted small">Goal</div>
      <strong>Not planned yet</strong>
    </div>
    <div v-if="left !== null" class="clock">
      <div class="muted small">{{ loss.name }} in</div>
      <div class="num weeks">
        {{ Math.max(0, left) }} <span class="small">week{{ left === 1 ? '' : 's' }}</span>
      </div>
      <div v-if="lost || gained" class="small muted">
        <span v-if="lost" class="bad">−{{ lost }}</span>
        <span v-if="lost && gained"> · </span>
        <span v-if="gained" class="good">+{{ gained }}</span>
        so far
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { lossOf } from '@/engine/losses'
import { bestIQ, costShortfall, describeCost } from '@/engine/model'
import { clockMoved, PHASE_NAMES, weeksLeft } from '@/engine/phase'
import { goalOf } from '@/engine/projection'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const phase = computed(() => game.state.phase)
const goal = computed(() => goalOf(game.state))
const best = computed(() => bestIQ(game.state))
const iqOk = computed(() => !!goal.value && best.value >= goal.value.minIQ)
const costOk = computed(() => !!goal.value && !costShortfall(game.state, goal.value.cost))
const loss = computed(() => lossOf(game.state))
const left = computed(() => weeksLeft(game.state))
const urgent = computed(() => left.value !== null && left.value <= 3)
const lost = computed(() => clockMoved(game.state, -1))
const gained = computed(() => clockMoved(game.state, 1))
</script>

<style scoped>
.phase {
  display: flex;
  gap: 24px;
  align-items: center;
  flex-wrap: wrap;
}

.phase.urgent {
  border-color: var(--bad);
}

.goal {
  flex: 1;
  min-width: 220px;
}

.needs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.clock {
  text-align: right;
}

.weeks {
  font-size: 26px;
  line-height: 1.1;
}

.urgent .weeks,
.bad {
  color: var(--bad);
}
</style>
