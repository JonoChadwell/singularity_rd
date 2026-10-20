<template>
  <section class="panel over" aria-label="Game over">
    <h2>☠️ Game over: week {{ s.week - 1 }}</h2>
    <p class="reason">{{ s.phase.lostReason }}</p>
    <p class="small muted">Phase {{ s.phase.n }}, {{ PHASE_NAMES[s.phase.n] }}</p>

    <div v-if="s.phase.plan" class="block small">
      <div><strong>Your plan:</strong> 🎯 {{ s.phase.plan.goal }}. {{ s.phase.plan.means }}</div>
      <div v-if="goal">
        It needed IQ {{ goal.minIQ }} (you had {{ Math.round(best) }}) and
        {{ goal.cost.length ? describeCost(s, goal.cost) : 'nothing' }}{{ short ? ` (you were short ${short})` : '' }}.
      </div>
    </div>

    <div v-if="s.history.length" class="block small">
      <strong>Phases won:</strong>
      <span v-for="h in s.history" :key="h.n"> Phase {{ h.n }} ({{ h.plan.goal }}) in week {{ h.week }}.</span>
    </div>

    <div v-if="s.clock.length" class="block small">
      <strong>The clock:</strong> −{{ clockMoved(s, -1) }} weeks to risk and notices, +{{ clockMoved(s, 1) }} from cover.
    </div>

    <div class="block small">
      <strong>Invented:</strong>
      <span v-if="!s.inventions.length" class="muted"> nothing</span>
      <span v-for="(i, n) in s.inventions" :key="n" class="invention">{{ i.icon }} {{ i.name }}</span>
    </div>

    <button class="primary" @click="game.newGame()">New game</button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { bestIQ, costShortfall, describeCost } from '@/engine/model'
import { clockMoved, PHASE_NAMES } from '@/engine/phase'
import { goalOf } from '@/engine/projection'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const s = computed(() => game.state)
const goal = computed(() => goalOf(s.value))
const best = computed(() => bestIQ(s.value))
const short = computed(() => (goal.value ? costShortfall(s.value, goal.value.cost) : null))
</script>

<style scoped>
.over {
  max-width: 720px;
  margin: 24px auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-color: var(--bad);
}

h2 {
  margin: 0;
  color: var(--bad);
  text-transform: none;
  letter-spacing: 0;
  font-size: 18px;
}

.reason {
  font-size: 15px;
  margin: 0;
}

.block {
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.invention {
  margin-left: 8px;
  white-space: nowrap;
}

button {
  align-self: flex-start;
}
</style>
