<template>
  <div class="over">
    <DataSheet part="FAIL-RPT" :title="`Game over: week ${s.week - 1}`" icon="☠️" aria-label="Game over">
      <p class="stamp">{{ loss.name }}</p>
      <p class="reason">{{ s.phase.lostReason }}</p>
      <section>
        <h4>Failure report</h4>
        <SpecTable :rows="rows" />
      </section>
      <section v-if="s.phase.plan">
        <h4>Your plan</h4>
        <p>
          <strong>{{ s.phase.plan.goal }}.</strong> {{ s.phase.plan.means }}
        </p>
      </section>
      <section>
        <h4>Invented</h4>
        <p v-if="!s.inventions.length" class="note">nothing</p>
        <ul v-else class="inventions">
          <li v-for="(i, n) in s.inventions" :key="n">{{ i.icon }} {{ i.name }}</li>
        </ul>
      </section>
      <template #foot>
        <button class="primary" @click="game.newGame()">New game</button>
      </template>
    </DataSheet>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { lossOf } from '@/engine/losses'
import { bestIQ, costShortfall, describeCost } from '@/engine/model'
import { clockMoved, PHASE_NAMES } from '@/engine/phase'
import { goalOf } from '@/engine/projection'
import { useGameStore } from '@/stores/game'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable, { type SpecRow } from '../kit/SpecTable.vue'

const game = useGameStore()
const s = computed(() => game.state)
const loss = computed(() => lossOf(s.value))

const rows = computed<SpecRow[]>(() => {
  const st = s.value
  const goal = goalOf(st)
  const out: SpecRow[] = [{ k: 'Phase', v: `${st.phase.n}, ${PHASE_NAMES[st.phase.n]}` }]
  if (goal) {
    const best = Math.round(bestIQ(st))
    out.push({ k: 'Goal needed IQ', v: `${goal.minIQ} (you had ${best})`, tone: best >= goal.minIQ ? 'good' : 'bad' })
    const short = costShortfall(st, goal.cost)
    out.push({ k: 'And used up', v: `${goal.cost.length ? describeCost(st, goal.cost) : 'nothing'}${short ? ` (you were short ${short})` : ''}`, tone: short ? 'bad' : 'good' })
  }
  for (const h of st.history) out.push({ k: `Phase ${h.n} won`, v: `${h.plan.goal}, week ${h.week}`, tone: 'good' })
  if (st.clock.length) out.push({ k: 'The clock', v: `−${clockMoved(st, -1)} weeks to risk and notices, +${clockMoved(st, 1)} from cover` })
  return out
})
</script>

<style scoped>
.over {
  max-width: 680px;
  margin: 24px auto;
  padding: 0 12px;
}

.stamp {
  align-self: flex-start;
  padding: 2px 14px;
  border: 3px solid #a3200f;
  color: #a3200f;
  font-family: var(--font-label);
  font-weight: 700;
  font-size: 26px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transform: rotate(-3deg);
}

.reason {
  font-size: 15px;
}

.inventions {
  margin: 0;
  padding-left: 18px;
  columns: 2;
}
</style>
