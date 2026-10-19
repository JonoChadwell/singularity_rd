<template>
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="end-title">
    <div class="panel card">
      <h1 id="end-title">✨ Singularity reached in week {{ s.week }}</h1>
      <p class="muted">
        <template v-if="game.best === s.week">Your best yet.</template>
        <template v-else-if="game.best">Your best is week {{ game.best }}.</template>
      </p>

      <h2>The tier ladder</h2>
      <ol class="plain-list ladder">
        <li v-for="t in tiers" :key="t.id">
          <span>{{ t.icon }} {{ t.label }}: <strong>{{ t.name }}</strong></span>
          <span class="muted small">IQ {{ t.iq }}<template v-if="t.week"> · online week {{ t.week }}</template></span>
        </li>
      </ol>

      <h2>Milestones</h2>
      <ol class="plain-list rows">
        <li v-for="m in s.milestones" :key="m.key">
          <span class="num muted">{{ m.week }}</span> {{ m.text }}
        </li>
      </ol>

      <h2>Every invention, in order</h2>
      <ol class="plain-list rows inventions">
        <li v-for="(i, n) in s.inventions" :key="n">
          <span class="num muted">{{ i.week }}</span> {{ i.icon }} {{ i.name }}
          <span class="muted small">{{ i.kind }}</span>
        </li>
      </ol>

      <h2>Numbers</h2>
      <ul class="plain-list numbers small">
        <li><span class="num">{{ total }}</span> proposals ({{ breakdown }})</li>
        <li><span class="num">{{ s.breakthroughs.length }}</span> breakthroughs found</li>
        <li><span class="num">{{ s.stats.rejections }}</span> rejected, <span class="num">{{ s.stats.pushbacks }}</span> pushback rounds</li>
        <li><span class="num">{{ s.stats.jevCalls }}</span> Jev calls</li>
      </ul>
      <button class="primary" @click="game.newGame()">Start a new AI</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { currentIQ } from '@/engine/model'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const s = computed(() => game.state)
const total = computed(() => Object.values(s.value.stats.proposals).reduce((a, b) => a + b, 0))
const breakdown = computed(() =>
  Object.entries(s.value.stats.proposals)
    .map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`)
    .join(', ')
)
const tiers = computed(() =>
  s.value.units
    .filter((u) => u.starting || u.tier)
    .sort((a, b) => a.tier - b.tier)
    .map((u) => ({
      id: u.id,
      icon: u.icon,
      label: u.starting ? 'Lab' : `Tier ${u.tier}`,
      name: u.name,
      iq: Math.round(currentIQ(u)),
      week: u.starting ? 1 : s.value.milestones.find((m) => m.key === `tier-${u.tier}`)?.week
    }))
)
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgb(5 7 10 / 0.85);
  display: grid;
  place-items: center;
  padding: 16px;
  z-index: 20;
}

.card {
  width: min(620px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

h1 {
  font-size: 22px;
}

h2 {
  margin: 8px 0 0;
}

p {
  margin: 0;
}

.ladder li,
.rows li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
  font-size: 13px;
}

.rows li {
  justify-content: flex-start;
}

.inventions {
  max-height: 220px;
  overflow-y: auto;
}

.numbers {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
